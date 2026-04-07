import { escHtml } from './utils.js';

const RATIO_METRICS = [
  { key: 'revenue_ltm', label: 'Revenue (LTM BUSD)', unit: 'BUSD', hasDelta: false },
  { key: 'revenue_growth_yoy', label: 'Revenue Growth YoY', unit: '%', hasDelta: false, allowNeg: true },
  { key: 'cogs_sales_pct', label: 'COGS / Sales', unit: '%', hasDelta: true, deltaKey: 'cogs_sales_yoy_delta' },
  { key: 'sga_sales_pct', label: 'SG&A / Sales', unit: '%', hasDelta: true, deltaKey: 'sga_sales_yoy_delta' },
  { key: 'ebitda_margin_pct', label: 'EBITDA Margin', unit: '%', hasDelta: true, deltaKey: 'ebitda_margin_yoy_delta' },
];

const SEGMENT_COLORS = {
  'Cement, Aggregates and Ready-mix Concrete': '#1a5c3a',
  'Glass': '#2d8a5e',
  'Lumber and Wood': '#8cc63f',
  'Steel': '#9e9e9e',
  'Bricks and Masonry': '#6d9e6d',
  'Building Envelope, Roofing, Siding, Flooring and Insulation': '#0d4f5c',
  'Doors and Windows': '#1a7a8a',
  'Piping': '#4db6ac',
  'Kitchen and Bath': '#80cbc4',
  'HVAC-R, Fire and Security': '#26a69a',
};

const SEGMENT_LABELS = {
  'Cement, Aggregates and Ready-mix Concrete': 'Cement & Aggregates',
  'Glass': 'Glass',
  'Lumber and Wood': 'Lumber & Wood',
  'Steel': 'Steel',
  'Bricks and Masonry': 'Bricks & Masonry',
  'Building Envelope, Roofing, Siding, Flooring and Insulation': 'Bldg Envelope & Roofing',
  'Doors and Windows': 'Doors & Windows',
  'Piping': 'Piping',
  'Kitchen and Bath': 'Kitchen & Bath',
  'HVAC-R, Fire and Security': 'HVAC-R & Security',
};

let ratiosData = [];
let ratioFlags = {};
let activeMetric = 'revenue_ltm';
let activeSegmentFilter = null;

function updateKeyHighlights() {
  document.querySelectorAll('#ratios-key .key-item').forEach(item => {
    if (activeSegmentFilter === null) {
      item.classList.remove('active', 'dimmed');
    } else if (item.dataset.segment === activeSegmentFilter) {
      item.classList.add('active');
      item.classList.remove('dimmed');
    } else {
      item.classList.remove('active');
      item.classList.add('dimmed');
    }
  });
}

async function loadRatioFlags(period) {
  try {
    const flags = await fetch(`/api/financial-ratio-flags?period=${encodeURIComponent(period)}`).then(r => r.ok ? r.json() : []);
    ratioFlags = {};
    for (const f of flags) {
      ratioFlags[`${f.company}|${f.metric}`] = f;
    }
  } catch { ratioFlags = {}; }
}

function buildRatioChart(companies, metric) {
  if (activeSegmentFilter) {
    companies = companies.filter(c => c.segment === activeSegmentFilter);
  }
  if (companies.length === 0) return '<div class="loading" style="font-size:12px;color:var(--text-muted)">No companies in this segment for this category.</div>';

  const vals = companies.map(c => c[metric.key]).filter(v => v != null);
  if (vals.length === 0) return '<div class="loading">No data available for this metric.</div>';

  const absMax = Math.max(...vals.map(Math.abs), 1);
  const hasNeg = metric.allowNeg && vals.some(v => v < 0);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;

  const rows = companies.map(c => {
    const val = c[metric.key];
    if (val == null) return '';
    const color = SEGMENT_COLORS[c.segment] || '#888';
    const pct = Math.abs(val) / absMax * 100;
    const valStr = metric.unit === 'BUSD' ? `$${val.toFixed(1)}` : `${val.toFixed(1)}%`;

    const flag = ratioFlags[`${c.company}|${metric.key}`];

    let deltaHtml = '';
    if (metric.hasDelta && metric.deltaKey) {
      const delta = c[metric.deltaKey];
      if (delta != null) {
        const cls = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';
        const deltaText = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
        if (flag && flag.article) {
          const verb = flag.direction === 'drop' ? 'dropped' : 'surged';
          const unitStr = flag.unit === '%' ? '%' : 'pp';
          const tipText = `${escHtml(flag.metricLabel)} ${verb} ${Math.abs(flag.value).toFixed(1)}${unitStr}`;
          const tipSrc = `${escHtml(flag.article.title)} (${escHtml(flag.article.source)})`;
          const icon = flag.direction === 'drop' ? '\u26a0' : '\u2191';
          deltaHtml = `<span class="ratio-delta ${cls}"><a href="${escHtml(flag.article.url || '#')}" target="_blank" title="${tipText} \u2014 ${tipSrc}">${deltaText}<span class="flag-indicator">${icon}</span><span class="delta-tooltip">${tipText}<br>${tipSrc}</span></a></span>`;
        } else {
          deltaHtml = `<span class="ratio-delta ${cls}">${deltaText}</span>`;
        }
      }
    } else if (metric.allowNeg) {
      const cls = val > 0 ? 'positive' : val < 0 ? 'negative' : '';
      const deltaText = `${val > 0 ? '+' : ''}${val.toFixed(1)}%`;
      if (flag && flag.article) {
        const verb = flag.direction === 'drop' ? 'dropped' : 'surged';
        const unitStr = flag.unit === '%' ? '%' : 'pp';
        const tipText = `${escHtml(flag.metricLabel)} ${verb} ${Math.abs(flag.value).toFixed(1)}${unitStr}`;
        const tipSrc = `${escHtml(flag.article.title)} (${escHtml(flag.article.source)})`;
        const icon = flag.direction === 'drop' ? '\u26a0' : '\u2191';
        deltaHtml = `<span class="ratio-delta ${cls}"><a href="${escHtml(flag.article.url || '#')}" target="_blank" title="${tipText} \u2014 ${tipSrc}">${deltaText}<span class="flag-indicator">${icon}</span><span class="delta-tooltip">${tipText}<br>${tipSrc}</span></a></span>`;
      } else {
        deltaHtml = `<span class="ratio-delta ${cls}">${deltaText}</span>`;
      }
    }

    let flagHtml = '';
    if (flag && !metric.hasDelta && !metric.allowNeg) {
      const icon = flag.direction === 'drop' ? '\u26a0' : '\u2191';
      const verb = flag.direction === 'drop' ? 'dropped' : 'surged';
      const unitStr = flag.unit === '%' ? '%' : 'pp';
      flagHtml = `<div class="ratio-flag-inline">${icon} ${escHtml(flag.metricLabel)} ${verb} ${Math.abs(flag.value).toFixed(1)}${unitStr}${flag.article ? ` \u2014 <a href="${escHtml(flag.article.url || '#')}" target="_blank">${escHtml(flag.article.title)}</a>` : ''}</div>`;
    }

    let barHtml;
    if (hasNeg) {
      const midPct = 50;
      if (val >= 0) {
        const w = (val / absMax) * midPct;
        barHtml = `<div class="ratio-bar-wrap" style="position:relative">
          <div style="position:absolute;left:${midPct}%;top:0;height:100%;width:1px;background:#ccc"></div>
          <div class="ratio-bar" style="position:absolute;left:${midPct}%;width:${w}%;background:${color}"></div>
        </div>`;
      } else {
        const w = (Math.abs(val) / absMax) * midPct;
        barHtml = `<div class="ratio-bar-wrap" style="position:relative">
          <div style="position:absolute;left:${midPct}%;top:0;height:100%;width:1px;background:#ccc"></div>
          <div class="ratio-bar" style="position:absolute;right:${midPct}%;width:${w}%;background:${color}"></div>
        </div>`;
      }
    } else {
      barHtml = `<div class="ratio-bar-wrap"><div class="ratio-bar" style="width:${pct}%;background:${color}"></div></div>`;
    }

    const pendingCls = c.has_reported === false ? ' pending' : '';
    const pendingBadge = c.has_reported === false ? '<span class="ratio-pending-badge">PENDING</span>' : '';

    return `<div class="ratio-row${pendingCls}">
      <span class="ratio-company" title="${escHtml(c.company)}">${escHtml(c.company)}${pendingBadge}</span>
      ${barHtml}
      <span class="ratio-value">${valStr}</span>
      ${deltaHtml}
    </div>${flagHtml}`;
  }).join('');

  const avgStr = metric.unit === 'BUSD' ? `$${avg.toFixed(1)}` : `${avg.toFixed(1)}%`;
  return rows + `<div class="ratio-avg">
    <span class="ratio-company">\u00d8 Average</span>
    <div class="ratio-bar-wrap"></div>
    <span class="ratio-value">${avgStr}</span>
    ${metric.hasDelta ? '<span class="ratio-delta"></span>' : metric.allowNeg ? '<span class="ratio-delta"></span>' : ''}
  </div>`;
}

function renderRatios() {
  const period = document.getElementById('ratios-period').value;
  const filtered = ratiosData.filter(d => d.period === period);
  const materials = filtered.filter(d => d.category === 'materials');
  const products = filtered.filter(d => d.category === 'products');
  const metric = RATIO_METRICS.find(m => m.key === activeMetric);

  const unreportedCount = filtered.filter(d => !d.has_reported).length;
  const panel = document.getElementById('ratios-panels');
  panel.innerHTML = `
    ${unreportedCount > 0 ? `<div style="grid-column:1/-1;text-align:center;margin-bottom:-16px">
      <div class="ratios-legend">
        <span class="leg-item"><span class="leg-swatch" style="background:var(--primary)"></span> Reported</span>
        <span class="leg-item"><span class="leg-swatch leg-pending"></span> Awaiting Earnings</span>
        <span style="font-size:11px;color:#e65100">${unreportedCount} of ${filtered.length} companies pending</span>
      </div>
    </div>` : ''}
    <div class="ratios-panel">
      <h3>Building Materials</h3>
      <div class="panel-sub">${metric.label}, ${period}</div>
      ${buildRatioChart(materials, metric)}
    </div>
    <div class="ratios-panel">
      <h3>Building Products</h3>
      <div class="panel-sub">${metric.label}, ${period}</div>
      ${buildRatioChart(products, metric)}
    </div>
  `;
}

export async function loadFinancialRatios() {
  try {
    let data;
    try {
      data = await fetch('/financial-ratios.json').then(r => { if (!r.ok) throw new Error(); return r.json(); });
    } catch {
      data = await fetch('/api/financial-ratios').then(r => r.json());
    }
    ratiosData = data;

    const periods = [...new Set(data.map(d => d.period))].sort().reverse();
    const periodSel = document.getElementById('ratios-period');
    periodSel.innerHTML = periods.map(p => `<option value="${p}">${p}</option>`).join('');
    periodSel.onchange = async () => {
      activeSegmentFilter = null;
      updateKeyHighlights();
      await loadRatioFlags(periodSel.value);
      renderRatios();
    };

    if (periods.length > 0) await loadRatioFlags(periods[0]);

    const btnContainer = document.getElementById('ratios-metric-btns');
    btnContainer.innerHTML = RATIO_METRICS.map(m =>
      `<button data-metric="${m.key}" class="${m.key === activeMetric ? 'active' : ''}">${m.label}</button>`
    ).join('');
    btnContainer.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        activeMetric = btn.dataset.metric;
        activeSegmentFilter = null;
        updateKeyHighlights();
        btnContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderRatios();
      };
    });

    const keyEl = document.getElementById('ratios-key');
    keyEl.innerHTML = Object.entries(SEGMENT_COLORS)
      .map(([seg, color]) => `<span class="key-item" data-segment="${escHtml(seg)}"><span class="key-swatch" style="background:${color}"></span>${SEGMENT_LABELS[seg] || seg}</span>`)
      .join('');
    keyEl.querySelectorAll('.key-item').forEach(item => {
      item.onclick = () => {
        const seg = item.dataset.segment;
        activeSegmentFilter = activeSegmentFilter === seg ? null : seg;
        updateKeyHighlights();
        renderRatios();
      };
    });

    renderRatios();
  } catch {
    document.getElementById('ratios-panels').innerHTML = '<div class="loading">Could not load financial data.</div>';
  }
}
