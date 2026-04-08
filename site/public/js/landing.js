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

function articleCard(a) {
  const sourceLink = a.url
    ? `<a href="${a.url}" target="_blank" rel="noopener" class="article-source-link" onclick="event.stopPropagation()">${a.source} &rarr;</a>`
    : `<span>${a.source}</span>`;
  return `<div class="article-item" onclick="window.openArticle('${a.id || a.slug}')">
    <div class="article-meta">
      <span class="date">${a.date}</span>
      <span class="cat">${a.category}</span>
      ${sourceLink}
    </div>
    <div class="article-title">${escHtml(a.title)}</div>
    ${a.summary ? '<div class="article-summary">' + escHtml(a.summary) + '</div>' : ''}
    ${a.companies?.length ? '<div class="article-companies">' + a.companies.join(', ') + '</div>' : ''}
  </div>`;
}

export async function loadHome() {
  const [companies, tracked, drivers, concepts, ratios, allArticles, earningsCalendar, weeklySummary] = await Promise.all([
    fetch('/api/wiki?type=company').then(r => r.json()).catch(() => []),
    fetch('/api/tracked-companies').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=market-driver').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=concept').then(r => r.json()).catch(() => []),
    fetch('/financial-ratios.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/financial-ratios').then(r => r.json()).catch(() => [])),
    fetch('/api/articles?limit=200').then(r => r.json()).catch(() => []),
    fetch('/earnings-calendar.json').then(r => r.json()).then(all => {
      const today = new Date().toISOString().slice(0, 10);
      return all.filter(e => e.date >= today).slice(0, 10);
    }).catch(() => []),
    fetch('/weekly-summary.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/weekly-summary').then(r => r.json()).catch(() => null)),
  ]);

  // Weekly AI summary
  const sumEl = document.getElementById('home-ai-summary');
  if (sumEl && weeklySummary && weeklySummary.summary) {
    const wStart = new Date(weeklySummary.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const wEnd = new Date(weeklySummary.week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const themes = weeklySummary.themes || [];
    const summaryHtml = weeklySummary.summary.split('\n\n').map(p => `<p>${escHtml(p.trim())}</p>`).join('');
    sumEl.innerHTML = `<div class="weekly-ai-summary">
      <div class="was-header"><span class="was-badge">AI Weekly Digest</span><span class="was-range">${wStart} &ndash; ${wEnd}</span></div>
      ${summaryHtml}
      ${themes.length ? '<div class="was-themes">' + themes.map(t => `<a class="was-theme" onclick="window.searchArticlesByTheme('${escHtml(t.replace(/'/g, "\\\\'"))}')">${escHtml(t)}</a>`).join('') + '</div>' : ''}
    </div>`;
  }

  // Market Drivers
  const driversEl = document.getElementById('home-drivers');
  if (driversEl && drivers.length) {
    driversEl.innerHTML = drivers.map(d => {
      const signal = (d.frontmatter.current_signal || '').toLowerCase();
      return `<div class="driver-overview-item" onclick="window.openWiki('${d.id}')">
        <div class="driver-overview-arrow ${signal}">${signalArrow(signal)}</div>
        <div class="driver-overview-name">${escHtml(d.title)}</div>
      </div>`;
    }).join('');
  }

  // Companies
  const segmentMap = {};
  for (const t of tracked) segmentMap[t.ticker] = t.segment;
  renderCompanyCards('home-company-grid', companies, segmentMap);
  renderFavoritesSection('home-favorites', companies, segmentMap);
  const countEl = document.getElementById('home-company-count');
  if (countEl) countEl.textContent = companies.length;

  window.addEventListener('favorites-changed', () => {
    renderCompanyCards('home-company-grid', companies, segmentMap);
    renderFavoritesSection('home-favorites', companies, segmentMap);
  });

  // Earnings calendar
  const earningsEl = document.getElementById('home-earnings');
  if (earningsEl) {
    earningsEl.innerHTML = earningsCalendar.length
      ? earningsCalendar.map(e => {
          const d = new Date(e.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return `<div class="earnings-cal-item" onclick="window.openCompanyByTicker('${e.ticker}')">
            <span class="earnings-cal-company">${escHtml(e.company)} <span class="earnings-cal-ticker">${e.ticker}</span></span>
            <span class="earnings-cal-quarter">${e.quarter}</span>
            <span class="earnings-cal-date">${dateStr}</span>
            ${e.estimated ? '<span class="earnings-cal-est">Est.</span>' : ''}
          </div>`;
        }).join('')
      : '<div class="weekly-empty">No upcoming earnings dates</div>';
    const badge = document.getElementById('home-earnings-count');
    if (badge) badge.textContent = earningsCalendar.length;
  }

  // This week's articles
  const thisWeek = allArticles.filter(a => {
    const d = new Date(a.date);
    return (Date.now() - d) < 7 * 86400000;
  });
  const weekEl = document.getElementById('home-week-articles');
  if (weekEl) {
    weekEl.innerHTML = thisWeek.length
      ? thisWeek.slice(0, 5).map(a => articleCard(a)).join('')
      : '<div class="weekly-empty">No articles this week</div>';
    const badge = document.getElementById('home-week-count');
    if (badge) badge.textContent = thisWeek.length;
  }

  // Revenue by segment
  const revEl = document.getElementById('home-revenue');
  if (revEl) {
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
      revEl.innerHTML = sorted.map(([seg, rev]) => `
        <div class="revenue-seg-item">
          <div class="revenue-seg-dot" style="background:${SEGMENT_COLORS[seg] || '#888'}"></div>
          <div class="revenue-seg-name">${SEGMENT_LABELS[seg] || seg}</div>
          <div class="revenue-seg-value">$${rev.toFixed(1)}B</div>
        </div>
      `).join('');
    } else {
      revEl.innerHTML = '<div class="weekly-empty">No financial data available</div>';
    }
  }

  // Key concepts
  const conceptsEl = document.getElementById('home-concepts');
  if (conceptsEl && concepts.length) {
    conceptsEl.innerHTML = concepts.map(c => `
      <div class="article-item" onclick="window.openWiki('${c.id}')">
        <div class="article-title">${escHtml(c.title)}</div>
        ${c.frontmatter.summary ? '<div class="article-summary">' + escHtml(c.frontmatter.summary) + '</div>' : ''}
      </div>
    `).join('');
  }
}
