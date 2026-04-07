export interface EarningsDate {
  company: string;
  ticker: string;
  date: string;       // YYYY-MM-DD
  quarter: string;    // e.g. "Q1 2026"
  estimated: boolean; // true if date is estimated
}

// Static earnings calendar for tracked companies.
// Last updated: 2026-04-07. 27 confirmed, 8 estimated.
// Update quarterly as companies confirm actual dates.
const earningsSchedule: EarningsDate[] = [
  // --- Aggregates & Cement ---
  { company: "CRH", ticker: "CRH", date: "2026-05-13", quarter: "Q1 2026", estimated: false },
  { company: "CEMEX", ticker: "CX", date: "2026-04-27", quarter: "Q1 2026", estimated: false },
  { company: "Heidelberg Materials", ticker: "HEI.DE", date: "2026-05-06", quarter: "Q1 2026 Trading Update", estimated: false },
  { company: "Holcim", ticker: "HOLN.SW", date: "2026-04-25", quarter: "Q1 2026 Sales Update", estimated: true },
  { company: "Martin Marietta", ticker: "MLM", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
  { company: "Taiheiyo Cement", ticker: "5233.T", date: "2026-05-12", quarter: "FY2026 Full Year", estimated: false },
  { company: "Vulcan Materials", ticker: "VMC", date: "2026-04-29", quarter: "Q1 2026", estimated: false },

  // --- Glass & Insulation ---
  { company: "AGC Inc", ticker: "5201.T", date: "2026-05-07", quarter: "FY2025 Full Year", estimated: false },
  { company: "Owens Corning", ticker: "OC", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
  { company: "Saint-Gobain", ticker: "SGO.PA", date: "2026-04-23", quarter: "Q1 2026 Sales", estimated: false },

  // --- Wood & Lumber ---
  { company: "Canfor", ticker: "CFP.TO", date: "2026-05-06", quarter: "Q1 2026", estimated: false },
  { company: "Interfor", ticker: "IFP.TO", date: "2026-05-07", quarter: "Q1 2026", estimated: false },
  { company: "UFP Industries", ticker: "UFPI", date: "2026-05-05", quarter: "Q1 2026", estimated: false },
  { company: "West Fraser", ticker: "WFG.TO", date: "2026-04-21", quarter: "Q1 2026", estimated: false },
  { company: "Weyerhaeuser", ticker: "WY", date: "2026-04-30", quarter: "Q1 2026", estimated: false },

  // --- Steel & Metals ---
  { company: "ArcelorMittal", ticker: "MT", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Nucor", ticker: "NUE", date: "2026-04-27", quarter: "Q1 2026", estimated: false },
  { company: "Steel Dynamics", ticker: "STLD", date: "2026-04-20", quarter: "Q1 2026", estimated: false },
  { company: "Wienerberger", ticker: "WIE.VI", date: "2026-05-13", quarter: "Q1 2026", estimated: false },

  // --- Building Products & Distribution ---
  { company: "Builders FirstSource", ticker: "BLDR", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Carlisle Companies", ticker: "CSL", date: "2026-04-23", quarter: "Q1 2026", estimated: false },
  { company: "Kingspan", ticker: "KRX.IR", date: "2026-05-08", quarter: "Q1 2026 Trading Update", estimated: true },
  { company: "QXO", ticker: "QXO", date: "2026-05-07", quarter: "Q1 2026", estimated: true },

  // --- Doors, Windows & Security ---
  { company: "ASSA ABLOY", ticker: "ASSA-B.ST", date: "2026-04-28", quarter: "Q1 2026", estimated: false },
  { company: "JELD-WEN", ticker: "JWEN", date: "2026-05-04", quarter: "Q1 2026", estimated: true },
  { company: "LIXIL", ticker: "5938.T", date: "2026-04-30", quarter: "FY2026 Full Year", estimated: false },
  { company: "Sanwa Holdings", ticker: "5929.T", date: "2026-05-14", quarter: "FY2026 Full Year", estimated: true },

  // --- Plumbing, Drainage & Fixtures ---
  { company: "Advanced Drainage Systems", ticker: "WMS", date: "2026-05-14", quarter: "Q4 FY2026", estimated: false },
  { company: "Geberit", ticker: "GEBN.SW", date: "2026-05-05", quarter: "Q1 2026", estimated: false },
  { company: "Fortune Brands", ticker: "FBIN", date: "2026-04-29", quarter: "Q1 2026", estimated: true },
  { company: "Masco", ticker: "MAS", date: "2026-04-22", quarter: "Q1 2026", estimated: false },

  // --- HVAC & Climate ---
  { company: "Carrier Global", ticker: "CARR", date: "2026-04-30", quarter: "Q1 2026", estimated: false },
  { company: "Daikin Industries", ticker: "6367.T", date: "2026-05-12", quarter: "FY2026 Full Year", estimated: false },
  { company: "Johnson Controls", ticker: "JCI", date: "2026-05-01", quarter: "Q2 FY2026", estimated: true },
  { company: "Trane Technologies", ticker: "TT", date: "2026-04-29", quarter: "Q1 2026", estimated: false },
];

export function getUpcomingEarnings(limit = 10): EarningsDate[] {
  const today = new Date().toISOString().slice(0, 10);
  return earningsSchedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
