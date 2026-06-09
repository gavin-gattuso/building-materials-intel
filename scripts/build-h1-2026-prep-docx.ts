/**
 * Build the H1 2026 Report Prep packet as a brand-styled .docx.
 * Reuses Applied Value formatting primitives from lib/docx-formatting.ts.
 * Run: bun scripts/build-h1-2026-prep-docx.ts
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, VerticalAlign, BorderStyle,
  Header, Footer, PageNumber,
} from "docx";
import {
  DARK_GREEN, ACCENT_GREEN, MEDIUM_GREEN, WHITE, GRAY_TEXT,
  heading, bodyText, bulletPoint, titleBlock, footer,
} from "../lib/docx-formatting";
import { writeFileSync } from "fs";

const FONT = "Arial";

// Verdict badge colors
const VERDICT = {
  hit:     { bg: "E3F5EA", fg: "1F7A4D", label: "HIT" },
  partial: { bg: "FDF3D8", fg: "9A6F08", label: "PARTIAL" },
  miss:    { bg: "FBE6E4", fg: "B3322C", label: "MISS" },
  verify:  { bg: "ECEEED", fg: "5A6B63", label: "VERIFY" },
} as const;
type V = keyof typeof VERDICT;

// ---- small table helpers ------------------------------------------------
function cellText(text: string, opts: { bold?: boolean; color?: string; size?: number; align?: any; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 20, font: FONT, color: opts.color })],
  });
}
function td(text: string, width: number, opts: { bold?: boolean; color?: string; bg?: string; align?: any } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [cellText(text, { bold: opts.bold, color: opts.color, align: opts.align })],
  });
}
function th(text: string, width: number, align: any = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: DARK_GREEN },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [cellText(text, { bold: true, color: WHITE, size: 20, align })],
  });
}
function verdictCell(v: V, width: number) {
  const { bg, fg, label } = VERDICT[v];
  return td(label, width, { bg, color: fg, bold: true, align: AlignmentType.CENTER });
}
function spacer(after = 160) { return new Paragraph({ spacing: { after }, children: [] }); }
function calloutPara(title: string, text: string) {
  return new Paragraph({
    shading: { type: ShadingType.SOLID, color: "E0F4EB" },
    border: { left: { color: ACCENT_GREEN, space: 6, style: BorderStyle.SINGLE, size: 18 } },
    spacing: { before: 120, after: 160 },
    children: [
      new TextRun({ text: `${title}  `, bold: true, size: 22, font: FONT, color: DARK_GREEN }),
      new TextRun({ text, size: 22, font: FONT, italics: true }),
    ],
  });
}
function warnPara(text: string) {
  return new Paragraph({
    shading: { type: ShadingType.SOLID, color: "FDF3D8" },
    border: { left: { color: "B5820A", space: 6, style: BorderStyle.SINGLE, size: 18 } },
    spacing: { before: 100, after: 160 },
    children: [new TextRun({ text: `⚠  ${text}`, size: 21, font: FONT, color: "7A5A07" })],
  });
}

// Full-width DXA for our page (8.5in - margins ~ 9000 dxa usable)
const W = 9000;

const children: any[] = [
  ...titleBlock(
    "BUILDING MATERIALS & PRODUCTS",
    "H1 2026 Report Prep — Postmortem & Planning Packet",
    "Mid-Year 2026  |  Due week of June 22–26",
  ),

  // ---------- Overview ----------
  heading("Overview", 1),
  bodyText("Working packet for the mid-year 2026 (H1 2026) Market Health Report, framed as a postmortem on the 2025 YTD report (published Nov 2025). Authors: Jacob Wozniewski, Gavin Gattuso."),
  calloutPara("The one-line story:",
    "Our directional calls were mostly right — residential weak, tariffs a real cost threat, infra resilient, M&A active — but the last report missed the two storylines that came to define H1 2026: the data-center / AI-infrastructure construction boom, and the scale of the M&A wave capped by Berkshire's $8.5B bet on homebuilding. And our base case of \"easing takes hold → residential recovers into 2026\" did not arrive on schedule; rates stayed higher and more volatile."),
  bodyText("All H1 2026 evidence is drawn from the live knowledge base (Supabase articles, 687 articles Jan–Jun 2026). Figures sourced inline; verify the ⚠ items before publication."),
];

// ---------- 01 Prediction Scorecard ----------
children.push(heading("01 · Prediction Scorecard", 1));
children.push(bodyText("Every forward call from the 2025 YTD report scored against H1 2026 actuals — the backbone of the new Postmortem section. Tally: 5 hit · 2 partial · 1 miss · 1 to verify."));

const scoreRows: Array<[string, string, V, string]> = [
  ["Rates ease → residential recovers (easing \"takes hold,\" mortgage toward 6.2–6.35%).",
   "Mortgage rates \"higher and volatile\" (CNBC, Jun 1); new-home sales slumped in April; recovery did not arrive on schedule.",
   "miss", "Drop the \"easing → recovery\" base case. Reframe 2026 as a delayed, rate-gated recovery."],
  ["Single-family demand muted into 2026.",
   "SF starts −2.8% in April → 1.47M SAAR (NAHB/Census); $440K affordability barrier. But March +10.8%, \"fastest pace in 2 years\" — choppy.",
   "partial", "\"Muted\" was right; the timing of any turn was the hard part. Lead with the chop."],
  ["Tariffs the renewed cost threat — +$7,500–$10,000/home (metals 20–25%, lumber 35%).",
   "Realized: construction PPI +3.6% YoY (largest since Jan '23); aluminum +28% YoY (50% tariff); 53% of contractors cite cost a top concern. Then mid-year partial reversal (Jun 4).",
   "hit", "Best call. Keep front-and-center; now track the escalation → reversal whipsaw."],
  ["Nonres resilient on IIJA/CHIPS/IRA.",
   "Nonres held — but the driver shifted to the data-center / AI-infrastructure boom (Modine $4B, Trane, JCI 1GW, Sterling), not federal programs.",
   "partial", "Biggest blind spot. Add a dedicated data-center thread — and a sales hook."],
  ["Labor stays binding; watch wage moderation.",
   "Labor still a starts constraint (NAHB); ISM Services employment contracting — early loosening.",
   "hit", "Keep; note \"still tight, first cracks appearing.\""],
  ["Credit stays restrictive for small/spec; large caps still access capital.",
   "Held: CEMEX raised $3B revolver + $1.5B notes; consumer-credit stress (LendingTree −22%).",
   "hit", "Low-change lever — compress/refresh."],
  ["GDP–sentiment gap persists; weak confidence caps discretionary demand.",
   "Persisted — affordability still dragging sentiment and adjacent sectors.",
   "hit", "Keep; refresh figures only."],
  ["M&A / portfolio activity continues (+24% YoY deal size).",
   "Accelerated — 2025 volume +30%; H1 wave: QXO/TopBuild $17B, HD/GMS $5.5B, Lowe's/FBM, Berkshire/Taylor Morrison $8.5B.",
   "hit", "Promote M&A to a named section + callout box."],
  ["ABI watchpoint: possible reversal of 16-month decline; backlog moderation early 2026.",
   "Not yet confirmed in KB set.",
   "verify", "Pull current ABI before publication."],
];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Predicted (Nov 2025)", 2500), th("Actual (H1 2026)", 3300),
      th("Verdict", 1100, AlignmentType.CENTER), th("Implication", 2100),
    ]}),
    ...scoreRows.map(([p, a, v, i]) => new TableRow({ children: [
      td(p, 2500), td(a, 3300), verdictCell(v, 1100), td(i, 2100),
    ]})),
  ],
}));
children.push(spacer());
children.push(calloutPara("Honest headline for readers:",
  "\"We got the direction right on cost, labor, and consolidation. We were early on the residential recovery, and we under-weighted the single biggest demand surprise of the half — data centers.\""));

// ---------- 02 M&A Digest ----------
children.push(heading("02 · M&A & Strategic-Deal Digest", 1));
children.push(bodyText("For the report's M&A callout box / \"Consolidation Wave\" section. The half's defining corporate story: broad consolidation across distribution, cement/aggregates, and HVAC, capped by Berkshire's vote of confidence in homebuilding."));

children.push(heading("The headline: Berkshire's housing bet", 2));
children.push(bulletPoint("Berkshire Hathaway → Taylor Morrison, ~$8.5B (announced May 31). All-cash, $72.50/share, ~$6.8B equity / $8.5B enterprise value, a 24% premium to the May 29 close. 350+ communities across 21 markets in 12 states."));
children.push(bulletPoint("Why it matters (sales angle): a conservative, long-horizon institution making a direct premium bet on U.S. homebuilding at a cyclical low. CNBC: the deal \"suggests the housing market may have bottomed.\" The report's signature \"smart money sees a bottom\" anchor. [CNBC Jun 1; ENR Jun 3]"));

children.push(heading("Distribution mega-consolidation (the structural story)", 2));
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Acquirer", 1800), th("Target", 1800), th("Value", 1200), th("Date", 1200), th("Note", 3000),
    ]}),
    ...([
      ["QXO", "TopBuild", "$17B", "Apr 19", "Brad Jacobs' roll-up goes mega-cap; insulation/installation."],
      ["Home Depot (SRS)", "GMS", "$5.5B", "Mar 1 (closed)", "Pro-market / specialty distribution transformation."],
      ["Lowe's", "FBM", "—", "Mar 25", "Lowe's pushes into pro distribution (vs. HD/GMS)."],
      ["QXO", "Kodiak Building Partners", "$2.25B", "Apr 1 (closed)", "Plus $1.8B raise + Apollo-led $1.2B for the deal war chest."],
    ] as string[][]).map(r => new TableRow({ children: [
      td(r[0], 1800, { bold: true }), td(r[1], 1800), td(r[2], 1200, { color: DARK_GREEN, bold: true }), td(r[3], 1200), td(r[4], 3000),
    ]})),
  ],
}));
children.push(spacer(120));
children.push(calloutPara("Why it matters:",
  "Building-products distribution is consolidating into a handful of national pros (QXO, HD/SRS, Lowe's). Procurement leverage, pricing power, and supplier relationships are all shifting — a direct strategic question for every manufacturer client."));

children.push(heading("Cement, aggregates & materials", 2));
[
  "Holcim — completed $1.5B Cementos Pacasmayo stake (Mar 31); plan for 15 acquisitions in 2026; primary buyer of CEMEX Colombia ($555M).",
  "CEMEX — divested Colombia ($555M) & Panama (~$200M); U.S. aggregates pivot.",
  "Martin Marietta — Quikrete asset exchange: divested cement, +20M tons aggregates (Feb 23).",
  "Heidelberg Materials — AUD 1.7B Maas Group, Australia (Feb 5).",
  "Vulcan Materials — signaled active 2026 M&A year (Feb 17). Taiheiyo/CalPortland — Tokuyama (JPY 37B); Vulcan ready-mix deal delayed on DOJ scrutiny.",
].forEach(t => children.push(bulletPoint(t)));

children.push(heading("HVAC / data-center thermal (ties into the data-center thread)", 2));
children.push(bulletPoint("Trane — completed LiquidStack (liquid cooling, Mar 3). Johnson Controls — Alloy Enterprises; guiding 1GW data-center thermal. Modine — $4B capacity deal through 2029. Kingspan — Brazil's Multiway (Jan 29)."));

children.push(heading("Other strategic moves & market context", 2));
[
  "ASSA ABLOY (Sennco), Saint-Gobain (Grouttech), Wienerberger (Italcer), Weyerhaeuser ($459M timberland / $410M+ divestitures).",
  "Warren Buffett / Berkshire — Nucor stake amid tariff uncertainty (Feb 14). Second Berkshire building-materials signal — pairs with Taylor Morrison.",
  "Context: building-products M&A \"poised for growth in 2026\" on +30% 2025 deal volume (BGL). Corroborated by Capstone, PwC, FMI outlooks.",
].forEach(t => children.push(bulletPoint(t)));
children.push(calloutPara("Suggested callout-box framing (sales hook):",
  "Consolidation is rewriting the competitive map — in distribution especially. When a buyer like Berkshire pays a 24% premium for a homebuilder at a cyclical low, and three national pros race to roll up distribution, the questions for our clients are immediate: Where does this leave your procurement leverage? Your channel access? Your own buy-vs-build calculus? Applied Value has supported [X] integrations and portfolio reviews in this sector."));
children.push(warnPara("Verify before publication: close vs. announce status on QXO/TopBuild, Lowe's/FBM, and Berkshire/Taylor Morrison (announced May 31, may still be pending)."));

// ---------- 03 Lever-by-Lever Delta ----------
children.push(heading("03 · Lever-by-Lever Delta", 1));
children.push(bodyText("Each of the 7 drivers: what the last report said → what the KB recorded → refresh vs. net-new call. Answers the kickoff's \"did the big levers change?\""));
const leverRows: Array<[string, string, string, V, string]> = [
  ["1. Rates", "Easing → 2026 residential recovery.", "\"Higher and volatile\"; recovery didn't arrive; new-home sales slumped.", "miss", "Net-new — rewrite around volatility & delayed recovery."],
  ["2. Labor", "Shortages + wage inflation; watch moderation.", "Still a constraint; ISM employment contracting (first loosening).", "hit", "Refresh + add \"first cracks.\""],
  ["3. Material Costs", "Stable but tariffs a renewed threat.", "Tariffs realized — PPI +3.6%, aluminum +28%; then mid-year reversal.", "hit", "Net-new (lead) — track the whipsaw."],
  ["4. Demand", "Residential muted; nonres solid on backlogs.", "Residential choppy; nonres engine = data centers, not federal programs.", "partial", "Net-new — split residential / data-center nonres."],
  ["5. Infrastructure", "Positive on IIJA/CHIPS/IRA durability.", "Federal floor intact, but private data-center capex eclipsed it.", "hit", "Refresh + reframe (floor vs. growth engine)."],
  ["6. Credit", "Restrictive; large caps still access capital.", "Held — CEMEX raised freely; consumer-credit stress.", "hit", "Refresh (compress — lowest change)."],
  ["7. GDP / Sentiment", "GDP–sentiment gap; weak confidence.", "Divergence persisted; affordability dragging.", "hit", "Refresh figures; keep analysis box."],
];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Lever", 1400), th("Said (Nov 2025)", 2200), th("Actual (H1 2026)", 2700),
      th("Verdict", 900, AlignmentType.CENTER), th("Editing call", 1800),
    ]}),
    ...leverRows.map(([l, s, a, v, c]) => new TableRow({ children: [
      td(l, 1400, { bold: true, bg: MEDIUM_GREEN, color: WHITE }), td(s, 2200), td(a, 2700), verdictCell(v, 900), td(c, 1800),
    ]})),
  ],
}));
children.push(spacer());
children.push(calloutPara("Refresh vs. net-new (workflow guidance):",
  "Net-new effort concentrates on 3 levers — Rates, Material Costs, Demand. The other 4 are refreshes. The tool's \"refresh vs. net-new\" workflow should prioritize regenerating those three."));
children.push(warnPara("Verify before publication: current Fed funds + 30-yr mortgage; latest PPI/lumber/steel/aluminum + tariff-reversal status; latest starts/permits + current ABI; latest GDP print + U-Mich sentiment."));

// ---------- 04 Report Outline ----------
children.push(heading("04 · H1 2026 Report Outline", 1));
children.push(bodyText("Keeps the proven 9-section skeleton; bold = changed/new. Tagged KEEP / REFRESH / NET-NEW."));
const outlineRows: string[][] = [
  ["1", "Introduction & Executive Summary", "REFRESH", "New lead framing: report-card teaser + new themes (data centers, consolidation, tariff whipsaw)."],
  ["2", "Market Scope", "KEEP", "Refresh market-sizing figures. Low effort."],
  ["3", "Market Context & Outlook", "REFRESH", "\"H1 2026 Summary\" + forward outlook for H2 2026 carrying the postmortem lessons."],
  ["4", "Drivers of Market Health", "REFRESH + NET-NEW", "Net-new: Rates, Costs, Demand. Refresh: Labor, Infra, Credit, GDP."],
  ["5", "NEW: Data-Center & AI-Infrastructure Demand", "NET-NEW", "The half's biggest demand surprise + top sales hook. May be a sub-section of Demand."],
  ["6", "NEW: Consolidation Wave (M&A)", "NET-NEW", "Promote to named section + callout box. Content ready in Digest 02."],
  ["7", "Public Company Performance Snapshot", "REFRESH", "Update H1 2026 charts. ⚠ Cap IQ wiring pending — resolve or footnote the period."],
  ["8", "Postmortem / Trend Continuity", "NET-NEW", "Marquee change: promote to the full scorecard table from 01. Makes the report interactive for repeat readers."],
  ["9", "How Applied Value Can Help", "REFRESH + CASES", "Add mini case-study callouts. ⚠ Owner input: real AV engagement examples."],
  ["—", "Appendix", "KEEP", "AV quarter-in-review + update report-roster/contacts."],
];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("#", 500, AlignmentType.CENTER), th("Section", 3100), th("Status", 1800, AlignmentType.CENTER), th("What changes this edition", 3600),
    ]}),
    ...outlineRows.map(r => new TableRow({ children: [
      td(r[0], 500, { align: AlignmentType.CENTER, bold: true }), td(r[1], 3100, { bold: r[1].startsWith("NEW") }),
      td(r[2], 1800, { align: AlignmentType.CENTER, bold: true, color: ACCENT_GREEN }), td(r[3], 3600),
    ]})),
  ],
}));
children.push(spacer());
children.push(heading("Build order (2-week runway)", 2));
[
  "This week — block-text draft (don't wait on the tool): Postmortem (§8) + M&A (§6) first, then the 3 net-new driver writeups (§4).",
  "Parallel — tool/data: resolve §7 financial-data dependency; pull the ⚠ verification figures.",
  "Owner inputs early: AV case-study examples (§9); structure sign-off (9 sections + 2 new).",
  "Late: Market Scope / Exec Summary refresh, charts, formatting pass.",
].forEach(t => children.push(bulletPoint(t)));
children.push(calloutPara("Open decisions for you + Jacob:",
  "§5 Data Centers — standalone section vs. sub-section of Demand? · §7 — wire Cap IQ now, or footnote the period and ship? · Author line — include Alex Schneider again?"));

children.push(...footer());

// ---------- assemble ----------
const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1100, right: 1000, bottom: 1100, left: 1000 }, pageNumbers: { start: 1 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [
      new TextRun({ text: "Applied Value — Building Materials & Products · H1 2026 Report Prep", size: 16, font: FONT, color: GRAY_TEXT }),
    ]})]})},
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: GRAY_TEXT }),
    ]})]})},
    children,
  }],
});

const out = "knowledge-base/outputs/h1-2026-prep/H1_2026_Report_Prep.docx";
const buf = Buffer.from(await Packer.toBuffer(doc));
writeFileSync(out, buf);
console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
