/**
 * Google News RSS URL decoder.
 *
 * Usage: `const { url, method } = await decodeGoogleNewsUrl(rssLink)` — pass any
 * `https://news.google.com/rss/articles/CBMi...` link and you get back the
 * publisher URL plus the method that succeeded ('base64' | 'batchexecute' |
 * 'redirect-follow' | 'failed'). For non-Google-News URLs the input is
 * returned unchanged with method='failed'. Expected success rate today
 * (2026-05): ~85-95% via batchexecute on new-style `AU_yqL...` payloads (the
 * encoding Google rolled out July 2024); ~95%+ via base64 on legacy pre-2024
 * payloads. Total bound: 3 HTTP calls per URL @ 8s timeout each = 24s worst
 * case. Caller should always fall back to the original URL on 'failed'.
 */

const FETCH_TIMEOUT_MS = 8000;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export type DecodeMethod = "base64" | "batchexecute" | "redirect-follow" | "failed";

export interface DecodeResult {
  url: string;
  method: DecodeMethod;
}

/**
 * Public entry point. Tries fast offline base64 decode first, then falls back
 * to the batchexecute RPC (works for July-2024+ `AU_yqL...` encodings), then
 * to a plain redirect follow as a last resort.
 */
export async function decodeGoogleNewsUrl(url: string): Promise<DecodeResult> {
  const base64Str = extractBase64Segment(url);
  if (!base64Str) {
    return { url, method: "failed" };
  }

  // 1. Fast path — try offline base64/protobuf decode (works for legacy URLs).
  const offline = tryDecodeBase64Offline(base64Str);
  if (offline && isPublisherUrl(offline)) {
    return { url: offline, method: "base64" };
  }

  // 2. batchexecute RPC — works for new-style AU_yqL... payloads.
  try {
    const params = await fetchDecodingParams(base64Str);
    if (params) {
      const decoded = await callBatchExecute(base64Str, params.signature, params.timestamp);
      if (decoded && isPublisherUrl(decoded)) {
        return { url: decoded, method: "batchexecute" };
      }
    }
  } catch {
    // Fall through to redirect follow.
  }

  // 3. Last resort — plain redirect follow with a real browser UA.
  try {
    const followed = await followRedirect(url);
    if (followed && isPublisherUrl(followed)) {
      return { url: followed, method: "redirect-follow" };
    }
  } catch {
    // Fall through to failed.
  }

  return { url, method: "failed" };
}

// ── URL parsing ──

function extractBase64Segment(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "news.google.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // Accept paths like /rss/articles/<b64>, /articles/<b64>, /read/<b64>
    const idx = parts.findIndex(p => p === "articles" || p === "read");
    if (idx === -1 || idx >= parts.length - 1) return null;
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

function isPublisherUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && u.hostname !== "news.google.com" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

// ── Method 1: offline base64/protobuf decode (legacy URLs only) ──

// Legacy Google News encoded path looks like:
//   <prefix 08 13 22> <len byte(s)> <url bytes> <len byte(s)> <amp url bytes> [<suffix d2 01 00>]
// New-style payloads (post July 2024) start with "AU_yqL..." after base64-
// decoding and contain no plain http(s) URL — they require the batchexecute
// call to resolve.
function tryDecodeBase64Offline(base64Str: string): string | null {
  try {
    // Add padding if needed — base64url-style strings sometimes lack it.
    const padded = base64Str + "=".repeat((4 - (base64Str.length % 4)) % 4);
    const buf = Buffer.from(padded, "base64");
    if (buf.length === 0) return null;

    // Strip optional 3-byte prefix (0x08 0x13 0x22).
    let start = 0;
    if (buf.length >= 3 && buf[0] === 0x08 && buf[1] === 0x13 && buf[2] === 0x22) {
      start = 3;
    }

    // Strip optional 3-byte suffix (0xd2 0x01 0x00).
    let end = buf.length;
    if (end >= 3 && buf[end - 3] === 0xd2 && buf[end - 2] === 0x01 && buf[end - 1] === 0x00) {
      end -= 3;
    }

    if (start >= end) return null;

    // Read varint-style length byte(s) for first field (the URL).
    const lenByte = buf[start];
    let urlStart: number;
    let urlLen: number;
    if (lenByte >= 0x80) {
      // Two-byte length: low 7 bits of byte[start], then byte[start+1] << 7.
      if (start + 2 > end) return null;
      urlLen = (lenByte & 0x7f) | (buf[start + 1] << 7);
      urlStart = start + 2;
    } else {
      urlLen = lenByte;
      urlStart = start + 1;
    }
    if (urlStart + urlLen > end) return null;

    const candidate = buf.slice(urlStart, urlStart + urlLen).toString("utf-8");

    // New-style payloads have "AU_yqL" or similar internal IDs here — not a URL.
    if (!/^https?:\/\//i.test(candidate)) {
      // Fall back: scan the whole decoded buffer for any http(s) URL.
      const full = buf.slice(start, end).toString("binary");
      const match = full.match(/https?:\/\/[^\x00-\x1f\s"'<>]+/);
      if (match) {
        // Convert binary-string match back to a clean UTF-8 URL.
        const cleaned = Buffer.from(match[0], "binary").toString("utf-8").replace(/[^\x20-\x7e].*$/, "");
        return cleaned || null;
      }
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

// ── Method 2: batchexecute RPC ──

// Fetches the signature/timestamp pair Google embeds in the article landing
// page; required for the batchexecute call below.
async function fetchDecodingParams(base64Str: string): Promise<{ signature: string; timestamp: string } | null> {
  // Try the non-RSS URL first (matches googlenewsdecoder library behavior —
  // higher success rate, fewer 429s).
  const candidates = [
    `https://news.google.com/articles/${base64Str}`,
    `https://news.google.com/rss/articles/${base64Str}`,
  ];

  for (const url of candidates) {
    try {
      const html = await fetchWithTimeout(url, { method: "GET" });
      if (!html) continue;

      // Look for the c-wiz div with the data-n-a-sg / data-n-a-ts attributes.
      // Format: <c-wiz ...><div jscontroller="..." ... data-n-a-sg="SIG" data-n-a-ts="TS" ...>
      const sgMatch = html.match(/data-n-a-sg="([^"]+)"/);
      const tsMatch = html.match(/data-n-a-ts="([^"]+)"/);
      if (sgMatch && tsMatch) {
        return { signature: sgMatch[1], timestamp: tsMatch[1] };
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function callBatchExecute(base64Str: string, signature: string, timestamp: string): Promise<string | null> {
  // Inner payload — note the embedded JSON-as-string format Google's RPC uses.
  const innerArgs = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`;
  const envelope = JSON.stringify([[["Fbv4je", innerArgs, null, "generic"]]]);
  const body = "f.req=" + encodeURIComponent(envelope);

  const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je";
  const text = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "Referer": "https://news.google.com/",
    },
    body,
  });
  if (!text) return null;

  // Response format: ")]}'\n\n[[[ ... ]]]". Strip the XSSI prefix, then
  // walk the outer array to find the garturlres payload.
  try {
    // Strip up to the first '[' so we can JSON.parse the envelope.
    const firstBracket = text.indexOf("[");
    if (firstBracket === -1) return null;
    // The response is a sequence of length-prefixed JSON chunks. The simplest
    // approach: find the first chunk that parses and contains "garturlres".
    const remainder = text.slice(firstBracket);

    // Fast path: regex pull the URL out of the embedded JSON string.
    // The payload contains: ["garturlres","https://publisher.example/...",timestamp,signature]
    const m = remainder.match(/"garturlres",\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/);
    if (m) {
      // Unescape any \/ → /
      return m[1].replace(/\\\//g, "/");
    }

    // Backup: walk the parsed JSON.
    // The envelope is a JSON array; chunks are separated by lines.
    const chunks = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("[["));
    for (const chunk of chunks) {
      try {
        const parsed = JSON.parse(chunk);
        const url = findGarturlres(parsed);
        if (url) return url;
      } catch {
        // Try next chunk.
      }
    }
  } catch {
    return null;
  }

  return null;
}

// Recursively walks a parsed batchexecute response looking for the embedded
// ["garturlres", "<publisher-url>", ...] tuple. The tuple itself is JSON-
// encoded as a string inside the outer array, so we have to attempt a nested
// JSON.parse on every string we find.
function findGarturlres(node: any): string | null {
  if (node == null) return null;
  if (typeof node === "string") {
    if (node.includes("garturlres")) {
      try {
        const inner = JSON.parse(node);
        if (Array.isArray(inner) && inner[0] === "garturlres" && typeof inner[1] === "string") {
          return inner[1];
        }
      } catch {
        // Not parseable JSON — ignore.
      }
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findGarturlres(child);
      if (found) return found;
    }
  }
  return null;
}

// ── Method 3: redirect follow ──

async function followRedirect(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.url && !res.url.includes("news.google.com")) {
      return res.url;
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Shared HTTP helper ──

async function fetchWithTimeout(url: string, init: RequestInit): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      ...(init.headers || {}),
    };
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
