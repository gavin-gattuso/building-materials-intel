/**
 * Foundational Knowledge Configuration Template
 *
 * This config defines the 25 evergreen reference articles that seed
 * "20+ year expert" knowledge for an industry. The same structure
 * works for any industry — swap the articles and synonyms.
 *
 * Usage: Import this config in generate-foundational.ts
 */

export interface ArticleSpec {
  filename: string;
  title: string;
  category: string;
  keyTopics: string[];
  timeRange: string;
  dataTables: string[];
  crosslinks: string[];
}

export interface FoundationalConfig {
  industry: string;
  industryLabel: string;
  categories: { id: string; label: string }[];
  articles: ArticleSpec[];
  synonyms: Record<string, string[]>;
}

export const buildingMaterialsConfig: FoundationalConfig = {
  industry: "building-materials",
  industryLabel: "Building Materials & Building Products",
  categories: [
    { id: "industry-cycles", label: "Industry Cycles & Macro History" },
    { id: "supply-chain", label: "Industry Structure & Supply Chain" },
    { id: "consolidation", label: "M&A & Consolidation History" },
    { id: "regulation", label: "Regulatory & Policy History" },
    { id: "technology", label: "Technology & Structural Trends" },
    { id: "regional", label: "Regional & Segment Dynamics" },
  ],
  articles: [
    // === A. Industry Cycles & Macro History (5) ===
    {
      filename: "housing-cycles-1970-2025",
      title: "Housing Cycles 1970-2025",
      category: "industry-cycles",
      keyTopics: ["housing starts by decade", "boom/bust duration patterns", "leading indicators", "S&L crisis", "2005-06 peak", "2008-11 trough", "COVID whipsaw"],
      timeRange: "1970-2025",
      dataTables: ["Housing starts by decade (peak/trough/average)", "Major cycle dates with duration and amplitude"],
      crosslinks: ["materials-pricing-cycles", "recession-playbook-building-materials", "interest-rate-housing-relationship"],
    },
    {
      filename: "commercial-construction-cycles",
      title: "Commercial Construction Cycles",
      category: "industry-cycles",
      keyTopics: ["office/retail/industrial/data center waves", "how commercial lags residential", "vacancy-to-construction feedback", "institutional vs speculative"],
      timeRange: "1990-2025",
      dataTables: ["Non-residential construction spending by segment (2000-2025)", "Commercial cycle timing vs residential"],
      crosslinks: ["housing-cycles-1970-2025", "regional-construction-dynamics"],
    },
    {
      filename: "materials-pricing-cycles",
      title: "Materials Pricing Cycles",
      category: "industry-cycles",
      keyTopics: ["lumber/steel/cement/aggregates pricing 20-year patterns", "typical cycle length and amplitude", "leading indicators", "2020-22 lumber supercycle", "PPI construction inputs"],
      timeRange: "2000-2025",
      dataTables: ["Key material price indices (2000-2025) with peak/trough", "Lumber futures vs housing starts correlation"],
      crosslinks: ["housing-cycles-1970-2025", "steel-construction-supply-dynamics", "lumber-supply-chain-economics"],
    },
    {
      filename: "recession-playbook-building-materials",
      title: "Recession Playbook: Building Materials",
      category: "industry-cycles",
      keyTopics: ["how each material category performs in downturns", "which segments lead/lag recovery", "2001 vs 2008 vs 2020 comparison", "defensive vs cyclical positioning"],
      timeRange: "2001-2025",
      dataTables: ["Revenue/volume decline by segment in each recession", "Recovery sequence timeline"],
      crosslinks: ["housing-cycles-1970-2025", "materials-pricing-cycles", "interest-rate-housing-relationship"],
    },
    {
      filename: "interest-rate-housing-relationship",
      title: "Interest Rates and Housing: The Historical Relationship",
      category: "industry-cycles",
      keyTopics: ["historical rate levels vs starts", "affordability equation", "rate lock-in effect", "how rate changes propagate through supply chain", "mortgage rate thresholds"],
      timeRange: "1980-2025",
      dataTables: ["30-year mortgage rate vs housing starts (1980-2025)", "Affordability index over time"],
      crosslinks: ["housing-cycles-1970-2025", "recession-playbook-building-materials"],
    },

    // === B. Industry Structure & Supply Chain (5) ===
    {
      filename: "building-materials-value-chain",
      title: "Building Materials Value Chain",
      category: "supply-chain",
      keyTopics: ["extraction to jobsite flow", "margin profiles at each stage", "where value concentrates", "vertical integration trends", "logistics cost as % of delivered price"],
      timeRange: "evergreen",
      dataTables: ["Value chain stages with typical margins", "Logistics cost share by material type"],
      crosslinks: ["distribution-channel-evolution", "cement-concrete-industry-structure"],
    },
    {
      filename: "distribution-channel-evolution",
      title: "Distribution Channel Evolution",
      category: "supply-chain",
      keyTopics: ["two-step vs one-step", "pro vs retail", "Home Depot/Lowe's transformation", "specialty distribution rise", "e-commerce disruption", "pro channel convergence"],
      timeRange: "1980-2025",
      dataTables: ["Market share by channel type (2000 vs 2010 vs 2020 vs 2025)", "Top distributors by revenue"],
      crosslinks: ["building-materials-value-chain", "building-materials-consolidation-waves"],
    },
    {
      filename: "cement-concrete-industry-structure",
      title: "Cement & Concrete Industry Structure",
      category: "supply-chain",
      keyTopics: ["plant economics and capital intensity", "geographic moats and transport radius", "import dynamics", "clinker substitution", "why cement is local", "pricing power mechanics"],
      timeRange: "evergreen",
      dataTables: ["US cement capacity by producer", "Import share by region", "Typical plant economics"],
      crosslinks: ["building-materials-value-chain", "building-materials-consolidation-waves", "international-players-us-market"],
    },
    {
      filename: "lumber-supply-chain-economics",
      title: "Lumber Supply Chain Economics",
      category: "supply-chain",
      keyTopics: ["timberland ownership structure", "sawmill capacity and utilization", "Canadian softwood lumber dispute history", "lumber futures as leading indicator", "species mix evolution"],
      timeRange: "1980-2025",
      dataTables: ["US and Canadian lumber production (2000-2025)", "Softwood lumber agreement timeline", "Top timberland owners"],
      crosslinks: ["materials-pricing-cycles", "trade-policy-building-materials"],
    },
    {
      filename: "steel-construction-supply-dynamics",
      title: "Steel in Construction: Supply Dynamics",
      category: "supply-chain",
      keyTopics: ["EAF vs BOF economics", "scrap pricing dynamics", "domestic vs import competition", "Section 232 history and market effects", "rebar/structural vs flat-rolled", "construction share of steel demand"],
      timeRange: "2000-2025",
      dataTables: ["US steel production by process (EAF vs BOF)", "Import penetration rate (2000-2025)", "Construction steel demand as % of total"],
      crosslinks: ["materials-pricing-cycles", "trade-policy-building-materials"],
    },

    // === C. M&A & Consolidation History (4) ===
    {
      filename: "building-materials-consolidation-waves",
      title: "Building Materials Consolidation Waves",
      category: "consolidation",
      keyTopics: ["1990s cement roll-ups", "2000s distribution consolidation", "2010s building products platforms", "2020s cross-category deals", "megadeal timeline", "CR4 concentration ratios"],
      timeRange: "1990-2025",
      dataTables: ["Top 20 deals by value with year and rationale", "Market concentration by segment over time"],
      crosslinks: ["private-equity-building-materials", "international-players-us-market", "distribution-channel-evolution"],
    },
    {
      filename: "private-equity-building-materials",
      title: "Private Equity in Building Materials",
      category: "consolidation",
      keyTopics: ["PE playbook in building products", "platform builds (Beacon, SRS, ABC Supply)", "typical hold periods", "entry multiples over time", "exit patterns", "buy-and-build strategy"],
      timeRange: "2000-2025",
      dataTables: ["Major PE-backed platforms with entry/exit dates and returns", "Average deal multiples by year"],
      crosslinks: ["building-materials-consolidation-waves", "distribution-channel-evolution"],
    },
    {
      filename: "homebuilder-consolidation-impact",
      title: "Homebuilder Consolidation and Its Impact on Materials",
      category: "consolidation",
      keyTopics: ["top 10 builders market share over time", "how builder consolidation affects procurement", "national accounts vs local buying", "supplier power dynamics", "builder vertical integration"],
      timeRange: "2000-2025",
      dataTables: ["Top 10 homebuilder market share (2000 vs 2010 vs 2020 vs 2025)", "National account penetration rates"],
      crosslinks: ["housing-cycles-1970-2025", "distribution-channel-evolution"],
    },
    {
      filename: "international-players-us-market",
      title: "International Players in the US Market",
      category: "consolidation",
      keyTopics: ["European companies US expansion (CRH, Holcim, HeidelbergCement, Saint-Gobain)", "Asian companies (Daikin, LIXIL, Sanwa)", "cross-border M&A patterns", "motivations and challenges", "currency effects"],
      timeRange: "1990-2025",
      dataTables: ["Major cross-border acquisitions timeline", "Foreign-owned market share by segment"],
      crosslinks: ["building-materials-consolidation-waves", "cement-concrete-industry-structure"],
    },

    // === D. Regulatory & Policy History (4) ===
    {
      filename: "building-code-evolution",
      title: "Building Code Evolution and Material Impacts",
      category: "regulation",
      keyTopics: ["IBC/IRC evolution", "energy code tightening (IECC)", "material specification impacts", "spray foam adoption", "continuous insulation mandates", "fire code changes", "accessibility requirements"],
      timeRange: "1990-2025",
      dataTables: ["Major code cycle changes and material impacts", "IECC stringency progression"],
      crosslinks: ["sustainability-decarbonization-building", "offsite-construction-evolution"],
    },
    {
      filename: "trade-policy-building-materials",
      title: "Trade Policy and Building Materials",
      category: "regulation",
      keyTopics: ["softwood lumber disputes (1982-present)", "Section 232 steel/aluminum (2018-present)", "anti-dumping cases (Chinese drywall, Turkish rebar)", "IEEPA tariffs", "USMCA provisions", "countervailing duties"],
      timeRange: "1982-2025",
      dataTables: ["Major trade actions timeline with material and rate", "Import volumes before/after tariffs"],
      crosslinks: ["lumber-supply-chain-economics", "steel-construction-supply-dynamics"],
    },
    {
      filename: "environmental-regulation-impact",
      title: "Environmental Regulation Impact on Building Materials",
      category: "regulation",
      keyTopics: ["EPA effects on manufacturing", "silica dust rule", "cement MACT standards", "embodied carbon policies", "clean air regulations on kilns", "OSHA in construction", "ESG reporting requirements"],
      timeRange: "1990-2025",
      dataTables: ["Key environmental regulations affecting building materials", "Compliance cost estimates by sector"],
      crosslinks: ["sustainability-decarbonization-building", "cement-concrete-industry-structure"],
    },
    {
      filename: "infrastructure-policy-history",
      title: "Infrastructure Policy History and Materials Impact",
      category: "regulation",
      keyTopics: ["ISTEA to IIJA progression", "authorization vs appropriation vs spending lag", "highway bill effects on aggregates/cement/steel", "heavy-side vs light-side materials", "state DOT spending patterns"],
      timeRange: "1991-2025",
      dataTables: ["Major infrastructure bills with total authorization", "Public construction spending by year"],
      crosslinks: ["cement-concrete-industry-structure", "steel-construction-supply-dynamics", "regional-construction-dynamics"],
    },

    // === E. Technology & Structural Trends (4) ===
    {
      filename: "offsite-construction-evolution",
      title: "Offsite Construction Evolution",
      category: "technology",
      keyTopics: ["manufactured housing history", "modular construction adoption curves", "CLT/mass timber emergence", "3D printing pilots", "why prefab has 'always been 5 years away'", "what's different now", "labor shortage as catalyst"],
      timeRange: "1970-2025",
      dataTables: ["Modular construction market share over time", "CLT projects by year", "Manufactured housing as % of starts"],
      crosslinks: ["labor-shortage-structural-drivers", "building-code-evolution"],
    },
    {
      filename: "digitalization-building-materials",
      title: "Digitalization in Building Materials",
      category: "technology",
      keyTopics: ["BIM adoption curve", "e-commerce in distribution", "IoT in building products", "digital estimating/takeoff", "ERP modernization", "supply chain visibility tools"],
      timeRange: "2005-2025",
      dataTables: ["BIM adoption rates by firm size", "E-commerce penetration in building materials distribution"],
      crosslinks: ["distribution-channel-evolution", "offsite-construction-evolution"],
    },
    {
      filename: "sustainability-decarbonization-building",
      title: "Sustainability and Decarbonization in Building",
      category: "technology",
      keyTopics: ["embodied carbon movement", "green cement/concrete alternatives", "mass timber as carbon sink", "EPD adoption", "LEED/green certification history", "buy clean policies", "Scope 1/2/3 in materials"],
      timeRange: "2000-2025",
      dataTables: ["Embodied carbon by material type", "Green building certification growth", "Buy clean policy adoption by state"],
      crosslinks: ["cement-concrete-industry-structure", "building-code-evolution", "environmental-regulation-impact"],
    },
    {
      filename: "labor-shortage-structural-drivers",
      title: "Construction Labor Shortage: Structural Drivers",
      category: "technology",
      keyTopics: ["demographic shift in trades", "immigration policy effects", "productivity trends in construction", "automation adoption barriers", "training pipeline gaps", "wage premium erosion", "aging workforce"],
      timeRange: "2000-2025",
      dataTables: ["Construction employment vs output (2000-2025)", "Age distribution of construction workers", "Unfilled job openings trend"],
      crosslinks: ["offsite-construction-evolution", "housing-cycles-1970-2025"],
    },

    // === F. Regional & Segment Dynamics (3) ===
    {
      filename: "regional-construction-dynamics",
      title: "Regional Construction Dynamics",
      category: "regional",
      keyTopics: ["Sun Belt migration 30-year boom", "Rust Belt stabilization", "coastal vs interior cost structures", "climate-driven demand shifts", "state-level permit trends", "population growth as leading indicator"],
      timeRange: "1990-2025",
      dataTables: ["Construction spending by region (2000-2025)", "Permits by state/region trend", "Population migration patterns"],
      crosslinks: ["housing-cycles-1970-2025", "commercial-construction-cycles"],
    },
    {
      filename: "residential-vs-commercial-materials",
      title: "Residential vs Commercial Materials",
      category: "regional",
      keyTopics: ["product overlap and divergence", "how multifamily blurs the line", "material mix by building type", "how segment shifts affect companies", "wood vs steel vs concrete framing"],
      timeRange: "evergreen",
      dataTables: ["Material consumption by building type", "Framing material market share by segment"],
      crosslinks: ["building-materials-value-chain", "housing-cycles-1970-2025", "commercial-construction-cycles"],
    },
    {
      filename: "repair-remodel-market-structure",
      title: "Repair & Remodel Market Structure",
      category: "regional",
      keyTopics: ["R&R as ~50% of construction spend", "age-of-housing-stock driver", "aging-in-place trends", "insurance/storm repair cycles", "LIRA index", "pro vs DIY split evolution"],
      timeRange: "2000-2025",
      dataTables: ["R&R spending vs new construction (2000-2025)", "Housing stock age distribution", "Pro vs DIY market share"],
      crosslinks: ["distribution-channel-evolution", "housing-cycles-1970-2025", "regional-construction-dynamics"],
    },
  ],
  synonyms: {
    "cycle": ["cycle", "cycles", "cyclical", "boom", "bust", "downturn", "recovery", "recession", "historical"],
    "supply chain": ["supply chain", "value chain", "distribution", "logistics", "channel"],
    "consolidation": ["consolidation", "roll-up", "rollup", "platform", "private equity"],
    "regulation": ["regulation", "code", "building code", "compliance", "epa", "osha", "ibc"],
    "technology": ["technology", "innovation", "prefab", "modular", "offsite", "bim", "digitalization", "3d printing"],
    "sustainability": ["sustainability", "decarbonization", "embodied carbon", "green", "epd", "leed", "net zero"],
  },
};
