import { escHtml, renderMd, closeDetail } from './utils.js';
import { isFavorite, renderFavoritesSection } from './favorites.js';

export function renderCompanyCards(containerId, companies, segmentMap) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = companies.map(c => {
    const ticker = c.frontmatter.ticker || '';
    const seg = segmentMap[ticker] || '';
    const fav = isFavorite(c.id);
    return `<div class="company-card" data-company-id="${c.id}" data-ticker="${ticker}" data-company-name="${escHtml(c.title)}" tabindex="0" onclick="window.openWiki('${c.id}')" title="View ${escHtml(c.title)} profile, financials & recent articles">
      <button class="fav-star${fav ? ' active' : ''}" onclick="event.stopPropagation(); window.toggleFavorite('${c.id}')" aria-label="Toggle favorite" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${fav ? '★' : '☆'}</button>
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
    <div class="driver-card" onclick="window.openWiki('${d.id}')" title="${escHtml(d.title)} — ${d.frontmatter.current_signal || 'N/A'} · Click for full analysis">
      <div class="driver-signal ${(d.frontmatter.current_signal || '').toLowerCase()}">${d.frontmatter.current_signal || ''}</div>
      <div class="name">${escHtml(d.title)}</div>
    </div>
  `).join('');
}

export async function loadConcepts() {
  const concepts = await fetch('/api/wiki?type=concept').then(r => r.json());
  document.getElementById('concepts-list').innerHTML = concepts.map(c => `
    <div class="article-item" onclick="window.openWiki('${c.id}')" title="Read full analysis: ${escHtml(c.title)}">
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

  if (page.type === 'company') {
    return openCompanyDetail(page);
  }

  document.getElementById('detail-header').innerHTML = `<h2>${escHtml(page.title)}</h2>`;
  document.getElementById('detail-content').innerHTML = renderMd(page.content);
  document.getElementById('detail-overlay').classList.add('open');
}

async function openCompanyDetail(page) {
  const ticker = page.frontmatter?.ticker || '';
  const sector = page.frontmatter?.sector || '';
  const subsector = page.frontmatter?.subsector || '';

  // Show overlay immediately with loading state
  document.getElementById('detail-header').innerHTML = `
    <h2>${escHtml(page.title)}</h2>
    <div class="detail-meta-grid">
      ${ticker ? '<span class="detail-ticker">' + escHtml(ticker) + '</span>' : ''}
      ${sector ? '<span>' + escHtml(sector) + '</span>' : ''}
      ${subsector ? '<span>' + escHtml(subsector) + '</span>' : ''}
    </div>
  `;
  document.getElementById('detail-content').innerHTML = '<div class="loading">Loading company data...</div>';
  document.getElementById('detail-overlay').classList.add('open');

  // Fetch financial data + articles in parallel
  const [ratios, articles] = await Promise.all([
    fetch('/api/financial-ratios?company=' + encodeURIComponent(page.title)).then(r => r.json()).catch(() => []),
    fetch('/api/articles?company=' + encodeURIComponent(page.title) + '&limit=5').then(r => r.json()).catch(() => []),
  ]);

  // Build financial snapshot
  let financialHtml = '';
  if (ratios.length) {
    const sorted = [...ratios].sort((a, b) => (b.period || '').localeCompare(a.period || ''));
    const latest = sorted[0];
    const metrics = [
      { label: 'Revenue (LTM)', value: latest.revenue_ltm, unit: 'B', prefix: '$' },
      { label: 'Revenue Growth YoY', value: latest.revenue_growth_yoy, unit: '%' },
      { label: 'COGS / Sales', value: latest.cogs_sales_pct, unit: '%', delta: latest.cogs_sales_yoy_delta },
      { label: 'SG&A / Sales', value: latest.sga_sales_pct, unit: '%', delta: latest.sga_sales_yoy_delta },
      { label: 'EBITDA Margin', value: latest.ebitda_margin_pct, unit: '%', delta: latest.ebitda_margin_yoy_delta },
    ];
    const rows = metrics.filter(m => m.value != null).map(m => {
      const val = m.prefix ? `${m.prefix}${m.value.toFixed(1)}${m.unit}` : `${m.value.toFixed(1)}${m.unit}`;
      let deltaHtml = '';
      if (m.delta != null) {
        const cls = m.delta > 0 ? 'positive' : m.delta < 0 ? 'negative' : '';
        deltaHtml = `<span class="ratio-delta ${cls}">${m.delta > 0 ? '+' : ''}${m.delta.toFixed(1)}pp</span>`;
      }
      return `<tr><td>${m.label}</td><td><strong>${val}</strong></td><td>${deltaHtml}</td></tr>`;
    }).join('');

    financialHtml = `<div class="company-detail-section">
      <h3>Financial Snapshot <span class="detail-period">${latest.period}</span></h3>
      <table class="company-financials-table">${rows}</table>
      <div class="detail-source">Source: Yahoo Finance</div>
    </div>`;
  }

  // Build articles list
  let articlesHtml = '';
  if (articles.length) {
    const items = articles.map(a => `
      <div class="article-item" onclick="window.openArticle('${a.id || a.slug}')" title="${escHtml(a.title)} · ${a.source} · Click to read full article">
        <div class="article-meta">
          <span class="date">${a.date}</span>
          <span class="cat">${a.category}</span>
          <span>${a.source}</span>
        </div>
        <div class="article-title">${escHtml(a.title)}</div>
      </div>
    `).join('');
    articlesHtml = `<div class="company-detail-section">
      <h3>Recent Articles</h3>
      <div class="article-list" style="border:none;border-radius:0">${items}</div>
    </div>`;
  }

  document.getElementById('detail-content').innerHTML =
    financialHtml +
    `<div class="company-detail-section"><h3>Company Profile</h3>${renderMd(page.content)}</div>` +
    articlesHtml;
}

export async function openCompanyByTicker(ticker) {
  const companies = await fetch('/api/wiki?type=company').then(r => r.json());
  const match = companies.find(c => c.frontmatter.ticker === ticker);
  if (match) openWiki(match.id);
}

export async function openCompanyByName(name) {
  const companies = await fetch('/api/wiki?type=company').then(r => r.json());
  const n = name.toLowerCase();
  const match = companies.find(c => c.title === name)
    || companies.find(c => c.title.toLowerCase().startsWith(n))
    || companies.find(c => c.title.toLowerCase().includes(n));
  if (match) openWiki(match.id);
}
