/**
 * Tests for lib/company-match.ts.
 *
 * The 2-signal rule is the contract that keeps macro/policy noise out of
 * company-pivot views. False positives are worse than false negatives here
 * because they pollute report sections.
 */
import { describe, test, expect } from "bun:test";
import { matchCompanies } from "../lib/company-match";

describe("matchCompanies — high-confidence (2+ signals)", () => {
  test("ticker + full name → high-confidence Nucor", () => {
    const m = matchCompanies("Nucor Q1 earnings", "NUE delivered strong Q1 results in steel");
    const nucor = m.find(x => x.slug === "nucor");
    expect(nucor).toBeDefined();
    expect(nucor!.lowConfidence).toBe(false);
    expect(nucor!.signals.length).toBeGreaterThanOrEqual(2);
  });

  test("ticker + segment keyword → high-confidence (segment-keyword promotes single signal)", () => {
    const m = matchCompanies("STLD reports Q1 earnings", "Steel Dynamics announced strong flat-rolled volume growth");
    const stld = m.find(x => x.slug === "steel-dynamics");
    expect(stld).toBeDefined();
    expect(stld!.lowConfidence).toBe(false);
  });

  test("full name in title + ticker in body → both Nucor signals", () => {
    const m = matchCompanies("Nucor Corp expands Arkansas plant", "Investors trading NUE on the news");
    const nucor = m.find(x => x.slug === "nucor");
    expect(nucor).toBeDefined();
    expect(nucor!.lowConfidence).toBe(false);
  });
});

describe("matchCompanies — low-confidence (single non-segment signal)", () => {
  test("full name alone → low-confidence link (still recorded for review)", () => {
    const m = matchCompanies("Home Depot announces spring hiring", "Discount retail trends");
    const hd = m.find(x => x.slug === "home-depot");
    expect(hd).toBeDefined();
    expect(hd!.lowConfidence).toBe(true);
  });

  test("ticker alone (no surrounding signal) → low-confidence", () => {
    const m = matchCompanies("Markets recap: STLD lower", "Some unrelated commentary");
    const stld = m.find(x => x.slug === "steel-dynamics");
    expect(stld).toBeDefined();
    expect(stld!.lowConfidence).toBe(true);
  });
});

describe("matchCompanies — segment-keyword rejection (false-positive guard)", () => {
  test("'steel prices rose 15%' produces no match (segment keyword alone)", () => {
    const m = matchCompanies("Steel prices rose 15% in Q1 amid tariff uncertainty", "");
    expect(m.find(x => x.slug === "steel-dynamics")).toBeUndefined();
    expect(m.find(x => x.slug === "nucor")).toBeUndefined();
    expect(m.find(x => x.slug === "arcelormittal")).toBeUndefined();
  });

  test("'cement industry consolidation' produces no match", () => {
    const m = matchCompanies("Cement industry consolidation accelerates", "Aggregates demand outlook");
    expect(m.find(x => x.slug === "crh")).toBeUndefined();
    expect(m.find(x => x.slug === "cemex")).toBeUndefined();
    expect(m.find(x => x.slug === "holcim")).toBeUndefined();
  });

  test("'hvac sector outlook' produces no match", () => {
    const m = matchCompanies("HVAC sector outlook for 2026", "Climate-control demand projections");
    expect(m.find(x => x.slug === "trane-technologies")).toBeUndefined();
    expect(m.find(x => x.slug === "carrier-global")).toBeUndefined();
  });
});

describe("matchCompanies — abbreviation rule (financial context only)", () => {
  test("'Carrier' alone in financial context → low-confidence Carrier (abbreviation)", () => {
    const m = matchCompanies("Carrier Q1 revenue grew 8% on strong dividend", "Carrier reported earnings beat");
    // "carrier" abbreviation + financial context = 1 signal; segment "hvac" not in text
    const c = m.find(x => x.slug === "carrier-global");
    expect(c).toBeDefined();
  });

  test("'Carrier' in non-financial context → no match (abbreviation gated)", () => {
    const m = matchCompanies("Carrier pigeons return to Manhattan", "Wildlife sightings increase");
    // No financial context words, no ticker, no full name → no match
    expect(m.find(x => x.slug === "carrier-global")).toBeUndefined();
  });
});

describe("matchCompanies — multi-company articles", () => {
  test("Home Depot AND Lowe's both link from a comparison piece", () => {
    const m = matchCompanies("Home Depot vs Lowe's: home improvement showdown", "HD shares outperformed LOW this quarter");
    expect(m.find(x => x.slug === "home-depot")).toBeDefined();
    expect(m.find(x => x.slug === "lowes")).toBeDefined();
  });
});

describe("matchCompanies — ticker disambiguation", () => {
  test("'MT' (ArcelorMittal) doesn't match the literal word 'mt' inside another word", () => {
    // Without word boundaries, "amount" would match MT. Confirm boundary fix.
    const m = matchCompanies("Significant amount of new steel production", "amount management strategy");
    expect(m.find(x => x.slug === "arcelormittal")).toBeUndefined();
  });

  test("'HD' (Home Depot) requires word boundary", () => {
    const m = matchCompanies("HDD storage prices fall as SSD adoption grows", "");
    expect(m.find(x => x.slug === "home-depot")).toBeUndefined();
  });
});

describe("matchCompanies — empty/edge inputs", () => {
  test("empty title and content → no matches", () => {
    expect(matchCompanies("", "")).toEqual([]);
  });

  test("only whitespace → no matches", () => {
    expect(matchCompanies("   ", "\n\n\t")).toEqual([]);
  });
});
