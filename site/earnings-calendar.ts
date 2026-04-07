export interface EarningsDate {
  company: string;
  ticker: string;
  date: string;       // YYYY-MM-DD
  quarter: string;    // e.g. "Q1 2026"
  estimated: boolean; // true if date is estimated
}

// Static earnings calendar for tracked companies.
// Dates are best estimates based on historical reporting patterns.
// Update quarterly as companies confirm actual dates.
const earningsSchedule: EarningsDate[] = [
  // --- Aggregates & Cement ---
  { company: "CRH", ticker: "CRH", date: "2026-05-07", quarter: "Q1 2026", estimated: true },
  { company: "CEMEX", ticker: "CX", date: "2026-04-24", quarter: "Q1 2026", estimated: true },
  { company: "Heidelberg Materials", ticker: "HEI.DE", date: "2026-05-07", quarter: "Q1 2026", estimated: true },
  { company: "Holcim", ticker: "HOLN.SW", date: "2026-04-29", quarter: "Q1 2026", estimated: true },
  { company: "Martin Marietta", ticker: "MLM", date: "2026-04-28", quarter: "Q1 2026", estimated: true },
  { company: "Taiheiyo Cement", ticker: "5233.T", date: "2026-05-13", quarter: "FY2026", estimated: true },
  { company: "Vulcan Materials", ticker: "VMC", date: "2026-04-29", quarter: "Q1 2026", estimated: true },

  // --- Glass & Insulation ---
  { company: "AGC Inc", ticker: "5201.T", date: "2026-05-12", quarter: "Q1 2026", estimated: true },
  { company: "Owens Corning", ticker: "OC", date: "2026-04-23", quarter: "Q1 2026", estimated: true },
  { company: "Saint-Gobain", ticker: "SGO.PA", date: "2026-04-24", quarter: "Q1 2026", estimated: true },

  // --- Wood & Lumber ---
  { company: "Canfor", ticker: "CFP.TO", date: "2026-04-30", quarter: "Q1 2026", estimated: true },
  { company: "Interfor", ticker: "IFP.TO", date: "2026-05-06", quarter: "Q1 2026", estimated: true },
  { company: "UFP Industries", ticker: "UFPI", date: "2026-04-22", quarter: "Q1 2026", estimated: true },
  { company: "West Fraser", ticker: "WFG.TO", date: "2026-04-23", quarter: "Q1 2026", estimated: true },
  { company: "Weyerhaeuser", ticker: "WY", date: "2026-04-24", quarter: "Q1 2026", estimated: true },

  // --- Steel & Metals ---
  { company: "ArcelorMittal", ticker: "MT", date: "2026-05-08", quarter: "Q1 2026", estimated: true },
  { company: "Nucor", ticker: "NUE", date: "2026-04-21", quarter: "Q1 2026", estimated: true },
  { company: "Steel Dynamics", ticker: "STLD", date: "2026-04-22", quarter: "Q1 2026", estimated: true },
  { company: "Wienerberger", ticker: "WIE.VI", date: "2026-05-06", quarter: "Q1 2026", estimated: true },

  // --- Building Products & Distribution ---
  { company: "Builders FirstSource", ticker: "BLDR", date: "2026-05-05", quarter: "Q1 2026", estimated: true },
  { company: "Carlisle Companies", ticker: "CSL", date: "2026-04-23", quarter: "Q1 2026", estimated: true },
  { company: "Kingspan", ticker: "KRX.IR", date: "2026-05-08", quarter: "Q1 2026", estimated: true },
  { company: "QXO", ticker: "QXO", date: "2026-05-07", quarter: "Q1 2026", estimated: true },

  // --- Doors, Windows & Security ---
  { company: "ASSA ABLOY", ticker: "ASSA-B.ST", date: "2026-04-24", quarter: "Q1 2026", estimated: true },
  { company: "JELD-WEN", ticker: "JWEN", date: "2026-05-05", quarter: "Q1 2026", estimated: true },
  { company: "LIXIL", ticker: "5938.T", date: "2026-05-13", quarter: "FY2026", estimated: true },
  { company: "Sanwa Holdings", ticker: "5929.T", date: "2026-05-12", quarter: "FY2026", estimated: true },

  // --- Plumbing, Drainage & Fixtures ---
  { company: "Advanced Drainage Systems", ticker: "WMS", date: "2026-05-07", quarter: "Q4 FY2026", estimated: true },
  { company: "Geberit", ticker: "GEBN.SW", date: "2026-04-29", quarter: "Q1 2026", estimated: true },
  { company: "Fortune Brands", ticker: "FBIN", date: "2026-04-28", quarter: "Q1 2026", estimated: true },
  { company: "Masco", ticker: "MAS", date: "2026-04-28", quarter: "Q1 2026", estimated: true },

  // --- HVAC & Climate ---
  { company: "Carrier Global", ticker: "CARR", date: "2026-04-23", quarter: "Q1 2026", estimated: true },
  { company: "Daikin Industries", ticker: "6367.T", date: "2026-05-14", quarter: "FY2026", estimated: true },
  { company: "Johnson Controls", ticker: "JCI", date: "2026-04-30", quarter: "Q2 FY2026", estimated: true },
  { company: "Trane Technologies", ticker: "TT", date: "2026-04-23", quarter: "Q1 2026", estimated: true },
];

export function getUpcomingEarnings(limit = 10): EarningsDate[] {
  const today = new Date().toISOString().slice(0, 10);
  return earningsSchedule
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
