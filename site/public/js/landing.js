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

/**
 * Pull the operational status snapshot and show a banner at the top of the
 * homepage when any tracked data type is stale. Silent on healthy state.
 */
export async function loadFreshnessBanner() {
  const banner = document.getElementById('freshness-banner');
  const msgEl = document.getElementById('freshness-banner-msg');
  if (!banner || !msgEl) return;
  try {
    const r = await fetch('/api/status');
    if (!r.ok) return;
    const s = await r.json();
    const f = s.freshness || {};
    const issues = [];
    if (f.article_stale_hours != null && f.article_stale_hours > 48) issues.push(`articles ${Math.floor(f.article_stale_hours / 24)}d behind`);
    if (f.weekly_summary_age_days != null && f.weekly_summary_age_days > 10) issues.push(`weekly digest ${f.weekly_summary_age_days}d behind`);
    if (f.financial_ratios_age_days != null && f.financial_ratios_age_days > 35) issues.push(`financial ratios ${f.financial_ratios_age_days}d behind`);
    if (f.market_drivers_age_days != null && f.market_drivers_age_days > 35) issues.push(`market drivers ${f.market_drivers_age_days}d behind`);
    if (s.counters?.stuck_locks > 0) issues.push(`${s.counters.stuck_locks} stuck ingest run(s)`);
    if (issues.length > 0) {
      msgEl.textContent = issues.join(' · ');
      banner.style.display = 'block';
    }
  } catch { /* status endpoint optional; never break the homepage */ }
}

export async function loadHome() {
  // Show skeleton placeholders while fetching
  const sumEl = document.getElementById('home-ai-summary');
  if (sumEl) sumEl.innerHTML = '<div class="weekly-ai-summary"><div class="skeleton-text w-40" style="height:16px;margin-bottom:14px"></div><div class="skeleton-text w-90"></div><div class="skeleton-text w-75"></div><div class="skeleton-text w-60"></div><div class="skeleton-text w-50"></div></div>';
  const driversEl = document.getElementById('home-drivers');
  if (driversEl) driversEl.innerHTML = Array.from({length: 7}, () => '<div class="driver-overview-item" style="pointer-events:none"><div class="skeleton" style="width:28px;height:28px;border-radius:50%"></div><div class="skeleton" style="width:80px;height:14px"></div></div>').join('');
  const earningsEl = document.getElementById('home-earnings');
  if (earningsEl) earningsEl.innerHTML = Array.from({length: 4}, () => '<div class="earnings-cal-item" style="pointer-events:none"><div class="skeleton" style="width:140px;height:14px"></div><div class="skeleton" style="width:40px;height:14px"></div><div class="skeleton" style="width:80px;height:14px"></div></div>').join('');

  const [companies, tracked, drivers, earningsCalendar, weeklySummary] = await Promise.all([
    fetch('/api/wiki?type=company').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/api/tracked-companies').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/api/wiki?type=market-driver').then(r => r.ok ? r.json() : []).catch(() => []),
    fetch('/earnings-calendar.json').then(r => r.json()).then(all => {
      const today = new Date().toISOString().slice(0, 10);
      return all.filter(e => e.date >= today).slice(0, 10);
    }).catch(() => []),
    // Prefer the live API (Supabase) over the static JSON: build-static.ts uses
    // the anon key which RLS may filter, so the static can lag behind. Fall
    // back to static if the API errors. Both return the same shape; we pick
    // whichever has the later week_end so old static never overrides fresh.
    Promise.all([
      fetch('/api/weekly-summary').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/weekly-summary.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([api, stat]) => {
      if (!api && !stat) return null;
      if (!api) return stat;
      if (!stat) return api;
      return (api.week_end || '') >= (stat.week_end || '') ? api : stat;
    }),
  ]);

  // Weekly AI summary
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
