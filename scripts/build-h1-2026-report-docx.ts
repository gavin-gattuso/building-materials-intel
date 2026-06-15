/**
 * Build the H1 2026 Market Health Report (draft) as a brand-styled .docx.
 * Mirrors the voice-edited manuscript (06-report-manuscript-h1-2026.md) and the
 * rendered PDF: standalone Data-Center (§5) and M&A (§6) sections, real AV case studies.
 * Reuses Applied Value formatting primitives from lib/docx-formatting.ts.
 * Run: bun scripts/build-h1-2026-report-docx.ts
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, VerticalAlign, BorderStyle,
  Header, Footer, PageNumber,
} from "docx";
import {
  DARK_GREEN, ACCENT_GREEN, MEDIUM_GREEN, WHITE, GRAY_TEXT,
  heading, bodyText, bulletPoint, titleBlock, footer,
  trendTableHeader, trendRow, impactParagraph,
} from "../lib/docx-formatting";
import { writeFileSync } from "fs";

const FONT = "Arial";
const W = 9000;

const VERDICT = {
  hit:     { bg: "E3F5EA", fg: "1F7A4D", label: "HIT" },
  partial: { bg: "FDF3D8", fg: "9A6F08", label: "PARTIAL" },
  miss:    { bg: "FBE6E4", fg: "B3322C", label: "MISS" },
} as const;
type V = keyof typeof VERDICT;

function cellText(text: string, opts: { bold?: boolean; color?: string; align?: any; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: 30, after: 30 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: 20, font: FONT, color: opts.color })],
  });
}
function td(text: string, width: number, opts: { bold?: boolean; color?: string; bg?: string; align?: any } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [cellText(text, opts)],
  });
}
function th(text: string, width: number, align: any = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: DARK_GREEN },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [cellText(text, { bold: true, color: WHITE, align })],
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
/** real case-study callout: green-tinted, header in accent green, plain body + grey source note */
function caseStudy(header: string, text: string, note: string) {
  return new Paragraph({
    shading: { type: ShadingType.SOLID, color: "E0F4EB" },
    border: { left: { color: ACCENT_GREEN, space: 6, style: BorderStyle.SINGLE, size: 18 } },
    spacing: { before: 100, after: 160 },
    children: [
      new TextRun({ text: `Applied Value in action — ${header}.  `, bold: true, size: 21, font: FONT, color: ACCENT_GREEN }),
      new TextRun({ text, size: 21, font: FONT }),
      new TextRun({ text: `  (${note})`, size: 18, font: FONT, italics: true, color: GRAY_TEXT }),
    ],
  });
}
/** body paragraph with an inline bold lead-in */
function leadBody(lead: string, rest: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: lead, bold: true, size: 24, font: FONT }),
      new TextRun({ text: rest, size: 24, font: FONT }),
    ],
  });
}

const children: any[] = [
  ...titleBlock(
    "BUILDING MATERIALS & PRODUCTS",
    "Market Health Report — H1 2026",
    "Mid-Year 2026  |  DRAFT for review",
  ),

  // ===== 1. Introduction & Executive Summary =====
  heading("1 · Introduction & Executive Summary", 1),
  bodyText("Six months ago, our 2025 year-end report made four central calls: residential construction would stay muted until interest rates eased, tariffs were the cost threat to watch, federal infrastructure programs would keep nonresidential demand resilient, and merger activity would stay hot. Three of the four held. The exceptions are as instructive as the hits, and they shape how the businesses we advise should read the rest of 2026."),
  bodyText("What held: tariffs became the defining cost story of the half and arrived harder than we forecast. Consolidation accelerated, capped by Berkshire Hathaway's $8.5 billion bet on a homebuilder. Labor stayed tight, credit stayed restrictive, and the gap between headline GDP and how the economy feels persisted. We got two things wrong. The rate-driven housing recovery we expected in 2026 did not arrive on time, and we under-weighted the biggest demand story of the half: the AI-driven data-center construction boom."),
  leadBody("Performance & Outlook.  ", "H1 2026 split in two. Rate-sensitive residential stayed weak and choppy: a strong March (housing starts +10.8%) gave way to an April pullback and a softer-than-expected May. Nonresidential held up, but on a different engine: private digital infrastructure rather than the federal IIJA/CHIPS/IRA programs we emphasized last edition. Data-center construction pulled demand through HVAC, electrical, steel, concrete, and coatings. Material costs rose sharply on Section 232 tariffs through the spring, then partly reversed in June, leaving cost planning tied to policy more than to price trend."),
  heading("Key Risks for H2 2026", 2),
  bulletPoint("A rate-gated recovery that keeps slipping. Mortgage rates stayed in the low-6% range but volatile, and the easing-into-recovery path did not arrive on schedule. Don't forecast demand off the timing of Fed cuts."),
  bulletPoint("Tariff and policy whipsaw. Section 232 rates rose through the spring, then partly reversed in June. The cost line now moves with policy in both directions, and that uncertainty is itself the planning risk."),
  bulletPoint("Demand concentration in data centers. The tailwind is real, but it is gated by power, grid, and permitting; only ~5 of the ~16 GW of planned 2026 U.S. capacity is on track to energize this year, tying much of the sector's growth to one capital- and power-intensive source."),
  bulletPoint("An affordability ceiling. A ~$440K median price and soft confidence cap any residential rebound, even if rates ease."),
  leadBody("Success Factors.  ", "The firms that outperform will do four things well: control cost and tariff exposure, hold pricing, build exposure to data-center demand (directly or through pull-through), and keep the balance-sheet strength to act in a consolidating market and integrate what they buy."),

  // ===== 2. Market Scope =====
  heading("2 · Market Scope", 1),
  bodyText("This report covers the global and U.S. building materials and building products value chain — aggregates and cement, glass and insulation, wood and lumber, steel and metals, building products and distribution, openings and security, plumbing and fixtures, HVAC and climate, and the big-box retail channel — tracked across the 39 public companies in our coverage universe."),
  bodyText("The global construction market these companies serve is on track for roughly $17.3 trillion in 2026, up from $16.5 trillion in 2025, with Asia-Pacific the largest region. The U.S. is the second-largest market: construction spending ran at a $2.17 trillion seasonally adjusted annual rate in April 2026, up 0.9% year-over-year (U.S. Census Bureau), with residential near $910 billion and nonresidential near $730 billion. The growth is modest and mostly price rather than volume, and the split inside the total is the real story — nonresidential held up on private data-center capital spending rather than the federal programs we emphasized last edition, while residential stayed weak under affordability and financing pressure."),

  // ===== 3. Market Context & Outlook =====
  heading("3 · Market Context & Outlook", 1),
  leadBody("The H1 2026 backdrop.  ", "The macroeconomy softened rather than firmed. Fourth-quarter 2025 GDP growth was revised down sharply to 0.7% from a 1.4% advance estimate, and the Atlanta Fed's GDPNow model tracked Q1 2026 down to roughly 1.6%, a steady decline from an initial 3.1% reading in February. Recession-probability estimates spanned 20–42%. Consumer confidence cratered to a 12-year low of 84.5 in January before clawing back to 91.8 by March: better, but well short of pre-cycle norms. Against that backdrop, demand split between weak rate-sensitive residential and resilient, digitally-driven nonresidential."),
  leadBody("Outlook for H2 2026.  ", "Three lessons from this half carry forward. First, the residential recovery is delayed and gated by rates — still coming, just later — and we will not tie its timing to Fed-cut expectations again after doing so last time at a cost. Second, tariffs remain the swing factor on cost, but the issue now is policy volatility, so plan for moves both ways. Third, data centers are the most reliable source of demand into the back half, and consolidation will keep shifting procurement leverage and channel access for every manufacturer."),

  // ===== 4. Drivers of Market Health =====
  heading("4 · Drivers of Market Health", 1),
  bodyText("Seven drivers, ranked by their influence on the sector this half. Three changed enough to rewrite; four are updates to a still-valid story."),
];

// Driver summary table (AV PDF layout)
children.push(new Table({
  width: { size: 8400, type: WidthType.DXA },
  rows: [
    trendTableHeader(),
    trendRow("Interest & Mortgage Rates", "Fed held at 3.50–3.75%; 30-yr fixed volatile in the low-6s (6.46% to 6.20% to 6.36%); recovery slipped.", "Negative"),
    trendRow("Material & Energy Costs", "Section 232 at 50%; PPI +4.0% YoY; nonres inputs +12.6% annualized; steel >$1,000/ton; June reversal.", "Negative"),
    trendRow("Demand Visibility", "Residential choppy, resolving down; nonres carried by data centers. ABI bottomed below 50 (48.5 to 43.8 to 49.4).", "Mixed"),
    trendRow("Government Infrastructure", "$430B+ federal floor intact, but private data-center capex eclipsed it as the marginal driver.", "Positive"),
    trendRow("Labor", "Still a binding constraint on starts; ISM Services employment contracting, the first loosening signal.", "Negative"),
    trendRow("Credit Availability", "Restrictive for small/spec; large caps raised freely (CEMEX $3B revolver + $1.5B notes).", "Negative"),
    trendRow("GDP & Consumer Confidence", "Gap persisted; GDP softening toward weak sentiment (Q4'25 0.7%; confidence 84.5 to 91.8).", "Negative"),
  ],
}));
children.push(spacer(200));

children.push(heading("Interest & Mortgage Rates", 2));
children.push(bodyText("The Federal Reserve held the federal funds target at 3.50–3.75% through the spring, and the 30-year fixed mortgage stayed in the low-6% range but volatile: it climbed for five straight weeks to 6.46% in early April, fell to 6.20% within days, then edged back to 6.36%. Our last base case — easing “takes hold,” mortgage toward 6.2–6.35%, residential recovering in 2026 — did not play out on schedule, and new-home sales slumped in April."));
children.push(impactParagraph("Implication", "Reframe the rate outlook around volatility and a delayed, rate-gated recovery, and stop forecasting demand off the timing of Fed cuts."));

children.push(heading("Material & Energy Costs", 2));
children.push(bodyText("This was our strongest call last edition, and we understated how far it would go. Effective April 2–6, Section 232 tariffs reached 50% on steel, aluminum, and copper (derivatives 25%, softwood lumber 10%). Producer prices for final demand rose 4.0% year over year in March (the largest since February 2023), and nonresidential construction inputs surged at a 12.6% annualized rate, the fastest since early 2022. Hot-rolled coil steel breached $1,000/ton, up roughly 23% from its January low, as the import share fell from about 25% to 14%. Brookings estimated the tariffs add roughly $17,500 per new home, well above our prior $7,500–$10,000 range. A partial reversal in June (“Trump tariff cuts,” USMCA steel-relief talks) then followed. Lumber, by contrast, fell to a 17-month low near $508 amid soft residential demand."));
children.push(impactParagraph("Implication", "Costs are now the headline lever, and the bigger risk is the volatility of policy itself, more than the price level."));
children.push(caseStudy("steel cost & commodity-volatility mitigation", "For a manufacturer facing elevated commodity volatility, AV assessed steel-sourcing maturity against best-in-class and benchmarked spend across its network of 27+ mill and service-center relationships, then quantified a roadmap: $79–114/ST in steel-cost reduction by consolidating flat steel onto a directed-buy program, a further $20–40/ST by reshaping the sourcing footprint, and up to ±$26M in gross-margin-variance reduction through indexation.", "real AV engagement, anonymized"));

children.push(heading("Demand Visibility", 2));
children.push(bodyText("Residential was choppy and ultimately soft: March starts surged 10.8%, single-family starts then fell 2.8% in April to a 1.47M SAAR (single-family down 9.0% to 930K as multifamily rose to 529K), and both starts and permits dropped more than expected in May. Affordability remained the ceiling, with a ~$440K median price. Nonresidential held, but the driver was the data-center / AI-infrastructure boom rather than the federal programs we emphasized. The Architecture Billings Index stabilized but did not reverse, reading 48.5 in December, 43.8 in January, and 49.4 in February, bottoming below the 50 growth line rather than recovering through it."));
children.push(impactParagraph("Implication", "Report residential as rate-gated chop, and break data-center-led nonresidential out as its own thread (§5)."));

children.push(heading("Government Infrastructure Spending", 2));
children.push(bodyText("The $430B+ committed under IIJA, CHIPS, and the IRA remains a durable multi-year floor for aggregates, cement, and steel demand. But private data-center capital expenditure eclipsed it as the marginal driver of nonresidential demand this half."));
children.push(impactParagraph("Implication", "Federal programs are the floor; data centers are the growth engine (cross-reference §5)."));

children.push(heading("Labor", 2));
children.push(bodyText("Labor remained a binding constraint on housing starts per NAHB, and workforce-development initiatives continued across the sector. But ISM Services employment turned to contraction, the first genuine loosening signal and the wage-moderation watchpoint we flagged in November."));
children.push(impactParagraph("Implication", "Still tight, but the first cracks are appearing."));

children.push(heading("Credit Availability & Lending", 2));
children.push(bodyText("Credit stayed restrictive for small and speculative borrowers while large, well-capitalized players raised freely; CEMEX alone secured a $3B sustainability-linked revolver and $1.5B in notes. Consumer-credit stress was visible (LendingTree revenue −22%)."));
children.push(impactParagraph("Implication", "The lowest-change lever; a short refresh."));

children.push(heading("GDP & Consumer Confidence", 2));
children.push(bodyText("The divergence we flagged held, but GDP is now slowing toward weak sentiment rather than the gap closing upward (Q4'25 revised to 0.7%, GDPNow Q1'26 ~1.6%, confidence 84.5 to 91.8). Affordability continued to drag demand and adjacent sectors such as freight."));
children.push(impactParagraph("Implication", "Keep the “why GDP strength isn't felt on the ground” analysis; refresh the figures."));

// ===== 5. Data Centers =====
children.push(heading("5 · Data-Center & AI-Infrastructure Demand", 1));
children.push(bodyText("The biggest demand surprise of the half was the construction wave driven by AI data centers. We under-weighted it last edition. This half it became the dominant driver of nonresidential demand and pulled through nearly every tracked segment."));
children.push(bodyText("In thermal management and HVAC, Modine signed a landmark $4 billion long-term capacity agreement through 2029; Trane completed its acquisition of liquid-cooling specialist LiquidStack; Johnson Controls guided to roughly 1GW of data-center thermal demand and launched a 3.5MW-class YORK unit; Carrier introduced its AquaEdge chiller; and AAON cited a $1 billion data-center opportunity. In construction and engineering, Sterling Infrastructure emerged as a pure-play data-center builder. In envelope, coatings, and finishes, Sherwin-Williams positioned itself as the single coatings partner for data-center construction, USG formed an alliance with Subzero Engineering, and Kingspan expanded internationally. The pipeline is global and deep, from West Texas and DFW to the Nordics and APAC."));
children.push(bodyText("Demand is not the constraint; deliverable capacity is. Global hyperscaler capex is set to top $700 billion in 2026, and the Americas pipeline reached 25.3 GW under construction at the end of 2025, 89% of it pre-committed. Yet of the ~16 GW of U.S. capacity planned for 2026, only about 5 GW is on track to energize this year. Power is now the top build constraint: high-voltage transformers run roughly four years out, grid-interconnection queues stretch five to seven years against 12-18-month build times, and behind-the-meter generation has become standard rather than a hedge. Permitting and labor gate the rest: $156 billion of projects were blocked or delayed by local opposition in 2025 (Texas SB 6, Virginia HB 507, and moratoriums from Ohio to Maine), and contractor backlogs have tripled to roughly ten months amid a ~440K-worker shortage led by electricians. On cooling, a $15 billion-plus M&A wave (Eaton-Boyd, Trane-LiquidStack, Ecolab-CoolIT) is finally adding capacity as liquid-cooling adoption climbs from 22% to about 40%. These figures track Applied Value's H1 2026 US Data Center Supply Chain Report, which maps the constraint layer by layer."));
children.push(calloutPara("For our clients:", "data-center demand is the cleanest growth opportunity in the sector, but it is gated by power, grid, permitting, and labor, not by capital. The pull-through into HVAC, electrical, structural, and finishing products is real; its timing depends on what can actually get energized. The winners are tied to the unlocking layers (power and electrical equipment, prefabrication, and cooling) and can plan around multi-year power and permitting timelines. It remains a concentrated bet on one capital- and power-intensive source."));
children.push(caseStudy("capturing a new growth segment", "For a building-products manufacturer targeting a new, higher-value end-user segment, AV built a go-to-market strategy segment-by-segment: mapping the buying center, criteria, and process; defining the sales-rep profile and value-added support model; and producing a sized market-opportunity assessment and roll-out plan. The same playbook applies directly to capturing data-center demand: identify the highest-value programs, then build the commercial readiness to win them.", "real AV engagement, anonymized"));

// ===== 6. M&A =====
children.push(heading("6 · The Consolidation Wave (M&A)", 1));
children.push(bodyText("The corporate story of the half was consolidation: broad, cross-segment, and capped by Berkshire's vote of confidence in American housing. We called continued M&A last edition; it accelerated, with 2025 deal volume up 30%, and now warrants its own section."));
children.push(heading("The headline: Berkshire's housing bet", 2));
children.push(bodyText("On May 31, Berkshire Hathaway agreed to acquire homebuilder Taylor Morrison for about $8.5 billion enterprise value (all-cash at $72.50 per share, a roughly 24% premium), for a builder operating 350+ communities across 21 markets in 12 states. What matters is less the price than the buyer. Berkshire is conservative and long-horizon, and it paid a premium for a homebuilder at the bottom of the cycle. CNBC read it as a signal the housing market “may have bottomed.” With its earlier Nucor stake, Berkshire is making a large, deliberate bet on U.S. construction despite soft starts data."));
children.push(heading("Distribution mega-consolidation — the structural story", 2));
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Acquirer", 1900), th("Target", 1900), th("Value", 1200), th("Date", 1200), th("Note", 2800),
    ]}),
    ...([
      ["QXO", "TopBuild", "$17B", "Apr 19", "Brad Jacobs' roll-up goes mega-cap; insulation/installation."],
      ["Home Depot (SRS)", "GMS", "$5.5B", "Mar 1 (closed)", "Pro-market / specialty distribution transformation."],
      ["Lowe's", "FBM", "—", "Mar 25", "Lowe's pushes into pro distribution (vs. HD/GMS)."],
      ["QXO", "Kodiak Building Partners", "$2.25B", "Apr 1 (closed)", "Plus a $1.8B raise + Apollo-led $1.2B for the deal war chest."],
    ] as string[][]).map(r => new TableRow({ children: [
      td(r[0], 1900, { bold: true }), td(r[1], 1900), td(r[2], 1200, { color: DARK_GREEN, bold: true }), td(r[3], 1200), td(r[4], 2800),
    ]})),
  ],
}));
children.push(spacer(120));
children.push(bodyText("Building-products distribution is consolidating into a handful of national players: QXO, Home Depot/SRS, and Lowe's. That shifts procurement leverage, pricing power, and channel access for every manufacturer. Materials and HVAC consolidated in parallel: Holcim's 15-deal 2026 plan and $1.5B Cementos Pacasmayo stake; Martin Marietta's Quikrete asset exchange; Heidelberg's AUD 1.7B Maas Group deal; and the data-center-linked HVAC deals (Trane/LiquidStack, JCI/Alloy). Private equity is expected to turn into an active seller, which should sustain deal flow into 2027."));
children.push(caseStudy("procurement leverage at a major building-materials producer", "For Heidelberg Materials, one of the world's largest building-materials companies, AV ran a structured RFP across its North American cement outbound-truck network (28 plants and terminals, 250+ carriers, ~$150.9M addressable spend), consolidating the carrier base and standardizing contracts and fuel schedules. Early workstreams delivered $2.8M (12%) in freight savings and recovered ~$700K/month via 50 newly identified haulers, with ~$7.5M (5%) targeted across the full network, while cutting RFP cycle time by four months.", "confirm client-disclosure permission before naming"));
children.push(caseStudy("post-deal value creation", "For a private-equity-owned industrial business, AV led commercial supplier negotiations to drive post-deal value: harmonizing competing quotes onto a like-for-like basis, building fact-based negotiation materials, and running multiple rounds, resulting in a >20% reduction in prices.", "real AV engagement, anonymized"));
children.push(calloutPara("Sales hook:", "Consolidation is rewriting the competitive map, especially in distribution. When a buyer like Berkshire pays a 24% premium for a homebuilder at a cyclical low and three national players race to roll up distribution, the questions for our clients are immediate: where does this leave your procurement leverage, your channel access, and your own buy-versus-build calculus?"));

// ===== 7. Performance Snapshot =====
children.push(heading("7 · Public Company Performance Snapshot", 1));
children.push(bodyText("Across the 39-company universe, FY 2025 actuals (the most recent complete period in our data) already pointed to the H1 2026 split: segments tied to this half's tailwinds led, and residential-exposed segments lagged."));
children.push(bodyText("Steel posted the strongest revenue growth (+8.1% average; Steel Dynamics +14.0%, Nucor +8.6%) as Section 232 tariffs lifted domestic pricing. Cement & aggregates paired solid growth (+3.4%) with the richest margins (23.3% average EBITDA, up 1.7 points YoY; Martin Marietta 34.3%, Vulcan 29.1%). HVAC-R grew +3.6% with expanding margins on data-center pull-through (Daikin +7.9%, Johnson Controls +6.8%, Trane +5.6%), and Retail & Distribution held steady (+3.2%) on repair-and-remodel resilience. Lumber & wood was the clear laggard (−11.1% revenue, EBITDA margin down 4.9 points to 4.4%; West Fraser −17.1%, Interfor −19.5%), with residential-exposed distribution (Builders FirstSource −12.1%) and doors & windows (JELD-WEN −10.5%) reflecting the same housing weakness."));
const segRows: Array<[string, string, string, string]> = [
  ["Steel", "+8.1%", "10.3%", "Tariff tailwind on price + volume"],
  ["HVAC-R, Fire & Security", "+3.6%", "16.5%", "Data-center pull-through"],
  ["Cement, Aggregates & Ready-mix", "+3.4%", "23.3%", "Pricing power; richest margins (+1.7pp)"],
  ["Retail & Distribution", "+3.2%", "14.9%", "R&R resilience (HD, Lowe's)"],
  ["Piping (Adv. Drainage)", "+0.4%", "30.1%", "Infrastructure / water demand"],
  ["Kitchen & Bath", "0.0%", "22.4%", "Flat; soft remodel"],
  ["Building Envelope / Roofing / Insulation", "−0.7%", "14.1%", "BLDR drag offset by Carlisle, IBP"],
  ["Doors & Windows", "−3.7%", "10.5%", "Residential drag (JELD-WEN −10.5%)"],
  ["Glass", "−5.5%", "17.3%", "Mixed; portfolio reshaping"],
  ["Bricks & Masonry (Wienerberger)", "−6.4%", "14.0%", "European residential softness"],
  ["Lumber & Wood", "−11.1%", "4.4%", "The laggard: demand + price collapse"],
];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Segment", 3400), th("Avg rev. growth", 1600, AlignmentType.CENTER), th("Avg EBITDA margin", 1600, AlignmentType.CENTER), th("Read", 2400),
    ]}),
    ...segRows.map(r => new TableRow({ children: [
      td(r[0], 3400, { bold: true }),
      td(r[1], 1600, { align: AlignmentType.CENTER, bold: true, color: r[1].startsWith("−") ? "B3322C" : DARK_GREEN }),
      td(r[2], 1600, { align: AlignmentType.CENTER }),
      td(r[3], 2400),
    ]})),
  ],
}));
children.push(spacer(120));
children.push(calloutPara("Data vintage footnote:", "Figures are FY 2025 actuals, the most recent complete period in our dataset (Capital IQ wiring is pending; last refresh April 2026). H1 2026 company results will be updated as the universe reports. We ship the narrative on verified full-year actuals rather than block on the live-data integration."));

// ===== 8. Postmortem =====
children.push(heading("8 · Postmortem — What We Said vs. What Happened", 1));
children.push(bodyText("New this edition, and the change repeat readers will value most: an honest accounting of our last set of calls."));
children.push(leadBody("The report card.  ", "Of nine forward-looking calls in our November 2025 report, five landed cleanly, three were partially right, and one missed. We were right on cost and tariff pressure, labor tightness, credit conditions, the GDP–sentiment gap, and the M&A wave. We were partially right on residential (direction right, timing hard), on nonresidential resilience (the outcome held, but the engine was data-center demand, not the federal programs we named), and on the Architecture Billings Index (it bottomed, as we expected, but stabilized below the growth line instead of reversing). We missed one outright: the rate-driven residential recovery we expected on a 2026 timeline did not arrive."));

const scoreRows: Array<[string, string, V, string]> = [
  ["Rates ease → residential recovers", "Rates higher and volatile; recovery slipped", "miss", "Plan residential off rate volatility, not Fed-cut timing; hold capacity for a later, sharper rebound rather than a smooth 2026 ramp."],
  ["Single-family demand muted", "Choppy, resolved downward (Mar +10.8% to May down)", "partial", "The direction was right and the timing was the hard part; size capacity to choppy demand, not a recovery curve."],
  ["Tariffs the renewed cost threat", "PPI +4.0% YoY; steel >$1,000/ton; ~$17,500/home; June reversal", "hit", "Model tariffs in both directions and build the swing into cost and pricing plans; the planning risk is policy volatility, not the price level."],
  ["Nonres resilient on IIJA/CHIPS/IRA", "Resilient, but data centers were the engine", "partial", "The engine changed; reweight commercial exposure toward data-center pull-through, with federal programs as the floor (§5)."],
  ["Labor binding; watch wage moderation", "Still tight; ISM employment contracting", "hit", "Still the binding constraint on delivery; keep investing in prefab and labor-saving products, and watch the first wage relief as labor loosens."],
  ["Credit stays restrictive", "Held; large caps raised freely", "hit", "Scale and balance-sheet strength stay the dividing line; well-capitalized players keep the edge in financing and a consolidating market."],
  ["GDP–sentiment gap persists", "Persisted; GDP now softening too", "hit", "Headline GDP overstates ground-level demand; weight order books, permits, and confidence over the top-line print when planning."],
  ["M&A continues (+24% YoY)", "Accelerated; +30% volume; Berkshire $8.5B", "hit", "Consolidation is reshaping procurement leverage and channel access; revisit buy-vs-build and supplier strategy now, not after the next deal (§6)."],
  ["ABI reversal; backlog moderation", "Stabilized below 50 (48.5 to 43.8 to 49.4); no reversal", "partial", "Billings bottomed but have not turned; treat commercial recovery as unconfirmed and gate capacity on an ABI cross back above 50."],
];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  rows: [
    new TableRow({ tableHeader: true, children: [
      th("Prediction (Nov 2025)", 2500), th("What happened (H1 2026)", 3300),
      th("Verdict", 1100, AlignmentType.CENTER), th("Implication", 2100),
    ]}),
    ...scoreRows.map(([p, a, v, i]) => new TableRow({ children: [
      td(p, 2500), td(a, 3300), verdictCell(v, 1100), td(i, 2100),
    ]})),
  ],
}));
children.push(spacer());
children.push(calloutPara("Why this matters:", "This candor doubles as a disclaimer. We don't pretend to have a crystal ball, and neither does anyone else forecasting this market. That is why operators benefit from an advisor who revisits the call, learns from it, and adjusts."));

// ===== 9. How AV Can Help =====
children.push(heading("9 · How Applied Value Can Help", 1));
children.push(bodyText("Applied Value helps building materials and products companies turn market dynamics, good and bad, into operational advantage through our Lean Growth approach: Focus, Simplicity, and Speed. Our work spans commercial strategy, procurement and cost transformation, operations, M&A and post-merger integration, and data-driven decision support."));
children.push(heading("Representative Engagements", 2));
children.push(bodyText("The dynamics in this report map directly to recent Applied Value work; these appear as kickers throughout."));
children.push(bulletPoint("Steel cost & commodity-volatility mitigation (see §4) — directed-buy and indexation roadmap; $79–114/ST steel-cost reduction and up to ±$26M margin-variance reduction."));
children.push(bulletPoint("New-segment growth capture (see §5) — go-to-market strategy by end-user segment for a building-products manufacturer; sized market opportunity and roll-out plan."));
children.push(bulletPoint("Procurement leverage at scale (see §6) — Heidelberg Materials cement-network RFP; $2.8M (12%) freight savings, $7.5M (5%) targeted on $150.9M spend."));
children.push(bulletPoint("Post-deal value creation (see §6) — fact-based supplier negotiations for a PE-owned industrial; >20% price reduction."));
children.push(calloutPara("Note:", "The engagements above are real Applied Value cases from the AV case-study database, anonymized where required. Confirm client-disclosure permissions (for example, naming Heidelberg Materials) and final figures before publication."));
children.push(bodyText("To learn how Applied Value can help your business prepare for and benefit from the dynamics in this report, contact [team]."));

// ===== Appendix =====
children.push(heading("Appendix", 1));
children.push(bulletPoint("A1 — Applied Value in Review: recent quarter highlights. [Update.]"));
children.push(bulletPoint("A2 — Additional Reports & Contacts: report roster and team contacts. [Update the roster table.]"));

children.push(...footer());

// ---------- assemble ----------
const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }, pageNumbers: { start: 1 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [
      new TextRun({ text: "Applied Value — Building Materials & Products Market Health Report · H1 2026 (DRAFT)", size: 16, font: FONT, color: GRAY_TEXT }),
    ]})]})},
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: GRAY_TEXT }),
    ]})]})},
    children,
  }],
});

const out = process.env.DOCX_OUT || "knowledge-base/outputs/h1-2026-prep/H1_2026_Report_DRAFT.docx";
const buf = Buffer.from(await Packer.toBuffer(doc));
writeFileSync(out, buf);
console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
