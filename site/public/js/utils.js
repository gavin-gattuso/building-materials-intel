import { marked } from '/marked.esm.js';

function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script,iframe,object,embed,form,link,style').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || (attr.name === 'href' && attr.value.trimStart().startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML;
}

export function renderMd(md) {
  let html;
  if (typeof marked !== 'undefined' && marked.parse) {
    html = marked.parse(md);
  } else {
    html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
  return sanitizeHtml(html);
}

export function escHtml(s) {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function navigateTo(page) {
  if (page === 'drivers' || page === 'concepts') page = 'drivers-concepts';
  document.querySelectorAll('.header-nav a').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  closeDetail();
}

export function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
}

// Highlight search terms in text
export function highlightTerms(text, terms) {
  if (!terms || terms.length === 0) return escHtml(text);
  let result = escHtml(text);
  for (const t of terms) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(re, '<mark>$1</mark>');
  }
  return result;
}
