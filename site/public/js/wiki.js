import { escHtml, renderMd, closeDetail } from './utils.js';
import { isFavorite, renderFavoritesSection } from './favorites.js';

export function renderCompanyCards(containerId, companies, segmentMap) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = companies.map(c => {
    const ticker = c.frontmatter.ticker || '';
    const seg = segmentMap[ticker] || '';
    const fav = isFavorite(c.id);
    return `<div class="company-card" data-company-id="${c.id}" data-ticker="${ticker}" data-company-name="${escHtml(c.title)}" tabindex="0" onclick="window.openWiki('${c.id}')">
      <button class="fav-star${fav ? ' active' : ''}" onclick="event.stopPropagation(); window.toggleFavorite('${c.id}')" aria-label="Toggle favorite">${fav ? '★' : '☆'}</button>
      <div class="ticker">${ticker}</div>
      <div class="name">${escHtml(c.title)}</div>
      ${seg ? '<div class="sector">' + escHtml(seg) + '</div>' : ''}
    </div>`;
  }).join('');
}

// Cache for favorites re-render
let _companiesCache = [];
let _segmentMapCache = {};

export async function loadCompanies() {
  const [companies, tracked] = await Promise.all([
    fetch('/api/wiki?type=company').then(r => r.json()),
    fetch('/api/tracked-companies').then(r => r.json()).catch(() => []),
  ]);
  const segmentMap = {};
  for (const t of tracked) segmentMap[t.ticker] = t.segment;
  _companiesCache = companies;
  _segmentMapCache = segmentMap;
  renderCompanyCards('company-grid', companies, segmentMap);
  renderFavoritesSection('companies-favorites', companies, segmentMap);

  // Re-render on favorites change
  window.addEventListener('favorites-changed', () => {
    renderCompanyCards('company-grid', _companiesCache, _segmentMapCache);
    renderFavoritesSection('companies-favorites', _companiesCache, _segmentMapCache);
  });
}

export async function loadDrivers() {
  const drivers = await fetch('/api/wiki?type=market-driver').then(r => r.json());
  document.getElementById('drivers-grid').innerHTML = drivers.map(d => `
    <div class="driver-card" onclick="window.openWiki('${d.id}')">
      <div class="driver-signal ${(d.frontmatter.current_signal || '').toLowerCase()}">${d.frontmatter.current_signal || ''}</div>
      <div class="name">${escHtml(d.title)}</div>
    </div>
  `).join('');
}

export async function loadConcepts() {
  const concepts = await fetch('/api/wiki?type=concept').then(r => r.json());
  document.getElementById('concepts-list').innerHTML = concepts.map(c => `
    <div class="article-item" onclick="window.openWiki('${c.id}')">
      <div class="article-title">${escHtml(c.title)}</div>
      ${c.frontmatter.summary ? '<div class="article-summary">' + escHtml(c.frontmatter.summary) + '</div>' : ''}
    </div>
  `).join('');
}

export async function openArticle(id) {
  const article = await fetch('/api/article/' + id).then(r => r.json());
  document.getElementById('detail-header').innerHTML = `
    <h2>${escHtml(article.title)}</h2>
    <div class="detail-meta-grid">
      <span>${article.date}</span>
      <span>${article.source}</span>
      <span>${article.category}</span>
      ${article.url ? '<a href="' + article.url + '" target="_blank">Original source &rarr;</a>' : ''}
    </div>
  `;
  document.getElementById('detail-content').innerHTML = renderMd(article.content);
  document.getElementById('detail-overlay').classList.add('open');
}

export async function openWiki(id) {
  const page = await fetch('/api/wiki/' + id).then(r => r.json());
  document.getElementById('detail-header').innerHTML = `<h2>${escHtml(page.title)}</h2>`;
  document.getElementById('detail-content').innerHTML = renderMd(page.content);
  document.getElementById('detail-overlay').classList.add('open');
}

export async function openCompanyByTicker(ticker) {
  const companies = await fetch('/api/wiki?type=company').then(r => r.json());
  const match = companies.find(c => c.frontmatter.ticker === ticker);
  if (match) {
    openWiki(match.id);
  }
}
