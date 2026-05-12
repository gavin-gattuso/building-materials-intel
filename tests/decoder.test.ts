/**
 * Tests for lib/google-news-decoder.ts.
 *
 * Pure-input cases (rejection paths) run in CI without network access. The
 * 3-tier resolution itself (base64 / batchexecute / redirect-follow) makes
 * outbound HTTP and isn't worth mocking — skipped here, covered by the live
 * script at scripts/test-google-news-decoder.ts and by production telemetry.
 *
 * Why these tests exist: the decoder is what restored 100% URL resolution
 * after the April 2026 outage. A regression where (say) the base64 prefix
 * detection mis-identifies a malformed URL as legacy-encoded would silently
 * collapse decode quality to 0% before anyone notices. These rejection-path
 * tests pin the parsing contract.
 */
import { describe, test, expect } from "bun:test";
import { decodeGoogleNewsUrl } from "../lib/google-news-decoder";

describe("decodeGoogleNewsUrl — input validation", () => {
  test("non-Google-News URL returns method='failed' with original URL", async () => {
    const result = await decodeGoogleNewsUrl("https://www.reuters.com/business/some-article");
    expect(result.method).toBe("failed");
    expect(result.url).toBe("https://www.reuters.com/business/some-article");
  });

  test("malformed URL string returns method='failed'", async () => {
    const result = await decodeGoogleNewsUrl("not a url at all");
    expect(result.method).toBe("failed");
    expect(result.url).toBe("not a url at all");
  });

  test("Google News homepage (no article path) returns method='failed'", async () => {
    const result = await decodeGoogleNewsUrl("https://news.google.com/");
    expect(result.method).toBe("failed");
  });

  test("Google News URL with /articles/ path but no payload returns failed", async () => {
    const result = await decodeGoogleNewsUrl("https://news.google.com/rss/articles/");
    expect(result.method).toBe("failed");
  });

  test("empty string returns method='failed'", async () => {
    const result = await decodeGoogleNewsUrl("");
    expect(result.method).toBe("failed");
  });
});

describe("decodeGoogleNewsUrl — legacy base64 path", () => {
  // These URLs use the pre-July-2024 protobuf format where the decoded
  // bytes contain a plain http(s) URL. The decoder should pull it out
  // without making any network call.
  test("legacy URL with embedded http(s) URL decodes via base64", async () => {
    // Construct a minimal protobuf payload: prefix 08 13 22 + varint len +
    // url bytes. URL = "https://example.com/article" (27 chars).
    const url = "https://example.com/article";
    const len = url.length; // < 0x80, single-byte varint
    const bytes = Buffer.concat([
      Buffer.from([0x08, 0x13, 0x22]),
      Buffer.from([len]),
      Buffer.from(url, "utf-8"),
    ]);
    const b64 = bytes.toString("base64url");
    const result = await decodeGoogleNewsUrl(`https://news.google.com/rss/articles/${b64}`);
    expect(result.method).toBe("base64");
    expect(result.url).toBe(url);
  });

  test("legacy URL with two-byte varint length decodes correctly", async () => {
    // 200-char URL needs a 2-byte varint (>127)
    const url = "https://example.com/" + "a".repeat(180);
    const len = url.length; // 200
    const lenByte1 = (len & 0x7f) | 0x80; // continuation bit set
    const lenByte2 = len >> 7;
    const bytes = Buffer.concat([
      Buffer.from([0x08, 0x13, 0x22]),
      Buffer.from([lenByte1, lenByte2]),
      Buffer.from(url, "utf-8"),
    ]);
    const b64 = bytes.toString("base64url");
    const result = await decodeGoogleNewsUrl(`https://news.google.com/rss/articles/${b64}`);
    expect(result.method).toBe("base64");
    expect(result.url).toBe(url);
  });
});
