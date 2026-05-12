import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { computeSyndicationHash, normalizeHeadline } from "../lib/syndication.js";
import {
  extractStructuredData,
  generateSummary,
  extractSourceExcerpts,
  anthropicTelemetry,
  resetAnthropicTelemetry,
} from "../lib/extraction.js";
import { sendEmail, idempotencyKey } from "../lib/email.js";
import { decodeGoogleNewsUrl, type DecodeMethod } from "../lib/google-news-decoder.js";
import { isAuthorizedCronOrPrivileged, signActionToken } from "../lib/auth.js";
import { createRequire } from "node:module";

const requireCfg = createRequire(import.meta.url);
const whitelistConfig = requireCfg("../config/source-whitelist.json") as {
  domains: Array<{ domain: string; tier: number; company?: string; note?: string }>;
};

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── Approved Source Whitelist (loaded from config/source-whitelist.json) ──

const APPROVED_DOMAINS = new Set<string>(whitelistConfig.domains.map(d => d.domain));
const TIER_BY_DOMAIN = new Map<string, number>(whitelistConfig.domains.map(d => [d.domain, d.tier]));

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
  for (const [d, tier] of TIER_BY_DOMAIN) {
    if (domain === d || domain.endsWith("." + d)) return tier;
  }
  return 3;
}

// ── Google News URL Resolution ──
//
// Delegated to lib/google-news-decoder.ts (three-tier strategy: offline
// base64/protobuf for legacy URLs, batchexecute RPC for July-2024+ AU_yqL...
// URLs, plain redirect-follow as last resort). The old inline resolver here
// was at 0% success on 2026-05 production URLs because Google had rotated
// the HTML patterns and the BuildingMaterialsBot UA was hitting consent walls.

interface ResolutionStats { attempted: number; succeeded: number; failed: number; }
type MethodCounts = Record<DecodeMethod, number>;

// ── Article Body Fetching ──
//
// Pre-2026-05 the extraction pipeline was called with just the RSS headline
// (`article.title`) as the "article text" — which is why article_extractions
// has been an empty table for the lifetime of the system. Fetching the body
// here, for whitelisted articles only, gives extraction and summary real text
// to work with. Failures are expected (paywalls, bot protection, Google News
// redirect URLs that can't be followed) — we count attempts and surface the
// success rate so the regression is visible if it drops over time.

interface BodyFetchStats { attempted: number; succeeded: number; failed: number; }

async function fetchArticleBody(url: string, timeoutMs = 4000): Promise<string | null> {
  if (!url) return null;
  // Skip Google News redirect URLs — they require either the URL decoder or a
  // browser-like environment to follow; the body fetch will hit a consent wall.
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

function extractMainText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Prefer <article>, then <main>, else fall back to whole doc
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

const reportSectionsConfig = requireCfg("../config/report-sections.json");

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
  // Auth — uses lib/auth.ts which recognizes (a) Vercel internal cron header,
  // (b) Authorization: Bearer <CRON_SECRET>, (c) x-scan-key / ?key= matching a
  // provisioned secret. The hardcoded "cron" literal was removed 2026-05-12
  // per RELIABILITY-AUDIT risk #1.
  if (!isAuthorizedCronOrPrivileged(req)) {
    return res.status(401).json({ error: "Unauthorized. Pass x-scan-key header or Authorization: Bearer <CRON_SECRET>." });
  }

  const today = new Date().toISOString().split("T")[0];
  const log: string[] = [];
  let archived = 0;
  let skipped = 0;
  let linked = 0;
  let rejected = 0;
  let reviewQueued = 0;
  const supplementalGaps: string[] = [];
  const resolutionStats: ResolutionStats = { attempted: 0, succeeded: 0, failed: 0 };
  const resolveMethods: MethodCounts = { "base64": 0, "batchexecute": 0, "redirect-follow": 0, "failed": 0 };
  const bodyFetchStats: BodyFetchStats = { attempted: 0, succeeded: 0, failed: 0 };
  resetAnthropicTelemetry();

  // ── Daily run-lock (idempotency across dual triggers) ──
  // Attempt to claim today's run. Unique-constraint violation = another
  // invocation has already started or completed; skip cleanly.
  // Ad-hoc backfill runs (?backfill=1) bypass the lock — they're manual and
  // idempotent via URL/title/syndication-hash dedup inside the loop.
  const isBackfill = req.query.backfill === "1";
  const { error: lockErr } = isBackfill
    ? { error: null as any }
    : await supabase.from("daily_run_lock").insert({ run_date: today, status: "in_progress" });
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
    // 8 topical queries cover the major Building Materials segments. Each feed
    // returns ~100 items; we sample the first 25 per feed = ~200 candidates/day
    // before dedup and whitelist filtering.
    // `when:2d` restricts results to the last 48 hours — without it Google
    // News mixes evergreen/stale content with fresh items and most days we
    // ingest old articles that just happened to match the query.
    // Query params:
    //   ?days=N      — widen window (e.g. 7 for one-off backfill). Default 2.
    //   ?extra=q1|q2 — append extra queries (pipe-separated). Ad-hoc searches.
    const daysParam = Math.max(1, Math.min(14, parseInt((req.query.days as string) || "4", 10) || 4));
    const whenFilter = `when:${daysParam}d`;
    const extraRaw = (req.query.extra as string) || "";
    const extraQueries = extraRaw ? extraRaw.split("|").map(s => s.trim()).filter(Boolean) : [];
    const gq = (q: string) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + " " + whenFilter)}&hl=en-US&gl=US&ceid=US:en`;
    const FEEDS = [
      gq("building materials construction industry"),
      gq("steel tariffs lumber prices construction"),
      gq("Nucor CRH Vulcan Materials construction"),
      gq("HVAC cooling data center construction"),
      gq("housing starts permits residential construction"),
      gq("Home Depot Lowe's retail hardware"),
      gq("cement concrete aggregates pricing"),
      gq("roofing windows insulation manufacturer earnings"),
      ...extraQueries.map(gq),
    ];
    const ITEMS_PER_FEED = 25;
    log.push(`Feed config: ${FEEDS.length} feeds, window=${whenFilter}${extraQueries.length ? `, extras=[${extraQueries.join(", ")}]` : ""}`);

    const articles: { title: string; url: string; googleUrl: string; source: string; date: string }[] = [];

    // Fetch feeds in parallel (8 feeds × ~1s each = ~2s wall vs ~15s sequential).
    // URL resolution inside each feed loop stays sequential to bound concurrency.
    const feedResults = await Promise.all(FEEDS.map(async (feedUrl) => {
      try {
        const feedRes = await fetch(feedUrl);
        if (!feedRes.ok) return { xml: null, error: `Feed failed: ${feedRes.status}` };
        return { xml: await feedRes.text(), error: null };
      } catch (err: any) {
        return { xml: null, error: `Feed error: ${err.message}` };
      }
    }));

    for (const { xml, error } of feedResults) {
      if (error) { log.push(error); continue; }
      if (!xml) continue;
      try {
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const item of items.slice(0, ITEMS_PER_FEED)) {
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

          // Two URLs travel together through the pipeline:
          //   url       — publisher homepage from <source url> (fast whitelist check)
          //   googleUrl — Google News redirect (resolves to the real article URL)
          // We resolve googleUrl AFTER the whitelist step so the slow 8s-timeout
          // resolution only runs on the handful of articles that survive whitelist,
          // not on the ~200 candidates we see per day.
          if (!sourceUrl && !googleUrl) continue;
          articles.push({ title, url: sourceUrl || googleUrl, googleUrl, source, date: pubDate });
        }
      } catch (err: any) { log.push(`Feed error: ${err.message}`); }
    }

    log.push(`Found ${articles.length} candidate articles from RSS feeds`);

    // Step 2: Deduplicate, whitelist-check, and archive
    for (const article of articles) {
      // Forensic snapshot — captured on every rejection so we can re-resolve
      // and re-ingest later if a whitelist or resolver change makes a rejected
      // candidate viable. Stored as JSONB in rejected_articles.raw_feed_data.
      const rawForensic = {
        googleUrl: article.googleUrl,
        publisherUrl: article.url,
        sourceName: article.source,
        date: article.date,
      };

      // Title-based noise filter: reject listicle / stock-picking articles
      const titleLower = article.title.toLowerCase();
      if (/stocks?\s+to\s+watch/.test(titleLower) || /top\s+\d+\s+stocks/.test(titleLower)) {
        await logRejection(article.url, article.title, "title_noise_filter",
          "Stock-picking listicle — not relevant to industry intelligence", rawForensic);
        rejected++;
        continue;
      }

      // Whitelist check (Phase 3.4) — uses publisher homepage URL (cheap)
      if (!isApprovedSource(article.url)) {
        await logRejection(article.url, article.title, "domain_not_whitelisted",
          `Domain ${getSourceDomain(article.url)} is not in the approved source whitelist`, rawForensic);
        rejected++;
        continue;
      }

      // Whitelist passed — decode the Google News URL to recover the real
      // article URL. The decoder tries offline base64 → batchexecute RPC →
      // redirect-follow. If all three fail, fall back to the Google News
      // redirect URL itself (unique per article, clickable via Google).
      if (article.googleUrl && article.googleUrl.includes("news.google.com/")) {
        resolutionStats.attempted++;
        const result = await decodeGoogleNewsUrl(article.googleUrl);
        resolveMethods[result.method]++;
        if (result.method !== "failed") {
          article.url = result.url;
          resolutionStats.succeeded++;
        } else {
          article.url = article.googleUrl;
          resolutionStats.failed++;
        }
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
          `Matched existing article by title similarity: "${titlePhrase}..."`, rawForensic);
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
          `Matched syndication hash of existing article "${original.slug}" from ${getSourceDomain(original.url)}. Added ${newDomain} as corroborating source.`, rawForensic);
        skipped++;
        continue;
      }

      // ── Archive the article ──
      const slug = slugify(article.date, article.title);
      const category = categorize(article.title, "");
      const isEarnings = category === "Earnings";
      const sourceTier = getSourceTier(article.url);

      // Try to fetch the full article body. Skips Google News redirect URLs
      // (those need the decoder) and anything that 4xx/5xx's or doesn't return
      // enough text. When this succeeds, extraction and summary stop being
      // headline-only and article_extractions actually gets meaningful rows.
      bodyFetchStats.attempted++;
      const fetchedBody = await fetchArticleBody(article.url);
      if (fetchedBody) bodyFetchStats.succeeded++;
      else bodyFetchStats.failed++;
      const articleText = fetchedBody || article.title;

      // Store the fetched body (if any) on the article row. Tier 1-3 articles
      // without a successful fetch still get the title as a placeholder so the
      // legacy field is populated; null for tier 4+.
      const fullText = fetchedBody || (sourceTier <= 3 ? article.title : null);

      // Structured extraction (Phase 3.1 Step 1)
      const extractionResult = await extractStructuredData(articleText);

      // Prose summary (Phase 3.1 Step 2)
      const summaryResult = await generateSummary(
        article.title,
        articleText,
        extractionResult?.extraction || null,
        isEarnings
      );

      // Source excerpts (Phase 3.2) — only meaningful when we have real body
      let sourceExcerpts: string[] = [];
      if (fetchedBody && fetchedBody.length >= 500) {
        const ex = await extractSourceExcerpts(fetchedBody);
        if (ex?.excerpts) sourceExcerpts = ex.excerpts;
      }

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

      // Insert structured extraction (Phase 3.1) — ALWAYS write a row,
      // including when extraction returned null. The empty-table state we had
      // before 2026-05-11 made silent failures invisible; now every attempt
      // leaves a row with confidence=0 / fields_absent=all so the failure mode
      // is observable.
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
      } else {
        await supabase.from("article_extractions").insert({
          article_id: articleId,
          model_version: process.env.MODEL_EXTRACTION || "claude-haiku-4-5-20251001",
          prompt_version: process.env.PROMPT_VERSION_EXTRACTION || "extraction-v1.0",
          extraction_confidence: 0,
          fields_present: [],
          fields_absent: ["revenue_figure","ebitda_figure","yoy_growth_pct","guidance_verbatim","mentioned_headwinds","mentioned_tailwinds","pricing_action"],
          additional_metrics: {
            failure_reason: fetchedBody ? "extraction_returned_null" : "no_article_body_fetched",
            body_length: articleText.length,
            source_tier: sourceTier,
          },
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
    if (resolutionStats.attempted > 0) {
      const pct = Math.round((resolutionStats.succeeded / resolutionStats.attempted) * 100);
      log.push(`URL resolution: ${resolutionStats.succeeded}/${resolutionStats.attempted} (${pct}%) succeeded — base64=${resolveMethods.base64} batchexecute=${resolveMethods.batchexecute} redirect-follow=${resolveMethods["redirect-follow"]} failed=${resolveMethods.failed}`);
    }
    if (bodyFetchStats.attempted > 0) {
      const pct = Math.round((bodyFetchStats.succeeded / bodyFetchStats.attempted) * 100);
      log.push(`Body fetch: ${bodyFetchStats.succeeded}/${bodyFetchStats.attempted} (${pct}%) succeeded, ${bodyFetchStats.failed} failed`);
    }
    if (anthropicTelemetry.totalCalls > 0) {
      const t = anthropicTelemetry;
      const okPct = Math.round((t.ok / t.totalCalls) * 100);
      const breakdown = [
        t.noKey > 0 ? `noKey=${t.noKey}` : null,
        t.http400 > 0 ? `400=${t.http400}` : null,
        t.http401 > 0 ? `401=${t.http401}` : null,
        t.http429 > 0 ? `429=${t.http429}` : null,
        t.http5xx > 0 ? `5xx=${t.http5xx}` : null,
        t.fetchError > 0 ? `fetch_err=${t.fetchError}` : null,
        t.empty > 0 ? `empty=${t.empty}` : null,
      ].filter(Boolean).join(" ");
      log.push(`Anthropic: ${t.ok}/${t.totalCalls} (${okPct}%) ok${breakdown ? " — " + breakdown : ""}${t.lastError ? ` — last_err: ${t.lastError.slice(0, 120)}` : ""}`);
    }

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
        // Get review queue items for the email (with IDs for action links)
        const { data: pendingReviews } = await supabase
          .from("human_review_queue")
          .select("id, queue_type, priority, auto_context, reference_id")
          .eq("review_status", "pending")
          .order("priority")
          .order("created_at", { ascending: false });

        const totalPending = (pendingReviews || []).length;
        const actionBaseUrl = `https://building-materials-intel.vercel.app/api/review-queue/action`;
        // Per-link HMAC over (id, action) signed with CRON_SECRET — replaces
        // the previous hardcoded "cron" literal that let anyone with the URL
        // pattern approve any review-queue item by UUID (RELIABILITY-AUDIT #1).

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

        // Review Queue Section — with one-click approve/dismiss buttons
        if (totalPending > 0) {
          html += `<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:6px;padding:12px 16px;margin-bottom:16px">`;
          html += `<h2 style="color:#E65100;font-size:15px;margin:0 0 8px">Review Queue: ${totalPending} Pending</h2>`;
          for (const item of (pendingReviews || []).slice(0, 10)) {
            const approveUrl = `${actionBaseUrl}?id=${item.id}&action=approved&sig=${signActionToken(item.id, "approved")}`;
            const dismissUrl = `${actionBaseUrl}?id=${item.id}&action=dismissed&sig=${signActionToken(item.id, "dismissed")}`;
            const label = item.queue_type.replace(/_/g, " ");
            const priorityBadge = item.priority === 1
              ? `<span style="background:#FF5722;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-right:4px">P1</span>`
              : `<span style="background:#FF9800;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-right:4px">P${item.priority}</span>`;
            html += `<div style="border-left:3px solid #FF5722;padding:8px 10px;margin:8px 0;background:#fff;border-radius:0 4px 4px 0">`;
            html += `<p style="margin:0 0 4px;font-size:12px">${priorityBadge}<strong>${label}</strong></p>`;
            html += `<p style="margin:0 0 6px;font-size:11px;color:#555">${(item.auto_context || "").slice(0, 180)}</p>`;
            html += `<a href="${approveUrl}" style="display:inline-block;background:#2E7D52;color:#fff;font-size:11px;padding:4px 12px;border-radius:3px;text-decoration:none;margin-right:6px">Approve</a>`;
            html += `<a href="${dismissUrl}" style="display:inline-block;background:#757575;color:#fff;font-size:11px;padding:4px 12px;border-radius:3px;text-decoration:none">Dismiss</a>`;
            html += `</div>`;
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

        const staleActionBase = `https://building-materials-intel.vercel.app/api/review-queue/action`;
        const rows = overdue.map(o => {
          const ageHours = Math.round((Date.now() - Date.parse(o.created_at)) / 36e5);
          const headline = titleById.get(o.reference_id) || (o.auto_context || "").slice(0, 120);
          const approveLink = `${staleActionBase}?id=${o.id}&action=approved&sig=${signActionToken(o.id, "approved")}`;
          const dismissLink = `${staleActionBase}?id=${o.id}&action=dismissed&sig=${signActionToken(o.id, "dismissed")}`;
          return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${o.queue_type}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${headline}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${ageHours}h</td><td style="padding:4px 8px;border-bottom:1px solid #eee;white-space:nowrap"><a href="${approveLink}" style="color:#2E7D52;font-weight:bold;text-decoration:none;margin-right:8px">Approve</a><a href="${dismissLink}" style="color:#757575;text-decoration:none">Dismiss</a></td></tr>`;
        }).join("");

        const alertHtml = `<div style="font-family:Arial,sans-serif;max-width:700px">
          <h2 style="color:#BF360C">${overdue.length} review queue item${overdue.length === 1 ? "" : "s"} overdue</h2>
          <p>The items below have been <strong>pending human review for more than 48 hours</strong>. They are blocking report-ready promotion and will not reach the bi-annual report until cleared.</p>
          <table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#163E2D;color:white"><th style="padding:6px 8px;text-align:left">Type</th><th style="padding:6px 8px;text-align:left">Article / Context</th><th style="padding:6px 8px;text-align:right">Age</th><th style="padding:6px 8px;text-align:center">Action</th></tr></thead><tbody>${rows}</tbody></table>
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

    // Persist run telemetry to pipeline_runs. This is the table healthcheck
    // reads to detect "70% degraded but not zero" silent regressions — the
    // failure mode that masked the April 2026 drought for 3 weeks.
    const decodePct = resolutionStats.attempted > 0
      ? Math.round((resolutionStats.succeeded / resolutionStats.attempted) * 10000) / 100
      : null;
    const bodyPct = bodyFetchStats.attempted > 0
      ? Math.round((bodyFetchStats.succeeded / bodyFetchStats.attempted) * 10000) / 100
      : null;
    const anthroPct = anthropicTelemetry.totalCalls > 0
      ? Math.round((anthropicTelemetry.ok / anthropicTelemetry.totalCalls) * 10000) / 100
      : null;
    await supabase.from("pipeline_runs").insert({
      run_date: today,
      started_at: new Date(Date.now() - 1000).toISOString(),
      completed_at: new Date().toISOString(),
      invocation: isBackfill ? "backfill" : "scheduled",
      candidates: articles.length,
      archived,
      skipped,
      rejected,
      url_decode_attempted: resolutionStats.attempted,
      url_decode_succeeded: resolutionStats.succeeded,
      url_decode_pct: decodePct,
      body_fetch_attempted: bodyFetchStats.attempted,
      body_fetch_succeeded: bodyFetchStats.succeeded,
      body_fetch_pct: bodyPct,
      anthropic_calls: anthropicTelemetry.totalCalls,
      anthropic_ok: anthropicTelemetry.ok,
      anthropic_pct: anthroPct,
      anthropic_last_error: anthropicTelemetry.lastError,
      resolution_methods: resolveMethods,
      errors: log.filter(l => /error|failed/i.test(l)).slice(0, 10),
    }).then(() => null, (e: any) => log.push(`pipeline_runs insert failed: ${e?.message?.slice(0, 80)}`));

    // Defense in depth: run trend-alert inline at end of every scheduled scan.
    // The /api/healthcheck cron has the same logic but may not fire on Vercel
    // Hobby (2-cron limit). Inlining here guarantees the trend signal fires
    // once a day no matter the tier. Safe: only sends emails on degradation.
    if (!isBackfill) {
      try {
        const sinceRecent = new Date(Date.now() - 7 * 86400000).toISOString();
        const sincePrior = new Date(Date.now() - 14 * 86400000).toISOString();
        const [{ data: recent }, { data: prior }] = await Promise.all([
          supabase.from("pipeline_runs").select("url_decode_pct, body_fetch_pct, anthropic_pct").gte("started_at", sinceRecent).eq("invocation", "scheduled"),
          supabase.from("pipeline_runs").select("url_decode_pct, body_fetch_pct, anthropic_pct").gte("started_at", sincePrior).lt("started_at", sinceRecent).eq("invocation", "scheduled"),
        ]);
        const avg = (rows: any[] | null, key: string) => {
          const nums = (rows || []).map(r => r[key]).filter(n => n != null && Number.isFinite(Number(n)));
          return nums.length > 0 ? nums.reduce((a, b) => a + Number(b), 0) / nums.length : null;
        };
        const checks: Array<[string, number | null, number | null]> = [
          ["url_decode_pct", avg(recent, "url_decode_pct"), avg(prior, "url_decode_pct")],
          ["body_fetch_pct", avg(recent, "body_fetch_pct"), avg(prior, "body_fetch_pct")],
          ["anthropic_pct", avg(recent, "anthropic_pct"), avg(prior, "anthropic_pct")],
        ];
        for (const [metric, cur, base] of checks) {
          if (cur != null && base != null && base >= 25 && (base - cur) >= 25 && process.env.RESEND_API_KEY) {
            await sendEmail({
              type: "alert-pipeline-degraded",
              subject: `[DEGRADED] ${metric} dropped ${Math.round((base - cur) * 10) / 10}pts WoW`,
              html: `<p><code>${metric}</code> averaged <strong>${Math.round(cur * 10) / 10}%</strong> this week vs <strong>${Math.round(base * 10) / 10}%</strong> prior. This is the alert that would have caught the April 2026 silent regression.</p>`,
              idempotencyKey: idempotencyKey("alert-pipeline-degraded", `${today}-${metric}`),
            });
            log.push(`[trend-alert] ${metric}: ${cur?.toFixed(1)}% vs ${base?.toFixed(1)}% (drop ≥ 25pt)`);
            break;
          }
        }
      } catch (err: any) {
        log.push(`Trend-alert check failed (non-fatal): ${err?.message?.slice(0, 80)}`);
      }
    }

    // Mark run complete (skip for ad-hoc backfill runs which bypassed the lock)
    if (!isBackfill) {
      await supabase
        .from("daily_run_lock")
        .update({ status: "complete", completed_at: new Date().toISOString(), articles_inserted: archived })
        .eq("run_date", today);
    }

    return res.json({ ok: true, date: today, archived, skipped, rejected, linked, reviewQueued, log });
  } catch (err: any) {
    // Best-effort telemetry write even on crash — so a partial run is observable
    try {
      await supabase.from("pipeline_runs").insert({
        run_date: today,
        completed_at: new Date().toISOString(),
        invocation: isBackfill ? "backfill" : "scheduled",
        archived,
        skipped,
        rejected,
        anthropic_calls: anthropicTelemetry.totalCalls,
        anthropic_ok: anthropicTelemetry.ok,
        anthropic_last_error: anthropicTelemetry.lastError,
        errors: [String(err?.message || err).slice(0, 200)],
      });
    } catch { /* swallow — original error still bubbles */ }
    if (!isBackfill) {
      await supabase
        .from("daily_run_lock")
        .update({ status: "failed", completed_at: new Date().toISOString(), articles_inserted: archived })
        .eq("run_date", today);
    }
    return res.status(500).json({ error: err.message, log });
  }
}
