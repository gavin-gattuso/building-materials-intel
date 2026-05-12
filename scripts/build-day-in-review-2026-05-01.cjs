// Build script for Building Materials & Building Products Day in Review — 2026-05-01
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  ExternalHyperlink, LevelFormat, BorderStyle, PageOrientation
} = require('docx');

const OUT = path.resolve('C:/Users/GavinGattuso/OneDrive - Applied Value/Desktop/Claude AI newsletter/newsletters/Building_Materials_Day_in_Review_2026-05-01.docx');

// Helpers
const p = (text, opts = {}) => new Paragraph({
  spacing: { after: 120 },
  ...opts,
  children: opts.children || [new TextRun({ text, font: 'Arial', size: 22 })]
});
const pBold = (text, opts = {}) => new Paragraph({
  spacing: { after: 100 },
  ...opts,
  children: [new TextRun({ text, bold: true, font: 'Arial', size: 22 })]
});
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 280, after: 160 },
  children: [new TextRun({ text, bold: true, font: 'Arial', size: 30, color: '1F4E2C' })]
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 220, after: 120 },
  children: [new TextRun({ text, bold: true, font: 'Arial', size: 26, color: '2E7D32' })]
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, bold: true, font: 'Arial', size: 24, color: '1B5E20' })]
});
const articleHead = (text) => new Paragraph({
  spacing: { before: 200, after: 80 },
  children: [new TextRun({ text, bold: true, font: 'Arial', size: 23 })]
});
const bullet = (text) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing: { after: 60 },
  children: [new TextRun({ text, font: 'Arial', size: 22 })]
});
const sourceLink = (label, url) => new Paragraph({
  spacing: { after: 160 },
  children: [
    new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: 22 }),
    new ExternalHyperlink({
      link: url,
      children: [new TextRun({ text: url, style: 'Hyperlink', font: 'Arial', size: 22, color: '0563C1', underline: {} })]
    })
  ]
});
const sourcesMulti = (label, urls) => {
  const children = [new TextRun({ text: `${label}: `, italics: true, font: 'Arial', size: 22 })];
  urls.forEach((u, i) => {
    if (i > 0) children.push(new TextRun({ text: ' | ', font: 'Arial', size: 22 }));
    children.push(new ExternalHyperlink({
      link: u,
      children: [new TextRun({ text: u, style: 'Hyperlink', font: 'Arial', size: 22, color: '0563C1', underline: {} })]
    }));
  });
  return new Paragraph({ spacing: { after: 160 }, children });
};
const keyData = (text) => new Paragraph({
  spacing: { after: 80 },
  children: [
    new TextRun({ text: 'Key Data Points: ', bold: true, italics: true, font: 'Arial', size: 22 }),
    new TextRun({ text, font: 'Arial', size: 22 })
  ]
});
const para = (text) => new Paragraph({
  spacing: { after: 120 },
  alignment: AlignmentType.JUSTIFIED,
  children: [new TextRun({ text, font: 'Arial', size: 22 })]
});

const titleBlock = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'BUILDING MATERIALS & BUILDING PRODUCTS', bold: true, font: 'Arial', size: 36, color: '1B5E20' })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'DAY IN REVIEW', bold: true, font: 'Arial', size: 32, color: '1B5E20' })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'Comprehensive Daily Intelligence Report', italics: true, font: 'Arial', size: 24 })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 280 },
    children: [new TextRun({ text: 'May 1, 2026', bold: true, font: 'Arial', size: 24 })]
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '2E7D32', space: 1 } },
    children: [new TextRun({ text: '', font: 'Arial', size: 22 })]
  })
];

const execSummary = [
  h1('Executive Summary'),
  para('May 1, 2026 caps a heavy 24 hours for the Building Materials & Building Products complex. Q1 2026 earnings season delivered a barrage of results from sector bellwethers on April 30: Trane Technologies posted a record $10.7 billion backlog (+30% vs year-end), Martin Marietta delivered a record $1.36 billion Q1 revenue (+17%), Holcim grew net sales 3.9% organically to CHF 3.52 billion, and Vulcan Materials grew revenue 7.4% to $1.756 billion — even as Builders FirstSource missed adjusted EPS by ~31% on a weakening housing market.'),
  para('The macro backdrop hardened: the Fed held the funds rate at 3.5–3.75% on April 29 amid an unusually divided 8–4 vote (last seen in 1992), with the Iran conflict pushing energy input prices up 21.4% in March and construction input prices climbing at a 12.6% annualized clip in early 2026. Mortgage rates ticked up to 6.13–6.37% on a 30-year basis, and tariffs on steel, aluminum, and copper remain at 50%.'),
  para('Three themes connect the day\'s developments: (1) the bifurcation between aggregates/HVAC strength (infrastructure and data centers) and residential weakness (housing affordability); (2) energy- and tariff-driven cost escalation that is starting to reach owners\' pockets; and (3) accelerating consolidation in building products M&A, anchored by QXO\'s $17 billion bid for TopBuild.')
];

const sectionA = [
  h1('Section A: Industry News'),

  h2('1. M&A and Corporate Strategy'),

  articleHead('QXO to Acquire TopBuild for $17 Billion (PR Newswire / QXO IR)'),
  para('QXO, the building products distribution roll-up vehicle led by Brad Jacobs, announced a definitive agreement to acquire TopBuild Corp. (BLD) — the largest U.S. installer and distributor of insulation and other building products — for approximately $17 billion. The transaction is the largest pure-play building products M&A event since QXO\'s acquisition of Beacon Roofing Supply in 2025 and would create a scaled, multi-vertical building products distribution platform with roofing, insulation, and adjacent product lines.'),
  para('Industry trackers report Q1 2026 sector volume climbed to 833 deals from 707 a year prior; TEV/EBITDA multiples expanded to 10.93x (from 9.65x) and TEV/Revenue strengthened to 1.62x (from 1.42x). Strategic buyers completed 86.6% of deals; financial sponsors increasingly pursued door services and fenestration as roll-up plays.'),
  para('Why it matters: this consolidates Jacobs\' building products thesis, materially compresses competitive options for insulation contractors and homebuilders, and validates the post-tariff thesis that scale matters more than ever in distribution. Watch for FTC review timing and any pricing power signal in Q2 results from peer distributors. Direct read-through to Building Products & Distribution segment commentary in the semi-annual report.'),
  keyData('$17B deal value; Q1 2026 sector deal volume 833 vs 707 LY; TEV/EBITDA 10.93x; strategic buyers 86.6% of activity.'),
  sourceLink('Source', 'https://investors.qxo.com/news/news-details/2026/QXO-to-Acquire-TopBuild-for-17-Billion/'),

  articleHead('Holcim Closes Cluster of Strategic Bolt-Ons (Holcim Q1 2026 Release)'),
  para('Holcim closed four bolt-on acquisitions during Q1 2026: a majority stake in Cementos Pacasmayo (Peru), Uranus Pluton SRL (Romania), Jacobs NV (Belgium), and Stevenson Group ready-mix concrete (New Zealand). The company also signed a definitive agreement to acquire building materials and solutions operations in Colombia (projected ~USD 360 million in annual sales) and divested Lebanon operations.'),
  para('CEO Miljan Gutovic stated: "I thank all my Holcim colleagues for their dedication and contributions to our strong start." Recurring EBIT margin expanded most in Latin America (30.6%) and Asia/Middle East/Africa (22.0%) — both regions where Holcim is using bolt-ons to extend leadership. The pattern signals continued cement and aggregates consolidation outside North America and is a meaningful counterweight to Holcim\'s Europe weakness (-2.3% organic).'),
  keyData('4 closed deals in Q1; $360M sales projected from Colombia signing; LatAm Q1 EBIT margin 30.6%; AMEA EBIT margin 22.0%.'),
  sourceLink('Source', 'https://www.holcim.com/media/media-releases/q1-2026-results'),

  articleHead('Martin Marietta Adds 8M+ Tons of Capacity via New Frontier Materials (GlobeNewswire)'),
  para('Martin Marietta announced a definitive agreement on April 19, 2026 to acquire Midwestern aggregates producer New Frontier Materials, adding more than 8 million tons of annual production in the greater St. Louis area. The deal complements the QUIKRETE asset exchange that closed February 23, 2026, which delivered ~20 million tons of annual aggregates capacity in Virginia, Missouri, Kansas, and British Columbia plus $450 million in cash, while shedding the Midlothian cement plant, Texas ready-mix, and cement terminals (generating a $1.4B after-tax gain reported in discontinued operations).'),
  para('The aggregates pure-play strategy is now structurally evident: Martin Marietta is converting cement exposure into aggregates breadth in inland markets where infrastructure tailwinds are strongest. Expected close on New Frontier: H2 2026.'),
  keyData('New Frontier ~8M tons annual; QUIKRETE exchange ~20M tons + $450M cash; $1.4B after-tax gain on QUIKRETE divestiture; deal close H2 2026.'),
  sourceLink('Source', 'https://www.globenewswire.com/news-release/2026/04/30/3284659/0/en/Martin-Marietta-Reports-First-Quarter-2026-Results.html'),

  h2('2. Pricing & Cost Trends'),

  articleHead('Construction Input Prices Surge at 12.6% Annualized Pace (Construction Dive)'),
  para('Construction input prices rose at a staggering 12.6% annualized rate during January-February 2026, with nonresidential construction inputs climbing 1.3% in February alone and the YoY index up 3.1% (vs 2.3% in January). Energy was the top driver, with natural gas +10.9% MoM, crude petroleum +4.7%, and unprocessed energy materials +6.0%.'),
  para('ABC Chief Economist Anirban Basu warned: "Materials price escalation could serve as a real headwind to construction activity over the next several months." AGC CEO Jeffrey Shoaf added: "There is a limit to how many price increases the market can absorb before owners put projects on hold."'),
  para('The Iran conflict (started Feb 28) has pushed crude near $100/barrel — pressure not yet fully reflected in reported PPI data. Aluminum mill shapes are up 30.5% over twelve months; structural steel shapes +12.1%; No. 2 diesel +51.2%; metal molding/trim +45.5%.'),
  keyData('Input prices +12.6% annualized Q1; aluminum +30.5%; steel structural +12.1%; diesel +51.2%; nonresidential inputs +1.3% MoM in Feb.'),
  sourceLink('Source', 'https://www.constructiondive.com/news/staggering-construction-prices-february-2026/815257/'),

  articleHead('Lumber Returns to Pre-Pandemic Range; Concrete Modestly Lower (NAHB / Gordian)'),
  para('Softwood lumber has returned to the pre-pandemic $400-$500/mbf trading range, with prices well below year-ago levels. Concrete costs sit at $2.45/unit to start 2026, down 0.41% sequentially. Standard 3,000 PSI concrete remains $120-$150/cubic yard, with 4-6% additional increases expected through 2026 (8-10% in coastal/dense urban centers).'),
  para('The lumber softness offers builders a meaningful cost offset against steel and aluminum tariff escalation; concrete-heavy infrastructure projects face continued mid-single-digit inflation that will pressure DOT budgets.'),
  keyData('Lumber $400-500/mbf; 3,000 PSI concrete $120-150/cubic yd; concrete +4-6% expected 2026.'),
  sourceLink('Source', 'https://www.nahb.org/blog/2026/01/building-material-price-growth'),

  h2('3. Tariffs & Trade Policy'),

  articleHead('50% Steel/Aluminum/Copper Tariffs Add ~$17,500 per New Home (Brookings / NAHB)'),
  para('Section 232 tariffs of 50% remain in effect on imported steel and aluminum and have now been extended to copper. A separate 25% tariff on kitchen cabinets, furniture, and vanities runs through January 1, 2027. Estimates: tariffs add up to $30 billion to the U.S. housing sector cost base — roughly $17,500 per new home.'),
  para('As of April 7, current tariff rates increase construction materials costs by 6.0% relative to a 2024 baseline and lift total project costs by 3.0%. Following the Supreme Court\'s February 20 ruling that invalidated the use of IEEPA to enact tariffs, the administration introduced a 10% global tariff under Section 122 of the Trade Act of 1974, capped at 15% and limited to 150 days unless extended by Congress. High-tariff exposure is concentrated on imports from China, Mexico, and Canada at an effective 25-30% rate.'),
  keyData('Steel/Al/Cu 50%; cabinets/furniture 25% to Jan 2027; +6.0% materials cost vs 2024 baseline; +$17,500 per home; Section 122 10% global cap 15%/150 days.'),
  sourceLink('Source', 'https://www.brookings.edu/articles/recent-tariffs-threaten-residential-construction/'),

  h2('4. Company Earnings & Performance'),

  articleHead('Trane Technologies Q1 2026 — Record $10.7B Backlog, Bookings +24% (The Motley Fool / Investing.com)'),
  para('Trane reported Q1 2026 revenue of $4.97 billion (vs $4.81 billion consensus), EPS of $2.63 (vs $2.53 consensus), and adjusted EPS growth of 7%. Enterprise organic bookings rose 24% and the company exited the quarter with a record $10.7 billion backlog — up over 30% versus year-end 2025.'),
  para('The print confirms HVAC\'s secular tailwinds from data center cooling, IRA-related electrification of buildings, and the labor-market-driven push to retrofit commercial HVAC systems. Trane\'s bookings strength is the strongest forward signal in the building products universe today.'),
  keyData('Revenue $4.97B (beat); EPS $2.63 (beat); Adj EPS +7%; bookings +24%; backlog $10.7B (+30% vs YE25).'),
  sourceLink('Source', 'https://www.fool.com/earnings/call-transcripts/2026/04/30/trane-tt-q1-2026-earnings-call-transcript/'),

  articleHead('Carrier Global Q1 2026 — EPS Down 12% on Margin Pressure (The Motley Fool)'),
  para('Carrier delivered Q1 2026 sales of $5.3 billion with organic sales roughly flat and adjusted EPS of $0.57, a 12% YoY decline driven by lower operating profit. The result underscores the divergence between Trane (commercial/industrial bias, high backlog) and Carrier (more residential/light commercial exposure, hit by housing softness and tariff pass-through lag).'),
  keyData('Sales $5.3B (flat organic); Adj EPS $0.57 (-12%).'),
  sourceLink('Source', 'https://www.fool.com/earnings/call-transcripts/2026/04/30/carrier-carr-q1-2026-earnings-call-transcript/'),

  articleHead('Martin Marietta Q1 2026 — Record Revenue, Aggregates Volume +12.4% (GlobeNewswire / Martin Marietta IR)'),
  para('Revenue rose 17% to a Q1 record $1.36 billion. Adjusted EBITDA grew 14% to $364 million. Aggregates shipments hit 43.9 million tons (+12.4%; organic +7%, materially above guidance), at a flat $23.70/ton ASP. Gross profit per ton declined 14% to $6.56 reflecting a $22M acquired inventory markup and 5.6% organic COGS/ton increase tied to freight.'),
  para('CEO Ward Nye: "2026 is off to a strong start, with revenues improving 17% to a new first-quarter record." FY2026 guidance reaffirmed: revenue $7.0-7.32B, Adjusted EBITDA $2.36-2.50B (midpoint $2.43B); organic aggregates volume +1-3%, organic ASP +4-6%; CapEx $550-600M.'),
  keyData('Revenue $1.36B (+17%); EBITDA $364M (+14%); aggregates 43.9M tons (+12.4%); organic volume +7%; FY26 EBITDA mid $2.43B.'),
  sourceLink('Source', 'https://www.globenewswire.com/news-release/2026/04/30/3284659/0/en/Martin-Marietta-Reports-First-Quarter-2026-Results.html'),

  articleHead('Vulcan Materials Q1 2026 — Revenue +7.4% to $1.756B, FY26 EBITDA $2.4-2.6B Reaffirmed (RTT News)'),
  para('Vulcan revenue increased 7.4% to $1.756 billion versus $1.635 billion year-ago. The company reaffirmed FY2026 Adjusted EBITDA guidance of $2.4-$2.6 billion. Trailing 12-month ROIC improved 30 bps from year-end 2025 to 16%; capital returns to shareholders totaled over $800 million in the LTM ($262M dividends + $550M buybacks, including $149M repurchased in Q1).'),
  keyData('Revenue $1.756B (+7.4%); FY26 EBITDA $2.4-2.6B; LTM ROIC 16%; LTM capital return >$800M.'),
  sourceLink('Source', 'https://www.rttnews.com/story.aspx?Id=3644734'),

  articleHead('Holcim Q1 2026 — Net Sales +3.9% Organic, Margin Mix Tilts to Latin America (Holcim IR)'),
  para('Holcim Q1 net sales reached CHF 3.52 billion (+3.9% organic), recurring EBIT grew 8.3% organically to CHF 431 million, and recurring EBITDA was CHF 695 million. Building Materials revenues +4.7% organic to CHF 2.50 billion; Building Solutions +2.3% to CHF 1.41 billion.'),
  para('Europe declined 2.3% organic with a thin 6.2% EBIT margin; Latin America was the standout (+7.6% with 30.6% margin); AMEA grew 8.9% with 22.0% margin. Sustainability mix advanced — ECOPact 31% of ready-mix sales (vs 29%), ECOPlanet 39% of cement sales (vs 35%). FY26 guidance affirmed: organic net sales +3-5%, organic recurring EBIT +8-10%, free cash flow ~CHF 2 billion. Holcim outlined CHF 200M run-rate EBIT benefits by 2028 from 38 large-scale AI initiatives.'),
  keyData('Net sales CHF 3.52B (+3.9%); EBIT CHF 431M (+8.3%); LatAm margin 30.6%; AMEA margin 22.0%; ECOPlanet 39% of cement; AI program targeting CHF 200M by 2028.'),
  sourceLink('Source', 'https://www.holcim.com/media/media-releases/q1-2026-results'),

  articleHead('Builders FirstSource Q1 2026 — EPS Misses by ~31% Amid Housing Slump (Investing.com)'),
  para('Builders FirstSource reported Q1 2026 adjusted EPS of $0.27, missing the $0.39 consensus by nearly 31%. Revenue of $3.3 billion topped the $3.18 billion expectation. Single-family and multifamily starts declined across BLDR\'s key geographies, pressuring product mix and margins.'),
  para('The print is the cleanest read on residential building products demand and contrasts sharply with Martin Marietta\'s infrastructure-led volume strength on the same day. BLDR exposure to homebuilder spend cycles makes it a leading indicator for distribution peers.'),
  keyData('Revenue $3.3B (beat); Adj EPS $0.27 (miss vs $0.39); single-family and multifamily starts down across key markets.'),
  sourceLink('Source', 'https://www.investing.com/news/company-news/builders-firstsource-q1-2026-slides-earnings-miss-amid-housing-slump-93CH-4650421'),

  articleHead('Amrize Q1 2026 — Revenue +4.7%, Building Materials +12.9% Organic (World Cement / Morningstar)'),
  para('Amrize Q1 2026 revenue rose 4.7%; Building Materials revenues hit $1.5 billion vs $1.329 billion (+12.9%) on higher cement and aggregates volumes. The Board declared its first quarterly dividend of $0.11 per share (payable May 20). The PB Materials acquisition (West Texas aggregates leader) contributed positively in Q1. Amrize reaffirmed FY2026 guidance.'),
  keyData('Revenue +4.7%; Building Materials revs $1.5B (+12.9%); first dividend $0.11/share; PB Materials integration on track.'),
  sourceLink('Source', 'https://www.worldcement.com/the-americas/30042026/amrize-grows-revenue-47-in-first-quarter-and-reaffirms-2026-guidance/'),

  h2('5. Product Innovation & Technology'),

  articleHead('Holcim Targets CHF 200M EBIT from AI by 2028; Calcined Clay Cements Scale (Holcim Investor Materials)'),
  para('Holcim disclosed a portfolio of 38 large-scale AI initiatives spanning production, logistics, commercial, and administrative functions, targeting CHF 200 million in recurring EBIT benefits by 2028. Industry-wide, calcined clay is becoming standard in low-carbon cement formulations, and CLT/engineered timber adoption is accelerating with the global sustainable construction materials market projected to approach $1.4 trillion by 2034. 3D-printed construction has progressed to repeatable commercial use, cutting labor 50-70% and material waste up to 40%.'),
  sourceLink('Source', 'https://www.holcim.com/who-we-are/our-stories/construction-innovations-in-2026')
];

const sectionB = [
  h1('Section B: Market Health Drivers'),

  h2('Driver 1: Interest & Mortgage Rates'),
  articleHead('Fed Holds at 3.5-3.75% in Rare 8-4 Vote (CNBC / Federal Reserve)'),
  para('The FOMC voted on April 29, 2026 to hold the funds rate at 3.5%-3.75%. The 8-4 split is the highest dissent count since October 1992: Governor Miran voted for a 25 bp cut, while three other members objected to language suggesting eventual resumption of cuts. The statement noted: "Inflation is elevated, in part reflecting the recent increase in global energy prices" and that the Middle East conflict is "contributing to a high level of uncertainty about the economic outlook."'),
  para('This was likely Chair Jerome Powell\'s final meeting amid an upcoming leadership transition. Mortgage market reaction: 30-year purchase rate at 6.13-6.37% (Zillow/NerdWallet), 15-year 5.75%, 30-year refi 6.51%. Rates rose into May 1 on inflation concerns.'),
  pBold('Impact on Building Materials Sector:'),
  para('Higher-for-longer pressures residential starts (already evident in BLDR results) and weighs on Home Depot/Lowe\'s transaction volumes. Aggregates exposure to infrastructure (Martin Marietta, Vulcan) is the cleanest hedge against residential rate sensitivity.'),
  keyData('Funds rate 3.5-3.75%; vote 8-4; 30Y mortgage 6.13-6.37%; 30Y refi 6.51%.'),
  sourcesMulti('Sources', [
    'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260429a.htm',
    'https://www.cnbc.com/2026/04/29/fed-interest-rate-decision-april-2026.html'
  ]),

  h2('Driver 2: Labor Dynamics'),
  articleHead('Construction Needs ~349K New Workers in 2026; ICE Disruptions Hit 28% of Firms (ConstructionOwners / ABC)'),
  para('The U.S. construction industry must attract approximately 349,000 net new workers in 2026 to meet current demand, rising to 456,000 in 2027. Wage growth runs 4%+ YoY broadly, with specialty trades up 9-11%. Three structural pressures converge: an aging workforce, ICE enforcement activity, and skilled-labor demand from data center construction.'),
  para('28% of contractors reported workforce disruptions tied to ICE within the past six months; immigrants comprise 34% of the construction workforce and over 60% in drywall, roofing, and plastering. The HBI estimates the skilled labor shortage costs $10.8 billion annually in carrying costs and lost single-family production (~19,000 homes).'),
  pBold('Impact on Building Materials Sector:'),
  para('Labor scarcity directly compresses installed-product demand even when distribution inventory is plentiful (relevant for TopBuild, BLDR, Installed Building Products) and is a structural tailwind for prefabricated/modular building products and HVAC retrofit packages with reduced field labor.'),
  keyData('349K-456K new workers needed (2026-27); wage growth 4%+; ICE disrupted 28% of firms; immigrants 34% of workforce; $10.8B annual cost of shortage.'),
  sourceLink('Source', 'https://www.constructionowners.com/news/construction-workforce-crisis-deepens-in-2026-amid-labor-shortages-and-ice-raids'),

  h2('Driver 3: Material & Energy Costs'),
  articleHead('Energy Input Prices +21.4% in March, Largest Since June 2020 (Eye on Housing / NAHB)'),
  para('Energy input prices rose 21.4% in March, 20.8% above prior year — the largest monthly increase since June 2020. Driver: the Iran conflict that began February 28 has shocked global oil and gas supply chains and pushed crude near $100/barrel. Diesel was up 51.2% YoY; metal molding and trim +45.5%; aluminum +30.5%. Red Sea and Strait of Hormuz disruptions have lifted freight to pandemic-era levels, with copper and structural steel now carrying permanent shipping surcharges.'),
  pBold('Impact on Building Materials Sector:'),
  para('Energy is a 12-15% input cost for cement (Holcim, Martin Marietta) and a major driver of distribution costs (BLDR, Lowe\'s). Pricing power in aggregates (already at 4-6% organic ASP guidance from Martin Marietta) is partly required to offset this; HVAC OEMs (Carrier) face margin compression as tariff and energy pass-through lag.'),
  keyData('Energy input prices +21.4% MoM March; +20.8% YoY; diesel +51.2%; aluminum +30.5%; oil ~$100/bbl.'),
  sourceLink('Source', 'https://eyeonhousing.org/2026/04/higher-energy-prices-increase-residential-construction-costs/'),

  h2('Driver 4: Demand Visibility'),
  articleHead('New Home Sales 737K SAAR; 70% of Builders Describe Conditions as Weaker than Expected (Builder Magazine / NAHB)'),
  para('New home sales are running at a 737K SAAR with 7.9 months of supply — a "tight but declining" market. 40% of builders cut prices in January; 65% offered sales incentives. Roughly 70% of builders describe conditions as weaker than expected. Forecasters project ~1% growth in single-family starts and new home sales for 2026. The HMI builder confidence reading edged lower on affordability concerns.'),
  para('Zonda\'s January seasonally adjusted annualized new-home sales totaled 713,104, down 7.2% YoY. March 2026 housing starts (most recent available) jumped 10.8% MoM to 1.502M SAAR; permits fell 10.8% MoM to 1.372M — pointing to volatile and uneven demand visibility.'),
  pBold('Impact on Building Materials Sector:'),
  para('Direct read-through to BLDR\'s miss; pressure on Home Depot pro segment, JELD-WEN, Masco, Fortune Brands, Owens Corning insulation. Aggregates and HVAC commercial bookings are decoupling from residential.'),
  keyData('New home sales 737K SAAR; 7.9-month supply; 70% builders below expectations; March starts 1.502M SAAR (+10.8% MoM); permits -10.8% MoM.'),
  sourcesMulti('Sources', [
    'https://www.builderonline.com/data-analysis/stabilization-defines-2026-housing-outlook',
    'https://www.nahb.org/news-and-economics/press-releases/2026/02/builder-sentiment-edges-lower-on-affordability-concerns'
  ]),

  h2('Driver 5: Government Infrastructure Spending'),
  articleHead('IIJA Hits Peak Disbursement Year; +40% Heavy Civil Solicitations (DOT / ConstructionBids.ai)'),
  para('2026 marks IIJA\'s "shovels in the ground" peak disbursement year, with a 40% YoY increase in heavy civil solicitations vs 2024. The Act authorizes $1.2 trillion total ($550B in new spending above baseline) over FY2022-2026, including $350B in federal highway programs.'),
  para('Roads/bridges allocation includes $110B (with significant capacity for "off-system" county bridges in $2-10M contract sizes). Water/wastewater allocation ($55B) is driving lead pipe replacement urgency as State Revolving Fund grant deadlines approach. Caveat: federal funding cuts, freezes, and delays threaten select project timelines.'),
  pBold('Impact on Building Materials Sector:'),
  para('Direct demand engine for Vulcan, Martin Marietta, Eagle Materials, Heidelberg Materials, and steel reinforcement (Nucor, Steel Dynamics). Martin Marietta cited infrastructure as a Q1 driver of organic volume +7%.'),
  keyData('$1.2T total IIJA; $550B incremental; $350B highways; +40% heavy civil solicitations vs 2024.'),
  sourceLink('Source', 'https://www.transportation.gov/mission/budget/infrastructure-investment-and-jobs-act-iija-funding-status'),

  h2('Driver 6: Credit Availability & Lending Standards'),
  articleHead('Modest Net Tightening for Construction Loans; White House Pushes Eased Treatment for Residential (SLOOS / White House)'),
  para('The Federal Reserve\'s January 2026 Senior Loan Officer Opinion Survey reported modest net shares of banks expecting to tighten standards on construction and land development loans through 2026, with similar modest tightening reported for Q3 2025 and Q4 2025. Banks expect demand to strengthen across loan categories in 2026.'),
  para('The White House issued guidance in March 2026 directing federal banking regulators to revise supervisory guidance and exclude one-to-four-family residential construction lending from CRE concentration limits — an action aimed at unlocking community bank capacity.'),
  pBold('Impact on Building Materials Sector:'),
  para('Tighter commercial construction credit pinches mid-market projects but the residential carve-out is a tailwind for small-builder volume — directly relevant to BLDR, ABC Supply, lumber dealers, and the residential side of Home Depot pro.'),
  keyData('Modest net tightening C&LD loans (Q3, Q4 2025, 2026 expectations); March 2026 White House directive on residential construction lending guidance.'),
  sourcesMulti('Sources', [
    'https://www.federalreserve.gov/data/sloos/sloos-202601.htm',
    'https://www.whitehouse.gov/presidential-actions/2026/03/promoting-access-to-mortgage-credit/'
  ]),

  h2('Driver 7: GDP & Consumer Confidence'),
  articleHead('Conference Board CCI Edges Up to 92.8 in April (Conference Board)'),
  para('The Conference Board Consumer Confidence Index edged up 0.6 points to 92.8 in April 2026 (vs 92.2 in March). The Present Situation Index slipped 0.3 points to 123.8; the Expectations Index rose 1.2 points to 72.2. Labor market views improved (jobs "hard to get" fell to 19.8% from 21.3%).'),
  para('Chief Economist Dana Peterson noted "material concern about rising gasoline prices as the war in the Middle East prompted a surge in Brent crude oil prices." Conference Board now forecasts U.S. GDP growth at 1.6% YoY for 2026 (revised down).'),
  pBold('Impact on Building Materials Sector:'),
  para('Below-trend GDP and elevated price expectations limit demand recovery for big-ticket repair-and-remodel and DIY (Home Depot/Lowe\'s). The labor market resilience is a partial offset for builder confidence and pro-channel volume.'),
  keyData('CCI 92.8 (+0.6); Present Situation 123.8; Expectations 72.2; "jobs hard to get" 19.8% (down from 21.3%); 2026 GDP forecast 1.6%.'),
  sourceLink('Source', 'https://www.conference-board.org/topics/consumer-confidence/')
];

const tracker = [
  h1('Daily Trend Tracker'),
  para('Direction signals for each market driver based on today\'s articles:'),
  bullet('Interest & Mortgage Rates: → flat at 3.5-3.75%; mortgage rates ↑ slightly on inflation concerns (30Y at 6.13-6.37%)'),
  bullet('Labor Dynamics: tightening (349K worker gap; wages +4-11%; ICE disruption at 28% of firms)'),
  bullet('Material & Energy Costs: ↑ sharply (energy +21.4% MoM; diesel +51.2% YoY; aluminum +30.5%)'),
  bullet('Demand Visibility: weakening (BLDR miss; 70% of builders below expectations; CCI flat-to-soft)'),
  bullet('Government Infrastructure Spending: expanding (IIJA peak year; +40% heavy civil solicitations)'),
  bullet('Credit Availability: mixed — modest tightening for construction; easing directive for residential'),
  bullet('GDP & Consumer Confidence: stable-to-soft (CCI +0.6 to 92.8; GDP forecast 1.6%)')
];

const footer = [
  new Paragraph({
    spacing: { before: 360, after: 120 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: '2E7D32', space: 1 } },
    children: [new TextRun({ text: '', font: 'Arial', size: 22 })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'Compiled by Jarvis AI — Building Materials & Building Products Daily Monitor', italics: true, font: 'Arial', size: 20 })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: 'This document is part of the Building Materials & Building Products knowledge repository for the semi-annual industry report.', italics: true, font: 'Arial', size: 20 })]
  })
];

const doc = new Document({
  creator: 'Jarvis AI',
  title: 'Building Materials & Building Products Day in Review — May 1, 2026',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: '1F4E2C' },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '2E7D32' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '1B5E20' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
    ]
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      ...titleBlock,
      ...execSummary,
      ...sectionA,
      ...sectionB,
      ...tracker,
      ...footer
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log('Wrote:', OUT, 'Size:', buf.length);
});
