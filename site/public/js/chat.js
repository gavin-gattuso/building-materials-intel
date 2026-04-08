import { escHtml, renderMd, highlightTerms } from './utils.js';

let chatHistory = [];
let chatMode = 'search';

function renderSearchResults(data) {
  const results = data.results || [];
  if (results.length === 0) return '<p>No matching results found. Try different search terms.</p>';
  const answerHtml = renderMd(data.answer);
  const cardsHtml = results.map(r => {
    const isArticle = r.type === 'article';
    const onclick = isArticle ? `window.openArticle('${r.id}')` : `window.openWiki('${r.id}')`;
    const excerpts = r.excerpts?.length
      ? `<ul class="search-result-excerpts">${r.excerpts.map(e => `<li>${highlightTerms(e, r.matchedTerms)}</li>`).join('')}</ul>`
      : '';
    const meta = isArticle
      ? `<span>${r.date}</span><span>${r.source}</span><span>${r.category}</span>`
      : `<span>${r.wikiType}</span>`;
    const companies = isArticle && r.companies?.length
      ? `<div class="search-result-tags">${r.companies.map(c => `<span class="search-result-tag">${escHtml(c)}</span>`).join('')}</div>`
      : '';
    return `<div class="search-result-card" onclick="${onclick}" title="${escHtml(r.title)} · ${r.score} pts · Click to view full ${isArticle ? 'article' : 'page'}">
      <div class="search-result-header">
        <span class="search-result-title">${escHtml(r.title)}</span>
        <span class="search-result-score">${r.score} pts</span>
      </div>
      <div class="search-result-meta">${meta}</div>
      ${excerpts}
      ${companies}
    </div>`;
  }).join('');
  return `
    <div class="chat-mode-badge search">Smart Search &mdash; ${results.length} results</div>
    ${answerHtml}
    <div class="search-results">${cardsHtml}</div>
  `;
}

function renderAIResponse(data) {
  const answerHtml = renderMd(data.answer);
  const sourcesHtml = data.sources?.length ? `
    <details class="chat-sources">
      <summary>${data.sources.length} sources referenced</summary>
      <ul class="source-list">
        ${data.sources.map(s => `<li><strong>[${s.index}]</strong> ${escHtml(s.title)} ${s.date ? '(' + s.date + ', ' + s.source + ')' : '(' + s.type + ')'} ${s.url ? '<a href="' + s.url + '" target="_blank">link</a>' : ''}</li>`).join('')}
      </ul>
    </details>
  ` : '';
  return `
    <div class="chat-mode-badge ai">AI Synthesis</div>
    ${answerHtml}${sourcesHtml}
  `;
}

export function initChat() {
  fetch('/api/mode').then(r => r.json()).then(data => {
    chatMode = data.aiEnabled ? 'ai' : 'search';
    const desc = document.getElementById('chat-mode-desc');
    if (desc) {
      desc.textContent = data.aiEnabled
        ? 'AI synthesis mode: Claude analyzes your question against the knowledge base and provides cited answers.'
        : 'Smart search mode: searches the knowledge base and shows relevant articles and wiki pages.';
    }
  }).catch(() => {});

  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  document.getElementById('chat-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  window.sendChat = sendChat;
  window.askSuggestion = function(el) {
    document.getElementById('chat-input').value = el.textContent;
    sendChat();
  };
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  input.style.height = 'auto';

  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const messagesEl = document.getElementById('chat-messages');
  messagesEl.innerHTML += `<div class="chat-msg user"><div class="chat-bubble">${escHtml(msg)}</div></div>`;
  messagesEl.innerHTML += `<div class="chat-msg assistant" id="typing"><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  document.getElementById('chat-send').disabled = true;
  chatHistory.push({ role: 'user', content: msg });
  if (chatHistory.length > 50) chatHistory = chatHistory.slice(-50);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory }),
    });
    document.getElementById('typing')?.remove();
    const data = await res.json();

    if (data.error) {
      messagesEl.innerHTML += `<div class="chat-msg assistant"><div class="chat-bubble" style="color:var(--danger-text)">Error: ${escHtml(data.error)}</div></div>`;
    } else {
      const html = data.mode === 'ai' ? renderAIResponse(data) : renderSearchResults(data);
      messagesEl.innerHTML += `<div class="chat-msg assistant"><div class="chat-bubble">${html}</div></div>`;
      chatHistory.push({ role: 'assistant', content: data.answer });
    }
  } catch (err) {
    document.getElementById('typing')?.remove();
    messagesEl.innerHTML += `<div class="chat-msg assistant"><div class="chat-bubble" style="color:var(--danger-text)">Failed to connect. Is the server running?</div></div>`;
  }

  document.getElementById('chat-send').disabled = false;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
