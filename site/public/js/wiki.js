import { escHtml, renderMd, closeDetail } from './utils.js';

export async function loadCompanies() {
  const companies = await fetch('/api/wiki?type=company').then(r => r.json());
  document.getElementById('company-grid').innerHTML = companies.map(c => `
    <div class="company-card" onclick="window.openWiki('${c.id}')">
      <div class="ticker">${c.frontmatter.ticker || ''}</div>
      <div class="name">${escHtml(c.title)}</div>
    </div>
  `).join('');
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
