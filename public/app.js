/* ================================================================
   StringHunter v2.0 PRO — Client Application Logic
   ================================================================ */

// ── DOM refs ──────────────────────────────────────────────────────
const targetUrlInput    = document.getElementById('targetUrl');
const directInputEl     = document.getElementById('directInput');
const extractModeSelect = document.getElementById('extractMode');
const outputFormatSelect= document.getElementById('outputFormat');
const extractBtn        = document.getElementById('extractBtn');
const normalForm        = document.getElementById('normalForm');
const diffForm          = document.getElementById('diffForm');
const normalModeBtn     = document.getElementById('normalModeBtn');
const diffModeBtn       = document.getElementById('diffModeBtn');

// Dynamic fields
const regexFields    = document.getElementById('regexFields');
const betweenFields  = document.getElementById('betweenFields');
const linesFields    = document.getElementById('linesFields');
const jsonPathFields = document.getElementById('jsonPathFields');

const regexPatternInput = document.getElementById('regexPattern');
const regexFlagsInput   = document.getElementById('regexFlags');
const startMarkerInput  = document.getElementById('startMarker');
const endMarkerInput    = document.getElementById('endMarker');
const startLineInput    = document.getElementById('startLine');
const endLineInput      = document.getElementById('endLine');
const jsonPathInput     = document.getElementById('jsonPath');

const diffUrl1Input  = document.getElementById('diffUrl1');
const diffUrl2Input  = document.getElementById('diffUrl2');

// Terminal log steps
const progressLogger = document.getElementById('progressLogger');
const stepFetch      = document.getElementById('stepFetch');
const stepAnalyze    = document.getElementById('stepAnalyze');
const stepSecurity   = document.getElementById('stepSecurity');
const stepFinalize   = document.getElementById('stepFinalize');

// Results
const resultsPanel       = document.getElementById('resultsPanel');
const fetchStrategyBadge = document.getElementById('fetchStrategyBadge');
const languageBadge      = document.getElementById('languageBadge');
const encodingBadge      = document.getElementById('encodingBadge');
const securityBanner     = document.getElementById('securityBanner');
const securityWarningList= document.getElementById('securityWarningList');
const securitySafeBanner = document.getElementById('securitySafeBanner');

const statSize  = document.getElementById('statSize');
const statChars = document.getElementById('statChars');
const statLines = document.getElementById('statLines');
const statWords = document.getElementById('statWords');

const diffTabBtn     = document.getElementById('diffTabBtn');
const extractedTitle = document.getElementById('extractedTitle');
const extractedCodeBlock = document.getElementById('extractedCodeBlock');
const rawCodeBlock   = document.getElementById('rawCodeBlock');
const diffBlock      = document.getElementById('diffBlock');

const reportSummary        = document.getElementById('reportSummary');
const metaAuthor           = document.getElementById('metaAuthor');
const metaVersion          = document.getElementById('metaVersion');
const metaDate             = document.getElementById('metaDate');
const metaExtractionNotes  = document.getElementById('metaExtractionNotes');
const metaComments         = document.getElementById('metaComments');

const historyList    = document.getElementById('historyList');
const clearHistoryBtn= document.getElementById('clearHistoryBtn');

const liveLatencyEl    = document.getElementById('liveLatency');
const sideLatencyEl    = document.getElementById('sideLatency');
const activeEngineModeEl= document.getElementById('activeEngineMode');
const extractCountEl   = document.getElementById('extractCount');
const localClockEl     = document.getElementById('localClock');

// ── State ─────────────────────────────────────────────────────────
let currentAppMode  = 'normal';
let activeTab       = 'loadstringsTab';
let searchHistory   = [];
let totalExtractions= 0;

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  toggleOptionFields();
  startClock();

  extractBtn.addEventListener('click', handleAction);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

  // Live direct input
  if (directInputEl) {
    directInputEl.addEventListener('input', handleDirectInput);
  }

  // default tab
  switchTab('loadstringsTab');
});

// ── Clock ─────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    if (localClockEl) localClockEl.textContent = `${hh}:${mm}:${ss}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ── App Mode ──────────────────────────────────────────────────────
function setAppMode(mode) {
  currentAppMode = mode;
  if (mode === 'normal') {
    normalModeBtn.classList.add('active');
    diffModeBtn.classList.remove('active');
    normalForm.style.display = '';
    diffForm.style.display = 'none';
    diffTabBtn.style.display = 'none';
    if (activeTab === 'diffTab') switchTab('loadstringsTab');
  } else {
    normalModeBtn.classList.remove('active');
    diffModeBtn.classList.add('active');
    normalForm.style.display = 'none';
    diffForm.style.display = '';
    diffTabBtn.style.display = '';
    switchTab('diffTab');
  }
  if (activeEngineModeEl) {
    activeEngineModeEl.textContent = mode === 'normal' ? 'Normal Extractor' : 'Diff Engine';
  }
}

// ── Dynamic Fields ────────────────────────────────────────────────
function toggleOptionFields() {
  const mode = extractModeSelect.value;
  regexFields.style.display    = mode === 'regex'      ? '' : 'none';
  betweenFields.style.display  = mode === 'between'    ? '' : 'none';
  linesFields.style.display    = mode === 'lines'      ? '' : 'none';
  jsonPathFields.style.display = mode === 'json_path'  ? '' : 'none';
}

// ── Presets ───────────────────────────────────────────────────────
function applyPreset(type) {
  setAppMode('normal');
  if (type === 'loadstring') {
    targetUrlInput.value = 'https://raw.githubusercontent.com/user/repo/main/script.lua';
    extractModeSelect.value = 'loadstring';
    outputFormatSelect.value = 'summary';
  } else if (type === 'base64') {
    targetUrlInput.value = 'https://raw.githubusercontent.com/user/repo/main/obfuscated.txt';
    extractModeSelect.value = 'base64_auto';
    outputFormatSelect.value = 'summary';
  } else if (type === 'json') {
    targetUrlInput.value = 'https://api.github.com/repos/expressjs/express';
    extractModeSelect.value = 'auto';
    outputFormatSelect.value = 'summary';
  }
  toggleOptionFields();
}

// ── Direct Input (Live) ───────────────────────────────────────────
function handleDirectInput() {
  const text = directInputEl.value;
  if (!text.trim()) return;

  targetUrlInput.value = '';

  const chars  = text.length;
  const lines  = text.split(/\r?\n/).length;
  const words  = text.split(/\s+/).filter(w => w.length > 0).length;
  const sizeKb = (chars / 1024).toFixed(2);

  updateStat(statSize,  `${sizeKb} KB`);
  updateStat(statChars, chars.toLocaleString());
  updateStat(statLines, lines.toLocaleString());
  updateStat(statWords, words.toLocaleString());

  // Live monitoring
  if (liveLatencyEl)     liveLatencyEl.textContent  = '0ms (Local)';
  if (sideLatencyEl)     sideLatencyEl.textContent  = '0ms';
  if (activeEngineModeEl) activeEngineModeEl.textContent = 'Live Buffer';

  // Render
  const found = clientExtractLoadstrings(text);
  renderLoadstringCards(found);

  extractedCodeBlock.textContent = text;
  rawCodeBlock.textContent = text;
  extractedTitle.textContent = 'direct_input.lua';

  resultsPanel.style.display = '';
  switchTab('loadstringsTab');
}

// Flash animation for stat values
function updateStat(el, val) {
  el.textContent = val;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ── Tab Switching ─────────────────────────────────────────────────
function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });
}

// ── Terminal Logger ───────────────────────────────────────────────
function setStepStatus(el, status, text) {
  const icon = el.querySelector('.tlog-icon');
  el.className = 'tlog-line';

  const icons = {
    waiting: { cls: 'waiting', char: '○' },
    active:  { cls: 'running', char: '◉' },
    success: { cls: 'success', char: '✓' },
    failed:  { cls: 'failed',  char: '✗' },
  };
  const cfg = icons[status] || icons.waiting;
  icon.className  = `tlog-icon ${cfg.cls}`;
  icon.textContent = cfg.char;

  if (status === 'active')   el.classList.add('tlog-running');
  if (status === 'success')  el.classList.add('tlog-success');
  if (status === 'failed')   el.classList.add('tlog-failed');

  if (text) el.querySelector('.tlog-text').textContent = text;
}

function resetProgressLogger() {
  progressLogger.style.display = '';
  setStepStatus(stepFetch,    'waiting', 'Fetch: Menghubungkan ke URL target...');
  setStepStatus(stepAnalyze,  'waiting', 'Analyze: Mendeteksi bahasa & encoding...');
  setStepStatus(stepSecurity, 'waiting', 'Security: Memindai pola berbahaya & kredensial...');
  setStepStatus(stepFinalize, 'waiting', 'Output: Memformat hasil & menyusun laporan...');
}

// ── Handle Action ─────────────────────────────────────────────────
async function handleAction() {
  if (currentAppMode === 'normal') await runNormalExtraction();
  else await runDiffExtraction();
}

// ── Normal Extraction ─────────────────────────────────────────────
async function runNormalExtraction(urlOverride = null) {
  const url = urlOverride || targetUrlInput.value.trim();
  if (!url) {
    showToast('Harap masukkan URL target terlebih dahulu.', 'warn');
    return;
  }

  setButtonLoading(true);
  resultsPanel.style.display = 'none';
  resetProgressLogger();

  const modeName = extractModeSelect.options[extractModeSelect.selectedIndex].text.replace(/^[\p{Emoji}\s]+/u, '').trim();
  if (activeEngineModeEl) activeEngineModeEl.textContent = modeName;

  const payload = {
    url,
    mode: extractModeSelect.value,
    format: 'summary',
    options: {
      regexPattern: regexPatternInput?.value.trim() || '',
      regexFlags:   regexFlagsInput?.value.trim()   || 'gi',
      startMarker:  startMarkerInput?.value         || '',
      endMarker:    endMarkerInput?.value           || '',
      startLine:    startLineInput?.value           || 1,
      endLine:      endLineInput?.value             || 50,
      jsonPath:     jsonPathInput?.value.trim()     || '',
      recursivelyInline: document.getElementById('recursivelyInline')?.checked || false,
    }
  };

  const t0 = performance.now();
  try {
    setStepStatus(stepFetch, 'active');

    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Kesalahan server.');

    const ms = Math.round(performance.now() - t0);
    if (liveLatencyEl)  liveLatencyEl.textContent  = `~${ms}ms`;
    if (sideLatencyEl)  sideLatencyEl.textContent  = `~${ms}ms`;

    setStepStatus(stepFetch, 'success', `Fetch ✓ — Strategi: ${data.strategy.toUpperCase()}`);

    setStepStatus(stepAnalyze, 'active');
    await delay(500);
    setStepStatus(stepAnalyze, 'success', `Analyze ✓ — ${data.language} (${data.encoding})`);

    setStepStatus(stepSecurity, 'active');
    await delay(500);
    if (data.isDangerous) {
      setStepStatus(stepSecurity, 'failed', 'Security ✗ — Pola berbahaya terdeteksi!');
    } else {
      setStepStatus(stepSecurity, 'success', 'Security ✓ — Aman, tidak ada ancaman kritis.');
    }

    setStepStatus(stepFinalize, 'active');
    await delay(350);
    setStepStatus(stepFinalize, 'success', 'Output ✓ — Laporan siap.');

    renderResults(data);
    saveToHistory(url, data.language, new Date().toLocaleTimeString());

    totalExtractions++;
    if (extractCountEl) extractCountEl.textContent = totalExtractions;

    await delay(1200);
    progressLogger.style.display = 'none';

  } catch (err) {
    setStepStatus(stepFetch, 'failed', `Fetch ✗ — ${err.message}`);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(false);
  }
}

// ── Diff Extraction ───────────────────────────────────────────────
async function runDiffExtraction() {
  const url1 = diffUrl1Input?.value.trim();
  const url2 = diffUrl2Input?.value.trim();
  if (!url1 || !url2) {
    showToast('Harap masukkan kedua URL untuk perbandingan.', 'warn');
    return;
  }

  setButtonLoading(true);
  resultsPanel.style.display = 'none';
  resetProgressLogger();
  if (activeEngineModeEl) activeEngineModeEl.textContent = 'Diff Engine';

  const t0 = performance.now();
  try {
    setStepStatus(stepFetch, 'active', 'Fetch: Mengambil URL pertama (Lama)...');
    const r1 = await fetch('/api/extract', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url:url1, mode:'full', format:'summary'}) });
    const d1 = await r1.json();
    if (!r1.ok) throw new Error(`URL 1: ${d1.error}`);
    setStepStatus(stepFetch, 'success', 'Fetch ✓ — URL pertama berhasil diambil.');

    setStepStatus(stepAnalyze, 'active', 'Fetch: Mengambil URL kedua (Baru)...');
    const r2 = await fetch('/api/extract', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url:url2, mode:'full', format:'summary'}) });
    const d2 = await r2.json();
    if (!r2.ok) throw new Error(`URL 2: ${d2.error}`);
    setStepStatus(stepAnalyze, 'success', 'Fetch ✓ — URL kedua berhasil diambil.');

    setStepStatus(stepSecurity, 'active', 'Diff: Membandingkan perbedaan baris...');
    const dr = await fetch('/api/diff', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text1:d1.rawContent, text2:d2.rawContent}) });
    const dd = await dr.json();
    if (!dr.ok) throw new Error(`Diff: ${dd.error}`);
    setStepStatus(stepSecurity, 'success', 'Diff ✓ — Perbandingan selesai.');

    const ms = Math.round(performance.now() - t0);
    if (liveLatencyEl) liveLatencyEl.textContent = `~${ms}ms`;
    if (sideLatencyEl) sideLatencyEl.textContent = `~${ms}ms`;

    setStepStatus(stepFinalize, 'active');
    renderDiffResults(dd.diff, d1, d2);
    setStepStatus(stepFinalize, 'success', 'Output ✓ — Diff siap ditampilkan.');

    await delay(1200);
    progressLogger.style.display = 'none';

  } catch (err) {
    setStepStatus(stepFetch, 'failed', `Error: ${err.message}`);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    setButtonLoading(false);
  }
}

// ── Render Results ────────────────────────────────────────────────
function renderResults(data) {
  resultsPanel.style.display = '';

  // Badges
  fetchStrategyBadge.textContent = (data.strategy || 'DIRECT').toUpperCase();
  languageBadge.textContent      = (data.language  || 'UNKNOWN').toUpperCase();
  encodingBadge.textContent      = data.encoding   || 'UTF-8';

  // Security
  if (data.warnings && data.warnings.length > 0) {
    securityBanner.style.display = '';
    securitySafeBanner.style.display = 'none';
    securityWarningList.innerHTML = '';
    data.warnings.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      securityWarningList.appendChild(li);
    });
  } else {
    securityBanner.style.display = 'none';
    securitySafeBanner.style.display = '';
  }

  // Stats
  updateStat(statSize,  `${data.stats.size} KB`);
  updateStat(statChars, data.stats.chars.toLocaleString());
  updateStat(statLines, data.stats.lines.toLocaleString());
  updateStat(statWords, data.stats.words.toLocaleString());

  // Loadstrings
  const all = [
    ...clientExtractLoadstrings(data.extractedContent || ''),
    ...clientExtractLoadstrings(data.rawContent || '')
  ].filter((v, i, s) => s.indexOf(v) === i);
  renderLoadstringCards(all);

  // Code tabs
  const fmt = outputFormatSelect.value;
  if (fmt === 'annotated') {
    let ann = `-- StringHunter Extraction Annotation\n-- SOURCE: ${data.source}\n-- LANGUAGE: ${data.language}\n-- WARNINGS: ${(data.warnings||[]).join(', ')||'None'}\n\n`;
    extractedCodeBlock.textContent = ann + (data.extractedContent || '');
  } else {
    extractedCodeBlock.textContent = data.extractedContent || '';
  }
  extractedTitle.textContent = `extracted_${(data.language||'content').toLowerCase()}.txt`;
  rawCodeBlock.textContent = data.rawContent || '';

  // Report
  reportSummary.textContent       = data.summary || '';
  metaAuthor.textContent          = data.metadata?.author   || '—';
  metaVersion.textContent         = data.metadata?.version  || '—';
  metaDate.textContent            = data.metadata?.date     || '—';
  metaExtractionNotes.textContent = data.extractionNotes    || 'OK';
  metaComments.textContent        = data.metadata?.commentHeader || 'Tidak ada komentar header.';

  switchTab('loadstringsTab');
}

function renderDiffResults(diffRows, old, nw) {
  resultsPanel.style.display = '';

  fetchStrategyBadge.textContent = 'DIFF';
  languageBadge.textContent      = (old.language || 'UNKNOWN').toUpperCase();
  encodingBadge.textContent      = 'UTF-8';

  securityBanner.style.display = 'none';
  securitySafeBanner.style.display = '';
  securitySafeBanner.querySelector('span:last-child').textContent =
    `Membandingkan ${old.stats.lines} baris vs ${nw.stats.lines} baris.`;

  updateStat(statSize,  `${nw.stats.size} KB`);
  updateStat(statChars, nw.stats.chars.toLocaleString());
  updateStat(statLines, nw.stats.lines.toLocaleString());
  updateStat(statWords, nw.stats.words.toLocaleString());

  extractedTitle.textContent       = `diff_new_${nw.language||'txt'}.txt`;
  extractedCodeBlock.textContent   = nw.rawContent || '';
  rawCodeBlock.textContent         = old.rawContent || '';

  reportSummary.textContent        = `Membandingkan lama (${old.source}) dengan baru (${nw.source}).`;
  metaAuthor.textContent           = nw.metadata?.author  || '—';
  metaVersion.textContent          = `Old: ${old.metadata?.version||'—'} | New: ${nw.metadata?.version||'—'}`;
  metaDate.textContent             = nw.metadata?.date    || '—';
  metaExtractionNotes.textContent  = 'Diff selesai.';
  metaComments.textContent         = `Old:\n${old.metadata?.commentHeader||''}\n\nNew:\n${nw.metadata?.commentHeader||''}`;

  diffBlock.innerHTML = '';
  if (!diffRows || diffRows.length === 0) {
    diffBlock.innerHTML = '<p class="empty-diff">Kedua dokumen identik — tidak ada perbedaan.</p>';
  } else {
    diffRows.forEach(row => {
      const div = document.createElement('div');
      div.className = `diff-row ${row.type}`;

      const numSpan = document.createElement('span');
      numSpan.className = 'diff-line-num';
      numSpan.textContent = row.line || row.lineNum1 || row.lineNum2 || '';

      const txtSpan = document.createElement('span');
      txtSpan.className = 'diff-text';
      const prefix = row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  ';
      txtSpan.textContent = prefix + (row.text || '');

      div.appendChild(numSpan);
      div.appendChild(txtSpan);
      diffBlock.appendChild(div);
    });
  }

  switchTab('diffTab');
}

// ── Loadstring Cards ──────────────────────────────────────────────
function renderLoadstringCards(list) {
  const container = document.getElementById('loadstringsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!list || list.length === 0) {
    container.innerHTML = '<p class="empty-hint center">Tidak ada loadstring yang terdeteksi.</p>';
    return;
  }

  list.forEach((ls, i) => {
    const card = document.createElement('div');
    card.className = 'ls-card';
    card.innerHTML = `
      <div class="ls-card-header">
        <span class="ls-badge">🎯 LOADSTRING #${i + 1}</span>
        <button class="btn-ghost" onclick="copyCardText('ls-code-${i}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Salin
        </button>
      </div>
      <div class="ls-card-body">
        <pre><code id="ls-code-${i}">${escapeHtml(ls)}</code></pre>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── Extractor ────────────────────────────────────────────────────
function clientExtractLoadstrings(text) {
  if (!text) return [];
  const matches = [];

  // loadstring(...) calls
  const lsRx = /loadstring\s*\(\s*([\s\S]*?)\s*\)/gi;
  let m;
  while ((m = lsRx.exec(text)) !== null) {
    if (!matches.includes(m[0])) matches.push(m[0]);
  }

  // game:HttpGet patterns
  const httpRx = /(?:game|game\.HttpService)[:\.]HttpGet(?:Async)?\s*\(\s*(["'])(https?:\/\/[^"'\)]+)\1\s*\)/gi;
  while ((m = httpRx.exec(text)) !== null) {
    if (!matches.includes(m[0])) matches.push(m[0]);
  }

  // Fallback — plain URLs
  if (matches.length === 0) {
    const urlRx = /https?:\/\/[^\s"'`\(\)<>]+/g;
    (text.match(urlRx) || []).forEach(url => {
      if (/raw|pastebin|github|\.lua|\.txt/i.test(url)) {
        const fmt = `loadstring(game:HttpGet("${url.replace(/&amp;/g,'&')}"))()`; 
        if (!matches.includes(fmt)) matches.push(fmt);
      }
    });
  }

  return matches;
}

// ── Copy helpers ──────────────────────────────────────────────────
async function copyCardText(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent);
    showToast('Loadstring disalin!', 'success');
  } catch { showToast('Gagal menyalin.', 'error'); }
}

function copyAllLoadstrings() {
  const codes = document.querySelectorAll('#loadstringsContainer code');
  if (!codes.length) { showToast('Tidak ada loadstring.', 'warn'); return; }
  const all = Array.from(codes).map(c => c.textContent).join('\n');
  navigator.clipboard.writeText(all)
    .then(() => showToast('Semua loadstring disalin!', 'success'))
    .catch(() => showToast('Gagal menyalin.', 'error'));
}

async function copyContent(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.innerText);
    showToast('Konten disalin!', 'success');
  } catch { showToast('Gagal menyalin.', 'error'); }
}

// ── Button Loading ────────────────────────────────────────────────
function setButtonLoading(loading) {
  const content = extractBtn.querySelector('.btn-content');
  const loader  = extractBtn.querySelector('.btn-loading');
  extractBtn.disabled = loading;
  if (content) content.style.display = loading ? 'none' : '';
  if (loader)  loader.style.display  = loading ? '' : 'none';
}

// ── Toast Notification ────────────────────────────────────────────
function showToast(msg, type = 'info') {
  // Remove existing toast
  document.querySelectorAll('.sh-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'sh-toast';

  const colors = { success: '#22c55e', error: '#ef4444', warn: '#f59e0b', info: '#00d4ff' };
  const color = colors[type] || colors.info;

  toast.style.cssText = `
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    background: rgba(10, 12, 22, 0.95); border: 1px solid ${color}44;
    color: #fff; padding: 12px 18px; border-radius: 12px;
    font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}22;
    backdrop-filter: blur(20px); display: flex; align-items: center; gap: 8px;
    animation: toastIn 0.25s cubic-bezier(0.16,1,0.3,1);
    border-left: 3px solid ${color};
  `;

  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;
  toast.appendChild(dot);
  toast.appendChild(document.createTextNode(msg));
  document.body.appendChild(toast);

  // Add keyframe once
  if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`;
    document.head.appendChild(style);
  }

  setTimeout(() => toast.remove(), 3200);
}

// ── History ───────────────────────────────────────────────────────
function saveToHistory(url, lang, time) {
  searchHistory = searchHistory.filter(i => i.url !== url);
  searchHistory.unshift({ url, language: lang, time });
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('sh_history', JSON.stringify(searchHistory));
  renderHistory();
}

function loadHistory() {
  try {
    searchHistory = JSON.parse(localStorage.getItem('sh_history') || '[]');
  } catch { searchHistory = []; }
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  if (searchHistory.length === 0) {
    historyList.innerHTML = '<p class="empty-hint">Belum ada riwayat</p>';
    return;
  }
  historyList.innerHTML = '';
  searchHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.onclick = () => { targetUrlInput.value = item.url; runNormalExtraction(item.url); };

    const urlSpan = document.createElement('div');
    urlSpan.className = 'history-url';
    urlSpan.textContent = item.url;

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const lang = document.createElement('span');
    lang.className = 'history-lang';
    lang.textContent = (item.language || '?').toUpperCase();
    const time = document.createElement('span');
    time.textContent = item.time || '';

    meta.appendChild(lang);
    meta.appendChild(time);
    div.appendChild(urlSpan);
    div.appendChild(meta);
    historyList.appendChild(div);
  });
}

function clearHistory() {
  searchHistory = [];
  localStorage.removeItem('sh_history');
  renderHistory();
}

// ── Utils ─────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
