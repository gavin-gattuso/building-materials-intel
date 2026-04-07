const docx = require("docx");
const fs = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel, ExternalHyperlink,
  TableBorders, ShadingType, VerticalAlign, PageBreak
} = docx;

const DARK_BLUE = "1E3A5F";
const MEDIUM_BLUE = "2B5C8A";
const LIGHT_GRAY = "F2F2F2";
const WHITE = "FFFFFF";
const BLACK = "000000";

function heading(text, level) {
  return new Paragraph({
    spacing: { before: level === 1 ? 400 : 300, after: 100 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === 1 ? 32 : level === 2 ? 26 : 22,
        color: DARK_BLUE,
        font: "Calibri",
      }),
    ],
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text, size: 22, font: "Calibri" }),
    ],
  });
}

function articleHeadline(title, source) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text: title, bold: true, size: 22, font: "Calibri", color: DARK_BLUE }),
      new TextRun({ text: ` (${source})`, italics: true, size: 22, font: "Calibri", color: "666666" }),
    ],
  });
}

function bulletPoint(text) {
  return new Paragraph({
    spacing: { after: 40 },
    bullet: { level: 0 },
    children: [
      new TextRun({ text, size: 22, font: "Calibri" }),
    ],
  });
}

function sourceLink(url) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: "Source: ", size: 20, font: "Calibri", color: "666666" }),
      new ExternalHyperlink({
        children: [
          new TextRun({ text: url, size: 20, font: "Calibri", color: "0563C1", underline: {} }),
        ],
        link: url,
      }),
    ],
  });
}

function categoryHeader(text) {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    shading: { type: ShadingType.SOLID, color: DARK_BLUE },
    children: [
      new TextRun({ text: `  ${text}`, bold: true, size: 24, font: "Calibri", color: WHITE }),
    ],
  });
}

function trendRow(driver, direction, signal) {
  const dirColor = direction.includes("Down") || direction.includes("Weakening") ? "008000" :
    direction.includes("Up") || direction.includes("Tightening") ? "CC0000" :
    direction.includes("Expanding") ? "008000" :
    "FF8C00";
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 2800, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: driver, size: 20, font: "Calibri", bold: true })] })],
      }),
      new TableCell({
        width: { size: 1400, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: direction, size: 20, font: "Calibri", bold: true, color: dirColor })] })],
      }),
      new TableCell({
        width: { size: 5400, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text: signal, size: 20, font: "Calibri" })] })],
      }),
    ],
  });
}

const children = [
  // Title block
  new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: "BUILDING MATERIALS & BUILDING PRODUCTS BRIEFING", bold: true, size: 36, font: "Calibri", color: DARK_BLUE }),
  ]}),
  new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: "Comprehensive Intelligence Report", size: 26, font: "Calibri", color: MEDIUM_BLUE }),
  ]}),
  new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: "April 6, 2026", size: 24, font: "Calibri", color: "666666" }),
  ]}),
  // Horizontal rule
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { color: DARK_BLUE, space: 1, style: BorderStyle.SINGLE, size: 12 } },
    children: [],
  }),

  // EXECUTIVE SUMMARY
  heading("EXECUTIVE SUMMARY", 1),
  bodyText("The past week in Building Materials & Building Products was dominated by tariff-driven cost shocks and major M&A activity. Construction input prices surged at a staggering 12.6% annualized rate in early 2026, fueled by 50% tariffs on steel, aluminum, and copper that took effect April 2. QXO completed its $2.25 billion acquisition of Kodiak Building Partners, continuing Brad Jacobs' aggressive roll-up strategy. Meanwhile, mortgage rates declined 25 basis points to 6.22%, offering a modest tailwind, but builder confidence remains subdued at 38 on the HMI as buyers hesitate despite softer pricing."),

  // SECTION A
  heading("SECTION A: INDUSTRY NEWS", 1),

  // M&A
  categoryHeader("M&A and Corporate Strategy"),

  articleHeadline("1. QXO Completes $2.25 Billion Acquisition of Kodiak Building Partners", "QXO Investor Relations"),
  bodyText("Brad Jacobs' QXO closed its landmark $2.25 billion acquisition of Kodiak Building Partners on April 1, 2026, paying $2.0 billion in cash plus 13.16 million shares of QXO common stock to seller Court Square Capital Partners. Kodiak generated approximately $2.4 billion in revenue in 2025 as a U.S. distributor of lumber, trusses, windows, doors, construction supplies, waterproofing, and roofing products, along with value-added assembly, fabrication, and installation services."),
  bodyText("This represents QXO's second major acquisition following the $11 billion all-cash purchase of Beacon Roofing Supply that closed in April 2025. The deal expands QXO's addressable market to more than $200 billion and is expected to be highly accretive to 2026 earnings. QXO retains the right to repurchase the issued shares at $40 per share."),
  bodyText("QXO's strategy mirrors CEO Brad Jacobs' prior playbook at XPO Logistics \u2014 acquire fragmented distribution platforms, then drive margin expansion through technology, procurement leverage, and operational efficiency. The company targets $50 billion in annual revenues within the next decade through continued acquisitions and organic growth."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Deal value: $2.25B ($2.0B cash + 13.16M shares)"),
  bulletPoint("Kodiak 2025 revenue: ~$2.4B"),
  bulletPoint("QXO addressable market: $200B+"),
  bulletPoint("Prior deal: Beacon Roofing Supply ($11B, April 2025)"),
  bulletPoint("Revenue target: $50B within decade"),
  sourceLink("https://investors.qxo.com/news/news-details/2026/QXO-Completes-Acquisition-of-Kodiak-Building-Partners/default.aspx"),

  articleHeadline("2. Bain & Company: Building Products M&A Shifts from Scale to Scope", "Bain & Company"),
  bodyText("Bain's 2026 M&A report reveals a fundamental strategic shift in building products deal-making. North America led with a 33% increase in deal value through September 2025, while EMEA declined 48% and Asia-Pacific fell 44%. The report highlights three marquee transactions: Lowe's $8.8 billion acquisition of Foundation Building Materials for pro customer reach, Home Depot's purchase of GMS for pro channel expansion, and CRH's $2.1 billion buy of Eco Material Technologies for fly ash and pozzolans scale."),
  bodyText("The shift from scale to scope means more deals are targeting product category expansion and capability acquisition rather than traditional market share consolidation. This reflects high concentration in some segments \u2014 the top 6 cement producers already control 65-70% of U.S. capacity. Bain's data shows frequent acquirers achieved 9.6% total shareholder returns versus 2.7% for inactive companies, validating the active M&A approach."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("North America deal value: +33%"),
  bulletPoint("EMEA deal value: -48%"),
  bulletPoint("APAC deal value: -44%"),
  bulletPoint("Lowe's/Foundation Building Materials: $8.8B"),
  bulletPoint("CRH/Eco Material Technologies: $2.1B"),
  bulletPoint("Top 6 cement producers: 65-70% US capacity"),
  bulletPoint("Acquirer TSR: 9.6% vs 2.7% inactive"),
  sourceLink("https://www.bain.com/insights/building-products-m-and-a-report-2026/"),

  // Pricing
  categoryHeader("Pricing & Cost Trends"),

  articleHeadline("3. Construction Input Prices Surge 12.6% Annualized in Early 2026", "Construction Dive"),
  bodyText("Construction input prices surged at a staggering 12.6% annualized rate during January-February 2026. On a monthly basis, nonresidential construction input prices increased 1.3% in February, driven by energy-related inputs: natural gas (+10.9% MoM), unprocessed energy materials (+6%), and crude petroleum (+4.7%). Oil prices near $100/barrel due to the Iran conflict are compounding tariff-driven increases."),
  bodyText("AGC Chief Economist Ken Simonson stated that disruption of oil, natural gas, and aluminum supplies from the Middle East is pushing costs further. ABC Chief Economist Anirban Basu warned of upward pressure on materials prices through diesel and shipping costs. Fewer than 1 in 4 contractors expect profit margin shrinkage over the next six months, but owners are beginning to delay projects."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Input prices: +12.6% annualized (Jan-Feb 2026)"),
  bulletPoint("Monthly increase: +1.3% (February)"),
  bulletPoint("YoY increase: +3.7% vs Feb 2025"),
  bulletPoint("Natural gas: +10.9% MoM"),
  bulletPoint("Crude petroleum: +4.7% MoM"),
  bulletPoint("Oil: ~$100/barrel"),
  sourceLink("https://www.constructionowners.com/news/construction-costs-surge-in-2026"),

  articleHeadline("4. Building Material Prices Hit 3.5% YoY - Largest Increase Since Early 2023", "NAHB"),
  bodyText("NAHB reports building material prices rose 3.5% year-over-year, the largest annual increase since January 2023, with price growth remaining above 3.0% since June 2025. Metal products are the standout, with metal molding and trim prices surging nearly 50% compared to last year. However, softwood lumber prices remain below prior year levels and ready-mix concrete has softened, creating a bifurcated pricing landscape."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Overall material prices: +3.5% YoY"),
  bulletPoint("Metal molding/trim: ~+50% YoY"),
  bulletPoint("Softwood lumber: below prior year"),
  bulletPoint("Ready-mix concrete: softened"),
  sourceLink("https://www.nahb.org/blog/2026/01/building-material-price-growth"),

  // Tariffs
  categoryHeader("Tariffs & Trade Policy"),

  articleHeadline("5. AGC Issues Urgent Contract Guidance as Tariffs Hit 50% on Key Materials", "AGC"),
  bodyText("The Associated General Contractors updated its Tariff Resource Center on April 2, describing current rates as some of the most consequential tariff levels the construction industry has ever faced. Steel, aluminum, and copper now carry 50% tariffs, with derivatives at 25%, lumber at 10-25%, and a 10% global baseline expiring July 2026. The AGC urges three immediate actions: include price escalation provisions (ConsensusDocs 200.1), document baseline pricing at signing, and build contingency language for rate changes between execution and procurement. Additional tariffs on critical minerals, robotics, semiconductors, and heavy trucks are under investigation."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Steel/aluminum/copper: 50% tariff"),
  bulletPoint("Derivatives: 25%"),
  bulletPoint("Lumber: 10-25%"),
  bulletPoint("Global baseline: 10% (expires July 2026)"),
  sourceLink("https://www.constructionowners.com/news/construction-tariffs-surge-agc-urges-contract-updates"),

  // Earnings
  categoryHeader("Company Earnings & Performance"),

  articleHeadline("6. RPM International Q3 2026 Earnings Due April 8", "Daily Political"),
  bodyText("RPM International (NYSE: RPM) is expected to report Q3 2026 results on Wednesday, April 8. Analysts project EPS of $0.3545 and revenue of $1.5484 billion. The broader building materials sector faced headwinds in Q4 2025, with collective revenues falling short of estimates and share prices declining post-earnings."),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Expected EPS: $0.3545"),
  bulletPoint("Expected revenue: $1.5484B"),
  bulletPoint("Report date: April 8, 2026"),
  sourceLink("https://www.dailypolitical.com/2026/04/05/rpm-international-rpm-projected-to-post-quarterly-earnings-on-wednesday.html"),

  // SECTION B
  heading("SECTION B: MARKET HEALTH DRIVERS", 1),

  // Interest Rates
  categoryHeader("Interest & Mortgage Rates"),

  articleHeadline("7. Mortgage Rates Down a Quarter Point in 5 Days", "Yahoo Finance / Zillow"),
  bodyText("The 30-year fixed mortgage rate fell to 6.22% as of April 6, down 0.25% in just five days. The 15-year fixed sits at 5.72%. MBA forecasts 30-year rates near 6.30% through 2026 and 6.20-6.30% for most of 2027, while Fannie Mae predicts just under 6% by year-end 2026."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Lower rates improve housing affordability and stimulate new construction demand. The recent decline, while modest, could help release some of the pent-up buyer demand that has constrained starts.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("30-year fixed: 6.22% (down 0.25% in 5 days)"),
  bulletPoint("15-year fixed: 5.72%"),
  bulletPoint("MBA forecast: ~6.30% through 2026"),
  bulletPoint("Fannie Mae forecast: <6% by year-end"),
  sourceLink("https://finance.yahoo.com/personal-finance/mortgages/article/mortgage-refinance-rates-today-monday-april-6-2026-100000808.html"),

  // Labor
  categoryHeader("Labor Dynamics"),

  articleHeadline("8. Construction's New Worker Demand Drops to 350,000 in 2026", "Construction Dive / ABC"),
  bodyText("The construction industry needs 349,000 net new workers in 2026, rising to 456,000 in 2027. Wages are up 4% YoY with some firms raising 20%+ to compete. The deeper problem is retention: while 71.7% of contractors increased headcount in 2025, 46% reported zero net workforce growth due to turnover. 28% of firms have been affected by immigration enforcement in the past 6 months. The skilled labor shortage costs the home building sector $10.8 billion per year and prevents an estimated 19,000 homes from being built annually."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Labor constraints cap construction activity and therefore material demand. However, they accelerate adoption of labor-saving building products (prefab, modular, 3D-printed components).", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Workers needed 2026: 349K (some estimates: 500K)"),
  bulletPoint("Workers needed 2027: 456K"),
  bulletPoint("Wage growth: +4% YoY"),
  bulletPoint("Zero net growth despite hiring: 46% of contractors"),
  bulletPoint("Immigration enforcement impact: 28% of firms"),
  bulletPoint("Annual cost: $10.8B; 19,000 homes not built"),
  sourceLink("https://www.constructiondive.com/news/labor-demand-gap-shrinks-abc-construction-staff/810681/"),

  // Energy
  categoryHeader("Material & Energy Costs"),

  articleHeadline("9. Oil at $112/Barrel Compounds Construction Cost Pressure", "Fortune / EIA"),
  bodyText("Brent crude reached $112.42/barrel as of April 3, approximately $34 higher than one year ago. EIA forecasts Brent to remain above $95/b for two months before falling below $80/b in Q3 2026. Energy costs are a primary driver of the 12.6% annualized construction input price surge."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Oil prices directly affect manufacturing costs (cement kilns, steel smelters) and delivery costs. Every $10/barrel increase adds roughly $5-10/ton to delivered material costs.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Brent crude: $112.42/bbl (April 3)"),
  bulletPoint("YoY change: +$34"),
  bulletPoint("EIA near-term: >$95/b"),
  bulletPoint("EIA Q3 forecast: <$80/b"),
  sourceLink("https://fortune.com/article/price-of-oil-04-06-2026/"),

  // Demand
  categoryHeader("Demand Visibility"),

  articleHeadline("10. Spring 2026 Housing: Hesitant Buyers Despite Softer Pricing", "HousingWire / NAHB"),
  bodyText("New home sales fell 7.2% YoY in January to 713,104 SAAR per Zonda. NAHB's HMI inched up 1 point to 38 in March, but 70% of builders describe conditions as weaker than expected. Housing starts hit 1,487,000 SAAR (+9.5% YoY) but driven entirely by multifamily \u2014 single-family starts declined. Building permits fell 5.8% YoY to 1,376,000. The market is defined by hesitant buyers, not absent demand."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Mixed signals \u2014 multifamily supports volume materials (concrete, steel, drywall) while single-family weakness affects wood framing, roofing, and finish products.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("New home sales: 713K SAAR (-7.2% YoY)"),
  bulletPoint("HMI: 38 (up 1)"),
  bulletPoint("Housing starts: 1,487K SAAR (+9.5% YoY, multifamily-driven)"),
  bulletPoint("Building permits: 1,376K (-5.8% YoY)"),
  sourceLink("https://www.housingwire.com/articles/spring-2026-housing-market-hesitation-homebuyer-confidence/"),

  // Infrastructure
  categoryHeader("Government Infrastructure Spending"),

  articleHeadline("11. IIJA Reaches Peak Disbursement in 2026: 42,000+ Active Projects", "ConstructionBids.ai"),
  bodyText("The IIJA is at peak disbursement with 42,105 active projects, 1,240 major projects tracked, and a 40% increase in Heavy Civil solicitations versus 2024. The largest allocations are Road/Bridge Repair ($110B), Water Infrastructure ($55B), and Broadband ($65B). 90% of funds flow through state formula grants. However, federal funding cuts and freezes threaten implementation."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Infrastructure is the strongest demand driver for cement, aggregates, steel rebar, and asphalt. Peak disbursement supports heavy materials volumes even as residential weakens.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("Active projects: 42,105"),
  bulletPoint("Major projects: 1,240"),
  bulletPoint("Heavy Civil solicitations: +40% vs 2024"),
  bulletPoint("Project growth: +12% YoY"),
  bulletPoint("Road/Bridge: $110B; Water: $55B; Broadband: $65B"),
  sourceLink("https://constructionbids.ai/resources/government-construction-opportunities-2026"),

  // Credit
  categoryHeader("Credit Availability & Lending Standards"),

  articleHeadline("12. Fed Survey: Modest Tightening for Commercial Loans, CRE Stable", "ABA Banking Journal / Federal Reserve"),
  bodyText("The Q4 2025 SLOOS shows 5-10% of banks tightened C&I loan standards, with modest easing for multifamily CRE and unchanged standards for construction/land development. Large banks eased while smaller banks tightened, creating a two-tier lending environment. Banks expect 2026 standards to remain unchanged with demand strengthening across all categories."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Stable credit availability means project financing won't constrain construction activity in 2026. The large/small bank divergence favors larger projects.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("C&I tightening: 5-10% of banks"),
  bulletPoint("Multifamily CRE: modest easing"),
  bulletPoint("Construction/land dev: unchanged"),
  bulletPoint("2026 outlook: unchanged standards, stronger demand"),
  sourceLink("https://bankingjournal.aba.com/2026/02/fed-survey-lending-standards-tightened-for-commercial-loans-in-q4/"),

  // GDP
  categoryHeader("GDP Growth & Consumer Confidence"),

  articleHeadline("13. Consumer Confidence at 91.8; GDP Growth Forecast 2.2-2.8%", "Conference Board / RSM / Goldman Sachs"),
  bodyText("The CCI edged up to 91.8 in March from 91.0 in February. Present Situation rose 4.6 points to 123.3, but Expectations fell 1.7 points to 70.9 \u2014 a mixed signal. GDP forecasts range from 2.2% (RSM) to 2.8% (Goldman Sachs, citing tariff fade and tax cuts). Recession probability fell to 30% from 40%. Consumer spending is shifting toward necessities and cheap thrills."),
  new Paragraph({ spacing: { before: 60, after: 40 }, children: [new TextRun({ text: "Impact on Building Materials: ", bold: true, italics: true, size: 22, font: "Calibri", color: DARK_BLUE }), new TextRun({ text: "Moderate GDP growth supports construction activity. The divergence between present conditions (improving) and expectations (weakening) suggests near-term stability but caution on discretionary renovation spending.", size: 22, font: "Calibri" })] }),
  new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: "Key Data Points:", bold: true, size: 22, font: "Calibri", color: DARK_BLUE })] }),
  bulletPoint("CCI: 91.8 (up 0.8)"),
  bulletPoint("Present Situation: 123.3 (+4.6)"),
  bulletPoint("Expectations: 70.9 (-1.7)"),
  bulletPoint("GDP forecasts: 2.2-2.8%"),
  bulletPoint("Recession probability: 30% (down from 40%)"),
  sourceLink("https://www.fakta.co/us-consumer-confidence-april-2026-spending"),

  // DAILY TREND TRACKER
  heading("DAILY TREND TRACKER", 1),

  new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 2800, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: DARK_BLUE },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Driver", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
          }),
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: DARK_BLUE },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Direction", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
          }),
          new TableCell({
            width: { size: 5400, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: DARK_BLUE },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Level / Signal", bold: true, size: 20, font: "Calibri", color: WHITE })] })],
          }),
        ],
      }),
      trendRow("Interest & Mortgage Rates", "\u2193 Down", "30yr at 6.22%, down 25bps in 5 days"),
      trendRow("Labor Dynamics", "\u2191 Tightening", "349K workers needed, 4% wage growth"),
      trendRow("Material & Energy Costs", "\u2191 Up", "Oil $112/bbl, inputs +12.6% annualized"),
      trendRow("Demand Visibility", "\u2193 Weakening", "HMI 38, permits -5.8% YoY, buyers hesitant"),
      trendRow("Gov't Infrastructure Spending", "\u2191 Expanding", "42K+ projects, +40% Heavy Civil solicitations"),
      trendRow("Credit Availability", "\u2192 Stable", "Unchanged standards, stronger demand expected"),
      trendRow("GDP & Consumer Confidence", "\u2192 Mixed", "CCI 91.8, GDP 2.2-2.8%, recession prob 30%"),
    ],
  }),

  // Footer
  new Paragraph({ spacing: { before: 400 }, border: { top: { color: DARK_BLUE, space: 1, style: BorderStyle.SINGLE, size: 6 } }, children: [] }),
  new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: "Compiled by Jarvis AI \u2014 Building Materials & Building Products Monitor", italics: true, size: 20, font: "Calibri", color: "666666" }),
  ]}),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text: "This document is part of the Building Materials & Building Products knowledge repository for the semi-annual industry report.", italics: true, size: 18, font: "Calibri", color: "999999" }),
  ]}),
];

const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
      },
    },
    children,
  }],
});

async function main() {
  const buffer = await Packer.toBuffer(doc);
  const outPath1 = path.join("C:/Users/GavinGattuso/OneDrive - Applied Value/Desktop/Claude AI newsletter/knowledge-base/outputs/reports", "Building_Materials_Briefing_2026-04-06.docx");
  const outPath2 = path.join("C:/Users/GavinGattuso/OneDrive - Applied Value/Desktop/Claude AI newsletter/newsletters", "Building_Materials_Briefing_2026-04-06.docx");

  fs.writeFileSync(outPath1, buffer);
  console.log("Written to:", outPath1);

  // Ensure newsletters directory exists
  const dir2 = path.dirname(outPath2);
  if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
  fs.writeFileSync(outPath2, buffer);
  console.log("Copied to:", outPath2);
}

main().catch(err => { console.error(err); process.exit(1); });
