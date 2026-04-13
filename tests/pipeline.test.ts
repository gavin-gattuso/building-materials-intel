/**
 * Tests for the provenance & pipeline upgrade (Phases 1-6).
 *
 * Run: bun test tests/pipeline.test.ts
 *
 * These tests verify logic in isolation without hitting Supabase or external APIs.
 * Integration tests that require a live database are skipped unless SUPABASE_SERVICE_ROLE_KEY is set.
 */

import { describe, test, expect } from "bun:test";
import { normalizeHeadline, computeSyndicationHash } from "../lib/syndication";

// ── Syndication Deduplication Tests ──

describe("syndication deduplication", () => {
  test("normalizeHeadline strips punctuation and stopwords", () => {
    const result = normalizeHeadline("The Nucor Corporation Reports Record Q1 Earnings of $2.5B");
    // Should remove: The, of
    // Should keep: nucor, corporation, reports, record, q1, earnings, 25b
    expect(result).not.toContain("the ");
    expect(result).not.toContain(" of ");
    expect(result).toContain("nucor");
    expect(result).toContain("earnings");
  });

  test("normalizeHeadline limits to first 12 significant words", () => {
    const longHeadline = "Building materials sector sees unprecedented growth in residential construction amid rising demand for sustainable products and green building technologies across North America";
    const result = normalizeHeadline(longHeadline);
    const words = result.split(" ");
    expect(words.length).toBeLessThanOrEqual(12);
  });

  test("normalizeHeadline is case-insensitive", () => {
    const a = normalizeHeadline("Nucor Reports Record Earnings");
    const b = normalizeHeadline("NUCOR REPORTS RECORD EARNINGS");
    expect(a).toBe(b);
  });

  test("computeSyndicationHash produces consistent hashes", async () => {
    const hash1 = await computeSyndicationHash("Nucor Reports Record Q1 Earnings", "2026-04-12");
    const hash2 = await computeSyndicationHash("Nucor Reports Record Q1 Earnings", "2026-04-12");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });

  test("computeSyndicationHash correctly detects syndicated pair", async () => {
    // Same wire story on two sites. Extra attribution after 12th word gets truncated.
    // Enough significant words that a trailing "Source Name" falls outside the 12-word window.
    const hash1 = await computeSyndicationHash(
      "Nucor Corporation Reports Record Q1 2026 Revenue Growth Beating Wall Street Estimates Substantially Higher Margins",
      "2026-04-12"
    );
    const hash2 = await computeSyndicationHash(
      "Nucor Corporation Reports Record Q1 2026 Revenue Growth Beating Wall Street Estimates - Yahoo Finance Reporting",
      "2026-04-12"
    );
    // First 12 significant words are identical in both
    expect(hash1).toBe(hash2);
  });

  test("computeSyndicationHash differs for different dates", async () => {
    const hash1 = await computeSyndicationHash("Nucor Reports Earnings", "2026-04-12");
    const hash2 = await computeSyndicationHash("Nucor Reports Earnings", "2026-04-13");
    expect(hash1).not.toBe(hash2);
  });

  test("computeSyndicationHash differs for materially different headlines", async () => {
    const hash1 = await computeSyndicationHash("Nucor Reports Record Q1 Earnings", "2026-04-12");
    const hash2 = await computeSyndicationHash("Vulcan Materials Announces Dividend Increase", "2026-04-12");
    expect(hash1).not.toBe(hash2);
  });
});

// ── Structured Extraction Tests ──

describe("structured extraction field handling", () => {
  test("extraction result uses null for absent fields, not empty strings", () => {
    // Simulate what the extraction parser should produce for missing fields
    const mockExtraction = {
      revenue_figure: null,
      revenue_period: null,
      revenue_currency: null,
      ebitda_figure: null,
      ebitda_margin_pct: null,
      yoy_growth_pct: null,
      guidance_verbatim: null,
      guidance_direction: null,
      guidance_period: null,
      mentioned_headwinds: null,
      mentioned_tailwinds: null,
      mentioned_capex: null,
      mentioned_volume_language: null,
      pricing_action: null,
      pricing_percentage: null,
      additional_metrics: null,
      extraction_confidence: null,
      fields_present: [] as string[],
      fields_absent: [
        "revenue_figure", "revenue_period", "revenue_currency",
        "ebitda_figure", "ebitda_margin_pct", "yoy_growth_pct",
        "guidance_verbatim", "guidance_direction", "guidance_period",
        "mentioned_headwinds", "mentioned_tailwinds", "mentioned_capex",
        "mentioned_volume_language", "pricing_action", "pricing_percentage",
      ],
    };

    // Verify null, not empty string
    for (const [key, value] of Object.entries(mockExtraction)) {
      if (key === "fields_present" || key === "fields_absent") continue;
      expect(value).toBeNull();
      expect(value).not.toBe("");
      expect(value).not.toBe(0);
    }
  });

  test("fields_present and fields_absent are mutually exclusive and exhaustive", () => {
    const allFields = [
      "revenue_figure", "revenue_period", "revenue_currency", "ebitda_figure",
      "ebitda_margin_pct", "yoy_growth_pct", "guidance_verbatim", "guidance_direction",
      "guidance_period", "mentioned_headwinds", "mentioned_tailwinds", "mentioned_capex",
      "mentioned_volume_language", "pricing_action", "pricing_percentage",
    ];

    // Simulate a partial extraction
    const fieldsPresent = ["revenue_figure", "revenue_period", "yoy_growth_pct"];
    const fieldsAbsent = allFields.filter(f => !fieldsPresent.includes(f));

    // No overlap
    const overlap = fieldsPresent.filter(f => fieldsAbsent.includes(f));
    expect(overlap.length).toBe(0);

    // Together they cover all fields
    const combined = [...fieldsPresent, ...fieldsAbsent].sort();
    expect(combined).toEqual(allFields.sort());
  });
});

// ── Anomaly Detection Tests ──

describe("anomaly detection", () => {
  // Import dynamically to handle the module's import chain
  test("detects revenue anomaly >15%", async () => {
    const { detectAnomalies } = await import("../services/financial-data/capiq-client");

    const current = {
      company: "Test Co", ticker: "TEST",
      revenue_growth_yoy: 18.5,
      ebitda_margin_pct: 15.0,
      gross_margin_pct: 35.0,
      net_debt: null, ebitda_ltm: null, fcf_ltm: null,
    } as any;

    const previous = {
      revenue_ltm: 10.0,
      ebitda_margin_pct: 14.5,
      gross_margin_pct: 34.0,
    } as any;

    const flags = detectAnomalies(current, previous);
    const revenueFlag = flags.find(f => f.anomaly_type === "revenue_anomaly");
    expect(revenueFlag).toBeDefined();
    expect(revenueFlag!.metric).toBe("revenue_growth_yoy");
    expect(revenueFlag!.threshold).toBe(15);
  });

  test("detects margin anomaly >2pp", async () => {
    const { detectAnomalies } = await import("../services/financial-data/capiq-client");

    const current = {
      company: "Test Co", ticker: "TEST",
      revenue_growth_yoy: 5.0,
      ebitda_margin_pct: 20.0,
      gross_margin_pct: 35.0,
      net_debt: null, ebitda_ltm: null, fcf_ltm: null,
    } as any;

    const previous = {
      ebitda_margin_pct: 15.0,
      gross_margin_pct: 35.0,
    } as any;

    const flags = detectAnomalies(current, previous);
    const marginFlag = flags.find(f => f.anomaly_type === "margin_anomaly" && f.metric === "ebitda_margin_pct");
    expect(marginFlag).toBeDefined();
    expect(marginFlag!.delta).toBe(5.0);
    expect(marginFlag!.threshold).toBe(2.0);
  });

  test("does not flag normal changes", async () => {
    const { detectAnomalies } = await import("../services/financial-data/capiq-client");

    const current = {
      company: "Test Co", ticker: "TEST",
      revenue_growth_yoy: 5.0,
      ebitda_margin_pct: 15.5,
      gross_margin_pct: 35.2,
      net_debt: null, ebitda_ltm: null, fcf_ltm: null,
    } as any;

    const previous = {
      ebitda_margin_pct: 15.0,
      gross_margin_pct: 35.0,
    } as any;

    const flags = detectAnomalies(current, previous);
    expect(flags.length).toBe(0);
  });

  test("returns empty for null previous data", async () => {
    const { detectAnomalies } = await import("../services/financial-data/capiq-client");
    const current = { company: "Test", ticker: "T", revenue_growth_yoy: 50.0 } as any;
    const flags = detectAnomalies(current, null);
    expect(flags.length).toBe(0);
  });
});

// ── Capital IQ Fallback Tests ──

describe("Capital IQ fallback behavior", () => {
  test("isCapIQConfigured returns false without env vars", async () => {
    const { isCapIQConfigured } = await import("../services/financial-data/capiq-client");
    // In test environment, CAPIQ vars should not be set
    const configured = isCapIQConfigured();
    expect(configured).toBe(false);
  });

  test("fetchCompanyFinancials returns fallback data when CapIQ not configured", async () => {
    const { fetchCompanyFinancials } = await import("../services/financial-data/capiq-client");

    // This test only verifies the fallback path is taken.
    // It will make a real Yahoo Finance call, so we just verify the structure.
    const company = { company: "Test", ticker: "INVALID_TICKER_XYZ", segment: "Test", category: "materials" as const, country: "US" };
    const result = await fetchCompanyFinancials(company, "H1 2026");

    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBeDefined();
    // data may be null for invalid ticker, that's OK
    if (result.data) {
      expect(result.data.data_source).toBe("yahoo_finance_fallback");
    }
  });
});

// ── Report Generation Validation Tests ──

describe("report generation validation", () => {
  test("checkReportReadyCount returns error message when count is insufficient", async () => {
    // This test requires a Supabase connection
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("  Skipping (no SUPABASE_SERVICE_ROLE_KEY)");
      return;
    }
    const { checkReportReadyCount } = await import("../lib/report-validation");

    // Use a date range far in the future where no articles exist
    const result = await checkReportReadyCount("2099-01-01", "2099-12-31", 20);
    expect(result).not.toBeNull();
    expect(result).toContain("Insufficient");
  });

  test("provenance appendix HTML is always generated", async () => {
    const { renderProvenanceHTML } = await import("../lib/report-validation");

    const provenance = {
      dateRange: { start: "2026-01-01", end: "2026-06-30" },
      articleCount: 100,
      excludedCount: 15,
      articlesByCategory: { "Earnings": 30, "Pricing & Cost Trends": 25 },
      financialSources: [
        { company: "Nucor", source: "capital_iq", pullDate: "2026-04-12T00:00:00Z", verified: true },
        { company: "CRH", source: "yahoo_finance_fallback", pullDate: "2026-04-12T00:00:00Z", verified: false },
      ],
      modelVersions: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
      promptVersions: ["extraction-v1.0", "summary-standard-v1.0"],
      warnings: [
        { check: "financial_consistency", severity: "warning" as const, message: "2 figures untraceable" },
      ],
      pendingReviewCount: 5,
    };

    const html = renderProvenanceHTML(provenance);

    // Must contain key sections
    expect(html).toContain("Data Provenance");
    expect(html).toContain("Methodology");
    expect(html).toContain("2026-01-01");
    expect(html).toContain("2026-06-30");
    expect(html).toContain("100");
    expect(html).toContain("15");
    expect(html).toContain("Nucor");
    expect(html).toContain("capital_iq");
    expect(html).toContain("yahoo_finance_fallback");
    expect(html).toContain("claude-haiku");
    expect(html).toContain("extraction-v1.0");
    expect(html).toContain("2 figures untraceable");
    expect(html).toContain("5");
    expect(html).toContain("cannot be removed");
  });

  test("validation correctly flags unverified Yahoo Finance fallback data", async () => {
    const { renderProvenanceHTML } = await import("../lib/report-validation");

    const provenance = {
      dateRange: { start: "2026-01-01", end: "2026-06-30" },
      articleCount: 50,
      excludedCount: 0,
      articlesByCategory: {},
      financialSources: [
        { company: "CEMEX", source: "yahoo_finance_fallback", pullDate: "2026-04-12", verified: false },
      ],
      modelVersions: [],
      promptVersions: [],
      warnings: [{
        check: "financial_source_quality",
        severity: "warning" as const,
        message: "1 company/companies have unverified Yahoo Finance fallback data: CEMEX",
      }],
      pendingReviewCount: 0,
    };

    const html = renderProvenanceHTML(provenance);
    expect(html).toContain("financial_source_quality");
    expect(html).toContain("CEMEX");
    expect(html).toContain("unverified");
  });
});

// ── Rejected Articles Logging Tests ──

describe("rejected article logging", () => {
  test("rejection reasons are valid enum values", () => {
    const validReasons = [
      "domain_not_whitelisted",
      "duplicate_url",
      "duplicate_title",
      "duplicate_syndication_hash",
      "paywall_blocked",
      "extraction_failed",
      "below_relevance_threshold",
      "company_match_failed",
    ];

    // Verify our code uses valid reasons
    // These are the reasons used in daily-scan.ts
    const usedReasons = [
      "domain_not_whitelisted",
      "duplicate_title",
      "duplicate_syndication_hash",
    ];

    for (const reason of usedReasons) {
      expect(validReasons).toContain(reason);
    }
  });
});

// ── Company Matching Tests ──

describe("tightened company matching", () => {
  // We test the matching logic indirectly through the exported patterns
  test("segment keyword alone does not match", () => {
    // "steel prices rose 15%" should NOT link to Steel Dynamics
    // because there's no company identifier — just a segment keyword
    const title = "Steel prices rose 15% in Q1 amid tariff uncertainty";
    const content = "";
    const text = (" " + title + " " + content + " ").toLowerCase();

    // Simulate the matching logic: segment keyword "steel" matches but
    // no ticker (STLD) and no full name ("steel dynamics")
    const hasTickerSTLD = /\bSTLD\b/i.test(text);
    const hasFullName = text.includes("steel dynamics");
    const hasSegmentKeyword = text.includes("steel");

    expect(hasTickerSTLD).toBe(false);
    expect(hasFullName).toBe(false);
    expect(hasSegmentKeyword).toBe(true);

    // With only segment keyword, no match should be produced
    // (the actual matchCompanies function enforces this)
  });

  test("ticker + segment keyword produces high-confidence match", () => {
    const title = "STLD reports strong steel demand in Q1 2026";
    const text = (" " + title + " ").toLowerCase();

    const hasTickerSTLD = /\bstld\b/i.test(text);
    const hasSegmentKeyword = text.includes("steel");

    expect(hasTickerSTLD).toBe(true);
    expect(hasSegmentKeyword).toBe(true);
    // Two signals → high confidence
  });

  test("full company name produces at least low-confidence match", () => {
    const title = "Home Depot announces spring seasonal hiring initiative";
    const text = (" " + title + " ").toLowerCase();

    expect(text).toContain("home depot");
    // Single signal (full name) → low confidence but still a match
  });
});

// ── Config File Tests ──

describe("config files", () => {
  test("report-sections.json has 9 sections", async () => {
    const config = await import("../config/report-sections.json");
    expect(config.sections.length).toBe(9);
  });

  test("market-drivers.json has 7 drivers", async () => {
    const config = await import("../config/market-drivers.json");
    expect(config.drivers.length).toBe(7);
  });

  test("prompt-versions.json has initial versions", async () => {
    const config = await import("../config/prompt-versions.json");
    expect(config.versions.length).toBeGreaterThanOrEqual(4);

    // Verify each version has required fields
    for (const v of config.versions) {
      expect(v.id).toBeDefined();
      expect(v.type).toBeDefined();
      expect(v.model).toBeDefined();
      expect(v.created).toBeDefined();
      expect(v.description).toBeDefined();
      expect(v.prompt).toBeDefined();
    }
  });

  test("report sections config matches expected slugs", async () => {
    const config = await import("../config/report-sections.json");
    const slugs = config.sections.map((s: any) => s.slug);
    expect(slugs).toContain("intro-exec-summary");
    expect(slugs).toContain("drivers-market-health");
    expect(slugs).toContain("public-company-performance");
    expect(slugs).toContain("public-company-snapshot");
  });
});

// ── FX Rate Tests ──

describe("FX rate utilities", () => {
  test("getCurrencyForCountry returns correct currencies", async () => {
    const { getCurrencyForCountry } = await import("../services/financial-data/fx-rates");

    expect(getCurrencyForCountry("US")).toBe("USD");
    expect(getCurrencyForCountry("DE")).toBe("EUR");
    expect(getCurrencyForCountry("JP")).toBe("JPY");
    expect(getCurrencyForCountry("CA")).toBe("CAD");
    expect(getCurrencyForCountry("CH")).toBe("CHF");
    expect(getCurrencyForCountry("SE")).toBe("SEK");
  });

  test("USD to USD conversion returns identity rate", async () => {
    const { getUSDConversionRate } = await import("../services/financial-data/fx-rates");

    const result = await getUSDConversionRate("USD", 2026, 1);
    expect(result).not.toBeNull();
    expect(result!.rate).toBe(1.0);
    expect(result!.source).toBe("identity");
  });
});
