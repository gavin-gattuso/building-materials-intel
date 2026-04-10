import { escHtml } from './utils.js';
import { SEGMENT_COLORS, SEGMENT_LABELS, SEGMENT_CATEGORY } from './segments.js';

const RATIO_METRICS = [
  { key: 'revenue_ltm', label: 'Revenue (LTM BUSD)', unit: 'BUSD', hasDelta: false },
  { key: 'revenue_growth_yoy', label: 'Revenue Growth YoY', unit: '%', hasDelta: false, allowNeg: true },
  { key: 'cogs_sales_pct', label: 'COGS / Sales', unit: '%', hasDelta: true, deltaKey: 'cogs_sales_yoy_delta' },
  { key: 'sga_sales_pct', label: 'SG&A / Sales', unit: '%', hasDelta: true, deltaKey: 'sga_sales_yoy_delta' },
  { key: 'ebitda_margin_pct', label: 'EBITDA Margin', unit: '%', hasDelta: true, deltaKey: 'ebitda_margin_yoy_delta' },
];

let ratiosData = [];
let ratioFlags = {};
let activeMetric = 'revenue_ltm';
let activeSegmentFilter = null;
let trendChart = null;

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

/* ── Chart.js Trend Chart ────────────────────────────────────── */

function renderTrendChart() {
  const period = document.getElementById('ratios-period').value;
  let filtered = ratiosData.filter(d => d.period === period);
  const metric = RATIO_METRICS.find(m => m.key === activeMetric);

  if (activeSegmentFilter) {
    filtered = filtered.filter(c => c.segment === activeSegmentFilter);
  }

  // Sort by metric value descending (nulls at end)
  filtered = [...filtered].sort((a, b) => {
    const va = a[metric.key], vb = b[metric.key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  }).filter(c => c[metric.key] != null);

  // Update title
  const titleEl = document.getElementById('ratios-chart-title');
  if (titleEl) titleEl.textContent = metric.label + ' \u2014 ' + period;

  const canvas = document.getElementById('ratios-chart-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Destroy previous chart
  if (trendChart) { trendChart.destroy(); trendChart = null; }

  if (filtered.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  const labels = filtered.map(c => c.company);
  const values = filtered.map(c => c[metric.key]);
  const bgColors = filtered.map(c => SEGMENT_COLORS[c.segment] || '#888');
  const borderColors = bgColors.map(c => c);

  // Build delta lookup for tooltips
  const deltaMap = {};
  if (metric.hasDelta && metric.deltaKey) {
    filtered.forEach(c => { deltaMap[c.company] = c[metric.deltaKey]; });
  } else if (metric.allowNeg) {
    filtered.forEach(c => { deltaMap[c.company] = c[metric.key]; });
  }

  // Compute dynamic height: 28px per bar, min 200px
  const barHeight = 28;
  const chartHeight = Math.max(200, filtered.length * barHeight + 60);
  canvas.parentElement.style.maxHeight = 'none';
  canvas.style.maxHeight = chartHeight + 'px';
  canvas.height = chartHeight;

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors.map(c => c + 'cc'),
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.75,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 16, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1f24',
          titleFont: { family: 'Montserrat', size: 13, weight: '600' },
          bodyFont: { family: 'Montserrat', size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label(ctx) {
              const val = ctx.raw;
              const company = ctx.label;
              const fmtVal = metric.unit === 'BUSD' ? `$${val.toFixed(1)}B` : `${val.toFixed(1)}%`;
              const parts = [fmtVal];
              const delta = deltaMap[company];
              if (delta != null && metric.hasDelta) {
                parts.push(`YoY \u0394: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`);
              }
              return parts.join('  |  ');
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)', drawTicks: false },
          border: { display: false },
          ticks: {
            font: { family: 'Montserrat', size: 11 },
            color: '#4a4d50',
            callback(v) {
              return metric.unit === 'BUSD' ? '$' + v + 'B' : v + '%';
            },
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { family: 'Montserrat', size: 11, weight: '500' },
            color: '#303133',
          },
        },
      },
      onClick(_evt, elements) {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const company = filtered[idx].company;
          if (window.openCompanyByName) window.openCompanyByName(company);
        }
      },
      onHover(evt, elements) {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    },
  });
}


/* ── Peer Comparison Mini-Chart (company detail overlay) ───── */

let peerChart = null;

export function renderPeerComparisonChart(companyName, ratios, allRatios) {
  // Find the company's segment
  const companyData = allRatios.find(r => r.company === companyName);
  if (!companyData) return '';

  const segment = companyData.segment;
  const period = companyData.period;

  // Get segment peers for same period
  const peers = allRatios.filter(r => r.segment === segment && r.period === period && r.company !== companyName);
  if (peers.length === 0) return '';

  const peerMetrics = [
    { key: 'revenue_ltm', label: 'Revenue (B)', unit: 'B', prefix: '$' },
    { key: 'ebitda_margin_pct', label: 'EBITDA Margin', unit: '%' },
    { key: 'revenue_growth_yoy', label: 'Growth YoY', unit: '%' },
  ];

  // Compute segment averages
  const segAvg = {};
  for (const m of peerMetrics) {
    const vals = peers.map(p => p[m.key]).filter(v => v != null);
    segAvg[m.key] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  const available = peerMetrics.filter(m => companyData[m.key] != null && segAvg[m.key] != null);
  if (available.length === 0) return '';

  const canvasId = 'peer-chart-canvas-' + Date.now();
  const segLabel = SEGMENT_LABELS[segment] || segment;

  // Defer chart creation until DOM is ready
  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (peerChart) { peerChart.destroy(); peerChart = null; }

    const labels = available.map(m => m.label);
    const companyVals = available.map(m => companyData[m.key]);
    const avgVals = available.map(m => segAvg[m.key]);

    peerChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: companyName,
            data: companyVals,
            backgroundColor: '#16664bcc',
            borderColor: '#16664b',
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.6,
          },
          {
            label: segLabel + ' Avg',
            data: avgVals,
            backgroundColor: '#9e9e9eaa',
            borderColor: '#9e9e9e',
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4 } },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Montserrat', size: 11 },
              boxWidth: 12,
              padding: 12,
            },
          },
          tooltip: {
            backgroundColor: '#1e1f24',
            titleFont: { family: 'Montserrat', size: 12, weight: '600' },
            bodyFont: { family: 'Montserrat', size: 11 },
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label(ctx) {
                const m = available[ctx.dataIndex];
                const v = ctx.raw;
                const fmtVal = m.prefix ? `${m.prefix}${v.toFixed(1)}${m.unit}` : `${v.toFixed(1)}${m.unit}`;
                return ctx.dataset.label + ': ' + fmtVal;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: 'Montserrat', size: 11 }, color: '#4a4d50' },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)', drawTicks: false },
            border: { display: false },
            ticks: { font: { family: 'Montserrat', size: 10 }, color: '#4a4d50' },
          },
        },
      },
    });
  }, 50);

  return `<div class="peer-chart-section">
    <h4>vs ${escHtml(segLabel)} Peers</h4>
    <div style="position:relative;height:200px"><canvas id="${canvasId}"></canvas></div>
  </div>`;
}


/* ── CSS Bar Chart (existing secondary view) ─────────────────── */

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

    return `<div class="ratio-row${pendingCls}" style="cursor:pointer" onclick="window.openCompanyByName('${escHtml(c.company.replace(/'/g, "\\'"))}')" title="View ${escHtml(c.company)} profile, financials & recent articles">
      <span class="ratio-company">${escHtml(c.company)}${pendingBadge}</span>
      ${barHtml}
      <span class="ratio-value">${valStr}</span>
      ${deltaHtml}
      <span class="ratio-arrow">\u2192</span>
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

  // Render interactive trend chart
  renderTrendChart();
}

export function getRatiosData() {
  return ratiosData;
}

export async function loadFinancialRatios() {
  try {
    let data;
    try {
      data = await fetch('/financial-ratios.json').then(r => { if (!r.ok) throw new Error(); return r.json(); });
      if (!data || data.length === 0) throw new Error('empty');
    } catch {
      data = await fetch('/api/financial-ratios').then(r => r.json()).catch(() => []);
      if (!data || data.length === 0) {
        await new Promise(r => setTimeout(r, 1500));
        data = await fetch('/api/financial-ratios').then(r => r.json()).catch(() => []);
      }
    }
    if (!data || data.length === 0) {
      document.getElementById('ratios-panels').innerHTML = '<div class="loading">Financial data is temporarily unavailable. Please refresh in a moment.</div>';
      return;
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
      `<button data-metric="${m.key}" class="${m.key === activeMetric ? 'active' : ''}" title="Compare all companies by ${m.label}">${m.label}</button>`
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
    const renderKeyItem = ([seg, color]) => `<span class="key-item" data-segment="${escHtml(seg)}" title="Click to filter by ${SEGMENT_LABELS[seg] || seg}"><span class="key-swatch" style="background:${color}"></span>${SEGMENT_LABELS[seg] || seg}</span>`;
    const materialsSegs = Object.entries(SEGMENT_COLORS).filter(([seg]) => SEGMENT_CATEGORY[seg] === 'materials');
    const productsSegs = Object.entries(SEGMENT_COLORS).filter(([seg]) => SEGMENT_CATEGORY[seg] === 'products');
    keyEl.innerHTML = `
      <div class="key-row"><span class="key-label">Materials</span>${materialsSegs.map(renderKeyItem).join('')}</div>
      <div class="key-row"><span class="key-label">Products</span>${productsSegs.map(renderKeyItem).join('')}</div>
    `;
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
