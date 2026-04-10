/**
 * Dynamic Interactive Dashboard builder.
 * Generates a self-contained HTML dashboard matching the AV Interactive Dashboard format.
 * Accepts date range, AI-synthesized content, and financial data from Supabase.
 */

import { readFileSync } from "fs";
import { join } from "path";

/* ── Types ── */
export interface DashboardDriver {
  driver: string;
  direction: string;
  signal: string;
  content: string;
  impact: string;
  dataPoints: string[];
}

export interface DashboardSection {
  category: string;
  content: string;
  articles: { title: string; source: string; analysis: string; dataPoints: string[]; url?: string }[];
}

export interface FinancialRow {
  company: string;
  ticker: string;
  segment: string;
  category: string;
  period?: string;
  revenue_growth_yoy: number | null;
  cogs_sales_pct: number | null;
  cogs_sales_yoy_delta: number | null;
  sga_sales_pct: number | null;
  sga_sales_yoy_delta: number | null;
  ebitda_margin_pct: number | null;
  ebitda_margin_yoy_delta: number | null;
}

/** Keep only the latest-period row per company */
function deduplicateFinancials(rows: FinancialRow[]): FinancialRow[] {
  const best = new Map<string, FinancialRow>();
  for (const r of rows) {
    const existing = best.get(r.company);
    if (!existing || (r.period || "") > (existing.period || "")) {
      best.set(r.company, r);
    }
  }
  return [...best.values()];
}

export interface DashboardOpts {
  startDate: string;
  endDate: string;
  executiveSummary: string;
  drivers: DashboardDriver[];
  sections: DashboardSection[];
  financials: FinancialRow[];
  conclusion?: string;
}

/* ── Helpers ── */
function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escJs(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDateFull(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function paragraphs(text: string): string {
  if (!text) return "";
  return text
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("\n    ");
}

function badgeClass(direction: string): string {
  const d = (direction || "").toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return "badge-pos";
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return "badge-neu";
  return "badge-neg";
}

function badgeLabel(direction: string): string {
  const d = (direction || "").toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return "Positive";
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return "Neutral";
  return "Negative";
}

function loadLogoBase64(): string {
  try {
    const logoPath = join(process.cwd(), "site", "public", "reports", "images", "_logo_b64.txt");
    return readFileSync(logoPath, "utf-8").trim();
  } catch {
    return "";
  }
}

function loadCSS(): string {
  try {
    return readFileSync(join(process.cwd(), "lib", "dashboard-css.txt"), "utf-8");
  } catch {
    return "/* CSS not found */";
  }
}

/* ── Company segment/subsector mapping ── */
const COMPANY_MAP: Record<string, { seg: string; sub: string; group: "materials" | "products" }> = {
  CRH: { seg: "nonresidential", sub: "Aggregates & Cement", group: "materials" },
  CEMEX: { seg: "residential", sub: "Aggregates & Cement", group: "materials" },
  "Heidelberg Materials": { seg: "nonresidential", sub: "Aggregates & Cement", group: "materials" },
  Holcim: { seg: "residential", sub: "Aggregates & Cement", group: "materials" },
  "Martin Marietta": { seg: "nonresidential", sub: "Aggregates & Cement", group: "materials" },
  "Taiheiyo Cement": { seg: "residential", sub: "Aggregates & Cement", group: "materials" },
  "Vulcan Materials": { seg: "nonresidential", sub: "Aggregates & Cement", group: "materials" },
  AGC: { seg: "nonresidential", sub: "Glass & Insulation", group: "materials" },
  "Owens Corning": { seg: "residential", sub: "Glass & Insulation", group: "materials" },
  "Saint-Gobain": { seg: "distribution", sub: "Glass & Insulation", group: "materials" },
  Canfor: { seg: "residential", sub: "Wood & Lumber", group: "materials" },
  Interfor: { seg: "residential", sub: "Wood & Lumber", group: "materials" },
  "UFP Industries": { seg: "residential", sub: "Wood & Lumber", group: "materials" },
  "West Fraser": { seg: "residential", sub: "Wood & Lumber", group: "materials" },
  Weyerhaeuser: { seg: "residential", sub: "Wood & Lumber", group: "materials" },
  ArcelorMittal: { seg: "nonresidential", sub: "Steel & Metals", group: "materials" },
  Nucor: { seg: "nonresidential", sub: "Steel & Metals", group: "materials" },
  "Steel Dynamics": { seg: "nonresidential", sub: "Steel & Metals", group: "materials" },
  Wienerberger: { seg: "residential", sub: "Steel & Metals", group: "materials" },
  "Builders FirstSource": { seg: "distribution", sub: "Building Envelope & Dist.", group: "products" },
  QXO: { seg: "distribution", sub: "Building Envelope & Dist.", group: "products" },
  "Carlisle Companies": { seg: "residential", sub: "Building Envelope & Dist.", group: "products" },
  Kingspan: { seg: "residential", sub: "Building Envelope & Dist.", group: "products" },
  "RPM International": { seg: "residential", sub: "Building Envelope & Dist.", group: "products" },
  "ASSA ABLOY": { seg: "residential", sub: "Doors & Windows", group: "products" },
  "JELD-WEN": { seg: "residential", sub: "Doors & Windows", group: "products" },
  LIXIL: { seg: "residential", sub: "Doors & Windows", group: "products" },
  "Sanwa Holdings": { seg: "residential", sub: "Doors & Windows", group: "products" },
  "Advanced Drainage Systems": { seg: "nonresidential", sub: "Plumbing & Fixtures", group: "products" },
  Geberit: { seg: "residential", sub: "Plumbing & Fixtures", group: "products" },
  "Fortune Brands": { seg: "residential", sub: "Plumbing & Fixtures", group: "products" },
  Masco: { seg: "residential", sub: "Plumbing & Fixtures", group: "products" },
  "Carrier Global": { seg: "residential", sub: "HVAC & Climate", group: "products" },
  "Daikin Industries": { seg: "residential", sub: "HVAC & Climate", group: "products" },
  "Johnson Controls": { seg: "residential", sub: "HVAC & Climate", group: "products" },
  "Trane Technologies": { seg: "residential", sub: "HVAC & Climate", group: "products" },
};

function mapFinancials(financials: FinancialRow[]): { materials: string; products: string } {
  const mats: string[] = [];
  const prods: string[] = [];

  for (const f of financials) {
    const mapping = COMPANY_MAP[f.company];
    if (!mapping) continue;

    const entry = `{name:'${escJs(f.company)}',seg:'${mapping.seg}',sub:'${escJs(mapping.sub)}',revenue:${f.revenue_growth_yoy ?? "null"},cogs:${f.cogs_sales_pct ?? "null"},cogsD:${f.cogs_sales_yoy_delta ?? "null"},sga:${f.sga_sales_pct ?? "null"},sgaD:${f.sga_sales_yoy_delta ?? "null"},ebitda:${f.ebitda_margin_pct ?? "null"},ebitdaD:${f.ebitda_margin_yoy_delta ?? "null"}}`;

    if (mapping.group === "materials") mats.push(entry);
    else prods.push(entry);
  }

  return { materials: `[${mats.join(",\n  ")}]`, products: `[${prods.join(",\n  ")}]` };
}

function buildCompanyTableRows(financials: FinancialRow[]): string {
  const segStyle: Record<string, string> = {
    nonresidential: "background:var(--seg-nonres)",
    distribution: "background:var(--seg-dist)",
    residential: "background:var(--seg-resi)",
  };

  return financials
    .filter((f) => COMPANY_MAP[f.company])
    .map((f) => {
      const mapping = COMPANY_MAP[f.company]!;
      const rev = f.revenue_growth_yoy != null ? (f.revenue_growth_yoy > 0 ? "+" : "") + f.revenue_growth_yoy.toFixed(1) + "%" : "n/a";
      const cogs = f.cogs_sales_pct != null ? f.cogs_sales_pct.toFixed(1) + "%" : "n/a";
      const cogsD = f.cogs_sales_yoy_delta != null ? yoyBubble(f.cogs_sales_yoy_delta, true) : "";
      const sga = f.sga_sales_pct != null ? f.sga_sales_pct.toFixed(1) + "%" : "n/a";
      const sgaD = f.sga_sales_yoy_delta != null ? yoyBubble(f.sga_sales_yoy_delta, true) : "";
      const ebitda = f.ebitda_margin_pct != null ? f.ebitda_margin_pct.toFixed(1) + "%" : "n/a";
      const ebitdaD = f.ebitda_margin_yoy_delta != null ? yoyBubble(f.ebitda_margin_yoy_delta, false) : "";

      return `        <tr><td><span class="seg-dot" style="${segStyle[mapping.seg] || ""}"></span></td><td>${esc(f.company)}</td><td>${rev}</td><td>${cogs} ${cogsD}</td><td>${sga} ${sgaD}</td><td>${ebitda} ${ebitdaD}</td></tr>`;
    })
    .join("\n");
}

function yoyBubble(delta: number, invertColor: boolean): string {
  // For COGS/SGA: negative delta is good (costs down). For EBITDA: positive delta is good.
  const isGood = invertColor ? delta < 0 : delta > 0;
  const isBad = invertColor ? delta > 0 : delta < 0;
  const cls = isGood ? "yoy-pos" : isBad ? "yoy-neg" : "yoy-neu";
  const sign = delta > 0 ? "+" : "";
  return `<span class="yoy-bubble ${cls}">${sign}${delta.toFixed(1)}pp</span>`;
}

/* ── Find driver by name match ── */
function findDriver(drivers: DashboardDriver[], ...keywords: string[]): DashboardDriver | undefined {
  return drivers.find((d) => {
    const dl = d.driver.toLowerCase();
    return keywords.some((k) => dl.includes(k.toLowerCase()));
  });
}

/* ── Build driver section HTML ── */
function buildDriverSection(
  id: string,
  heading: string,
  driver: DashboardDriver | undefined,
  chartHtml: string,
): string {
  const content = driver?.content || "";
  return `
<section class="report-section" id="${id}">
  <h2 class="section-heading">${heading}</h2>
  <div class="section-body">
    ${paragraphs(content)}
    ${chartHtml}
    ${driver?.impact ? `<div class="callout"><strong>Impact:</strong> ${esc(driver.impact)}</div>` : ""}
    ${driver?.dataPoints?.length ? `<ul>${driver.dataPoints.map((dp) => `<li>${esc(dp)}</li>`).join("")}</ul>` : ""}
  </div>
</section>`;
}

/* ── Main builder ── */
export function buildDashboardHTML(opts: DashboardOpts): string {
  const { startDate, endDate, executiveSummary, drivers, sections, conclusion } = opts;
  const financials = deduplicateFinancials(opts.financials);
  const dateRange = `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`;
  const dateRangeFull = `${formatDateFull(startDate)} \u2013 ${formatDateFull(endDate)}`;
  const endDateLabel = formatDate(endDate);
  const css = loadCSS();
  const logoB64 = loadLogoBase64();
  const logoSrc = logoB64 ? `data:image/png;base64,${logoB64}` : "";
  const { materials, products } = mapFinancials(financials);

  // Find specific drivers
  const drvRates = findDriver(drivers, "interest", "mortgage", "rate");
  const drvLabor = findDriver(drivers, "labor");
  const drvMaterial = findDriver(drivers, "material", "energy", "cost");
  const drvDemand = findDriver(drivers, "demand");
  const drvInfra = findDriver(drivers, "infrastructure");
  const drvCredit = findDriver(drivers, "credit", "lending");
  const drvGdp = findDriver(drivers, "gdp", "consumer");

  // Build driver overview table
  const driverRows = drivers
    .map(
      (d) =>
        `        <tr><td>${esc(d.driver)}</td><td>${d.signal ? esc(d.signal) : "—"}</td><td><span class="badge ${badgeClass(d.direction)}">${badgeLabel(d.direction)}</span></td></tr>`,
    )
    .join("\n");

  // Build driver conclusion mini-grid
  const driverMiniGrid = drivers
    .map(
      (d) =>
        `      <div class="driver-mini"><div class="dm-name">${esc(d.driver)}</div><span class="badge ${badgeClass(d.direction)}">${badgeLabel(d.direction)}</span></div>`,
    )
    .join("\n");

  // Build news sections for the report
  const newsSectionsHtml = sections
    .map((sec) => {
      const secId = `sec-news-${sec.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      const articleHtml = sec.articles
        .map(
          (a) => `
      <div class="card">
        <div class="card-title">${esc(a.title)} <span style="font-weight:400;color:var(--text3);font-size:12px">(${esc(a.source)})</span></div>
        <div class="card-desc">${esc(a.analysis)}</div>
        ${a.dataPoints?.length ? `<ul style="margin-top:6px;font-size:13px">${a.dataPoints.map((dp) => `<li>${esc(dp)}</li>`).join("")}</ul>` : ""}
      </div>`,
        )
        .join("\n");

      return `
<section class="report-section" id="${secId}">
  <h2 class="section-heading">${esc(sec.category)}</h2>
  <div class="section-body">
    ${paragraphs(sec.content)}
    <div class="card-grid">
      ${articleHtml}
    </div>
  </div>
</section>`;
    })
    .join("\n");

  // Sidebar nav links for news sections
  const newsSidebarLinks = sections
    .map((sec) => {
      const secId = `sec-news-${sec.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      return `  <a href="#${secId}">— ${esc(sec.category)}</a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AV Building Materials &amp; Products Market Health \u2014 ${esc(dateRange)}</title>
<style>
${css}
</style>
</head>
<body>

<!-- ====== PRINT-ONLY: Cover Page ====== -->
<div class="print-only print-cover" aria-hidden="true">
  <div style="flex:1"></div>
  <div class="pc-brand">Applied Value</div>
  <div class="pc-divider"></div>
  <div class="pc-title">Building Materials &amp; Products<br>Market Health Report</div>
  <div class="pc-sub" style="font-size:13pt;margin-bottom:12pt">${esc(dateRange)}</div>
  <div class="pc-sub">${esc(endDateLabel)}</div>
  <div class="pc-divider"></div>
  <div class="pc-sub" style="margin-top:16pt;font-size:10pt">
    Prepared by:<br>
    <strong>Jarvis AI</strong> &nbsp;|&nbsp; <strong>Applied Value Intelligence</strong>
  </div>
  <div style="flex:1"></div>
  <div class="pc-sub" style="font-size:8pt;color:#999;margin-top:auto">
    Applied Value Group<br>
    One Biscayne Tower, 2 S Biscayne Blvd. Suite 1750, Miami, FL 33131
  </div>
  <div class="pc-bar"></div>
</div>

<!-- ====== PRINT-ONLY: Table of Contents ====== -->
<div class="print-only print-toc" aria-hidden="true">
  <h2>Table of Contents</h2>
  <ul>
    <li><a href="#sec-exec"><span class="toc-section">1.</span> Executive Summary</a></li>
    <li><a href="#sec-drivers"><span class="toc-section">2.</span> Drivers of Market Health</a></li>
    ${drivers.map((d, i) => `<li class="toc-sub"><a href="#sec-driver-${i}">2.${i + 1} ${esc(d.driver)}</a></li>`).join("\n    ")}
    <li><a href="#sec-conclusion"><span class="toc-section">3.</span> Sector Driver Conclusion</a></li>
    <li><a href="#sec-company"><span class="toc-section">4.</span> Company Performance Data</a></li>
    ${sections.length ? `<li><a href="#sec-news"><span class="toc-section">5.</span> Industry News</a></li>` : ""}
    ${sections.map((s, i) => `<li class="toc-sub"><a href="#sec-news-${s.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}">${esc(s.category)}</a></li>`).join("\n    ")}
    <li><a href="#sec-av"><span class="toc-section">${sections.length ? 6 : 5}.</span> How Applied Value Can Help</a></li>
  </ul>
</div>

<!-- ====== PRINT-ONLY: Running header ====== -->
<div class="print-only print-header" aria-hidden="true">
  <span style="font-weight:600;color:var(--av-dark)">Applied Value</span>
  <span>Building Materials &amp; Products Market Health Report</span>
  <span>${esc(endDateLabel)}</span>
</div>

<!-- ====== SCREEN: Sticky Header ====== -->
<header class="sticky-header screen-only">
  <div class="header-flex">
    <button class="hamburger" onclick="var s=document.querySelector('.sidebar');s.classList.toggle('open');this.setAttribute('aria-expanded',s.classList.contains('open'))" aria-label="Toggle menu" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
    <div class="logo">${logoSrc ? `<img src="${logoSrc}" alt="Applied Value">` : ""}</div>
  </div>
  <div class="header-title">Building Materials &amp; Products Market Health Report \u2014 ${esc(dateRange)}</div>
  <button class="download-btn" onclick="setTimeout(function(){window.print()},100)">&#8681; Download as PDF</button>
</header>

<!-- ====== SCREEN: Sidebar ====== -->
<nav class="sidebar screen-only" id="sidebar">
  <h3>Contents</h3>
  <a href="#sec-hero">Cover</a>
  <a href="#sec-exec">Executive Summary</a>
  <a href="#sec-drivers">Drivers Overview</a>
  ${drivers.map((d, i) => `<a href="#sec-driver-${i}">\u2014 ${esc(d.driver)}</a>`).join("\n  ")}
  <a href="#sec-conclusion">Driver Conclusion</a>
  <a href="#sec-company">Company Data</a>
  ${sections.length ? `<a href="#sec-news">Industry News</a>` : ""}
  ${newsSidebarLinks}
  <a href="#sec-av">Applied Value</a>
</nav>

<!-- ====== SCREEN: Global Filter Bar ====== -->
<div class="global-filter-bar screen-only">
  <label>Segment:</label>
  <button class="filter-btn active" data-segment="all" aria-pressed="true" onclick="applySegmentFilter('all')">All Segments</button>
  <button class="filter-btn" data-segment="nonresidential" aria-pressed="false" onclick="applySegmentFilter('nonresidential')">Nonresidential Forward</button>
  <button class="filter-btn" data-segment="distribution" aria-pressed="false" onclick="applySegmentFilter('distribution')">Distribution</button>
  <button class="filter-btn" data-segment="residential" aria-pressed="false" onclick="applySegmentFilter('residential')">Residential Forward</button>
</div>

<!-- ============================================================
     MAIN CONTENT
     ============================================================ -->
<main class="main-content">

<!-- ========== HERO ========== -->
<section class="report-section" id="sec-hero">
  <div class="hero-inner">
    <div class="hero-brand">Applied Value Group</div>
    <h1 class="hero-title">Building Materials &amp; Products<br>Market Health Report</h1>
    <p class="hero-subtitle">${esc(dateRange)}</p>
    <p class="hero-authors">Generated by Jarvis AI &nbsp;|&nbsp; Applied Value Intelligence Platform</p>
    <div class="hero-rule"></div>
  </div>
</section>

<!-- ========== EXECUTIVE SUMMARY ========== -->
<section class="report-section" id="sec-exec">
  <h2 class="section-heading">Executive Summary</h2>
  <div class="section-body">
    ${paragraphs(executiveSummary)}
  </div>
</section>

<!-- ========== DRIVERS OVERVIEW ========== -->
<section class="report-section" id="sec-drivers">
  <h2 class="section-heading">Drivers of Market Health</h2>
  <div class="section-body">
    <table>
      <thead>
        <tr><th scope="col">Driver</th><th scope="col">Signal</th><th scope="col">Recent Trend</th></tr>
      </thead>
      <tbody>
${driverRows}
      </tbody>
    </table>
  </div>
</section>

<!-- ========== DRIVER DEEP DIVES ========== -->
${drivers
  .map((d, i) => {
    const id = `sec-driver-${i}`;
    const heading = `${i + 1}. ${esc(d.driver)}`;
    const bullets = (d.dataPoints || []).map((dp) => `<li>${esc(dp)}</li>`).join("\n          ");
    return `
<section class="report-section" id="${id}">
  <h2 class="section-heading">${heading}</h2>
  <div class="section-body">
    ${paragraphs(d.content)}
    ${d.impact ? `<div class="callout"><strong>Impact on Construction:</strong> ${esc(d.impact)}</div>` : ""}
    ${bullets ? `<h3 class="sub-heading">Key Data Points</h3>\n    <ul>\n          ${bullets}\n    </ul>` : ""}
  </div>
</section>`;
  })
  .join("\n")}

<!-- ========== DRIVER CONCLUSION ========== -->
<section class="report-section" id="sec-conclusion">
  <h2 class="section-heading">Sector Driver Conclusion</h2>
  <div class="section-body">
    ${conclusion ? paragraphs(conclusion) : `<p>The market environment for the period ${esc(dateRange)} presents a complex landscape across the building materials and products sector. The driver overview below summarizes the current direction of each key market force.</p>`}
    <div class="driver-mini-grid">
${driverMiniGrid}
    </div>
  </div>
</section>

<!-- ========== COMPANY PERFORMANCE DATA ========== -->
<section class="report-section" id="sec-company">
  <h2 class="section-heading">Company Performance Data</h2>
  <div class="section-body">
    <div class="metric-tab-bar screen-only" role="tablist" aria-label="Financial metric selector">
      <button class="metric-tab active" data-metric="revenue" role="tab" aria-selected="true" onclick="switchMetric('revenue')">Revenue Growth %</button>
      <button class="metric-tab" data-metric="cogs" role="tab" aria-selected="false" onclick="switchMetric('cogs')">COGS/Sales %</button>
      <button class="metric-tab" data-metric="sga" role="tab" aria-selected="false" onclick="switchMetric('sga')">SG&amp;A/Sales %</button>
      <button class="metric-tab" data-metric="ebitda" role="tab" aria-selected="false" onclick="switchMetric('ebitda')">EBITDA Margin %</button>
    </div>

    <!-- Subsector Key -->
    <div class="subsector-key" id="subsector-key">
      <div class="subsector-group" id="subsector-materials">
        <span class="subsector-group-label">Materials:</span>
      </div>
      <div class="subsector-divider"></div>
      <div class="subsector-group" id="subsector-products">
        <span class="subsector-group-label">Products:</span>
      </div>
    </div>

    <div class="dual-chart">
      <div class="chart-block">
        <h3 class="sub-heading text-center">Building Materials</h3>
        <div class="chart-wrapper tall" aria-label="Building Materials company performance">
          <canvas id="chart-materials" role="img"></canvas>
        </div>
      </div>
      <div class="chart-block">
        <h3 class="sub-heading text-center">Building Products</h3>
        <div class="chart-wrapper tall" aria-label="Building Products company performance">
          <canvas id="chart-products" role="img"></canvas>
        </div>
      </div>
    </div>
    <div class="chart-legend" id="legend-company"></div>
    <div class="chart-caption" id="company-chart-caption">Revenue Growth YoY (%) \u2014 ${esc(dateRange)}</div>
    <div id="filter-announce" aria-live="polite" class="sr-only"></div>

    <!-- Company Summary Table -->
    <h3 class="sub-heading mt-32">Company Summary Table</h3>
    <div class="table-filter-key screen-only" id="table-filter-key"></div>
    <div class="table-overflow">
    <table id="company-table">
      <thead><tr><th scope="col" class="seg-col">Seg.</th><th scope="col">Company</th><th scope="col">Revenue YoY</th><th scope="col">COGS/Sales</th><th scope="col">SG&amp;A/Sales</th><th scope="col">EBITDA Margin</th></tr></thead>
      <tbody>
${buildCompanyTableRows(financials)}
      </tbody>
    </table>
    </div>
  </div>
</section>

${sections.length ? `
<!-- ========== INDUSTRY NEWS ========== -->
<section class="report-section" id="sec-news">
  <h2 class="section-heading">Industry News</h2>
  <div class="section-body">
    <p>AI-synthesized coverage of key industry developments for ${esc(dateRange)}.</p>
  </div>
</section>
${newsSectionsHtml}
` : ""}

<!-- ========== HOW APPLIED VALUE CAN HELP ========== -->
<section class="report-section" id="sec-av">
  <h2 class="section-heading">How Applied Value Can Help</h2>
  <div class="section-body">
    <p>Applied Value partners with building materials and products companies to drive measurable improvement across the value chain. Our team brings deep sector expertise, data-driven methodologies, and hands-on implementation support.</p>

    <div class="service-cards">
      <div class="service-card">
        <div class="service-icon">&#8644;</div>
        <h4>Optimize Sourcing &amp; Supply Chains</h4>
        <p class="service-card-desc">Strategic procurement, supplier consolidation, and logistics optimization.</p>
      </div>
      <div class="service-card">
        <div class="service-icon">&#9881;</div>
        <h4>Enhance Operational Efficiency</h4>
        <p class="service-card-desc">Lean manufacturing, capacity optimization, and continuous improvement programs.</p>
      </div>
      <div class="service-card">
        <div class="service-icon">&#36;</div>
        <h4>Improve Pricing &amp; Commercial Strategy</h4>
        <p class="service-card-desc">Data-driven pricing analytics, channel strategy, and go-to-market optimization.</p>
      </div>
      <div class="service-card">
        <div class="service-icon">&#10070;</div>
        <h4>Strategic M&amp;A &amp; Portfolio Optimization</h4>
        <p class="service-card-desc">Target identification, due diligence support, integration planning.</p>
      </div>
    </div>

    <h3 class="sub-heading mt-32">Contact Us</h3>
    <div class="contact-grid">
      <div class="contact-card">
        <div class="name">Max Sultan</div>
        <div class="role">Partner</div>
        <div class="phone">+1 (978) 760-9971</div>
        <div class="role">Miami</div>
      </div>
      <div class="contact-card">
        <div class="name">Alexander Schneider</div>
        <div class="role">Senior Manager</div>
        <div class="phone">+1 (561) 289-1313</div>
        <div class="role">Miami</div>
      </div>
      <div class="contact-card">
        <div class="name">Jacob Wozniewski</div>
        <div class="role">Senior Consultant</div>
        <div class="phone">+1 (351) 216-9648</div>
        <div class="role">Miami</div>
      </div>
    </div>

    <div class="av-footer-block">
      <div class="av-footer-name">Applied Value Group</div>
      <div class="av-footer-addr">One Biscayne Tower, 2 S Biscayne Blvd. Suite 1750, Miami, FL 33131</div>
    </div>
  </div>
</section>

<!-- ====== PRINT-ONLY: Running footer ====== -->
<div class="print-only print-footer" aria-hidden="true">
  <span>Applied Value Group \u2014 Confidential</span>
  <span>&copy; ${new Date().getFullYear()} Applied Value Group &nbsp;|&nbsp; ${esc(endDateLabel)}</span>
</div>

</main>

<!-- ============================================================
     CHART.JS
     ============================================================ -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>

<script>
/* ============================================================
   GLOBAL STATE & DATA
   ============================================================ */
let activeSegment = 'all';
let activeMetric = 'revenue';
const allCharts = {};
const dateRange = '${escJs(dateRange)}';

const subsectorColors = {
  'Aggregates & Cement':'#1A4731',
  'Glass & Insulation':'#0097A7',
  'Wood & Lumber':'#8D6E27',
  'Steel & Metals':'#546E7A',
  'Building Envelope & Dist.':'#6A1B9A',
  'Doors & Windows':'#00695C',
  'Plumbing & Fixtures':'#1565A0',
  'HVAC & Climate':'#D84315'
};
let activeSubsector = 'all';

const materials = ${materials};
const products = ${products};

const segColors = {nonresidential:'#2E7D52',distribution:'#E07B2A',residential:'#1565A0'};
const dimColor = 'rgba(200,200,200,0.3)';

/* ============================================================
   UTILITIES
   ============================================================ */
function getSegColor(seg){return segColors[seg]||'#999'}
function getSubColor(sub){return subsectorColors[sub]||'#999'}
function getBarColor(company){
  if(activeSubsector!=='all') return company.sub===activeSubsector ? getSubColor(company.sub) : dimColor;
  if(activeSegment!=='all') return company.seg===activeSegment ? getSegColor(company.seg) : dimColor;
  return getSubColor(company.sub);
}

function buildLegend(id, items){
  const el=document.getElementById(id);
  if(!el)return;
  el.innerHTML=items.map((it,i)=>
    \`<button class="chart-legend-item" data-idx="\${i}" aria-label="Toggle \${it.label}"><span class="chart-legend-swatch" style="background:\${it.color}"></span><span class="chart-legend-label">\${it.label}</span></button>\`
  ).join('');
}

function attachLegendToggle(legendId, chart){
  const el=document.getElementById(legendId);
  if(!el)return;
  el.querySelectorAll('.chart-legend-item').forEach(item=>{
    item.addEventListener('click',function(){
      const idx=+this.dataset.idx;
      const meta=chart.getDatasetMeta(idx);
      meta.hidden=!meta.hidden;
      this.classList.toggle('struck');
      chart.update();
    });
  });
}

/* ============================================================
   CHART INITIALIZATION
   ============================================================ */
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    if(typeof r==='number') r=[r,r,r,r];
    this.moveTo(x+r[0],y);this.lineTo(x+w-r[1],y);this.arcTo(x+w,y,x+w,y+r[1],r[1]);
    this.lineTo(x+w,y+h-r[2]);this.arcTo(x+w,y+h,x+w-r[2],y+h,r[2]);
    this.lineTo(x+r[3],y+h);this.arcTo(x,y+h,x,y+h-r[3],r[3]);
    this.lineTo(x,y+r[0]);this.arcTo(x,y,x+r[0],y,r[0]);this.closePath();return this;
  };
}

document.addEventListener('DOMContentLoaded', function(){

Chart.defaults.layout = { padding: { top: 8, right: 10, bottom: 16, left: 4 } };
Chart.defaults.plugins.tooltip.cornerRadius = 4;
Chart.defaults.plugins.tooltip.caretSize = 5;

// Average line plugin
Chart.register({
  id:'avgLine',
  afterDraw(chart){
    const opts=chart.options.plugins.avgLine;
    if(!opts||opts.avg===undefined||opts.avg===null) return;
    const avg=opts.avg;const xScale=chart.scales.x;
    if(!xScale||typeof xScale.getPixelForValue!=='function') return;
    const xPixel=xScale.getPixelForValue(avg);const ctx=chart.ctx;
    const top=chart.chartArea.top;const bottom=chart.chartArea.bottom;
    ctx.save();ctx.beginPath();ctx.setLineDash([6,4]);ctx.lineWidth=1.5;ctx.strokeStyle='#C62828';
    ctx.moveTo(xPixel,top);ctx.lineTo(xPixel,bottom);ctx.stroke();ctx.setLineDash([]);
    const label='\\u00D8 '+avg.toFixed(1)+'%';
    ctx.font='bold 10px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';
    const tw=ctx.measureText(label).width;const lx=xPixel;const ly=top-10;
    ctx.fillStyle='rgba(255,255,255,0.95)';ctx.beginPath();ctx.roundRect(lx-tw/2-6,ly-7,tw+12,16,4);
    ctx.fill();ctx.strokeStyle='#C62828';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#C62828';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,lx,ly+1);
    ctx.restore();
  }
});

/* ============================================================
   COMPANY CHARTS
   ============================================================ */
function getMetricData(companies, metric){
  return companies.map(c=>{
    if(metric==='revenue') return c.revenue;
    if(metric==='cogs') return c.cogs;
    if(metric==='sga') return c.sga;
    if(metric==='ebitda') return c.ebitda;
    return 0;
  });
}
function getMetricDataForChart(companies, metric){
  return getMetricData(companies,metric).map(v=>v===null?0:v);
}
function getMetricDelta(companies, metric){
  return companies.map(c=>{
    if(metric==='revenue') return null;
    if(metric==='cogs') return c.cogsD;
    if(metric==='sga') return c.sgaD;
    if(metric==='ebitda') return c.ebitdaD;
    return null;
  });
}

function buildCompanyChart(canvasId, companies, metric){
  const ctx=document.getElementById(canvasId);
  const existing=allCharts[canvasId];
  if(existing) existing.destroy();

  const filtered = activeSubsector==='all' ? companies : companies.filter(c=>c.sub===activeSubsector);
  if(filtered.length===0){
    allCharts[canvasId]=new Chart(ctx,{
      type:'bar',data:{labels:['No companies in this subsector'],datasets:[{data:[0],backgroundColor:'#eee'}]},
      options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{display:false},y:{ticks:{font:{size:11},color:'#999'}}}}
    });
    return;
  }

  const rawData=getMetricData(filtered, metric);
  const data=getMetricDataForChart(filtered, metric);
  const colors=filtered.map(c=>getBarColor(c));
  const names=filtered.map(c=>c.name);

  const displayData = data.map((v,i)=>{
    if(filtered[i].name==='QXO'){
      if(metric==='revenue') return 65;
      if(metric==='sga') return 100;
      if(metric==='ebitda') return Math.max(v, -50);
    }
    return v;
  });

  const wrapper = ctx.closest('.chart-wrapper');
  if(wrapper) wrapper.style.height = Math.max(200, filtered.length * 28 + 40) + 'px';

  const validVals = rawData.filter((v,i)=> v!==null && filtered[i].name!=='QXO');
  const avg = validVals.length ? validVals.reduce((a,b)=>a+b,0)/validVals.length : null;

  allCharts[canvasId]=new Chart(ctx,{
    type:'bar',
    data:{labels:names,datasets:[{data:displayData,backgroundColor:colors,borderRadius:3,barPercentage:0.7}]},
    options:{
      responsive:true,maintainAspectRatio:false,indexAxis:'y',
      layout:{padding:{top:26,right:10}},
      animation:{duration:0},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#fff',titleColor:'#1A1A1A',bodyColor:'#555',borderColor:'#E0E0E0',borderWidth:1,
          callbacks:{
            title:items=>{const i=items[0].dataIndex;return filtered[i].name+' \\u2014 '+filtered[i].sub;},
            label:item=>{
              const i=item.dataIndex;const realVal=getMetricData(filtered,metric)[i];
              const delta=getMetricDelta(filtered,metric);
              let label=metricLabels[metric]+': '+(realVal===null?'n/a':realVal.toFixed(1)+'%');
              if(delta&&delta[i]!==null&&delta[i]!==undefined) label+=' (YoY: '+(delta[i]>0?'+':'')+delta[i]+'pp)';
              return label;
            }
          }
        },
        avgLine:{avg:avg}
      },
      scales:{
        x:{ticks:{callback:v=>v+'%',font:{size:10},color:'#666'},grid:{color:ctx=>ctx.tick?.value===0?'#333':'#E8E8E8',lineWidth:ctx=>ctx.tick?.value===0?1.5:0.5}},
        y:{ticks:{font:{size:10},color:'#333'},grid:{display:false}}
      }
    }
  });
  allCharts[canvasId]._companies=filtered;
}

const metricLabels={revenue:'Revenue Growth YoY',cogs:'COGS/Sales',sga:'SG&A/Sales',ebitda:'EBITDA Margin'};
const metricCaptions={
  revenue:'Revenue Growth YoY (%) \\u2014 '+dateRange,
  cogs:'COGS/Sales (%) \\u2014 '+dateRange+' (lower is better)',
  sga:'SG&A/Sales (%) \\u2014 '+dateRange+' (lower is better)',
  ebitda:'EBITDA Margin (%) \\u2014 '+dateRange+' (higher is better)'
};

function announce(msg){
  const el=document.getElementById('filter-announce');
  if(el){el.textContent='';setTimeout(()=>{el.textContent=msg;},50);}
}
function updateCompanyCharts(){
  buildCompanyChart('chart-materials', materials, activeMetric);
  buildCompanyChart('chart-products', products, activeMetric);
  document.getElementById('company-chart-caption').textContent=metricCaptions[activeMetric];
}

const materialsSubs=['Aggregates & Cement','Glass & Insulation','Wood & Lumber','Steel & Metals'];
const productsSubs=['Building Envelope & Dist.','Doors & Windows','Plumbing & Fixtures','HVAC & Climate'];

function buildSubsectorKey(){
  const matEl=document.getElementById('subsector-materials');
  const prodEl=document.getElementById('subsector-products');
  if(!matEl||!prodEl) return;
  function addChip(container, sub){
    const color=subsectorColors[sub];const btn=document.createElement('button');
    btn.className='subsector-chip';btn.dataset.subsector=sub;
    btn.setAttribute('aria-pressed','false');
    btn.onclick=function(){toggleSubsector(sub)};
    btn.innerHTML='<span class="ss-dot" style="background:'+color+'"></span>'+sub;
    container.appendChild(btn);
  }
  materialsSubs.forEach(sub=>addChip(matEl,sub));
  productsSubs.forEach(sub=>addChip(prodEl,sub));
}
buildSubsectorKey();

window.toggleSubsector=function(sub){
  if(activeSubsector===sub) activeSubsector='all'; else activeSubsector=sub;
  document.querySelectorAll('.subsector-chip').forEach(chip=>{
    const isSel=chip.dataset.subsector===activeSubsector;
    chip.classList.toggle('active',isSel);chip.setAttribute('aria-pressed',isSel);
    if(isSel){chip.style.background=subsectorColors[activeSubsector]||'var(--av-dark)';chip.style.color='#fff';}
    else{chip.style.background='#fff';chip.style.color='';}
  });
  if(activeSubsector!=='all'){
    activeSegment='all';
    document.querySelectorAll('.filter-btn').forEach(b=>{
      const sel=b.dataset.segment==='all';b.classList.toggle('active',sel);b.setAttribute('aria-pressed',sel);
    });
  }
  updateCompanyCharts();
  announce(activeSubsector==='all'?'Showing all subsectors':'Filtered to '+activeSubsector);
};

updateCompanyCharts();

/* ============================================================
   INTERACTIVITY
   ============================================================ */
window.applySegmentFilter=function(segment){
  activeSegment=segment;
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    const sel=btn.dataset.segment===segment;btn.classList.toggle('active',sel);btn.setAttribute('aria-pressed',sel);
  });
  activeSubsector='all';
  document.querySelectorAll('.subsector-chip').forEach(chip=>{
    chip.classList.remove('active');chip.setAttribute('aria-pressed','false');chip.style.background='#fff';chip.style.color='';
  });
  updateCompanyCharts();
  announce('Filtered to '+segment+' segment');
};

window.switchMetric=function(metric){
  activeMetric=metric;
  document.querySelectorAll('.metric-tab').forEach(tab=>{
    const sel=tab.dataset.metric===metric;tab.classList.toggle('active',sel);tab.setAttribute('aria-selected',sel);
  });
  updateCompanyCharts();
  announce('Showing '+metricLabels[metric]);
};

// Section collapse
document.querySelectorAll('.section-heading').forEach(heading=>{
  heading.setAttribute('role','button');heading.setAttribute('tabindex','0');heading.setAttribute('aria-expanded','true');
  function toggle(){
    const sec=heading.closest('.report-section');sec.classList.toggle('collapsed');
    heading.setAttribute('aria-expanded',!sec.classList.contains('collapsed'));
  }
  heading.addEventListener('click',toggle);
  heading.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});
});

// Sidebar active link tracking
const sections=document.querySelectorAll('.report-section[id]');
const sidebarLinks=document.querySelectorAll('.sidebar a');
let ticking=false;
function updateActiveLink(){
  let current='';
  sections.forEach(sec=>{if(sec.getBoundingClientRect().top<=120) current=sec.id;});
  sidebarLinks.forEach(link=>{
    link.classList.toggle('active',link.getAttribute('href')==='#'+current);
  });
  ticking=false;
}
document.querySelector('.main-content')?.addEventListener('scroll',function(){
  if(!ticking){requestAnimationFrame(updateActiveLink);ticking=true;}
});
window.addEventListener('scroll',function(){
  if(!ticking){requestAnimationFrame(updateActiveLink);ticking=true;}
});

// Mark chart wrappers as loaded
document.querySelectorAll('.chart-wrapper').forEach(w=>w.classList.add('loaded'));

// Print handlers
window.addEventListener('beforeprint',function(){
  document.querySelectorAll('.report-section.collapsed').forEach(sec=>{
    sec.dataset.wasCollapsed='true';sec.classList.remove('collapsed');
    const h=sec.querySelector('.section-heading');if(h) h.setAttribute('aria-expanded','true');
  });
  ['chart-materials','chart-products'].forEach(id=>{
    const canvas=document.getElementById(id);
    if(canvas){const wrapper=canvas.closest('.chart-wrapper');const chart=allCharts[id];
      if(wrapper&&chart){const count=chart.data?.labels?.length||16;wrapper.style.height=Math.max(300,count*20+50)+'px';}
    }
  });
  const caption=document.getElementById('company-chart-caption');
  if(caption&&!document.querySelector('.print-metric-label')){
    const lbl=document.createElement('div');lbl.className='print-metric-label print-only';
    lbl.textContent='Showing: '+(metricCaptions[activeMetric]||'Revenue Growth YoY (%)');
    caption.parentNode.insertBefore(lbl,caption);
  }
  if(activeSegment!=='all') applySegmentFilter('all');
  if(activeSubsector!=='all') toggleSubsector(activeSubsector);
  Object.values(allCharts).forEach(chart=>{
    if(chart&&chart.options){chart.options.animation=false;chart.update('none');}
  });
});
window.addEventListener('afterprint',function(){
  document.querySelectorAll('.print-metric-label').forEach(el=>el.remove());
  ['chart-materials','chart-products'].forEach(id=>{
    const canvas=document.getElementById(id);
    if(canvas){const w=canvas.closest('.chart-wrapper');if(w) w.style.height='';}
  });
  Object.values(allCharts).forEach(chart=>{
    if(chart&&chart.options){delete chart.options.devicePixelRatio;chart.resize();}
  });
  document.querySelectorAll('[data-was-collapsed]').forEach(sec=>{
    sec.classList.add('collapsed');delete sec.dataset.wasCollapsed;
    const h=sec.querySelector('.section-heading');if(h) h.setAttribute('aria-expanded','false');
  });
});

}); // end DOMContentLoaded
</script>

</body>
</html>`;
}
