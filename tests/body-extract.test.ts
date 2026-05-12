/**
 * Tests for api/daily-scan.ts:extractMainText.
 *
 * Why these tests exist: extractMainText is what turns fetched HTML into the
 * "article body" string that gets passed to structured extraction and
 * summary generation. A regression here (e.g., the <article> regex no
 * longer matches, or paragraph filtering drops everything) collapses body
 * quality to 0 without any alert — the function still returns a string,
 * the call site still succeeds, the article still archives. These tests
 * pin the parsing contract so the regression is observable in CI.
 */
import { describe, test, expect } from "bun:test";
import { extractMainText } from "../lib/body-fetch";

describe("extractMainText — basic HTML", () => {
  test("extracts text from a single <p> tag", () => {
    const html = "<html><body><p>This is the article body. It has more than forty characters so it survives the filter.</p></body></html>";
    const text = extractMainText(html);
    expect(text).toContain("This is the article body");
    expect(text).toContain("forty characters");
  });

  test("strips <script> tags and their contents", () => {
    const html = `<article><script>alert('evil')</script><p>The real content paragraph that has enough characters to survive the filter.</p></article>`;
    const text = extractMainText(html);
    expect(text).not.toContain("alert");
    expect(text).not.toContain("evil");
    expect(text).toContain("The real content paragraph");
  });

  test("strips <style> tags and their contents", () => {
    const html = `<article><style>body { color: red; }</style><p>This is a paragraph with more than forty characters to survive filtering.</p></article>`;
    const text = extractMainText(html);
    expect(text).not.toContain("color: red");
    expect(text).toContain("This is a paragraph");
  });

  test("strips HTML comments", () => {
    const html = `<article><!-- editorial note: this is hidden --><p>Visible paragraph content that has plenty of characters to survive.</p></article>`;
    const text = extractMainText(html);
    expect(text).not.toContain("editorial note");
    expect(text).toContain("Visible paragraph content");
  });

  test("decodes common HTML entities (&nbsp;, &amp;, etc.)", () => {
    const html = "<article><p>Trane &amp; Carrier reported &quot;strong&quot; Q1, with margins up &gt;5% YoY across all segments.</p></article>";
    const text = extractMainText(html);
    expect(text).toContain("Trane & Carrier");
    expect(text).toContain('"strong"');
    expect(text).toContain(">5%");
  });
});

describe("extractMainText — main-content detection", () => {
  test("prefers <article> contents over surrounding chrome", () => {
    const html = `
      <html><body>
        <nav><p>Home About Contact menu items only here, ignore this paragraph.</p></nav>
        <article>
          <p>The real article body that should be returned. This is what extraction wants.</p>
        </article>
        <footer><p>Copyright 2026 Some Publisher. Privacy Terms.</p></footer>
      </body></html>
    `;
    const text = extractMainText(html);
    expect(text).toContain("The real article body");
    expect(text).not.toContain("Home About Contact");
    expect(text).not.toContain("Copyright 2026");
  });

  test("falls back to <main> when <article> is absent", () => {
    const html = `
      <html><body>
        <main>
          <p>Main content that has more than forty characters to survive the filter logic.</p>
        </main>
        <footer><p>Stuff in the footer that should be ignored entirely please.</p></footer>
      </body></html>
    `;
    const text = extractMainText(html);
    expect(text).toContain("Main content");
    expect(text).not.toContain("footer");
  });

  test("scans whole document when neither <article> nor <main> present", () => {
    const html = "<html><body><div><p>This is a paragraph with more than forty characters of substantive content.</p></div></body></html>";
    const text = extractMainText(html);
    expect(text).toContain("substantive content");
  });
});

describe("extractMainText — filtering rules", () => {
  test("drops paragraphs ≤ 40 chars (boilerplate filter)", () => {
    const html = `<article>
      <p>Short.</p>
      <p>Also short paragraph.</p>
      <p>This is a long enough paragraph to survive the 40-char filter cleanly.</p>
    </article>`;
    const text = extractMainText(html);
    expect(text).not.toContain("Short.");
    expect(text).not.toContain("Also short paragraph.");
    expect(text).toContain("long enough paragraph");
  });

  test("collapses whitespace within each paragraph", () => {
    const html = `<article><p>Multiple    spaces   should    collapse   into   single   spaces   in   the   output.</p></article>`;
    const text = extractMainText(html);
    expect(text).not.toMatch(/  /);
  });

  test("caps output at ~10,000 chars (slice(0,10000))", () => {
    const para = "<p>" + "x".repeat(100) + "</p>";
    const html = "<article>" + para.repeat(200) + "</article>"; // ~20,000 chars
    const text = extractMainText(html);
    expect(text.length).toBeLessThanOrEqual(10000);
  });

  test("empty HTML returns empty string", () => {
    expect(extractMainText("")).toBe("");
  });

  test("HTML with no <p> tags returns empty string", () => {
    expect(extractMainText("<html><body><div>raw text not in paragraphs</div></body></html>")).toBe("");
  });
});

describe("extractMainText — realistic page shapes", () => {
  test("Barron's-style paywall stub leaves only minimal content", () => {
    // Real paywall pages return enough HTML to be valid but the article body
    // is gated. The extractor should return whatever real text is present
    // (often just a teaser).
    const html = `
      <html><head><title>Article Title</title></head><body>
        <article>
          <p>Subscribers can read the full article. Sign in to continue reading the news.</p>
        </article>
      </body></html>
    `;
    const text = extractMainText(html);
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(200); // not a full article
  });

  test("ESG Today-style article extracts the substantive body", () => {
    const html = `
      <html><body>
        <header><p>Site nav links footer copyright notices stuff here ignore please.</p></header>
        <article>
          <p>Amazon and cooling and dehumidification technology company Transaera announced a new agreement to deploy Transaera's next-generation heat pump technology across Amazon's global building network.</p>
          <p>Founded in 2018 by MIT engineers and materials scientists, Massachusetts-based Transaera develops energy-efficient air conditioning and dehumidification systems based on novel composite materials.</p>
        </article>
      </body></html>
    `;
    const text = extractMainText(html);
    expect(text).toContain("Transaera");
    expect(text).toContain("MIT engineers");
    expect(text).not.toContain("Site nav");
  });
});
