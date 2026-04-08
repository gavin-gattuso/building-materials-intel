import { escHtml } from './utils.js';
import { SEGMENT_COLORS, SEGMENT_LABELS } from './segments.js';

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

export async function loadDashboard() {
  const [stats, articles, allArticles, earningsCalendar, weeklySummary, drivers, concepts, financialRatios] = await Promise.all([
    fetch('/api/stats').then(r => r.json()).catch(() => ({ total: 0, byCategory: {}, companyMentions: {}, thisWeek: 0 })),
    fetch('/api/articles?limit=10').then(r => r.json()).catch(() => []),
    fetch('/api/articles?limit=500').then(r => r.json()).catch(() => []),
    fetch('/earnings-calendar.json').then(r => r.json()).then(all => {
      const today = new Date().toISOString().slice(0, 10);
      return all.filter(e => e.date >= today).slice(0, 10);
    }).catch(() => []),
    fetch('/weekly-summary.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/weekly-summary').then(r => r.json()).catch(() => null)),
    fetch('/api/wiki?type=market-driver').then(r => r.json()).catch(() => []),
    fetch('/api/wiki?type=concept').then(r => r.json()).catch(() => []),
    fetch('/financial-ratios.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/financial-ratios').then(r => r.json()).catch(() => [])),
  ]);

  // Render weekly AI summary if available
  const sumContainer = document.getElementById('weekly-ai-summary-container');
  if (weeklySummary && weeklySummary.summary) {
    const wStart = new Date(weeklySummary.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const wEnd = new Date(weeklySummary.week_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const themes = (weeklySummary.themes || []);
    const summaryHtml = weeklySummary.summary.split('\n\n').map(p => `<p>${escHtml(p.trim())}</p>`).join('');
    sumContainer.innerHTML = `<div class="weekly-ai-summary">
      <div class="was-header"><span class="was-badge">AI Weekly Digest</span><span class="was-range">${wStart} &ndash; ${wEnd}</span></div>
      ${summaryHtml}
      ${themes.length ? '<div class="was-themes">' + themes.map(t => `<a class="was-theme" onclick="window.searchArticlesByTheme('${escHtml(t.replace(/'/g, "\\\\'"))}')">${escHtml(t)}</a>`).join('') + '</div>' : ''}
    </div>`;
  } else {
    sumContainer.innerHTML = '';
  }

  // Market Drivers overview
  const driversEl = document.getElementById('dashboard-drivers');
  if (driversEl && drivers.length) {
    const signalArrow = (s) => {
      s = (s || '').toLowerCase();
      if (['up','worsening'].includes(s)) return '↑';
      if (['down','easing','improving','expanding'].includes(s)) return '↓';
      if (s === 'stable') return '→';
      if (['tightening','constrained'].includes(s)) return '↗';
      if (s === 'weakening') return '↘';
      return '↕';
    };
    driversEl.innerHTML = drivers.map(d => {
      const signal = (d.frontmatter.current_signal || '').toLowerCase();
      return `<div class="driver-overview-item" onclick="window.openWiki('${d.id}')">
        <div class="driver-overview-arrow ${signal}">${signalArrow(signal)}</div>
        <div class="driver-overview-name">${escHtml(d.title)}</div>
      </div>`;
    }).join('');
  }

  // Featured Concept (rotate by day of week)
  const conceptEl = document.getElementById('dashboard-concept');
  if (conceptEl && concepts.length) {
    const idx = new Date().getDay() % concepts.length;
    const c = concepts[idx];
    conceptEl.innerHTML = `<div class="featured-concept" onclick="window.openWiki('${c.id}')">
      <span class="featured-concept-badge">Featured Concept</span>
      <span class="featured-concept-title">${escHtml(c.title)}</span>
    </div>`;
  }

  // Revenue by Segment
  const revenueEl = document.getElementById('dashboard-revenue');
  if (revenueEl) {
    const validRatios = financialRatios.filter(r => r.revenue_ltm != null);
    if (validRatios.length) {
      // Get latest period
      const periods = [...new Set(validRatios.map(r => r.period))].sort().reverse();
      const latest = validRatios.filter(r => r.period === periods[0]);
      // Group by segment
      const bySegment = {};
      for (const r of latest) {
        if (!bySegment[r.segment]) bySegment[r.segment] = 0;
        bySegment[r.segment] += r.revenue_ltm;
      }
      const sorted = Object.entries(bySegment).sort((a, b) => b[1] - a[1]);
      revenueEl.innerHTML = sorted.map(([seg, rev]) => `
        <div class="revenue-seg-item">
          <div class="revenue-seg-dot" style="background:${SEGMENT_COLORS[seg] || '#888'}"></div>
          <div class="revenue-seg-name">${SEGMENT_LABELS[seg] || seg}</div>
          <div class="revenue-seg-value">$${rev.toFixed(1)}B</div>
        </div>
      `).join('');
    } else {
      revenueEl.innerHTML = '<div class="weekly-empty">No financial data available</div>';
    }
  }

  // Stats
  const total = stats.totalArticles || stats.total || 0;
  const wiki = stats.totalWikiPages || 0;
  const thisWeekArticles = allArticles.filter(a => {
    const d = new Date(a.date);
    const now = new Date();
    return (now - d) < 7 * 86400000;
  });

  document.getElementById('week-articles').innerHTML = thisWeekArticles.length
    ? thisWeekArticles.slice(0, 5).map(a => articleCard(a)).join('')
    : '<div class="weekly-empty">No articles this week</div>';

  // Earnings calendar
  const earningsPanel = document.getElementById('upcoming-earnings');
  if (earningsPanel) {
    earningsPanel.innerHTML = earningsCalendar.length
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
  }
  const earningsBadge = document.getElementById('earnings-count-badge');
  if (earningsBadge) earningsBadge.textContent = earningsCalendar.length;

  // Latest articles
  document.getElementById('article-count-badge').textContent = stats.totalArticles;
  document.getElementById('latest-articles').innerHTML = articles.map(a => articleCard(a)).join('');
}

export async function loadArticles(q, category, company) {
  let url = '/api/articles?limit=100';
  if (q) url += '&q=' + encodeURIComponent(q);
  if (category) url += '&category=' + encodeURIComponent(category);
  if (company) url += '&company=' + encodeURIComponent(company);
  const articles = await fetch(url).then(r => r.json());
  document.getElementById('all-articles').innerHTML = articles.length
    ? articles.map(a => articleCard(a)).join('')
    : '<div class="loading">No articles found</div>';
}

export async function loadArticleFilters() {
  const stats = await fetch('/api/stats').then(r => r.json()).catch(() => ({ byCategory: {}, companyMentions: {} }));
  const catSelect = document.getElementById('article-category-filter');
  for (const cat of Object.keys(stats.byCategory || {}).sort()) {
    catSelect.innerHTML += `<option value="${cat}">${cat} (${stats.byCategory[cat]})</option>`;
  }
  const compSelect = document.getElementById('article-company-filter');
  for (const [comp, count] of Object.entries(stats.companyMentions || {}).sort((a,b) => b[1]-a[1])) {
    compSelect.innerHTML += `<option value="${comp}">${comp} (${count})</option>`;
  }
}

export { articleCard };
