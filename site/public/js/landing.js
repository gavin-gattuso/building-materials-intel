import { escHtml } from './utils.js';
import { renderFavoritesSection } from './favorites.js';

function signalArrow(s) {
  s = (s || '').toLowerCase();
  if (['up', 'worsening'].includes(s)) return '↑';
  if (['down', 'easing', 'improving', 'expanding'].includes(s)) return '↓';
  if (s === 'stable') return '→';
  if (['tightening', 'constrained'].includes(s)) return '↗';
  if (s === 'weakening') return '↘';
  return '↕';
}

export async function loadHome() {
  const [companies, tracked, drivers, earningsCalendar, weeklySummary] = await Promise.all([
    fetch('/api/wiki?type=company').then(r => r.json()).catch(() => []),
    fetch('/api/tracked-companies').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=market-driver').then(r => r.json()).catch(() => []),
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
      ${themes.length ? '<div class="was-themes">' + themes.map(t => `<a class="was-theme" onclick="window.searchArticlesByTheme('${escHtml(t.replace(/'/g, "\\\\'"))}')" title="Search articles about ${escHtml(t)}">${escHtml(t)}</a>`).join('') + '</div>' : ''}
    </div>`;
  }

  // Market Drivers
  const driversEl = document.getElementById('home-drivers');
  if (driversEl && drivers.length) {
    driversEl.innerHTML = drivers.map(d => {
      const signal = (d.frontmatter.current_signal || '').toLowerCase();
      return `<div class="driver-overview-item" onclick="window.openWiki('${d.id}')" title="${escHtml(d.title)} — currently ${d.frontmatter.current_signal || 'N/A'} · Click for full analysis">
        <div class="driver-overview-arrow ${signal}">${signalArrow(signal)}</div>
        <div class="driver-overview-name">${escHtml(d.title)}</div>
      </div>`;
    }).join('');
  }

  // Favorites
  const segmentMap = {};
  for (const t of tracked) segmentMap[t.ticker] = t.segment;
  renderFavoritesSection('home-favorites', companies, segmentMap);

  window.addEventListener('favorites-changed', () => {
    renderFavoritesSection('home-favorites', companies, segmentMap);
  });

  // Earnings calendar
  const earningsEl = document.getElementById('home-earnings');
  if (earningsEl) {
    earningsEl.innerHTML = earningsCalendar.length
      ? earningsCalendar.map(e => {
          const d = new Date(e.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          return `<div class="earnings-cal-item" onclick="window.openCompanyByTicker('${e.ticker}')" title="View ${escHtml(e.company)} (${e.ticker}) profile · ${e.quarter} earnings ${e.estimated ? '(estimated)' : ''} ${dateStr}">
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

}
