/**
 * Article-body fetching + HTML-to-text extraction.
 *
 * Extracted from api/daily-scan.ts so the parser is unit-testable in
 * isolation (importing the daily-scan module pulls in a Supabase client
 * that crashes if the service-role key is missing at test time).
 *
 * Pre-2026-05 the extraction pipeline was called with just the RSS headline
 * as the "article text" — which is why article_extractions was empty for the
 * lifetime of the system. Fetching the body, for whitelisted articles only,
 * gives extraction and summary real text to work with. Failures are expected
 * (paywalls, bot protection, Google News redirect URLs) — caller counts
 * attempts and surfaces the success rate via pipeline_runs telemetry.
 */

export interface BodyFetchStats {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Fetches the article HTML and returns its main text content, or null if
 * the fetch failed, returned a non-HTML response, or extracted body was
 * too short (< 200 chars) to be useful for extraction.
 *
 * Skips news.google.com URLs entirely — those need either the URL decoder
 * to land on the real publisher, or a browser-like environment that can
 * handle Google's consent flow.
 */
export async function fetchArticleBody(url: string, timeoutMs = 4000): Promise<string | null> {
  if (!url) return null;
  if (url.includes("news.google.com")) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    const html = await res.text();
    const body = extractMainText(html);
    return body && body.length >= 200 ? body : null;
  } catch {
    return null;
  }
}

/**
 * Pull the substantive paragraph text out of arbitrary HTML. Strips scripts,
 * styles, and comments; prefers content inside <article> or <main>; drops
 * paragraphs shorter than 40 chars (boilerplate filter); decodes the common
 * HTML entities; caps output at 10,000 chars.
 *
 * Returns empty string for HTML with no usable paragraphs.
 */
export function extractMainText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Prefer <article>, then <main>, else fall back to whole doc.
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) cleaned = articleMatch[1];
  else {
    const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch?.[1]) cleaned = mainMatch[1];
  }

  const paragraphs: string[] = [];
  const pMatches = cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of pMatches) {
    const text = (m[1] || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 40) paragraphs.push(text);
  }
  return paragraphs.join("\n\n").slice(0, 10000);
}
