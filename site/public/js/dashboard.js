import { escHtml } from './utils.js';

export function articleCard(a) {
  const sourceLink = a.url
    ? `<a href="${a.url}" target="_blank" rel="noopener" class="article-source-link" onclick="event.stopPropagation()">${a.source} &rarr;</a>`
    : `<span>${a.source}</span>`;
  return `<div class="article-item" onclick="window.openArticle('${a.id || a.slug}')" title="${escHtml(a.title)} · ${a.source || ''} ${a.date || ''} · Click to read full article">
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
