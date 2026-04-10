import { escHtml } from './utils.js';

const NEWS_CATEGORIES = [
  'M&A and Corporate Strategy',
  'Pricing & Cost Trends',
  'Tariffs & Trade Policy',
  'Company Earnings & Performance',
  'Demand & Construction Activity',
  'Sustainability & Innovation',
];
const MARKET_DRIVERS = [
  'Interest & Mortgage Rates',
  'Labor Dynamics',
  'Material & Energy Costs',
  'Demand Visibility',
  'Government Infrastructure Spending',
  'Credit Availability & Lending Standards',
  'GDP Growth & Consumer Confidence',
];

export async function loadReportDownloads() {
  try {
    const reports = await fetch('/reports.json').then(r => r.ok ? r.json() : []);
    const el = document.getElementById('report-downloads');
    if (!Array.isArray(reports) || reports.length === 0) {
      el.innerHTML = '<div class="loading">No published reports available yet.</div>';
      return;
    }
    el.innerHTML = reports.map(r => {
      const sizeMB = r.size > 1024*1024 ? (r.size / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(r.size / 1024) + ' KB';
      const date = new Date(r.modified).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const ext = r.filename.endsWith('.html') ? 'HTML' : 'PDF';
      return `<a class="report-card" href="/reports/${encodeURIComponent(r.filename)}" ${r.filename.endsWith('.html') ? 'download' : 'target="_blank"'} title="Download ${escHtml(r.name)} (${sizeMB})">
        <div class="report-card-icon" ${ext==='HTML'?'style="background:var(--accent-bg,#E8F5E9);color:var(--av-mid,#2E7D52)"':''}>${ext}</div>
        <div class="report-card-info">
          <div class="report-card-title">${escHtml(r.name)}</div>
          <div class="report-card-meta">${sizeMB} &middot; ${date}</div>
        </div>
      </a>`;
    }).join('');
  } catch {
    document.getElementById('report-downloads').innerHTML = '<div class="loading">Could not load reports.</div>';
  }
}

export async function loadReports() {
  try {
    const sections = await fetch('/api/av-sections').then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
    if (!Array.isArray(sections) || sections.length === 0) {
      document.getElementById('coverage-grid').innerHTML = '<div class="loading">No report sections configured. Run migrate-av-reports-schema.ts first.</div>';
      return;
    }
    const coverage = await fetch('/api/av-coverage').then(r => r.ok ? r.json() : []).catch(() => []);
    const countMap = {};
    if (Array.isArray(coverage)) {
      for (const s of coverage) {
        const count = s.article_av_sections?.[0]?.count || 0;
        countMap[s.slug] = count;
      }
    }
    const maxCount = Math.max(1, ...Object.values(countMap));

    document.getElementById('coverage-grid').innerHTML = sections.map(s => {
      const count = countMap[s.slug] || 0;
      const pct = Math.round((count / maxCount) * 100);
      return `<div class="coverage-card" onclick="window.openReportSection('${s.slug}')" title="${escHtml(s.title)} — ${count} tagged articles · Click to view">
        <div style="flex:1">
          <div class="coverage-title">${s.section_order}. ${escHtml(s.title)}</div>
          <div class="coverage-bar"><div class="coverage-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="coverage-count">${count}</div>
      </div>`;
    }).join('');
  } catch {
    document.getElementById('coverage-grid').innerHTML = '<div class="loading">Report sections unavailable (Supabase not configured).</div>';
  }
}

export async function openReportSection(slug) {
  try {
    const data = await fetch('/api/av-sections/' + slug).then(r => { if (!r.ok) throw new Error(r.status + ''); return r.json(); });
    document.getElementById('coverage-grid').style.display = 'none';
    const detail = document.getElementById('report-section-detail');
    detail.style.display = 'block';
    document.getElementById('report-section-title').textContent = data.title;
    document.getElementById('report-section-desc').textContent = data.description || '';
    const articles = data.articles || [];
    document.getElementById('report-section-articles').innerHTML = articles.length
      ? articles.map(t => {
          const a = t.articles;
          if (!a) return '';
          const score = Math.round((t.relevance_score || 0) * 100);
          return `<div class="article-item" onclick="window.openArticle('${a.slug}')" title="${escHtml(a.title || '')} · ${a.source || ''} · ${score}% relevance · Click to read">
            <div class="article-meta">
              <span class="date">${a.date || ''}</span>
              <span class="cat">${a.category || ''}</span>
              <span>${a.source || ''}</span>
              <span style="margin-left:auto;font-size:11px;color:var(--primary)">${score}% match</span>
            </div>
            <div class="article-title">${escHtml(a.title || '')}</div>
          </div>`;
        }).join('')
      : '<div class="loading">No articles tagged for this section yet. Run tag-articles-with-av-sections.ts to populate.</div>';
  } catch (err) {
    console.error('Failed to load report section:', err);
  }
}

export function initReportGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  document.getElementById('rg-start').value = sixMonthsAgo;
  document.getElementById('rg-end').value = today;

  window.generateReport = generateReport;
  window.openReportSection = openReportSection;
}

async function generateReport() {
  const startDate = document.getElementById('rg-start').value;
  const endDate = document.getElementById('rg-end').value;
  if (!startDate || !endDate) return alert('Please select both start and end dates.');

  const btn = document.getElementById('rg-btn');
  const progress = document.getElementById('rg-progress');
  btn.disabled = true;
  progress.style.display = 'block';

  function setStep(steps) {
    progress.innerHTML = steps.map(s =>
      `<div class="rg-step ${s.status}">${s.label}</div>`
    ).join('');
  }

  try {
    setStep([
      { label: 'Fetching latest articles from knowledge base...', status: 'active' },
      { label: 'AI analyzing 7 market health drivers...', status: '' },
      { label: 'AI synthesizing 6 news categories...', status: '' },
      { label: 'Writing executive summary, narrative & conclusion...', status: '' },
      { label: 'Generating Market Scope, Context, Snapshot & Outlook...', status: '' },
      { label: 'Building interactive dashboard...', status: '' },
    ]);

    // Animate progress steps while waiting for the server
    let step = 0;
    const stepTimings = [3000, 10000, 10000, 8000, 8000]; // estimated ms per phase
    const progressTimer = setInterval(() => {
      step++;
      if (step >= 6) { clearInterval(progressTimer); return; }
      const steps = [
        { label: 'Fetching latest articles from knowledge base...', status: 'done' },
        { label: 'AI analyzing 7 market health drivers...', status: step >= 1 ? (step > 1 ? 'done' : 'active') : '' },
        { label: 'AI synthesizing 6 news categories...', status: step >= 2 ? (step > 2 ? 'done' : 'active') : '' },
        { label: 'Writing executive summary, narrative & conclusion...', status: step >= 3 ? (step > 3 ? 'done' : 'active') : '' },
        { label: 'Generating Market Scope, Context, Snapshot & Outlook...', status: step >= 4 ? (step > 4 ? 'done' : 'active') : '' },
        { label: 'Building interactive dashboard...', status: step >= 5 ? 'active' : '' },
      ];
      setStep(steps);
    }, stepTimings[step] || 5000);

    // Single server call — AI generates everything from live KB data
    const docResponse = await fetch('/api/build-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, mode: 'ai' }),
    });

    clearInterval(progressTimer);

    if (!docResponse.ok) {
      const errDetail = await docResponse.text();
      throw new Error(`Failed to build report: ${errDetail}`);
    }

    const blob = await docResponse.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Building_Materials_Dashboard_${startDate}_to_${endDate}.html`;
    a.click();
    URL.revokeObjectURL(url);

    setStep([
      { label: 'Fetching latest articles from knowledge base...', status: 'done' },
      { label: 'AI analyzing 7 market health drivers...', status: 'done' },
      { label: 'AI synthesizing 6 news categories...', status: 'done' },
      { label: 'Writing executive summary, narrative & conclusion...', status: 'done' },
      { label: 'Generating Market Scope, Context, Snapshot & Outlook...', status: 'done' },
      { label: 'Building interactive dashboard...', status: 'done' },
      { label: 'Report downloaded successfully!', status: 'done' },
    ]);
  } catch (err) {
    progress.innerHTML = `<div class="rg-step" style="color:var(--danger-text)">Error: ${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}
