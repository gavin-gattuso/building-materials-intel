/**
 * HTML report builder — generates a standalone HTML report matching the
 * Applied Value 2025 YTD format (cover, TOC, drivers, news, print CSS).
 * Same data contract as buildReportDocument in docx-formatting.ts.
 */

import { readFileSync } from "fs";
import { join } from "path";

/* ── Brand palette ── */
const AV = {
  darkGreen: "#163E2D",
  medGreen: "#328D66",
  accentGreen: "#215D44",
  lightGreen: "#2c654d",
  posGreen: "#00B050",
  neuAmber: "#ffa347",
  negRed: "#fc595c",
  posBg: "#E0F4EB",
  neuBg: "#FFF3E0",
  negBg: "#fde8e8",
  gray: "#5a5a5a",
  lightGray: "#e0e0e0",
  body: "#1a1a1a",
  white: "#fff",
};

/* ── Helpers ── */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trendClass(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return "pos";
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return "neu";
  return "neg";
}

function trendLabel(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("positive") || d.includes("expanding") || d.includes("improving")) return "Positive";
  if (d.includes("neutral") || d.includes("mixed") || d.includes("stable")) return "Neutral";
  return "Negative";
}

function indicatorType(driver: string): string {
  const d = driver.toLowerCase();
  if (d.includes("gdp") || d.includes("labor")) return "Lagging";
  return "Leading";
}

function formatDate(d: string): string {
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
    .join("\n");
}

/** Try to load the AV logo as base64 for embedding; return empty string on failure */
function loadLogoBase64(): string {
  try {
    const logoPath = join(process.cwd(), "site", "public", "reports", "images", "_logo_b64.txt");
    return readFileSync(logoPath, "utf-8").trim();
  } catch {
    return "";
  }
}

/* ── Types ── */
interface ReportArticle {
  title: string;
  source: string;
  analysis: string;
  dataPoints: string[];
  url?: string;
}
interface ReportSection {
  category: string;
  content: string;
  articles: ReportArticle[];
}
interface ReportDriver {
  driver: string;
  direction: string;
  signal: string;
  content: string;
  impact: string;
  dataPoints: string[];
}
export interface HtmlReportOpts {
  startDate: string;
  endDate: string;
  executiveSummary: string;
  sections: ReportSection[];
  drivers: ReportDriver[];
}

/* ── Main builder ── */
export function buildReportHTML(opts: HtmlReportOpts): string {
  const { startDate, endDate, executiveSummary, sections, drivers } = opts;
  const dateRange = `${formatDate(startDate)} \u2014 ${formatDate(endDate)}`;
  const logoB64 = loadLogoBase64();
  const logoSrc = logoB64 ? `data:image/png;base64,${logoB64}` : "";

  /* TOC entries */
  const tocEntries: { label: string; id: string; page: string }[] = [
    { label: "Executive Summary", id: "sec-exec", page: "2" },
  ];
  if (drivers.length) {
    tocEntries.push({ label: "Drivers of Market Health", id: "sec-drivers", page: "3" });
    tocEntries.push({ label: "Recent Trends &amp; Outlook", id: "sec-trends", page: "4" });
  }
  if (sections.length) {
    tocEntries.push({ label: "Industry News", id: "sec-news", page: String(drivers.length ? 5 : 3) });
    for (const sec of sections) {
      tocEntries.push({
        label: esc(sec.category),
        id: `sec-${sec.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`,
        page: "",
      });
    }
  }

  /* Sidebar nav links */
  const navLinks = [
    `<a href="#sec-exec">Executive Summary</a>`,
    ...(drivers.length ? [
      `<a href="#sec-drivers">Drivers of Market Health</a>`,
      ...drivers.map((d) => `<a href="#drv-${d.driver.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}">${esc(d.driver)}</a>`),
    ] : []),
    ...(sections.length ? [
      `<a href="#sec-news">Industry News</a>`,
      ...sections.map((s) => `<a href="#sec-${s.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}">${esc(s.category)}</a>`),
    ] : []),
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Building Materials &amp; Products \u2014 Custom Intelligence Report</title>
${CSS}
</head>
<body>

<!-- SKIP LINK -->
<a href="#content" class="skip-link">Skip to content</a>

<!-- EXPORT BUTTON -->
<button class="export-btn" onclick="window.print()">
  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6zm2-6h8v1.5H8V14zm0-3h8v1.5H8V11zm0 6h5v1.5H8V17z"/></svg>
  Export PDF
</button>

<!-- STICKY HEADER BAR (screen only) -->
<div class="top-bar" id="top-bar">
  ${logoSrc ? `<img src="${logoSrc}" alt="AV">` : ""}
  <span class="bar-title">Building Materials &amp; Products \u2014 Custom Intelligence Report</span>
  <span class="bar-section" id="bar-section"></span>
</div>

<!-- SIDEBAR NAV (screen only) -->
<nav class="side-nav" id="side-nav">
  ${navLinks.join("\n  ")}
</nav>

<!-- HERO COVER (screen only) -->
<div class="cover-hero" id="cover-hero">
  <div class="cover-hero-content">
    <h1>Building Materials<br>&amp; Products</h1>
    <h2>Custom Intelligence Report</h2>
    <div class="hero-meta">
      <span><strong>${esc(dateRange)}</strong></span>
      <span>Applied Value &bull; Miami, FL</span>
    </div>
  </div>
</div>

<!-- PRINT COVER -->
<div class="page cover">
  <div class="cover-top">
    ${logoSrc ? `<img class="cover-logo" src="${logoSrc}" alt="Applied Value">` : ""}
    <div class="cover-rule"></div>
  </div>
  <div class="cover-photo"></div>
  <div class="cover-band">
    <h1>Building Materials &amp; Products</h1>
    <h2>Custom Intelligence Report</h2>
    <div class="cover-sep"></div>
    <div class="cover-date">
      <span>${esc(dateRange)}</span>
    </div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-left">
      <strong>Applied Value</strong><br>
      One Biscayne Tower<br>
      2 S Biscayne Blvd. Suite 1750<br>
      Miami, FL 33131<br><br>
      <a href="https://www.appliedvaluegroup.com">www.appliedvaluegroup.com</a>
    </div>
  </div>
</div>

<!-- TABLE OF CONTENTS -->
<div class="page" id="content" style="padding:0;">
  <div class="toc-layout">
    <div class="toc-left">
      <div class="toc-title">Building Materials &amp; Products<br>Custom Intelligence Report</div>
      <div class="toc-subtitle">${esc(dateRange)}</div>
      <div class="toc-rule"></div>
      <ul class="toc-list">
        ${tocEntries.map((t) =>
          t.page
            ? `<li><a href="#${t.id}" style="color:inherit;text-decoration:none;">${t.label} <span class="pg">(P${t.page})</span></a></li>`
            : `<li class="toc-sub"><a href="#${t.id}" style="color:inherit;text-decoration:none;">${t.label}</a></li>`
        ).join("\n        ")}
      </ul>
    </div>
    <div class="toc-divider"></div>
    <div class="toc-right"></div>
  </div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="page">
  <div class="pg-header">
    ${logoSrc ? `<img src="${logoSrc}" alt="AV">` : ""}
    <span>Applied Value \u2014 Building Materials &amp; Products Custom Intelligence Report</span>
    <span class="pg-num">2</span>
  </div>
  <h1 class="section" id="sec-exec">Executive Summary</h1>
  <div class="section-rule"></div>
  ${paragraphs(executiveSummary)}
</div>

${drivers.length ? buildDriversSection(drivers, logoSrc) : ""}

${sections.length ? buildNewsSection(sections, logoSrc, drivers.length) : ""}

<!-- FOOTER PAGE -->
<div class="page">
  <div class="pg-footer-block">
    <div class="pg-footer-rule"></div>
    <p class="pg-footer-text">Compiled by Jarvis AI \u2014 Building Materials &amp; Building Products Monitor</p>
    <p class="pg-footer-text">Applied Value &nbsp;|&nbsp; <a href="https://www.appliedvaluegroup.com">www.appliedvaluegroup.com</a></p>
  </div>
</div>

${SCRIPT}
</body>
</html>`;
}

/* ── Drivers section ── */
function buildDriversSection(drivers: ReportDriver[], logoSrc: string): string {
  const tableRows = drivers
    .map((d) => {
      const cls = trendClass(d.direction);
      return `    <tr>
      <td class="dn">${esc(d.driver)}</td>
      <td class="ds">${esc(d.signal)}</td>
      <td class="it">${indicatorType(d.driver)}</td>
      <td class="tn t-${cls}">${trendLabel(d.direction)}</td>
    </tr>`;
    })
    .join("\n");

  const driverCards = drivers
    .map((d) => {
      const cls = trendClass(d.direction);
      const id = `drv-${d.driver.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      return `<div class="driver-card" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'})">
      <div class="dc-top">
        <span class="dc-name">${esc(d.driver)}</span>
        <span class="dc-trend ${cls}">${trendLabel(d.direction)}</span>
      </div>
      <div class="dc-summary">${esc(d.signal)}</div>
      <div class="dc-indicator">${indicatorType(d.driver)} Indicator</div>
    </div>`;
    })
    .join("\n    ");

  const deepDives = drivers
    .map((d) => {
      const id = `drv-${d.driver.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      const bullets = (d.dataPoints || [])
        .map((dp) => `<li>${esc(dp)}</li>`)
        .join("\n          ");
      return `<div class="driver-detail" id="${id}">
      <h2 class="sub">${esc(d.driver)}</h2>
      ${paragraphs(d.content)}
      ${d.impact ? `<p><span class="impact-label">Impact on Construction:</span> ${esc(d.impact)}</p>` : ""}
      ${bullets ? `<h3 class="sub">Key Data Points</h3>\n      <ul class="bullets">\n          ${bullets}\n      </ul>` : ""}
    </div>`;
    })
    .join("\n    ");

  return `
<!-- DRIVERS OF MARKET HEALTH -->
<div class="page">
  <div class="pg-header">
    ${logoSrc ? `<img src="${logoSrc}" alt="AV">` : ""}
    <span>Applied Value \u2014 Building Materials &amp; Products Custom Intelligence Report</span>
    <span class="pg-num">3</span>
  </div>
  <h1 class="section" id="sec-drivers">Drivers of Market Health</h1>
  <div class="section-rule"></div>
  <p class="section-intro">A range of macroeconomic and industry-specific forces are shaping the near- and medium-term construction outlook. The table below ranks the most influential drivers by impact, indicating recent trend direction and whether each serves as a Leading or Lagging indicator.</p>

  <!-- Driver summary table (print + screen) -->
  <table class="driver-table">
    <thead>
      <tr><th>Driver</th><th>Summary</th><th>Indicator Type</th><th>Recent Trend</th></tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>

  <!-- Legend -->
  <div class="legend">
    <span style="font-weight:bold;">Key:</span>
    <span><span class="leg-sw" style="background:${AV.posBg};border:1px solid ${AV.posGreen};"></span> Positive</span>
    <span><span class="leg-sw" style="background:${AV.neuBg};border:1px solid ${AV.neuAmber};"></span> Neutral</span>
    <span><span class="leg-sw" style="background:${AV.negBg};border:1px solid ${AV.negRed};"></span> Negative</span>
    <span style="margin-left:16px;font-size:8.5pt;color:#555;">Leading = forward-looking &nbsp;|&nbsp; Lagging = confirms established trend</span>
  </div>

  <!-- Driver cards (screen only) -->
  <div class="driver-cards">
    ${driverCards}
  </div>
</div>

<!-- RECENT TRENDS & OUTLOOK -->
<div class="page">
  <div class="pg-header">
    ${logoSrc ? `<img src="${logoSrc}" alt="AV">` : ""}
    <span>Applied Value \u2014 Building Materials &amp; Products Custom Intelligence Report</span>
    <span class="pg-num">4</span>
  </div>
  <h1 class="section" id="sec-trends" style="font-size:14pt;">Recent Trends &amp; Outlook</h1>
  <div class="section-rule"></div>
  ${deepDives}
</div>`;
}

/* ── News sections ── */
function buildNewsSection(sections: ReportSection[], logoSrc: string, hasDrivers: number): string {
  const pageStart = hasDrivers ? 5 : 3;

  const sectionBlocks = sections
    .map((sec, i) => {
      const secId = `sec-${sec.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
      const articleBlocks = sec.articles
        .map((art) => {
          const bullets = (art.dataPoints || [])
            .map((dp) => `<li>${esc(dp)}</li>`)
            .join("\n            ");
          return `<div class="article-block">
        <h3 class="article-headline">${esc(art.title)} <span class="article-source">(${esc(art.source)})</span></h3>
        ${art.analysis ? `<p>${esc(art.analysis)}</p>` : ""}
        ${bullets ? `<div class="data-points-label">Key Data Points</div>\n        <ul class="bullets">\n            ${bullets}\n        </ul>` : ""}
        ${art.url ? `<p class="source-link">Source: <a href="${esc(art.url)}" target="_blank" rel="noopener">${esc(art.url)}</a></p>` : ""}
      </div>`;
        })
        .join("\n      ");

      return `
  <!-- ${esc(sec.category)} -->
  <div class="category-section" id="${secId}">
    <div class="category-header">${esc(sec.category)}</div>
    ${sec.content ? `<p class="category-overview">${esc(sec.content)}</p>` : ""}
    ${articleBlocks}
  </div>`;
    })
    .join("\n");

  return `
<!-- INDUSTRY NEWS -->
<div class="page">
  <div class="pg-header">
    ${logoSrc ? `<img src="${logoSrc}" alt="AV">` : ""}
    <span>Applied Value \u2014 Building Materials &amp; Products Custom Intelligence Report</span>
    <span class="pg-num">${pageStart}</span>
  </div>
  <h1 class="section" id="sec-news">Industry News</h1>
  <div class="section-rule"></div>
  ${sectionBlocks}
</div>`;
}

/* ── CSS (embedded) ── */
const CSS = `<style>
  /* ===== AV REPORT — DUAL MODE: SCREEN + PRINT ===== */
  @page { size: 8.5in 11in; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html { scroll-behavior: smooth; }
  body {
    font-family: Calibri, Inter, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt; color: ${AV.body}; background: #f5f6f7;
    line-height: 1.6; text-align: left;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .page {
    max-width: 860px; margin: 0 auto;
    padding: 36px 48px 40px; background: #fff; position: relative;
  }
  .page + .page { border-top: 1px solid #eaeaea; }

  /* ===== SKIP LINK ===== */
  .skip-link {
    position: absolute; left: -9999px; top: 0; z-index: 10000;
    padding: 8px 16px; background: ${AV.darkGreen}; color: #fff; font-size: 14px;
  }
  .skip-link:focus { left: 0; }

  /* ===== RUNNING HEADER ===== */
  .pg-header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 8px; border-bottom: 2px solid ${AV.darkGreen};
    margin-bottom: 24px; font-size: 9pt; color: ${AV.gray}; gap: 8px;
  }
  .pg-header img { height: 20px; vertical-align: middle; object-fit: contain; }
  .pg-header .pg-num { font-size: 9pt; color: ${AV.gray}; margin-left: auto; }

  /* ===== COVER (print only) ===== */
  .cover {
    padding: 0; display: flex; flex-direction: column; min-height: 520px;
  }
  .cover-top { flex: 0 0 auto; padding: 28px 48px 0; }
  .cover-logo { height: 50px; width: auto; object-fit: contain; }
  .cover-rule { height: 2px; background: ${AV.accentGreen}; margin-top: 14px; }
  .cover-photo {
    flex: 1; min-height: 220px; position: relative; overflow: hidden;
    background: linear-gradient(135deg, ${AV.darkGreen} 0%, ${AV.accentGreen} 50%, ${AV.medGreen} 100%);
  }
  .cover-band {
    background: ${AV.accentGreen}; color: #fff;
    padding: 20px 28px 16px; margin: 0 auto 0 18%; max-width: 72%; text-align: left;
  }
  .cover-band h1 { font-size: 24pt; font-weight: bold; margin-bottom: 2px; line-height: 1.2; }
  .cover-band h2 { font-size: 24pt; font-weight: bold; line-height: 1.2; }
  .cover-sep { height: 1px; background: #fff; margin: 10px 0; opacity: 0.5; }
  .cover-date { font-size: 12pt; color: #fff; }
  .cover-footer {
    padding: 24px 48px 32px; display: flex; justify-content: space-between; align-items: flex-start;
  }
  .cover-footer-left { font-size: 10pt; color: ${AV.body}; line-height: 1.6; }
  .cover-footer-left strong { font-size: 11pt; }
  .cover-footer-left a { color: ${AV.lightGreen}; text-decoration: none; }

  /* ===== TYPOGRAPHY ===== */
  h1.section {
    font-size: 24pt; color: ${AV.body}; font-weight: bold;
    margin-top: 20px; margin-bottom: 4px; text-align: left;
  }
  .section-rule { height: 2px; background: ${AV.darkGreen}; margin-bottom: 16px; }
  .section-intro { font-size: 10.5pt; color: #333; margin-bottom: 18px; max-width: 9in; }
  h2.sub {
    font-size: 14pt; color: ${AV.accentGreen}; font-weight: bold;
    margin: 18px 0 8px; text-align: left;
  }
  h3.sub {
    font-size: 12pt; color: ${AV.accentGreen}; font-weight: bold;
    margin: 14px 0 6px; text-align: left;
  }
  p { margin-bottom: 12px; }
  .impact-label { font-weight: bold; color: ${AV.body}; }
  ul.bullets { list-style: none; margin: 6px 0 16px 0; padding: 0; }
  ul.bullets li {
    padding-left: 18px; margin-bottom: 6px; font-size: 11pt; position: relative;
  }
  ul.bullets li::before {
    content: '\\203A'; color: ${AV.lightGreen}; font-weight: bold;
    position: absolute; left: 0; font-size: 13pt;
  }

  /* ===== TOC ===== */
  .toc-layout { display: flex; min-height: 480px; }
  .toc-left {
    flex: 0 0 55%; padding: 40px 20px 40px 48px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .toc-divider { flex: 0 0 2px; background: ${AV.lightGreen}; }
  .toc-right {
    flex: 1; overflow: hidden; position: relative;
    background: linear-gradient(135deg, ${AV.darkGreen} 0%, ${AV.accentGreen} 100%);
  }
  .toc-title { font-size: 24pt; font-weight: bold; color: ${AV.body}; line-height: 1.2; margin-bottom: 6px; }
  .toc-subtitle { font-size: 16pt; font-weight: bold; color: ${AV.body}; margin-bottom: 8px; }
  .toc-rule { height: 2px; background: ${AV.darkGreen}; margin-bottom: 18px; }
  .toc-list { list-style: none; padding: 0; }
  .toc-list li {
    padding: 5px 0; font-size: 11pt; display: flex; align-items: baseline; gap: 8px;
  }
  .toc-list li::before { content: '\\203A'; color: ${AV.lightGreen}; font-weight: bold; font-size: 12pt; }
  .toc-list .pg { margin-left: auto; color: ${AV.gray}; font-size: 10pt; }
  .toc-list a { transition: color 0.2s; }
  .toc-list a:hover { color: ${AV.accentGreen} !important; }
  .toc-sub { padding-left: 14px; font-size: 10.5pt; }

  /* ===== DRIVER TABLE ===== */
  .driver-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt; }
  .driver-table thead th {
    background: ${AV.darkGreen}; color: #fff; font-weight: bold;
    padding: 8px 10px; text-align: left; text-transform: uppercase; font-size: 9pt;
  }
  .driver-table thead th:nth-child(3),
  .driver-table thead th:nth-child(4) { text-align: center; }
  .driver-table td {
    padding: 8px 10px; border-bottom: 1px solid #d0d0d0;
    border-right: 1px solid #d0d0d0; vertical-align: middle;
  }
  .driver-table td:last-child { border-right: none; }
  .driver-table tbody tr:last-child td { border-bottom: 1.5pt solid ${AV.darkGreen}; }
  .dn {
    background: ${AV.darkGreen}; color: #fff; font-weight: bold;
    font-size: 8.5pt; text-transform: uppercase; width: 130pt; line-height: 1.25;
  }
  .ds { font-size: 8.5pt; color: ${AV.body}; width: 260pt; }
  .it { text-align: center; font-size: 9pt; color: #555; width: 80pt; }
  .tn { text-align: center; font-weight: bold; font-size: 8.5pt; width: 96pt; }
  .t-neg { color: ${AV.negRed}; }
  .t-neu { color: ${AV.neuAmber}; }
  .t-pos { color: ${AV.posGreen}; }

  /* Legend */
  .legend {
    display: flex; gap: 12pt; font-size: 8pt; font-style: italic;
    color: ${AV.body}; margin: 6pt 0 14pt; align-items: center;
  }
  .leg-sw { width: 16pt; height: 10pt; display: inline-block; margin-right: 3pt; vertical-align: middle; }

  /* Driver deep dives */
  .driver-detail { margin-bottom: 22px; page-break-inside: avoid; }

  /* ===== CATEGORY / NEWS ===== */
  .category-header {
    background: ${AV.darkGreen}; color: #fff; font-weight: bold;
    padding: 8px 14px; font-size: 11pt; text-transform: uppercase;
    letter-spacing: 0.5px; margin: 24px 0 12px;
  }
  .category-overview { font-size: 10.5pt; color: #333; margin-bottom: 16px; }
  .article-block { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
  .article-block:last-child { border-bottom: none; }
  .article-headline {
    font-size: 12pt; font-weight: bold; color: ${AV.darkGreen}; margin-bottom: 6px;
  }
  .article-source { font-weight: normal; font-style: italic; color: ${AV.gray}; font-size: 10pt; }
  .data-points-label { font-weight: bold; color: ${AV.accentGreen}; font-size: 10pt; margin: 8px 0 4px; }
  .source-link { font-size: 9pt; color: ${AV.gray}; margin-top: 6px; }
  .source-link a { color: #0563C1; }

  /* ===== FOOTER ===== */
  .pg-footer-block { margin-top: 40px; text-align: center; }
  .pg-footer-rule { height: 1px; background: ${AV.accentGreen}; margin-bottom: 12px; }
  .pg-footer-text { font-size: 9pt; color: ${AV.gray}; font-style: italic; margin-bottom: 4px; }
  .pg-footer-text a { color: ${AV.lightGreen}; text-decoration: none; }

  /* ===== SCREEN ENHANCEMENTS ===== */

  /* Sticky header */
  .top-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    background: ${AV.darkGreen}; color: #fff; height: 44px;
    display: flex; align-items: center; padding: 0 24px; gap: 12px;
    font-size: 10pt; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transform: translateY(-100%); transition: transform 0.3s ease;
  }
  .top-bar.visible { transform: translateY(0); }
  .top-bar img { height: 22px; object-fit: contain; }
  .top-bar .bar-title { font-weight: 600; letter-spacing: 0.3px; }
  .top-bar .bar-section { margin-left: auto; font-size: 9pt; color: #8fbfa8; }

  /* Sidebar nav */
  .side-nav {
    position: fixed; left: 0; top: 54px; width: 220px; z-index: 900;
    padding: 16px 12px 16px 16px; font-size: 9pt; display: none;
  }
  .side-nav.visible { display: block; }
  .side-nav a {
    display: block; padding: 5px 10px; margin-bottom: 2px;
    color: ${AV.gray}; text-decoration: none; border-left: 2px solid transparent;
    border-radius: 0 3px 3px 0; transition: all 0.2s; line-height: 1.35;
  }
  .side-nav a:hover { color: ${AV.darkGreen}; background: #f0f5f2; }
  .side-nav a.active { color: ${AV.darkGreen}; font-weight: 600; border-left-color: ${AV.darkGreen}; background: #edf5ef; }
  @media (max-width: 1200px) { .side-nav { display: none !important; } }
  @media (min-width: 1201px) {
    .side-nav.visible ~ .page, .side-nav.visible ~ .cover-hero { margin-left: 240px; }
  }

  /* Hero cover */
  .cover-hero {
    position: relative; width: 100%; min-height: 520px;
    display: flex; flex-direction: column; justify-content: flex-end;
    background: linear-gradient(135deg, ${AV.darkGreen} 0%, ${AV.accentGreen} 50%, ${AV.medGreen} 100%);
  }
  .cover-hero::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(22,62,45,0.1) 0%, rgba(22,62,45,0.75) 70%, rgba(22,62,45,0.95) 100%);
  }
  .cover-hero-content {
    position: relative; z-index: 1;
    max-width: 860px; margin: 0 auto; padding: 0 48px 48px; width: 100%;
  }
  .cover-hero h1 { font-size: 38pt; font-weight: 700; color: #fff; line-height: 1.1; margin-bottom: 6px; }
  .cover-hero h2 { font-size: 18pt; font-weight: 400; color: rgba(255,255,255,0.85); margin-bottom: 16px; }
  .cover-hero .hero-meta {
    display: flex; gap: 24px; align-items: center;
    font-size: 10pt; color: rgba(255,255,255,0.7);
    border-top: 1px solid rgba(255,255,255,0.2); padding-top: 14px;
  }
  .cover-hero .hero-meta strong { color: #fff; }
  .cover { display: none; }

  /* Driver cards (screen only) */
  .driver-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .driver-card {
    border: 1px solid ${AV.lightGray}; border-radius: 6px; padding: 14px 16px;
    cursor: pointer; transition: all 0.2s; background: #fff;
  }
  .driver-card:hover { border-color: ${AV.darkGreen}; box-shadow: 0 2px 8px rgba(22,62,45,0.1); }
  .driver-card .dc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .driver-card .dc-name { font-weight: 700; font-size: 10pt; text-transform: uppercase; color: ${AV.darkGreen}; }
  .driver-card .dc-trend { font-size: 8.5pt; font-weight: 700; padding: 2px 10px; border-radius: 12px; }
  .dc-trend.pos { background: ${AV.posBg}; color: ${AV.posGreen}; }
  .dc-trend.neg { background: ${AV.negBg}; color: ${AV.negRed}; }
  .dc-trend.neu { background: ${AV.neuBg}; color: ${AV.neuAmber}; }
  .driver-card .dc-summary { font-size: 9.5pt; color: #555; line-height: 1.4; }
  .driver-card .dc-indicator { font-size: 8pt; color: #888; margin-top: 4px; }

  /* Scroll fade-in */
  .fade-in { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .fade-in.visible { opacity: 1; transform: translateY(0); }

  /* Export button */
  .export-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 1100;
    background: ${AV.darkGreen}; color: #fff; border: none;
    padding: 12px 24px; font-family: Calibri, Inter, Arial, sans-serif;
    font-size: 11pt; font-weight: 600; border-radius: 6px; cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25); transition: all 0.2s;
    display: flex; align-items: center; gap: 8px;
  }
  .export-btn:hover { background: ${AV.accentGreen}; transform: translateY(-1px); }
  .export-btn svg { width: 18px; height: 18px; fill: currentColor; }

  /* ===== PRINT ===== */
  @media print {
    body { background: #fff; font-size: 9.5pt; line-height: 14pt; text-align: justify; }
    .page {
      max-width: none; width: 8.5in; min-height: 11in;
      padding: 40pt 24pt 36pt; margin: 0 auto; background: #fff;
      page-break-after: always; overflow: hidden; border-top: none;
    }
    .page:last-child { page-break-after: auto; }
    .pg-header { font-size: 7.5pt; padding-bottom: 4pt; border-bottom-width: 1.5pt; margin-bottom: 14pt; }
    .pg-header img { height: 18px; }
    h1.section { font-size: 17pt; margin-top: 14pt; margin-bottom: 2pt; }
    .section-rule { height: 2pt; margin-bottom: 8pt; }
    h2.sub { font-size: 10.5pt; margin: 8pt 0 4pt; }
    h3.sub { font-size: 10pt; margin: 6pt 0 3pt; }
    p { margin-bottom: 6pt; }
    ul.bullets li { font-size: 9.5pt; }
    .driver-table { font-size: 8.5pt; }
    .driver-table thead th { padding: 6pt 8pt; font-size: 8.5pt; }
    .driver-table td { padding: 6pt 8pt; }
    .cover { display: flex !important; min-height: 11in; }
    .top-bar, .side-nav, .cover-hero, .driver-cards, .export-btn { display: none !important; }
    .fade-in { opacity: 1 !important; transform: none !important; }
    body { padding-top: 0; }
  }

  /* ===== RESPONSIVE ===== */
  @media screen and (max-width: 900px) {
    .page { padding: 20px 16px 24px; }
    .driver-cards { grid-template-columns: 1fr; }
  }
  @media screen and (max-width: 600px) {
    .page { padding: 12px 8px 16px; }
    .pg-header { font-size: 7pt; flex-wrap: wrap; gap: 4px; }
    .export-btn { font-size: 12px; padding: 8px 14px; }
  }
</style>`;

/* ── JavaScript (embedded) ── */
const SCRIPT = `<script>
(function() {
  // Sticky header bar — show when scrolled past hero
  const topBar = document.getElementById('top-bar');
  const sideNav = document.getElementById('side-nav');
  const hero = document.getElementById('cover-hero');

  const observer = new IntersectionObserver(function(entries) {
    const isHeroVisible = entries[0].isIntersecting;
    topBar.classList.toggle('visible', !isHeroVisible);
    sideNav.classList.toggle('visible', !isHeroVisible);
  }, { threshold: 0 });

  if (hero) observer.observe(hero);

  // Active sidebar link tracking
  const sections = document.querySelectorAll('h1.section, h2.sub');
  const navLinks = document.querySelectorAll('.side-nav a');
  const barSection = document.getElementById('bar-section');

  const sectionObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        if (!id) return;
        navLinks.forEach(function(link) {
          link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
        if (barSection) barSection.textContent = entry.target.textContent;
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach(function(sec) { if (sec.id) sectionObserver.observe(sec); });

  // Fade-in animation
  document.querySelectorAll('.driver-detail, .article-block, .category-section').forEach(function(el) {
    el.classList.add('fade-in');
  });
  const fadeObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(function(el) { fadeObserver.observe(el); });
})();
</script>`;
