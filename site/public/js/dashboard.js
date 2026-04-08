import { escHtml } from './utils.js';

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
  const [stats, articles, allArticles, earningsCalendar, weeklySummary] = await Promise.all([
    fetch('/api/stats').then(r => r.json()).catch(() => ({ total: 0, byCategory: {}, companyMentions: {}, thisWeek: 0 })),
    fetch('/api/articles?limit=10').then(r => r.json()).catch(() => []),
    fetch('/api/articles?limit=500').then(r => r.json()).catch(() => []),
    fetch('/earnings-calendar.json').then(r => r.json()).then(all => {
      const today = new Date().toISOString().slice(0, 10);
      return all.filter(e => e.date >= today).slice(0, 10);
    }).catch(() => []),
    fetch('/weekly-summary.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => fetch('/api/weekly-summary').then(r => r.json()).catch(() => null)),
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

  // Stats
  const total = stats.totalArticles || stats.total || 0;
  const wiki = stats.totalWikiPages || 0;
  const thisWeekArticles = allArticles.filter(a => {
    const d = new Date(a.date);
    const now = new Date();
    return (now - d) < 7 * 86400000;
  });

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Articles</div></div>
    <div class="stat-card"><div class="stat-value">${wiki}</div><div class="stat-label">Wiki Pages</div></div>
    <div class="stat-card"><div class="stat-value">${Object.keys(stats.byCategory || {}).length}</div><div class="stat-label">Categories</div></div>
    <div class="stat-card"><div class="stat-value">${Object.keys(stats.companyMentions || {}).length}</div><div class="stat-label">Companies Tracked</div></div>
  `;
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

  // Earnings & Financials articles
  const earningsArticles = allArticles.filter(a => a.category === 'Earnings' || a.category === 'Earnings & Financials');
  const earningsEl = document.getElementById('earnings-articles');
  if (earningsEl) {
    earningsEl.innerHTML = earningsArticles.length
      ? earningsArticles.slice(0, 5).map(a => articleCard(a)).join('')
      : '<div class="weekly-empty">No earnings articles yet</div>';
  }
  const earningsBadge = document.getElementById('earnings-count-badge');
  if (earningsBadge) earningsBadge.textContent = earningsArticles.length;

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
