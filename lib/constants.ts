/**
 * Single source of truth for the 35 tracked companies.
 * Import from here instead of duplicating company lists across scripts.
 */

export interface TrackedCompany {
  company: string;
  ticker: string;
  segment: string;
  category: "materials" | "products";
  country: string;
}

export const TRACKED_COMPANIES: TrackedCompany[] = [
  // Aggregates & Cement
  { company: "CRH", ticker: "CRH", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "IE" },
  { company: "CEMEX", ticker: "CX", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "MX" },
  { company: "Heidelberg Materials", ticker: "HEI.DE", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "DE" },
  { company: "Holcim", ticker: "HOLN.SW", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "CH" },
  { company: "Martin Marietta", ticker: "MLM", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "US" },
  { company: "Taiheiyo Cement", ticker: "5233.T", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "JP" },
  { company: "Vulcan Materials", ticker: "VMC", segment: "Cement, Aggregates and Ready-mix Concrete", category: "materials", country: "US" },
  // Glass & Insulation
  { company: "AGC", ticker: "5201.T", segment: "Glass", category: "materials", country: "JP" },
  { company: "Owens Corning", ticker: "OC", segment: "Glass", category: "materials", country: "US" },
  { company: "Saint-Gobain", ticker: "SGO.PA", segment: "Glass", category: "materials", country: "FR" },
  // Wood & Lumber
  { company: "Canfor", ticker: "CFP.TO", segment: "Lumber and Wood", category: "materials", country: "CA" },
  { company: "Interfor", ticker: "IFP.TO", segment: "Lumber and Wood", category: "materials", country: "CA" },
  { company: "UFP Industries", ticker: "UFPI", segment: "Lumber and Wood", category: "materials", country: "US" },
  { company: "West Fraser", ticker: "WFG.TO", segment: "Lumber and Wood", category: "materials", country: "CA" },
  { company: "Weyerhaeuser", ticker: "WY", segment: "Lumber and Wood", category: "materials", country: "US" },
  // Steel & Metals
  { company: "ArcelorMittal", ticker: "MT", segment: "Steel", category: "materials", country: "LU" },
  { company: "Nucor", ticker: "NUE", segment: "Steel", category: "materials", country: "US" },
  { company: "Steel Dynamics", ticker: "STLD", segment: "Steel", category: "materials", country: "US" },
  { company: "Wienerberger", ticker: "WIE.VI", segment: "Bricks and Masonry", category: "materials", country: "AT" },
  // Building Products & Distribution
  { company: "Builders FirstSource", ticker: "BLDR", segment: "Building Envelope, Roofing, Siding, Flooring and Insulation", category: "products", country: "US" },
  { company: "Carlisle Companies", ticker: "CSL", segment: "Building Envelope, Roofing, Siding, Flooring and Insulation", category: "products", country: "US" },
  { company: "Kingspan", ticker: "KRX.IR", segment: "Building Envelope, Roofing, Siding, Flooring and Insulation", category: "products", country: "IE" },
  { company: "QXO", ticker: "QXO", segment: "Building Envelope, Roofing, Siding, Flooring and Insulation", category: "products", country: "US" },
  // Doors, Windows & Security
  { company: "ASSA ABLOY", ticker: "ASSA-B.ST", segment: "Doors and Windows", category: "products", country: "SE" },
  { company: "JELD-WEN", ticker: "JWEN", segment: "Doors and Windows", category: "products", country: "US" },
  { company: "LIXIL", ticker: "5938.T", segment: "Doors and Windows", category: "products", country: "JP" },
  { company: "Sanwa Holdings", ticker: "5929.T", segment: "Doors and Windows", category: "products", country: "JP" },
  // Plumbing, Drainage & Fixtures
  { company: "Advanced Drainage Systems", ticker: "WMS", segment: "Piping", category: "products", country: "US" },
  { company: "Geberit", ticker: "GEBN.SW", segment: "Kitchen and Bath", category: "products", country: "CH" },
  { company: "Fortune Brands", ticker: "FBIN", segment: "Kitchen and Bath", category: "products", country: "US" },
  { company: "Masco", ticker: "MAS", segment: "Kitchen and Bath", category: "products", country: "US" },
  // HVAC & Climate
  { company: "Carrier Global", ticker: "CARR", segment: "HVAC-R, Fire and Security", category: "products", country: "US" },
  { company: "Daikin Industries", ticker: "6367.T", segment: "HVAC-R, Fire and Security", category: "products", country: "JP" },
  { company: "Johnson Controls", ticker: "JCI", segment: "HVAC-R, Fire and Security", category: "products", country: "US" },
  { company: "Trane Technologies", ticker: "TT", segment: "HVAC-R, Fire and Security", category: "products", country: "US" },
];

/** Set of company names for quick membership checks */
export const TRACKED_COMPANY_NAMES = new Set(TRACKED_COMPANIES.map(c => c.company));

/** Yahoo Finance ticker mapping for international stocks */
export const YAHOO_TICKER_MAP: Record<string, string> = {
  "HEI.DE": "HEI.DE",
  "HOLN.SW": "HOLN.SW",
  "5233.T": "5233.T",
  "5201.T": "5201.T",
  "SGO.PA": "SGO.PA",
  "CFP.TO": "CFP.TO",
  "IFP.TO": "IFP.TO",
  "WFG.TO": "WFG.TO",
  "ASSA-B.ST": "ASSA-B.ST",
  "5938.T": "5938.T",
  "5929.T": "5929.T",
  "GEBN.SW": "GEBN.SW",
  "WIE.VI": "WIE.VI",
  "6367.T": "6367.T",
  "KRX.IR": "KRX.IR",
};

export function getYahooTicker(ticker: string): string {
  return YAHOO_TICKER_MAP[ticker] || ticker;
}
