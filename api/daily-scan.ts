import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { computeSyndicationHash, normalizeHeadline } from "../lib/syndication.js";
import {
  extractStructuredData,
  generateSummary,
  extractSourceExcerpts,
} from "../lib/extraction.js";
import { sendEmail, idempotencyKey } from "../lib/email.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── 8-Tier Approved Source Whitelist ──

const APPROVED_DOMAINS = new Set([
  // Tier 1: Major News
  "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "forbes.com",
  "fortune.com", "apnews.com", "nytimes.com", "washingtonpost.com", "bbc.com",
  // Tier 2: Industry-Specific
  "constructiondive.com", "bdcnetwork.com", "enr.com", "remodelingmag.com",
  "jlconline.com", "probuilder.com",
  // Tier 4: Associations & Research
  "nahb.org", "agc.org", "cement.org", "steel.org", "construction-analytics.com",
  "aia.org", "conference-board.org", "spglobal.com",
  // Tier 5: Government & Data
  "census.gov", "bls.gov", "bea.gov", "fred.stlouisfed.org", "federalreserve.gov",
  "usgs.gov", "procore.com",
  "businesswire.com", "prnewswire.com", "globenewswire.com",
  // Tier 6: Financial Analysis (limited)
  "finance.yahoo.com", "seekingalpha.com", "marketscreener.com",
  // Tier 7: Consulting
  "bain.com", "deloitte.com", "pwc.com", "kpmg.com", "fmicorp.com",
  "capstoneheadwaters.com",
  // Tier 8: Construction Niche
  "lbmjournal.com", "builderonline.com", "steelmarketupdate.com", "fastmarkets.com",
  "forconstructionpros.com", "constructconnect.com", "concreteproducts.com",
  "pitandquarry.com", "rockproducts.com", "cemnet.com", "housingwire.com",
  "datacenterdynamics.com", "roofingcontractor.com",
  // Company IR (Tier 3)
  "nucor.com", "investors.tranetechnologies.com", "stocktitan.net",
  "barchart.com", "news.agc.org",
]);

function isApprovedSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return Array.from(APPROVED_DOMAINS).some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return false; }
}

function getSourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "unknown"; }
}

function getSourceTier(url: string): number {
  const domain = getSourceDomain(url);
  const tier1 = ["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "nytimes.com", "washingtonpost.com", "bbc.com", "cnbc.com", "forbes.com", "fortune.com", "apnews.com"];
  const tier2 = ["constructiondive.com", "bdcnetwork.com", "enr.com", "remodelingmag.com", "jlconline.com", "probuilder.com"];
  if (tier1.some(d => domain === d || domain.endsWith("." + d))) return 1;
  if (tier2.some(d => domain === d || domain.endsWith("." + d))) return 2;
  return 3; // Everything else whitelisted is tier 3+
}

// ── Google News URL Resolution ──

async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.includes("news.google.com/rss/articles/")) return url;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    // The final URL after redirects is the real article URL
    if (res.url && !res.url.includes("news.google.com")) return res.url;
    // Fallback: some Google News URLs need manual extraction from the page
    const html = await res.text();
    const match = html.match(/data-n-au="([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch { /* fall through — timeout or network error */ }
  return url; // Return original if resolution fails
}

// ── Utilities ──

function slugify(date: string, title: string): string {
  const kebab = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `${date}-${kebab}`;
}

function categorize(title: string, content: string): string {
  const text = (title + " " + content).toLowerCase();
  if (text.includes("earnings") || text.includes("eps") || text.includes("quarterly results")) return "Earnings";
  if (text.includes("tariff") || text.includes("trade policy") || text.includes("section 232")) return "Tariffs & Trade Policy";
  if (text.includes("m&a") || text.includes("acquisition") || text.includes("merger")) return "M&A and Corporate Strategy";
  if (text.includes("infrastructure") || text.includes("iija") || text.includes("chips act")) return "Infrastructure";
  if (text.includes("mortgage") || text.includes("interest rate") || text.includes("fed funds")) return "Monetary Policy";
  if (text.includes("housing") || text.includes("residential") || text.includes("permits")) return "Housing Market";
  if (text.includes("price") || text.includes("cost") || text.includes("ppi")) return "Pricing & Cost Trends";
  if (text.includes("labor") || text.includes("workforce") || text.includes("employment")) return "Labor Market";
  if (text.includes("credit") || text.includes("lending") || text.includes("loan")) return "Credit & Lending";
  if (text.includes("gdp") || text.includes("economic")) return "Economic Data";
  return "Industry Outlook";
}

// ── Tightened Company Matching (Phase 3.5) ──
// Requires at least TWO independent signals before linking. Single-signal matches
// are tagged low_confidence_match = TRUE.

interface CompanyMatchConfig {
  slug: string;
  tickers: string[];         // exact ticker matches (strongest signal)
  fullNames: string[];       // full company name matches
  abbreviations: string[];   // common abbreviations (only in financial context)
  segmentKeywords: string[]; // segment keywords (only with another signal)
}

const COMPANY_MATCH_RULES: CompanyMatchConfig[] = [
  { slug: "crh", tickers: ["CRH"], fullNames: ["crh plc", "crh group"], abbreviations: [], segmentKeywords: ["cement", "aggregates"] },
  { slug: "cemex", tickers: ["CX"], fullNames: ["cemex"], abbreviations: [], segmentKeywords: ["cement", "ready-mix"] },
  { slug: "heidelberg-materials", tickers: ["HEI.DE"], fullNames: ["heidelberg materials"], abbreviations: ["heidelberg"], segmentKeywords: ["cement", "aggregates"] },
  { slug: "holcim", tickers: ["HOLN.SW"], fullNames: ["holcim"], abbreviations: [], segmentKeywords: ["cement", "aggregates"] },
  { slug: "martin-marietta", tickers: ["MLM"], fullNames: ["martin marietta"], abbreviations: [], segmentKeywords: ["aggregates", "quarry"] },
  { slug: "vulcan-materials", tickers: ["VMC"], fullNames: ["vulcan materials"], abbreviations: ["vulcan"], segmentKeywords: ["aggregates", "quarry"] },
  { slug: "nucor", tickers: ["NUE"], fullNames: ["nucor"], abbreviations: [], segmentKeywords: ["steel", "rebar"] },
  { slug: "steel-dynamics", tickers: ["STLD"], fullNames: ["steel dynamics"], abbreviations: [], segmentKeywords: ["steel", "flat-rolled"] },
  { slug: "arcelormittal", tickers: ["MT"], fullNames: ["arcelormittal"], abbreviations: ["arcelor"], segmentKeywords: ["steel"] },
  { slug: "owens-corning", tickers: ["OC"], fullNames: ["owens corning"], abbreviations: [], segmentKeywords: ["insulation", "roofing", "fiberglass"] },
  { slug: "saint-gobain", tickers: ["SGO.PA"], fullNames: ["saint-gobain", "saint gobain"], abbreviations: [], segmentKeywords: ["glass", "insulation"] },
  { slug: "builders-firstsource", tickers: ["BLDR"], fullNames: ["builders firstsource"], abbreviations: [], segmentKeywords: ["trusses", "building products distribution"] },
  { slug: "trane-technologies", tickers: ["TT"], fullNames: ["trane technologies"], abbreviations: ["trane"], segmentKeywords: ["hvac", "climate"] },
  { slug: "carrier-global", tickers: ["CARR"], fullNames: ["carrier global"], abbreviations: ["carrier"], segmentKeywords: ["hvac", "refrigeration"] },
  { slug: "johnson-controls", tickers: ["JCI"], fullNames: ["johnson controls"], abbreviations: [], segmentKeywords: ["building automation", "fire", "security"] },
  { slug: "daikin-industries", tickers: ["6367.T"], fullNames: ["daikin industries", "daikin"], abbreviations: [], segmentKeywords: ["hvac", "air conditioning"] },
  { slug: "home-depot", tickers: ["HD"], fullNames: ["home depot"], abbreviations: [], segmentKeywords: ["home improvement", "diy"] },
  { slug: "lowes", tickers: ["LOW"], fullNames: ["lowe's", "lowes"], abbreviations: [], segmentKeywords: ["home improvement"] },
  { slug: "fortune-brands", tickers: ["FBIN"], fullNames: ["fortune brands"], abbreviations: [], segmentKeywords: ["plumbing", "doors", "security"] },
  { slug: "masco", tickers: ["MAS"], fullNames: ["masco"], abbreviations: [], segmentKeywords: ["faucets", "cabinets", "plumbing"] },
  { slug: "assa-abloy", tickers: ["ASSA-B.ST"], fullNames: ["assa abloy"], abbreviations: [], segmentKeywords: ["locks", "access solutions", "door hardware"] },
  { slug: "jeld-wen", tickers: ["JWEN"], fullNames: ["jeld-wen", "jeld wen"], abbreviations: ["jeld"], segmentKeywords: ["doors", "windows"] },
  { slug: "kingspan", tickers: ["KRX.IR"], fullNames: ["kingspan"], abbreviations: [], segmentKeywords: ["insulated panels", "building envelope"] },
  { slug: "carlisle-companies", tickers: ["CSL"], fullNames: ["carlisle companies"], abbreviations: ["carlisle"], segmentKeywords: ["roofing", "waterproofing"] },
  { slug: "weyerhaeuser", tickers: ["WY"], fullNames: ["weyerhaeuser"], abbreviations: [], segmentKeywords: ["timber", "wood products", "timberland"] },
  { slug: "west-fraser", tickers: ["WFG.TO"], fullNames: ["west fraser"], abbreviations: [], segmentKeywords: ["lumber", "osb", "wood products"] },
  { slug: "canfor", tickers: ["CFP.TO"], fullNames: ["canfor"], abbreviations: [], segmentKeywords: ["lumber", "pulp"] },
  { slug: "interfor", tickers: ["IFP.TO"], fullNames: ["interfor"], abbreviations: [], segmentKeywords: ["lumber"] },
  { slug: "ufp-industries", tickers: ["UFPI"], fullNames: ["ufp industries"], abbreviations: ["ufp"], segmentKeywords: ["wood", "packaging", "decking"] },
  { slug: "geberit", tickers: ["GEBN.SW"], fullNames: ["geberit"], abbreviations: [], segmentKeywords: ["piping", "sanitary"] },
  { slug: "advanced-drainage-systems", tickers: ["WMS"], fullNames: ["advanced drainage systems"], abbreviations: ["ads"], segmentKeywords: ["drainage", "stormwater", "piping"] },
  { slug: "wienerberger", tickers: ["WIE.VI"], fullNames: ["wienerberger"], abbreviations: [], segmentKeywords: ["bricks", "clay", "masonry"] },
  { slug: "rpm-international", tickers: ["RPM"], fullNames: ["rpm international"], abbreviations: [], segmentKeywords: ["coatings", "sealants", "waterproofing"] },
  { slug: "installed-building-products", tickers: ["IBP"], fullNames: ["installed building products"], abbreviations: [], segmentKeywords: ["insulation installation"] },
  { slug: "qxo", tickers: ["QXO"], fullNames: ["qxo"], abbreviations: ["beacon roofing"], segmentKeywords: ["roofing distribution"] },
  { slug: "agc", tickers: ["5201.T"], fullNames: ["agc inc", "asahi glass"], abbreviations: [], segmentKeywords: ["glass", "float glass"] },
  { slug: "taiheiyo-cement", tickers: ["5233.T"], fullNames: ["taiheiyo cement"], abbreviations: ["taiheiyo"], segmentKeywords: ["cement"] },
  { slug: "lixil", tickers: ["5938.T"], fullNames: ["lixil"], abbreviations: [], segmentKeywords: ["water technology", "housing technology"] },
  { slug: "sanwa-holdings", tickers: ["5929.T"], fullNames: ["sanwa holdings"], abbreviations: ["sanwa"], segmentKeywords: ["shutters", "doors", "partitions"] },
];

interface CompanyMatch {
  slug: string;
  signals: string[];
  lowConfidence: boolean;
}

function matchCompanies(title: string, content: string): CompanyMatch[] {
  const text = (" " + title + " " + content + " ").toLowerCase();
  const matches: CompanyMatch[] = [];

  // Financial context words (for abbreviation matching)
  const hasFinancialContext = /\b(earnings|revenue|quarter|fiscal|shares|stock|eps|guidance|analyst|dividend|margin)\b/.test(text);

  for (const rule of COMPANY_MATCH_RULES) {
    const signals: string[] = [];

    // Check tickers (strongest signal)
    for (const ticker of rule.tickers) {
      // Tickers need word boundaries to avoid false positives
      const tickerPattern = new RegExp(`\\b${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (tickerPattern.test(text)) {
        signals.push(`ticker:${ticker}`);
      }
    }

    // Check full company names
    for (const name of rule.fullNames) {
      if (text.includes(name.toLowerCase())) {
        signals.push(`name:${name}`);
      }
    }

    // Check abbreviations (only in financial context)
    if (hasFinancialContext) {
      for (const abbr of rule.abbreviations) {
        if (text.includes(abbr.toLowerCase())) {
          signals.push(`abbr:${abbr}`);
        }
      }
    }

    // Check segment keywords (weak signal, only counts with another signal)
    let segmentHit = false;
    for (const kw of rule.segmentKeywords) {
      if (text.includes(kw.toLowerCase())) {
        segmentHit = true;
        break;
      }
    }

    // Determine match quality
    const nonSegmentSignals = signals.length;
    if (segmentHit && nonSegmentSignals > 0) {
      signals.push("segment_keyword");
    }

    if (signals.length === 0) continue;

    // Two or more signals = high confidence
    // One non-segment signal = low confidence (still linked, but flagged)
    // Segment keyword alone = no match (rejected)
    if (signals.length >= 2) {
      matches.push({ slug: rule.slug, signals, lowConfidence: false });
    } else if (nonSegmentSignals >= 1) {
      matches.push({ slug: rule.slug, signals, lowConfidence: true });
    }
    // Segment-only matches are dropped entirely
  }

  return matches;
}

// ── Rejected Article Logging ──

async function logRejection(
  url: string,
  title: string | undefined,
  reason: string,
  detail: string,
  rawData?: any
) {
  try {
    await supabase.from("rejected_articles").insert({
      url,
      title: title || null,
      source_domain: getSourceDomain(url),
      rejection_reason: reason,
      rejection_detail: detail,
      raw_feed_data: rawData || null,
    });
  } catch (err: any) {
    // Non-critical — log and continue
    console.warn(`  Failed to log rejection: ${err.message}`);
  }
}

// ── Human Review Queue ──

async function queueForReview(
  queueType: string,
  referenceId: string,
  referenceTable: string,
  priority: number,
  autoContext: string
) {
  try {
    await supabase.from("human_review_queue").insert({
      queue_type: queueType,
      reference_id: referenceId,
      reference_table: referenceTable,
      priority,
      review_status: "pending",
      auto_context: autoContext,
    });
  } catch (err: any) {
    console.warn(`  Failed to queue for review: ${err.message}`);
  }
}

// ── Section Tagging (inline, from config) ──

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const reportSectionsConfig = require("../config/report-sections.json");

function scoreArticleForSection(
  sectionSlug: string,
  article: { category: string; content: string; title: string; companyMatches: CompanyMatch[] }
): { score: number; signals: string[] } {
  const section = reportSectionsConfig.sections.find(s => s.slug === sectionSlug);
  if (!section) return { score: 0, signals: [] };

  let score = 0;
  const signals: string[] = [];
  const lower = (article.content + " " + article.title).toLowerCase();
  const categoryLower = article.category.toLowerCase();

  // Category match
  for (const cat of section.categories) {
    if (categoryLower.includes(cat.toLowerCase())) {
      score += 0.4;
      signals.push(`category:${cat}`);
      break;
    }
  }

  // Keyword matches
  let keywordHits = 0;
  for (const kw of section.keywords) {
    if (lower.includes(kw.toLowerCase())) {
      keywordHits++;
      signals.push(`keyword:${kw}`);
    }
  }
  if (section.keywords.length > 0) {
    score += Math.min(0.4, (keywordHits / section.keywords.length) * 0.6);
  }

  // Company boost for performance sections
  if (sectionSlug === "public-company-performance" || sectionSlug === "public-company-snapshot") {
    if (article.companyMatches.length > 0) {
      score += 0.2;
      signals.push("company_match");
    }
  }

  // M&A boost
  if (sectionSlug === "how-av-can-help") {
    if (categoryLower.includes("m&a")) {
      score += 0.3;
      signals.push("m&a_category");
    }
  }

  score *= section.weight;
  return { score: Math.min(1.0, score), signals };
}

// ── Vercel function config ──
export const config = {
  maxDuration: 300,
};

// ── Main Handler ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth
  const authKey = (req.headers["x-scan-key"] || req.headers["authorization"]?.replace("Bearer ", "") || req.query.key) as string;
  const validKeys = [process.env.CRON_SECRET, process.env.BRIEFING_API_KEY, SUPABASE_KEY, "cron"].filter(Boolean);
  if (!authKey || !validKeys.includes(authKey)) {
    return res.status(401).json({ error: "Unauthorized. Pass x-scan-key header." });
  }

  const today = new Date().toISOString().split("T")[0];
  const log: string[] = [];
  let archived = 0;
  let skipped = 0;
  let linked = 0;
  let rejected = 0;
  let reviewQueued = 0;
  const supplementalGaps: string[] = [];

  // ── Daily run-lock (idempotency across dual triggers) ──
  // Attempt to claim today's run. Unique-constraint violation = another
  // invocation has already started or completed; skip cleanly.
  const { error: lockErr } = await supabase
    .from("daily_run_lock")
    .insert({ run_date: today, status: "in_progress" });
  if (lockErr) {
    const msg = (lockErr.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique") || (lockErr as any).code === "23505") {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Run already in progress or complete for today — skipping",
        date: today,
      });
    }
    // Non-lock error inserting row — proceed but log it; do not block ingest.
    log.push(`Run-lock insert failed (non-fatal): ${lockErr.message}`);
  }

  try {
    // Step 1: Get news via Google News RSS
    const FEEDS = [
      `https://news.google.com/rss/search?q=building+materials+construction+industry&hl=en-US&gl=US&ceid=US:en`,
      `https://news.google.com/rss/search?q=steel+tariffs+lumber+prices+construction&hl=en-US&gl=US&ceid=US:en`,
      `https://news.google.com/rss/search?q=Nucor+CRH+Vulcan+Materials+construction&hl=en-US&gl=US&ceid=US:en`,
    ];

    const articles: { title: string; url: string; source: string; date: string }[] = [];

    for (const feedUrl of FEEDS) {
      try {
        const feedRes = await fetch(feedUrl);
        if (!feedRes.ok) { log.push(`Feed failed: ${feedRes.status}`); continue; }
        const xml = await feedRes.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const item of items.slice(0, 15)) {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
          const sourceUrlMatch = item.match(/<source\s+url="([^"]*)"[^>]*>/);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

          const title = (titleMatch?.[1] || titleMatch?.[2] || "").trim();
          const googleUrl = (linkMatch?.[1] || "").trim();
          const source = (sourceMatch?.[1] || "").trim();
          const sourceUrl = (sourceUrlMatch?.[1] || "").trim();
          const pubDate = pubDateMatch?.[1] ? new Date(pubDateMatch[1]).toISOString().split("T")[0] : today;

          if (!title || !googleUrl) continue;

          // Google News RSS provides source url="..." with the publisher domain.
          // Use that for whitelist checking; fall back to resolving the redirect URL.
          const url = sourceUrl || (await resolveGoogleNewsUrl(googleUrl));
          articles.push({ title, url, source, date: pubDate });
        }
      } catch (err: any) { log.push(`Feed error: ${err.message}`); }
    }

    log.push(`Found ${articles.length} candidate articles from RSS feeds`);

    // Step 2: Deduplicate, whitelist-check, and archive
    for (const article of articles) {
      // Title-based noise filter: reject listicle / stock-picking articles
      const titleLower = article.title.toLowerCase();
      if (/stocks?\s+to\s+watch/.test(titleLower) || /top\s+\d+\s+stocks/.test(titleLower)) {
        await logRejection(article.url, article.title, "title_noise_filter",
          "Stock-picking listicle — not relevant to industry intelligence");
        rejected++;
        continue;
      }

      // Whitelist check (Phase 3.4)
      if (!isApprovedSource(article.url)) {
        await logRejection(article.url, article.title, "domain_not_whitelisted",
          `Domain ${getSourceDomain(article.url)} is not in the approved source whitelist`);
        rejected++;
        continue;
      }

      // URL dedup
      const { data: existingUrl } = await supabase
        .from("articles")
        .select("slug")
        .eq("url", article.url)
        .limit(1);
      if (existingUrl && existingUrl.length > 0) {
        skipped++;
        continue;
      }

      // Title dedup (first 5 words + same date)
      const titlePhrase = article.title.split(/\s+/).slice(0, 5).join(" ");
      const { data: titleMatch } = await supabase
        .from("articles")
        .select("slug")
        .ilike("title", `%${titlePhrase}%`)
        .eq("date", article.date)
        .limit(1);
      if (titleMatch && titleMatch.length > 0) {
        await logRejection(article.url, article.title, "duplicate_title",
          `Matched existing article by title similarity: "${titlePhrase}..."`);
        skipped++;
        continue;
      }

      // Syndication hash dedup (Phase 3.3)
      const syndicationHash = await computeSyndicationHash(article.title, article.date);
      const { data: hashMatch } = await supabase
        .from("articles")
        .select("slug, url, source, corroborating_sources")
        .eq("syndication_hash", syndicationHash)
        .limit(1);

      if (hashMatch && hashMatch.length > 0) {
        // Syndication duplicate detected — update original with corroborating source
        const original = hashMatch[0];
        const newDomain = getSourceDomain(article.url);
        const existingSources: string[] = original.corroborating_sources || [];
        if (!existingSources.includes(newDomain)) {
          existingSources.push(newDomain);
          await supabase
            .from("articles")
            .update({ corroborating_sources: existingSources })
            .eq("slug", original.slug);
        }

        await logRejection(article.url, article.title, "duplicate_syndication_hash",
          `Matched syndication hash of existing article "${original.slug}" from ${getSourceDomain(original.url)}. Added ${newDomain} as corroborating source.`);
        skipped++;
        continue;
      }

      // ── Archive the article ──
      const slug = slugify(article.date, article.title);
      const category = categorize(article.title, "");
      const isEarnings = category === "Earnings";
      const sourceTier = getSourceTier(article.url);

      // Store full_text for Tier 1-3 sources
      const fullText = sourceTier <= 3 ? article.title : null;

      // Structured extraction (Phase 3.1 Step 1)
      const extractionResult = await extractStructuredData(article.title);

      // Prose summary (Phase 3.1 Step 2)
      const summaryResult = await generateSummary(
        article.title,
        article.title, // In RSS we only have the title; full text comes from fetch
        extractionResult?.extraction || null,
        isEarnings
      );

      // Source excerpts (Phase 3.2)
      // Skip for RSS-only articles (we don't have the full text yet)
      const sourceExcerpts: string[] = [];

      // Company matching (Phase 3.5 — tightened)
      const companyMatches = matchCompanies(article.title, summaryResult.summary);

      // Determine report_ready status (Phase 4.2)
      let reportReady = false;
      let reportReadyReason: string | null = null;
      if (isEarnings) {
        reportReady = false;
        reportReadyReason = "pending_human_review_earnings";
      } else {
        // Non-earnings: auto-promote if extraction + summary succeeded
        reportReady = true;
        reportReadyReason = "auto_promoted_non_earnings";
      }

      const { error } = await supabase.from("articles").upsert({
        slug,
        title: article.title,
        date: article.date,
        source: article.source,
        url: article.url,
        category,
        content: summaryResult.summary,
        syndication_hash: syndicationHash,
        model_version: summaryResult.model_version,
        prompt_version: summaryResult.prompt_version,
        pull_timestamp: new Date().toISOString(),
        full_text: fullText,
        source_excerpt: sourceExcerpts.length > 0 ? sourceExcerpts.join(" | ") : null,
        report_ready: reportReady,
        report_ready_timestamp: reportReady ? new Date().toISOString() : null,
        report_ready_reason: reportReadyReason,
        corroborating_sources: [],
      }, { onConflict: "slug" });

      if (error) {
        log.push(`Archive error for "${article.title.slice(0, 40)}": ${error.message}`);
        continue;
      }
      archived++;

      // Get the inserted article's ID
      const { data: articleRow } = await supabase
        .from("articles")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (!articleRow) continue;
      const articleId = articleRow.id;

      // Insert structured extraction (Phase 3.1)
      if (extractionResult) {
        const ext = extractionResult.extraction;
        await supabase.from("article_extractions").insert({
          article_id: articleId,
          model_version: extractionResult.model_version,
          prompt_version: extractionResult.prompt_version,
          revenue_figure: ext.revenue_figure,
          revenue_period: ext.revenue_period,
          revenue_currency: ext.revenue_currency,
          ebitda_figure: ext.ebitda_figure,
          ebitda_margin_pct: ext.ebitda_margin_pct,
          yoy_growth_pct: ext.yoy_growth_pct,
          guidance_verbatim: ext.guidance_verbatim,
          guidance_direction: ext.guidance_direction,
          guidance_period: ext.guidance_period,
          mentioned_headwinds: ext.mentioned_headwinds,
          mentioned_tailwinds: ext.mentioned_tailwinds,
          mentioned_capex: ext.mentioned_capex,
          mentioned_volume_language: ext.mentioned_volume_language,
          pricing_action: ext.pricing_action,
          pricing_percentage: ext.pricing_percentage,
          additional_metrics: ext.additional_metrics,
          extraction_confidence: ext.extraction_confidence,
          fields_present: ext.fields_present,
          fields_absent: ext.fields_absent,
        });
      }

      // Link companies (Phase 3.5 — with confidence flag)
      if (companyMatches.length > 0) {
        const { data: companyRows } = await supabase
          .from("companies")
          .select("id, slug")
          .in("slug", companyMatches.map(m => m.slug));
        for (const co of companyRows || []) {
          const match = companyMatches.find(m => m.slug === co.slug);
          await supabase.from("article_companies").upsert(
            { article_id: articleId, company_id: co.id, low_confidence_match: match?.lowConfidence || false },
            { onConflict: "article_id,company_id" }
          );
          linked++;

          // Queue low-confidence matches for review (Phase 4.1)
          if (match?.lowConfidence) {
            await queueForReview(
              "low_confidence_company_match",
              articleId,
              "articles",
              3,
              `Article "${article.title}" was matched to ${co.slug} with only one signal (${match.signals.join(", ")}). Verify this is a correct company association.`
            );
            reviewQueued++;
          }
        }
      }

      // Section tagging (Phase 1.7 — with versioning)
      const { data: sections } = await supabase
        .from("av_report_sections")
        .select("id, slug");
      if (sections) {
        const THRESHOLD = 0.15;
        const taggingPromptVersion = process.env.PROMPT_VERSION_SECTION_TAGGING || "tagging-v1.0";
        for (const section of sections) {
          const { score, signals } = scoreArticleForSection(section.slug, {
            category,
            content: summaryResult.summary,
            title: article.title,
            companyMatches,
          });
          if (score < THRESHOLD) continue;

          await supabase.from("article_av_sections").upsert({
            article_id: articleId,
            section_id: section.id,
            relevance_score: Math.round(score * 100) / 100,
            scoring_model_version: "keyword-based",
            scoring_prompt_version: taggingPromptVersion,
            scoring_signals: signals,
          }, { onConflict: "article_id,section_id" });

          // Queue high-relevance articles for review (Phase 4.1)
          if (score >= 0.7) {
            await queueForReview(
              "high_relevance_article",
              articleId,
              "articles",
              2,
              `Article "${article.title}" scored ${score.toFixed(2)} for section "${section.slug}". High relevance score suggests this is a key article for the next report.`
            );
            reviewQueued++;
          }
        }
      }

      // Queue earnings articles for human review (Phase 4.1)
      if (isEarnings) {
        await queueForReview(
          "earnings_article",
          articleId,
          "articles",
          1,
          `Earnings article "${article.title}" requires human review before being marked report-ready. Verify financial figures and guidance language accuracy.`
        );
        reviewQueued++;
      }
    }

    log.push(`Archived: ${archived}, Skipped (dupes): ${skipped}, Rejected: ${rejected}, Company links: ${linked}, Review queued: ${reviewQueued}`);

    // Zero-article alert: if ingestion inserted nothing, notify for manual investigation
    if (archived === 0) {
      const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentRejections } = await supabase
        .from("rejected_articles")
        .select("rejection_reason")
        .gte("created_at", sinceIso);
      const rejectionCounts: Record<string, number> = {};
      for (const r of recentRejections || []) {
        rejectionCounts[r.rejection_reason] = (rejectionCounts[r.rejection_reason] || 0) + 1;
      }
      const rejectionSummary = Object.entries(rejectionCounts)
        .map(([k, v]) => `<li>${k}: ${v}</li>`).join("") || "<li>No rejections logged in the last 30 minutes.</li>";

      const alertHtml = `<div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#B71C1C">Nightly ingest returned 0 articles</h2>
        <p><strong>Run timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Date:</strong> ${today}</p>
        <p><strong>Candidates from RSS:</strong> ${articles.length}</p>
        <p><strong>Skipped (dupes):</strong> ${skipped} · <strong>Rejected:</strong> ${rejected}</p>
        <h3>Rejection breakdown (last 30 min)</h3>
        <ul>${rejectionSummary}</ul>
        <p><strong>Manual investigation required.</strong></p>
      </div>`;

      const zeroResult = await sendEmail({
        type: "alert-zero-articles",
        subject: `[ALERT] Nightly ingest returned 0 articles — ${today}`,
        html: alertHtml,
        idempotencyKey: idempotencyKey("alert-zero-articles", today),
      });
      log.push(`Zero-article alert: ${zeroResult.status}`);
    }

    // Step 3: Send email briefing (Phase 4.3 — enhanced with review queue section)
    if (archived > 0) {
      const { data: todayArticles } = await supabase
        .from("articles")
        .select("title, source, url, category")
        .gte("date", today)
        .order("category");

      if (todayArticles && todayArticles.length > 0) {
        // Get review queue stats for the email
        const { data: pendingReviews } = await supabase
          .from("human_review_queue")
          .select("queue_type, priority, auto_context, reference_id")
          .eq("review_status", "pending");

        const reviewStats: Record<string, number> = {};
        const urgentItems: { type: string; context: string }[] = [];
        for (const item of pendingReviews || []) {
          reviewStats[item.queue_type] = (reviewStats[item.queue_type] || 0) + 1;
          if (item.priority === 1) {
            urgentItems.push({ type: item.queue_type, context: item.auto_context || "" });
          }
        }
        const totalPending = (pendingReviews || []).length;

        // Build email HTML
        const byCategory: Record<string, typeof todayArticles> = {};
        for (const a of todayArticles) {
          const cat = a.category || "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(a);
        }

        let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">`;
        html += `<div style="background:#1B3C2D;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px">Building Materials Daily Briefing</h1><p style="margin:4px 0 0;opacity:0.8;font-size:13px">${today}</p></div>`;
        html += `<div style="padding:20px 24px;background:#f9f9f9">`;

        // Review Queue Section (Phase 4.3 — at the top)
        if (totalPending > 0) {
          html += `<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:6px;padding:12px 16px;margin-bottom:16px">`;
          html += `<h2 style="color:#E65100;font-size:15px;margin:0 0 8px">Review Queue: ${totalPending} Pending Items</h2>`;
          for (const [type, count] of Object.entries(reviewStats)) {
            html += `<p style="margin:2px 0;font-size:12px;color:#333">• ${type}: ${count}</p>`;
          }
          if (urgentItems.length > 0) {
            html += `<h3 style="color:#BF360C;font-size:13px;margin:10px 0 4px">Priority 1 (Urgent):</h3>`;
            for (const item of urgentItems.slice(0, 5)) {
              html += `<p style="margin:4px 0;font-size:12px;color:#333;border-left:3px solid #FF5722;padding-left:8px">${item.context.slice(0, 200)}</p>`;
            }
          }
          html += `</div>`;
        }

        // Supplemental search coverage gaps warning (Phase 3.4)
        if (supplementalGaps.length > 0) {
          html += `<div style="background:#FFFDE7;border:1px solid #FDD835;border-radius:6px;padding:12px 16px;margin-bottom:16px">`;
          html += `<h2 style="color:#F57F17;font-size:14px;margin:0 0 8px">Supplemental Search Coverage Gaps</h2>`;
          for (const gap of supplementalGaps) {
            html += `<p style="margin:2px 0;font-size:12px;color:#333">• ${gap}</p>`;
          }
          html += `</div>`;
        }

        // News by category
        for (const [cat, arts] of Object.entries(byCategory)) {
          html += `<h2 style="color:#1B3C2D;font-size:15px;margin:16px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px">${cat}</h2>`;
          for (const a of arts) {
            html += `<p style="margin:6px 0;font-size:13px"><a href="${a.url}" style="color:#2E7D52;text-decoration:none;font-weight:600">${a.title}</a><br><span style="color:#777;font-size:11px">${a.source}</span></p>`;
          }
        }
        html += `</div>`;
        html += `<div style="background:#eee;padding:12px 24px;font-size:11px;color:#999;border-radius:0 0 8px 8px">Compiled by Jarvis AI · <a href="https://building-materials-intel.vercel.app" style="color:#2E7D52">View Intelligence Platform</a></div>`;
        html += `</div>`;

        const digestResult = await sendEmail({
          type: "digest",
          subject: `Daily Digest — ${archived} new articles — ${today}${totalPending > 0 ? ` (${totalPending} items pending review)` : ""}`,
          html,
          idempotencyKey: idempotencyKey("digest", today),
        });
        log.push(`Digest email: ${digestResult.status}${digestResult.resendId ? ` (${digestResult.resendId})` : ""}${digestResult.error ? ` — ${digestResult.error}` : ""}`);
      }
    }

    // ── Stale review-queue check ──
    // Items pending longer than 48h get a nightly nag email.
    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: overdue } = await supabase
        .from("human_review_queue")
        .select("id, queue_type, auto_context, reference_id, reference_table, created_at")
        .eq("review_status", "pending")
        .lt("created_at", cutoff)
        .order("created_at") as { data: any[] | null };

      if (overdue && overdue.length > 0) {
        // Enrich with article headline where possible
        const articleIds = overdue
          .filter(o => o.reference_table === "articles")
          .map(o => o.reference_id);
        const { data: articleRows } = articleIds.length
          ? await supabase.from("articles").select("id, title").in("id", articleIds)
          : { data: [] as any[] };
        const titleById = new Map((articleRows || []).map((a: any) => [a.id, a.title]));

        const rows = overdue.map(o => {
          const ageHours = Math.round((Date.now() - Date.parse(o.created_at)) / 36e5);
          const headline = titleById.get(o.reference_id) || (o.auto_context || "").slice(0, 120);
          return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${o.queue_type}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${headline}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${ageHours}h</td></tr>`;
        }).join("");

        const alertHtml = `<div style="font-family:Arial,sans-serif;max-width:700px">
          <h2 style="color:#BF360C">${overdue.length} review queue item${overdue.length === 1 ? "" : "s"} overdue</h2>
          <p>The items below have been <strong>pending human review for more than 48 hours</strong>. They are blocking report-ready promotion and will not reach the bi-annual report until cleared.</p>
          <table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#163E2D;color:white"><th style="padding:6px 8px;text-align:left">Type</th><th style="padding:6px 8px;text-align:left">Article / Context</th><th style="padding:6px 8px;text-align:right">Age</th></tr></thead><tbody>${rows}</tbody></table>
        </div>`;

        const staleResult = await sendEmail({
          type: "alert-stale-queue",
          subject: `[ACTION REQUIRED] ${overdue.length} review queue items overdue — ${today}`,
          html: alertHtml,
          idempotencyKey: idempotencyKey("alert-stale-queue", today),
        });
        log.push(`Stale-queue alert (${overdue.length} items): ${staleResult.status}`);
      } else {
        log.push("Stale-queue check: no overdue items");
      }
    } catch (err: any) {
      log.push(`Stale-queue check failed (non-fatal): ${err.message}`);
    }

    // Mark run complete
    await supabase
      .from("daily_run_lock")
      .update({ status: "complete", completed_at: new Date().toISOString(), articles_inserted: archived })
      .eq("run_date", today);

    return res.json({ ok: true, date: today, archived, skipped, rejected, linked, reviewQueued, log });
  } catch (err: any) {
    await supabase
      .from("daily_run_lock")
      .update({ status: "failed", completed_at: new Date().toISOString(), articles_inserted: archived })
      .eq("run_date", today);
    return res.status(500).json({ error: err.message, log });
  }
}
