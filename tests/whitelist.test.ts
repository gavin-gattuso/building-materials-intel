/**
 * Tests for lib/whitelist.ts.
 *
 * Why these tests exist: 98% of rejected articles are filtered by the
 * whitelist. A bug in isApprovedSource (e.g., the subdomain-suffix match
 * silently fails) means either over-rejection (silent regression) or
 * over-acceptance (spam in the KB). These tests pin both directions.
 */
import { describe, test, expect } from "bun:test";
import { isApprovedSource, getSourceDomain, getSourceTier } from "../lib/whitelist";

describe("isApprovedSource — accept paths", () => {
  test("exact whitelist hostname is approved (reuters.com)", () => {
    expect(isApprovedSource("https://reuters.com/some-article")).toBe(true);
  });

  test("www. subdomain is stripped before matching", () => {
    expect(isApprovedSource("https://www.reuters.com/some-article")).toBe(true);
  });

  test("non-www subdomain of a whitelisted domain is approved (sg.finance.yahoo.com)", () => {
    expect(isApprovedSource("https://sg.finance.yahoo.com/news/xyz")).toBe(true);
  });

  test("subdomain of a whitelisted Tier-1 publisher (e.g. shopping.yahoo.com)", () => {
    expect(isApprovedSource("https://shopping.yahoo.com/products")).toBe(true);
  });

  test("HTTP (not HTTPS) URL is still approved if domain matches", () => {
    expect(isApprovedSource("http://www.bbc.com/news")).toBe(true);
  });
});

describe("isApprovedSource — reject paths", () => {
  test("unknown domain is rejected", () => {
    expect(isApprovedSource("https://random-news-site.example/article")).toBe(false);
  });

  test("known spam domain is rejected (ad-hoc-news.de)", () => {
    expect(isApprovedSource("https://www.ad-hoc-news.de/some-stock")).toBe(false);
  });

  test("malformed URL returns false (no throw)", () => {
    expect(isApprovedSource("not-a-url")).toBe(false);
    expect(isApprovedSource("")).toBe(false);
    expect(isApprovedSource("https://")).toBe(false);
  });

  test("partial hostname does not match (lookalike domains)", () => {
    // "reuters-news.com" should NOT be approved just because "reuters.com" is.
    // This is the canonical security concern with prefix-style matching.
    expect(isApprovedSource("https://reuters-news.example/x")).toBe(false);
  });

  test("Google News redirect host is NOT in the whitelist by itself", () => {
    expect(isApprovedSource("https://news.google.com/rss/articles/CBM...")).toBe(false);
  });
});

describe("getSourceDomain", () => {
  test("strips www. prefix", () => {
    expect(getSourceDomain("https://www.reuters.com/x")).toBe("reuters.com");
  });

  test("preserves non-www subdomain", () => {
    expect(getSourceDomain("https://finance.yahoo.com/x")).toBe("finance.yahoo.com");
  });

  test("malformed URL returns 'unknown' (not throws, not empty)", () => {
    expect(getSourceDomain("not-a-url")).toBe("unknown");
    expect(getSourceDomain("")).toBe("unknown");
  });
});

describe("getSourceTier", () => {
  test("major news (Reuters) is Tier 1", () => {
    expect(getSourceTier("https://reuters.com/x")).toBe(1);
  });

  test("industry trade (Construction Dive) is Tier 2", () => {
    expect(getSourceTier("https://www.constructiondive.com/x")).toBe(2);
  });

  test("financial portal (Yahoo Finance) is Tier 6", () => {
    expect(getSourceTier("https://finance.yahoo.com/x")).toBe(6);
  });

  test("unmatched host defaults to Tier 3 (neutral)", () => {
    expect(getSourceTier("https://unknown-example.com/x")).toBe(3);
  });
});
