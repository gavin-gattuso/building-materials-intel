import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pmjqymxdaiwfpfglwqux.supabase.co").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// Approved source domains
const APPROVED_DOMAINS = new Set([
  "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "forbes.com",
  "fortune.com", "apnews.com", "constructiondive.com", "bdcnetwork.com", "enr.com",
  "nahb.org", "agc.org", "finance.yahoo.com", "seekingalpha.com", "housingwire.com",
  "businesswire.com", "prnewswire.com", "globenewswire.com", "lbmjournal.com",
  "builderonline.com", "steelmarketupdate.com", "fastmarkets.com", "constructconnect.com",
  "spglobal.com", "roofingcontractor.com", "barchart.com", "stocktitan.net",
  "news.agc.org", "nucor.com", "investors.tranetechnologies.com",
]);

function isApprovedSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return Array.from(APPROVED_DOMAINS).some(d => hostname === d || hostname.endsWith("." + d));
  } catch { return false; }
}

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

// Match article to tracked companies
const COMPANY_KEYWORDS: Record<string, string[]> = {
  "crh": ["crh"],
  "cemex": ["cemex"],
  "heidelberg-materials": ["heidelberg materials", "heidelberg"],
  "holcim": ["holcim"],
  "martin-marietta": ["martin marietta", "mlm"],
  "vulcan-materials": ["vulcan materials", "vulcan", "vmc"],
  "nucor": ["nucor", "nue"],
  "steel-dynamics": ["steel dynamics", "stld"],
  "arcelormittal": ["arcelormittal", "arcelor"],
  "owens-corning": ["owens corning"],
  "saint-gobain": ["saint-gobain", "saint gobain"],
  "builders-firstsource": ["builders firstsource", "bldr"],
  "trane-technologies": ["trane technologies", "trane", " tt "],
  "carrier-global": ["carrier global", "carrier", "carr"],
  "johnson-controls": ["johnson controls", "jci"],
  "daikin-industries": ["daikin"],
  "home-depot": ["home depot"],
  "lowes": ["lowe's", "lowes", "low "],
  "fortune-brands": ["fortune brands", "fbin"],
  "masco": ["masco", "mas "],
  "assa-abloy": ["assa abloy"],
  "jeld-wen": ["jeld-wen", "jeld"],
  "kingspan": ["kingspan"],
  "carlisle-companies": ["carlisle"],
  "weyerhaeuser": ["weyerhaeuser"],
  "west-fraser": ["west fraser"],
  "canfor": ["canfor"],
  "interfor": ["interfor"],
  "ufp-industries": ["ufp industries", "ufp", "ufpi"],
  "geberit": ["geberit"],
  "advanced-drainage-systems": ["advanced drainage", "ads ", "wms "],
  "wienerberger": ["wienerberger"],
  "rpm-international": ["rpm international", "rpm "],
  "installed-building-products": ["installed building products", "ibp"],
  "qxo": ["qxo", "beacon roofing"],
  "agc": [" agc "],
  "taiheiyo-cement": ["taiheiyo"],
  "lixil": ["lixil"],
  "sanwa-holdings": ["sanwa"],
};

function matchCompanies(title: string, content: string): string[] {
  const text = (" " + title + " " + content + " ").toLowerCase();
  const matches: string[] = [];
  for (const [slug, keywords] of Object.entries(COMPANY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) matches.push(slug);
  }
  return matches;
}

async function summarizeWithAI(title: string, content: string): Promise<string> {
  if (!ANTHROPIC_KEY || !content) return content.slice(0, 500);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2024-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: `Summarize this building materials industry article in 200 words. Preserve all specific numbers, percentages, company names, and dates. Title: ${title}\n\nContent: ${content.slice(0, 3000)}` }],
      }),
    });
    if (!res.ok) return content.slice(0, 500);
    const data = await res.json();
    return data.content?.[0]?.text || content.slice(0, 500);
  } catch { return content.slice(0, 500); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth: Vercel cron, BRIEFING_API_KEY, or Supabase service role key
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

  try {
    // Step 1: Get news via Google News RSS (no API key needed, reliable)
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
        // Parse RSS items
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const item of items.slice(0, 15)) {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

          const title = (titleMatch?.[1] || titleMatch?.[2] || "").trim();
          let url = (linkMatch?.[1] || "").trim();
          const source = (sourceMatch?.[1] || "").trim();
          const pubDate = pubDateMatch?.[1] ? new Date(pubDateMatch[1]).toISOString().split("T")[0] : today;

          if (!title || !url) continue;
          // Google News wraps URLs; try to extract the real URL
          if (url.includes("news.google.com/rss/articles/")) {
            // Keep Google URL as-is for now; we'll resolve later
          }
          articles.push({ title, url, source, date: pubDate });
        }
      } catch (err: any) { log.push(`Feed error: ${err.message}`); }
    }

    log.push(`Found ${articles.length} candidate articles from RSS feeds`);

    // Step 2: Deduplicate and archive
    for (const article of articles) {
      // Check if URL already exists
      const { data: existing } = await supabase
        .from("articles")
        .select("slug")
        .eq("url", article.url)
        .limit(1);
      if (existing && existing.length > 0) { skipped++; continue; }

      // Also check by title similarity
      const titlePhrase = article.title.split(/\s+/).slice(0, 5).join(" ");
      const { data: titleMatch } = await supabase
        .from("articles")
        .select("slug")
        .ilike("title", `%${titlePhrase}%`)
        .eq("date", article.date)
        .limit(1);
      if (titleMatch && titleMatch.length > 0) { skipped++; continue; }

      const slug = slugify(article.date, article.title);
      const category = categorize(article.title, "");
      const summary = article.title; // Will be enriched by AI if available

      const { error } = await supabase.from("articles").upsert({
        slug,
        title: article.title,
        date: article.date,
        source: article.source,
        url: article.url,
        category,
        content: summary,
      }, { onConflict: "slug" });

      if (error) {
        log.push(`Archive error for "${article.title.slice(0, 40)}": ${error.message}`);
        continue;
      }
      archived++;

      // Link companies
      const companies = matchCompanies(article.title, summary);
      if (companies.length > 0) {
        const { data: articleRow } = await supabase
          .from("articles")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (articleRow) {
          const { data: companyRows } = await supabase
            .from("companies")
            .select("id, slug")
            .in("slug", companies);
          for (const co of companyRows || []) {
            await supabase.from("article_companies").upsert(
              { article_id: articleRow.id, company_id: co.id },
              { onConflict: "article_id,company_id" }
            );
            linked++;
          }
        }
      }
    }

    log.push(`Archived: ${archived}, Skipped (dupes): ${skipped}, Company links: ${linked}`);

    // Step 3: Send email briefing if we archived anything
    if (archived > 0) {
      // Get today's articles for the briefing
      const { data: todayArticles } = await supabase
        .from("articles")
        .select("title, source, url, category")
        .gte("date", today)
        .order("category");

      if (todayArticles && todayArticles.length > 0) {
        const byCategory: Record<string, typeof todayArticles> = {};
        for (const a of todayArticles) {
          const cat = a.category || "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(a);
        }

        let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">`;
        html += `<div style="background:#1B3C2D;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0"><h1 style="margin:0;font-size:20px">Building Materials Daily Briefing</h1><p style="margin:4px 0 0;opacity:0.8;font-size:13px">${today}</p></div>`;
        html += `<div style="padding:20px 24px;background:#f9f9f9">`;
        for (const [cat, arts] of Object.entries(byCategory)) {
          html += `<h2 style="color:#1B3C2D;font-size:15px;margin:16px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px">${cat}</h2>`;
          for (const a of arts) {
            html += `<p style="margin:6px 0;font-size:13px"><a href="${a.url}" style="color:#2E7D52;text-decoration:none;font-weight:600">${a.title}</a><br><span style="color:#777;font-size:11px">${a.source}</span></p>`;
          }
        }
        html += `</div>`;
        html += `<div style="background:#eee;padding:12px 24px;font-size:11px;color:#999;border-radius:0 0 8px 8px">Compiled by Jarvis AI · <a href="https://building-materials-intel.vercel.app" style="color:#2E7D52">View Intelligence Platform</a></div>`;
        html += `</div>`;

        // Try Resend
        const RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY) {
          try {
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL || "Jarvis AI <onboarding@resend.dev>",
                to: ["gavin.gattuso@appliedvalue.com"],
                subject: `Building Materials Daily Briefing - ${today}`,
                html,
              }),
            });
            const emailData = await emailRes.json();
            log.push(emailRes.ok ? `Email sent: ${emailData.id}` : `Email failed: ${JSON.stringify(emailData)}`);
          } catch (err: any) { log.push(`Email error: ${err.message}`); }
        } else {
          log.push("No RESEND_API_KEY — email skipped");
        }
      }
    }

    return res.json({ ok: true, date: today, archived, skipped, linked, log });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, log });
  }
}
