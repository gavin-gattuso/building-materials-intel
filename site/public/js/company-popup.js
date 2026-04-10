import { escHtml } from './utils.js';

let ratiosMap = {};
const articleCache = new Map();
let hoverTimer = null;
let activePopup = null;

export function initCompanyPopup(ratiosData) {
  // Build ratios lookup by ticker (latest period)
  if (ratiosData && ratiosData.length) {
    const periods = [...new Set(ratiosData.map(r => r.period))].sort().reverse();
    const latest = ratiosData.filter(r => r.period === periods[0]);
    for (const r of latest) {
      if (r.revenue_ltm != null) {
        ratiosMap[r.ticker] = { revenue_ltm: r.revenue_ltm, period: r.period };
      }
    }
  }

  // Event delegation for hover/focus
  document.body.addEventListener('mouseenter', onEnter, true);
  document.body.addEventListener('mouseleave', onLeave, true);
  document.body.addEventListener('focusin', onFocusIn, true);
  document.body.addEventListener('focusout', onLeave, true);
}

function getCard(e) {
  return e.target.closest('.company-card');
}

function onEnter(e) {
  const card = getCard(e);
  if (!card) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => showPopup(card), 200);
}

function onFocusIn(e) {
  const card = getCard(e);
  if (!card) return;
  showPopup(card);
}

function onLeave(e) {
  const card = getCard(e);
  if (!card) return;
  clearTimeout(hoverTimer);
  removePopup();
}

async function showPopup(card) {
  removePopup();

  const ticker = card.dataset.ticker;
  const companyName = card.dataset.companyName;
  if (!ticker && !companyName) return;

  // Build content
  const rev = ratiosMap[ticker];
  let revenueHtml = '<div class="popup-revenue"><span class="popup-label">Revenue</span><span class="popup-value">N/A</span></div>';
  if (rev) {
    revenueHtml = `<div class="popup-revenue">
      <span class="popup-label">Revenue (LTM)</span>
      <span class="popup-value">$${rev.revenue_ltm.toFixed(1)}B</span>
      <span class="popup-period">${rev.period}</span>
    </div>`;
  }

  // Create popup immediately with revenue, then load articles
  const popup = document.createElement('div');
  popup.className = 'company-popup';
  popup.innerHTML = `${revenueHtml}<div class="popup-divider"></div><div class="popup-news"><div class="skeleton-text w-90" style="height:12px"></div><div class="skeleton-text w-75" style="height:12px"></div><div class="skeleton-text w-60" style="height:12px"></div></div>`;
  document.body.appendChild(popup);
  activePopup = popup;
  positionPopup(popup, card);

  // Fetch articles
  let articles = articleCache.get(companyName);
  if (!articles) {
    try {
      articles = await fetch(`/api/articles?company=${encodeURIComponent(companyName)}&limit=3`).then(r => r.json());
      articleCache.set(companyName, articles);
    } catch {
      articles = [];
    }
  }

  // Popup may have been removed during fetch
  if (activePopup !== popup) return;

  const newsEl = popup.querySelector('.popup-news');
  if (articles.length) {
    newsEl.innerHTML = articles.map(a => {
      const d = new Date(a.date + 'T00:00:00');
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="popup-news-item">
        <span class="popup-news-date">${dateStr}</span>
        <span class="popup-news-title">${escHtml(a.title)}</span>
      </div>`;
    }).join('');
  } else {
    newsEl.innerHTML = '<div class="popup-loading">No recent articles</div>';
  }
}

function positionPopup(popup, card) {
  const rect = card.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2;

  // Need to measure after render
  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    // Flip above if overflows bottom
    if (top + pr.height > window.innerHeight - 8) {
      top = rect.top - pr.height - 8;
    }
    // Clamp horizontal
    const halfW = pr.width / 2;
    if (left - halfW < 8) left = halfW + 8;
    if (left + halfW > window.innerWidth - 8) left = window.innerWidth - halfW - 8;

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  });
}

function removePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}
