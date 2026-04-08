import { escHtml } from './utils.js';
import { renderCompanyCards } from './wiki.js';
import { renderFavoritesSection } from './favorites.js';
import { SEGMENT_COLORS, SEGMENT_LABELS } from './segments.js';

function signalArrow(s) {
  s = (s || '').toLowerCase();
  if (['up', 'worsening'].includes(s)) return '↑';
  if (['down', 'easing', 'improving', 'expanding'].includes(s)) return '↓';
  if (s === 'stable') return '→';
  if (['tightening', 'constrained'].includes(s)) return '↗';
  if (s === 'weakening') return '↘';
  return '↕';
}

export async function loadLanding() {
  const [companies, tracked, drivers, concepts, ratios] = await Promise.all([
    fetch('/api/wiki?type=company').then(r => r.json()).catch(() => []),
    fetch('/api/tracked-companies').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=market-driver').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=concept').then(r => r.json()).catch(() => []),
    fetch('/financial-ratios.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/financial-ratios').then(r => r.json()).catch(() => [])),
  ]);

  // Companies
  const segmentMap = {};
  for (const t of tracked) segmentMap[t.ticker] = t.segment;
  renderCompanyCards('landing-company-grid', companies, segmentMap);
  renderFavoritesSection('landing-favorites', companies, segmentMap);
  const countEl = document.getElementById('landing-company-count');
  if (countEl) countEl.textContent = companies.length;

  // Re-render on favorites change
  window.addEventListener('favorites-changed', () => {
    renderCompanyCards('landing-company-grid', companies, segmentMap);
    renderFavoritesSection('landing-favorites', companies, segmentMap);
  });

  // Market Drivers
  const driversEl = document.getElementById('landing-drivers');
  if (driversEl && drivers.length) {
    driversEl.innerHTML = drivers.map(d => {
      const signal = (d.frontmatter.current_signal || '').toLowerCase();
      return `<div class="driver-overview-item" onclick="window.openWiki('${d.id}')">
        <div class="driver-overview-arrow ${signal}">${signalArrow(signal)}</div>
        <div class="driver-overview-name">${escHtml(d.title)}</div>
      </div>`;
    }).join('');
  }

  // Concepts
  const conceptsEl = document.getElementById('landing-concepts');
  if (conceptsEl && concepts.length) {
    conceptsEl.innerHTML = concepts.map(c => `
      <div class="article-item" onclick="window.openWiki('${c.id}')">
        <div class="article-title">${escHtml(c.title)}</div>
        ${c.frontmatter.summary ? '<div class="article-summary">' + escHtml(c.frontmatter.summary) + '</div>' : ''}
      </div>
    `).join('');
  }

  // Financial snapshot
  const finEl = document.getElementById('landing-financials');
  if (finEl) {
    const valid = ratios.filter(r => r.revenue_ltm != null);
    if (valid.length) {
      const periods = [...new Set(valid.map(r => r.period))].sort().reverse();
      const latest = valid.filter(r => r.period === periods[0]);
      const bySegment = {};
      for (const r of latest) {
        if (!bySegment[r.segment]) bySegment[r.segment] = 0;
        bySegment[r.segment] += r.revenue_ltm;
      }
      const sorted = Object.entries(bySegment).sort((a, b) => b[1] - a[1]);
      finEl.innerHTML = sorted.map(([seg, rev]) => `
        <div class="revenue-seg-item">
          <div class="revenue-seg-dot" style="background:${SEGMENT_COLORS[seg] || '#888'}"></div>
          <div class="revenue-seg-name">${SEGMENT_LABELS[seg] || seg}</div>
          <div class="revenue-seg-value">$${rev.toFixed(1)}B</div>
        </div>
      `).join('');
    } else {
      finEl.innerHTML = '<div class="weekly-empty">No financial data available</div>';
    }
  }
}
