/**
 * Generate inline-SVG charts (no JS/CDN — print-deterministic) and inject them
 * into H1_2026_Report_Print.html, writing H1_2026_Report_print_built.html.
 * Data are verified figures from the AV knowledge base (Jan–Jun 2026 / FY 2025).
 * Run: node scripts/build-h1-2026-charts.mjs
 */
import { readFileSync, writeFileSync } from "fs";

const DIR = "knowledge-base/outputs/h1-2026-prep";
const C = { dark:"#163E2D", mid:"#2E7D52", light:"#4CAF7D", pos:"#2E7D52", amber:"#B84700",
  neg:"#C62828", zero:"#9AA5A0", grid:"#E2E8E4", axis:"#9AA5A0", txt:"#555", txt3:"#777", fedline:"#9CB7A8" };
const esc = s => String(s);

/* ---------- line chart ---------- */
function lineChart({ w=640, h=250, yMin, yMax, yTicks, yFmt=(v=>v), xLabels, series, baseline }) {
  const padL=56, padR=20, padT=22, padB=42;
  const pw=w-padL-padR, ph=h-padT-padB, n=xLabels.length;
  const xAt = i => padL + (n===1 ? pw/2 : i*pw/(n-1));
  const yAt = v => padT + (1-(v-yMin)/(yMax-yMin))*ph;
  let s = "";
  // gridlines + y labels
  for (const t of yTicks) {
    const y = yAt(t).toFixed(1);
    s += `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${padL-8}" y="${(+y+3).toFixed(1)}" text-anchor="end" font-size="10" fill="${C.txt3}">${esc(yFmt(t))}</text>`;
  }
  // baseline
  if (baseline) {
    const y = yAt(baseline.value).toFixed(1);
    s += `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="${C.neg}" stroke-width="1.3" stroke-dasharray="5 4"/>`;
    s += `<text x="${w-padR}" y="${(+y-5).toFixed(1)}" text-anchor="end" font-size="9" fill="${C.neg}">${esc(baseline.label)}</text>`;
  }
  // x labels
  xLabels.forEach((lb,i)=>{ s += `<text x="${xAt(i).toFixed(1)}" y="${h-padB+18}" text-anchor="middle" font-size="10" fill="${C.txt}">${esc(lb)}</text>`; });
  // series
  for (const ser of series) {
    const pts = ser.data.map((v,i)=>`${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="${ser.color}" stroke-width="${ser.dashed?2:2.6}"${ser.dashed?' stroke-dasharray="6 4"':''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (ser.showPoints) ser.data.forEach((v,i)=>{ s += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3.4" fill="#fff" stroke="${ser.color}" stroke-width="2"/>`; });
  }
  // legend
  if (series.length>1) {
    let lx=padL;
    series.forEach(ser=>{ s += `<rect x="${lx}" y="6" width="11" height="11" rx="2" fill="${ser.color}"/>`+
      `<text x="${lx+15}" y="15" font-size="9.5" fill="${C.txt}">${esc(ser.name)}</text>`; lx += 16 + ser.name.length*5.3 + 16; });
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${s}</svg>`;
}

/* ---------- horizontal bar chart ---------- */
function barChartH({ w=640, items, xFmt=(v=>v), dMin, dMax }) {
  const padL=190, padR=58, padT=8, padB=8, rowH=22, gap=6;
  const ph = items.length*(rowH+gap)-gap;
  const h = ph+padT+padB+16;
  const x0=padL, xR=w-padR;
  const xAt = v => x0 + (v-dMin)/(dMax-dMin)*(xR-x0);
  const zx = xAt(0).toFixed(1);
  let s = `<line x1="${zx}" y1="${padT-2}" x2="${zx}" y2="${padT+ph+2}" stroke="${C.axis}" stroke-width="1"/>`;
  items.forEach((it,i)=>{
    const y = padT + i*(rowH+gap);
    const x = xAt(it.value);
    const bx = Math.min(+zx, x).toFixed(1), bw = Math.abs(x-zx).toFixed(1);
    s += `<rect x="${bx}" y="${y}" width="${bw}" height="${rowH}" rx="2" fill="${it.color}"/>`;
    s += `<text x="${padL-10}" y="${y+rowH/2+4}" text-anchor="end" font-size="10.5" fill="${C.dark}">${esc(it.label)}</text>`;
    const vx = it.value>=0 ? x+6 : x-6;
    s += `<text x="${vx.toFixed(1)}" y="${y+rowH/2+4}" text-anchor="${it.value>=0?'start':'end'}" font-size="10" font-weight="700" fill="${it.color}">${esc(xFmt(it.value))}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${s}</svg>`;
}

/* ---------- donut ---------- */
function donut({ segs, centerTop, centerBot }) {
  const cx=80, cy=80, r=58, sw=26, Circ=2*Math.PI*r;
  const total = segs.reduce((a,b)=>a+b.value,0);
  let off=0, s=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EFEFEF" stroke-width="${sw}"/>`;
  for (const sg of segs) {
    const len = sg.value/total*Circ;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${sg.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(Circ-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
  }
  s += `<text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="22" font-weight="700" fill="${C.dark}">${esc(centerTop)}</text>`;
  s += `<text x="${cx}" y="${cy+16}" text-anchor="middle" font-size="9.5" fill="${C.txt3}">${esc(centerBot)}</text>`;
  const svg = `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" width="150" role="img">${s}</svg>`;
  const legend = segs.map(sg=>`<div><span class="sw" style="background:${sg.color}"></span>${esc(sg.label)}</div>`).join("");
  return `<div class="donut-wrap">${svg}<div class="legend">${legend}</div></div>`;
}

const chartBlock = (svg, cap) => `<div class="chart">${svg}<div class="cap">${cap}</div></div>`;

/* ---------- chart definitions (verified KB data) ---------- */
const charts = {
  rates: chartBlock(lineChart({
    yMin:3, yMax:7, yTicks:[3,4,5,6,7], yFmt:v=>v+"%",
    xLabels:["Mar 20","Mar 24","Mar 31","Apr 2","Apr 6","Apr 7","Apr 9"],
    series:[
      { name:"30-yr fixed mortgage", color:C.mid, data:[6.25,6.43,6.37,6.46,6.22,6.20,6.36], showPoints:true },
      { name:"Fed funds target (mid)", color:C.fedline, data:[3.625,3.625,3.625,3.625,3.625,3.625,3.625], dashed:true },
    ],
  }), "Figure 2: 30-year fixed mortgage rate — volatile in the low-6s (a quarter-point round trip in under two weeks) — against a held Fed funds target. Source: Freddie Mac / Zillow / Optimal Blue; Federal Reserve. AV KB."),

  costs: chartBlock(lineChart({
    yMin:800, yMax:1100, yTicks:[800,900,1000,1100], yFmt:v=>"$"+v,
    xLabels:["Jan 2026","Feb 2026","Mar 2026","Apr 2026"],
    series:[{ name:"Hot-rolled coil steel ($/ton)", color:C.amber, data:[874,975,990,1051], showPoints:true }],
  }), "Figure 3: Hot-rolled coil steel breached $1,000/ton (+23% off January lows) under 50% Section 232 tariffs. Construction PPI ran +4.0% YoY; framing lumber, by contrast, fell to a 17-month low (~$508). Source: Trading Economics / CME; BLS. AV KB."),

  abi: chartBlock(lineChart({
    yMin:40, yMax:52, yTicks:[40,44,48,52], yFmt:v=>v,
    xLabels:["Dec 2025","Jan 2026","Feb 2026"],
    baseline:{ value:50, label:"50 = growth line" },
    series:[{ name:"Architecture Billings Index", color:C.mid, data:[48.5,43.8,49.4], showPoints:true }],
  }), "Figure 4: The Architecture Billings Index stabilized below the 50 growth line — bottoming, not reversing. Source: AIA. AV KB."),

  segments: chartBlock(barChartH({
    dMin:-12, dMax:9, xFmt:v=>(v>0?"+":"")+v.toFixed(1)+"%",
    items:[
      { label:"Steel", value:8.1, color:C.pos },
      { label:"HVAC-R, Fire & Security", value:3.6, color:C.pos },
      { label:"Cement, Aggregates & Ready-mix", value:3.4, color:C.pos },
      { label:"Retail & Distribution", value:3.2, color:C.pos },
      { label:"Piping (Adv. Drainage)", value:0.4, color:C.pos },
      { label:"Kitchen & Bath", value:0.0, color:C.zero },
      { label:"Building Envelope / Roofing", value:-0.7, color:C.neg },
      { label:"Doors & Windows", value:-3.7, color:C.neg },
      { label:"Glass", value:-5.5, color:C.neg },
      { label:"Bricks & Masonry", value:-6.4, color:C.neg },
      { label:"Lumber & Wood", value:-11.1, color:C.neg },
    ],
  }), "Figure 5: FY 2025 average revenue growth by segment — steel led on tariffs; lumber & wood was the clear laggard. Source: AV KB (financial_ratios)."),

  scorecard: donut({
    centerTop:"5 / 9", centerBot:"calls hit",
    segs:[
      { label:"Hit (5)", value:5, color:C.pos },
      { label:"Partial (3)", value:3, color:C.amber },
      { label:"Miss (1)", value:1, color:C.neg },
    ],
  }),
};

/* ---------- inject ---------- */
const src = `${DIR}/H1_2026_Report_Print.html`;
const outHtml = `${DIR}/H1_2026_Report_print_built.html`;
let html = readFileSync(src, "utf8");
let missing = [];
for (const [k, svg] of Object.entries(charts)) {
  const tok = `{{CHART:${k}}}`;
  if (!html.includes(tok)) missing.push(k);
  html = html.split(tok).join(svg);
}
const leftover = [...html.matchAll(/\{\{CHART:(\w+)\}\}/g)].map(m=>m[1]);
writeFileSync(outHtml, html);
console.log(`Wrote ${outHtml}`);
console.log(`Charts injected: ${Object.keys(charts).join(", ")}`);
if (missing.length) console.log(`WARNING: tokens not found in template: ${missing.join(", ")}`);
if (leftover.length) console.log(`WARNING: unreplaced tokens remain: ${leftover.join(", ")}`);
