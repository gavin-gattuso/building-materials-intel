import { escHtml, renderMd, closeDetail } from './utils.js';
import { isFavorite, renderFavoritesSection } from './favorites.js';
import { renderPeerComparisonChart, getRatiosData } from './financial.js';

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

// Cache for favorites re-render and prev/next navigation
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

// Company navigation context
let _navCompanies = [];

async function ensureCompanyList() {
  if (_navCompanies.length) return _navCompanies;
  _navCompanies = await fetch('/api/wiki?type=company').then(r => r.json()).catch(() => []);
  return _navCompanies;
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

  // Build prev/next nav
  const companies = await ensureCompanyList();
  const idx = companies.findIndex(c => c.id === page.id);
  const prev = idx > 0 ? companies[idx - 1] : null;
  const next = idx < companies.length - 1 ? companies[idx + 1] : null;
  const navHtml = (prev || next) ? `<div class="detail-nav-arrows">
    ${prev ? `<button onclick="window.openWiki('${prev.id}')" title="Previous: ${escHtml(prev.title)}">&larr; ${escHtml(prev.title)}</button>` : '<span></span>'}
    ${next ? `<button onclick="window.openWiki('${next.id}')" title="Next: ${escHtml(next.title)}">${escHtml(next.title)} &rarr;</button>` : '<span></span>'}
  </div>` : '';

  // Show overlay immediately with loading state
  document.getElementById('detail-header').innerHTML = `
    ${navHtml}
    <h2>${escHtml(page.title)}</h2>
    <div class="detail-meta-grid">
      ${ticker ? '<span class="detail-ticker">' + escHtml(ticker) + '</span>' : ''}
      ${sector ? '<span>' + escHtml(sector) + '</span>' : ''}
      ${subsector ? '<span>' + escHtml(subsector) + '</span>' : ''}
    </div>
  `;
  document.getElementById('detail-content').innerHTML = '<div style="padding:24px"><div class="skeleton-text w-40" style="height:20px;margin-bottom:16px"></div><div class="skeleton-text w-90"></div><div class="skeleton-text w-75"></div><div class="skeleton-text w-60"></div><div style="margin-top:24px"><div class="skeleton-text w-40" style="height:20px;margin-bottom:16px"></div><div class="skeleton-row"><div class="skeleton" style="width:140px;height:14px"></div><div class="skeleton" style="flex:1;height:20px"></div><div class="skeleton" style="width:55px;height:14px"></div></div><div class="skeleton-row"><div class="skeleton" style="width:120px;height:14px"></div><div class="skeleton" style="flex:1;height:20px"></div><div class="skeleton" style="width:55px;height:14px"></div></div><div class="skeleton-row"><div class="skeleton" style="width:100px;height:14px"></div><div class="skeleton" style="flex:1;height:20px"></div><div class="skeleton" style="width:55px;height:14px"></div></div></div></div>';
  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('detail-overlay').scrollTop = 0;

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

    // Peer comparison chart
    let peerChartHtml = '';
    try {
      const allRatios = getRatiosData();
      if (allRatios && allRatios.length) {
        peerChartHtml = renderPeerComparisonChart(page.title, ratios, allRatios);
      }
    } catch { /* Chart.js may not be loaded */ }

    financialHtml = `<div class="company-detail-section">
      <h3>Financial Snapshot <span class="detail-period">${latest.period}</span></h3>
      <table class="company-financials-table">${rows}</table>
      ${peerChartHtml}
      <div class="detail-source">Source: Yahoo Finance</div>
    </div>`;
  }

  // Build section nav from markdown headings
  const headings = (page.content || '').match(/^## .+$/gm) || [];
  const sectionNav = headings.length > 1
    ? `<div class="detail-section-nav">${headings.map((h, i) => {
        const text = h.replace(/^## /, '');
        return `<a class="detail-section-link" onclick="document.getElementById('comp-section-${i}').scrollIntoView({behavior:'smooth',block:'start'})">${escHtml(text)}</a>`;
      }).join('')}</div>`
    : '';

  // Render profile with section IDs injected
  let sectionIdx = 0;
  const profileHtml = renderMd(page.content).replace(/<h2>/g, () => {
    return `<h2 id="comp-section-${sectionIdx++}">`;
  });

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
    sectionNav +
    `<div class="company-detail-section"><h3>Company Profile</h3>${profileHtml}</div>` +
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
