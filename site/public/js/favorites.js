import { escHtml } from './utils.js';

const STORAGE_KEY = 'bmi-favorite-companies';
const COLLAPSE_KEY = 'bmi-favorites-collapsed';

export function getFavorites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

export function isFavorite(id) {
  return getFavorites().includes(id);
}

export function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  window.dispatchEvent(new CustomEvent('favorites-changed'));
  return idx < 0;
}

function isCollapsed() {
  return localStorage.getItem(COLLAPSE_KEY) === 'true';
}

function toggleCollapse(containerId) {
  const collapsed = !isCollapsed();
  localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  const section = document.getElementById(containerId);
  if (section) {
    const grid = section.querySelector('.favorites-grid');
    const icon = section.querySelector('.collapse-icon');
    if (grid) grid.style.display = collapsed ? 'none' : '';
    if (icon) icon.textContent = collapsed ? '▸' : '▾';
  }
}

export function renderFavoritesSection(containerId, allCompanies, segmentMap) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const favIds = getFavorites();
  if (favIds.length === 0) {
    el.style.display = 'none';
    return;
  }

  const favCompanies = favIds.map(id => allCompanies.find(c => c.id === id)).filter(Boolean);
  if (favCompanies.length === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  const collapsed = isCollapsed();
  el.innerHTML = `
    <div class="favorites-section">
      <div class="favorites-header" onclick="window._toggleFavCollapse('${containerId}')" title="Click to ${collapsed ? 'expand' : 'collapse'} favorites">
        <span class="collapse-icon">${collapsed ? '▸' : '▾'}</span>
        <span>Favorites</span>
        <span class="badge">${favCompanies.length}</span>
      </div>
      <div class="favorites-grid" style="${collapsed ? 'display:none' : ''}">
        ${favCompanies.map(c => {
          const ticker = c.frontmatter.ticker || '';
          const seg = segmentMap[ticker] || '';
          return `<div class="company-card" data-company-id="${c.id}" data-ticker="${ticker}" data-company-name="${escHtml(c.title)}" tabindex="0" onclick="window.openWiki('${c.id}')" title="View ${escHtml(c.title)} profile, financials & recent articles">
            <button class="fav-star active" onclick="event.stopPropagation(); window.toggleFavorite('${c.id}')" aria-label="Remove from favorites" title="Remove from favorites">★</button>
            <div class="ticker">${ticker}</div>
            <div class="name">${escHtml(c.title)}</div>
            ${seg ? '<div class="sector">' + escHtml(seg) + '</div>' : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// Expose collapse toggle globally
window._toggleFavCollapse = toggleCollapse;
