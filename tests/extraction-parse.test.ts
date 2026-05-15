/**
 * Tests for safeParseJSON / safeParseJSONArray in lib/extraction.ts.
 *
 * Why these exist: from project launch through 2026-05-12, every single row
 * in the article_extractions table had extraction_confidence=0 and zero
 * populated financial fields — 46/46 rows of nothing. The audit on 2026-05-15
 * traced root cause to strict JSON.parse() at the call site: Haiku frequently
 * wraps responses in markdown fences (```json ... ```) despite the prompt
 * instructing otherwise, and any preamble or fence killed parsing silently.
 * The summary path tolerated it because it accepts raw text; the extraction
 * path collapsed to null. These tests pin the parser's tolerance to common
 * model wrappings so the bug cannot regress without a loud failure.
 */
import { describe, test, expect } from "bun:test";
import { safeParseJSON, safeParseJSONArray } from "../lib/extraction";

describe("safeParseJSON", () => {
  test("clean JSON object parses directly", () => {
    expect(safeParseJSON(`{"a":1,"b":"x"}`)).toEqual({ a: 1, b: "x" });
  });

  test("JSON wrapped in ```json fences (Haiku's most common wrapping)", () => {
    const input = "```json\n{\"revenue_figure\": 7400, \"guidance_direction\": \"raised\"}\n```";
    expect(safeParseJSON(input)).toEqual({ revenue_figure: 7400, guidance_direction: "raised" });
  });

  test("JSON wrapped in plain ``` fences (no language tag)", () => {
    const input = "```\n{\"k\":1}\n```";
    expect(safeParseJSON(input)).toEqual({ k: 1 });
  });

  test("JSON with preamble explanation before the object", () => {
    const input = "Here is the extracted data:\n\n{\"k\": 2}";
    expect(safeParseJSON(input)).toEqual({ k: 2 });
  });

  test("JSON with trailing commentary after the object", () => {
    const input = `{"k": 3}\n\nLet me know if you need anything else.`;
    expect(safeParseJSON(input)).toEqual({ k: 3 });
  });

  test("preamble + fences + trailing text all together", () => {
    const input = "Sure, here you go:\n```json\n{\"revenue_figure\": 1200, \"yoy_growth_pct\": 6}\n```\nThat's all the data in the article.";
    expect(safeParseJSON(input)).toEqual({ revenue_figure: 1200, yoy_growth_pct: 6 });
  });

  test("returns null for completely non-JSON output", () => {
    expect(safeParseJSON("I cannot extract any data from this article.")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(safeParseJSON("")).toBeNull();
  });

  test("nested objects survive fence stripping", () => {
    const input = "```json\n{\"additional_metrics\": {\"backlog\": \"$20B\"}, \"k\": 1}\n```";
    expect(safeParseJSON(input)).toEqual({ additional_metrics: { backlog: "$20B" }, k: 1 });
  });

  test("real-world realistic Haiku response with all 17 fields", () => {
    const input = `\`\`\`json
{
  "revenue_figure": 7400,
  "revenue_period": "Q2 FY2026",
  "revenue_currency": "USD",
  "ebitda_figure": null,
  "ebitda_margin_pct": 15.5,
  "yoy_growth_pct": 6,
  "guidance_verbatim": "we are raising our full year guidance",
  "guidance_direction": "raised",
  "guidance_period": "FY2026",
  "mentioned_headwinds": [],
  "mentioned_tailwinds": ["data center demand", "applied HVAC systems"],
  "mentioned_capex": null,
  "mentioned_volume_language": "Orders increased 30%",
  "pricing_action": "neutral",
  "pricing_percentage": null,
  "extraction_confidence": 0.92,
  "fields_present": ["revenue_figure", "guidance_verbatim"],
  "fields_absent": ["ebitda_figure", "mentioned_capex"]
}
\`\`\``;
    const parsed = safeParseJSON(input);
    expect(parsed).not.toBeNull();
    expect(parsed.revenue_figure).toBe(7400);
    expect(parsed.guidance_direction).toBe("raised");
    expect(parsed.mentioned_tailwinds).toHaveLength(2);
    expect(parsed.extraction_confidence).toBe(0.92);
  });
});

describe("safeParseJSONArray", () => {
  test("clean JSON array parses directly", () => {
    expect(safeParseJSONArray(`["a","b","c"]`)).toEqual(["a", "b", "c"]);
  });

  test("array wrapped in ```json fences", () => {
    const input = "```json\n[\"sentence one\",\"sentence two\"]\n```";
    expect(safeParseJSONArray(input)).toEqual(["sentence one", "sentence two"]);
  });

  test("array with preamble", () => {
    const input = "Here are the excerpts:\n[\"a\",\"b\"]";
    expect(safeParseJSONArray(input)).toEqual(["a", "b"]);
  });

  test("returns null when JSON parses to an object, not an array", () => {
    expect(safeParseJSONArray(`{"k":1}`)).toBeNull();
  });

  test("returns null for non-JSON output", () => {
    expect(safeParseJSONArray("nothing here")).toBeNull();
  });
});
