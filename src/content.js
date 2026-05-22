const TABLE_SEL      = '#dataViewerPlaceholder table.data-viewer-table';
const ROW_SEL        = `${TABLE_SEL} tbody tr.table__row--body`;
const DESC_CHAR_CAP  = 6000;
const SCAN_DELAY_MS  = 600;
const FETCH_TIMEOUT  = 15000;
const VERDICT_ORDER  = { Apply: 0, Consider: 1, Skip: 2 };

const scores = new Map(); // postingId → {score, verdict, reason, title, org}
let allPostingIds = [];   // ordered list from selectAll — used for page navigation
let aborted = false;
let detectedPageSize = 50; // refined upward from observed row counts
let cacheName = null;      // context cache name for the current scan session

if (!window.__wwExtensionInjected) {
  window.__wwExtensionInjected = true;
  waitForTable().then(async () => {
    injectBridge();
    injectSidebar();
    startTableObserver();
    await loadScores();
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyThemeToContent(theme) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('ww-light', isLight);
  document.getElementById('ww-ext-sidebar')?.classList.toggle('ww-light', isLight);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.theme) applyThemeToContent(changes.theme.newValue ?? 'dark');
  if (changes.apiKey || changes.cvText) {
    chrome.storage.local.get(['apiKey', 'cvText'], data => {
      updateGuideSteps(!!data.apiKey, !!(data.cvText && data.cvText.trim()));
    });
  }
});

// ── Bridge ────────────────────────────────────────────────────────────────────

function injectBridge() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/page-bridge.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
}

function sendBridge(op, data = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Bridge timeout: ${op}`));
    }, timeout);

    function handler(e) {
      if (e.source !== window || e.data?.source !== '__ww_ext_page' || e.data?.reqId !== reqId) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
    }

    window.addEventListener('message', handler);
    window.postMessage({ source: '__ww_ext_cs', reqId, op, data }, '*');
  });
}

// ── Table wait ────────────────────────────────────────────────────────────────

function waitForTable() {
  return new Promise(resolve => {
    if (document.querySelector(TABLE_SEL)) { resolve(); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector(TABLE_SEL)) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

// ── Persistence ───────────────────────────────────────────────────────────────

function clearScores() {
  scores.clear();
  allPostingIds = [];
  detectedPageSize = 50;
  chrome.storage.local.remove(['ww_scores', 'ww_posting_ids']);
  document.querySelectorAll('.ww-ext-badge').forEach(el => el.remove());
  renderSidebarList();
}

function saveScores() {
  chrome.storage.local.set({
    ww_scores:      Object.fromEntries(scores),
    ww_posting_ids: allPostingIds
  });
}

async function loadScores() {
  const data = await chrome.storage.local.get(['ww_scores', 'ww_posting_ids']);
  if (data.ww_scores) {
    // Drop entries that don't match the current shape — guards against
    // corrupted storage or future schema migrations.
    for (const [id, entry] of Object.entries(data.ww_scores)) {
      if (entry && typeof entry === 'object'
          && Number.isInteger(entry.score)
          && VERDICT_ORDER[entry.verdict] !== undefined
          && typeof entry.reason === 'string') {
        scores.set(id, entry);
      }
    }
    allPostingIds = Array.isArray(data.ww_posting_ids) ? data.ww_posting_ids : [];
    injectRowScores();
  }
  renderSidebarList();
}

// Throttle expensive UI work during the scan loop (sidebar re-render + storage write).
// Per-job calls would be O(n²) and hit chrome.storage.local's write quota.
let flushScheduled = false;
function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    saveScores();
    renderSidebarList();
  }, 300);
}

// ── Score inline in title cell ────────────────────────────────────────────────

function injectRowScores() {
  let sidebarDirty = false;
  document.querySelectorAll(ROW_SEL).forEach(row => {
    const id = row.querySelector('input[name="dataViewerSelection"]')?.value;
    if (!id || !scores.has(id)) return;

    const entry = scores.get(id);
    if (!entry.title || entry.title === `#${id}`) {
      const cells = row.querySelectorAll('td.table__value');
      const title = cells[0]?.querySelector('a')?.textContent.trim();
      const org   = cells[1]?.querySelector('span')?.textContent.trim();
      if (title) {
        scores.set(id, { ...entry, title, org: org || entry.org });
        sidebarDirty = true;
      }
    }

    const titleCell = row.querySelectorAll('td.table__value')[0];
    if (!titleCell || titleCell.querySelector('.ww-ext-badge')) return;
    const anchor = titleCell.querySelector('a');
    if (!anchor) return;
    const { score, verdict } = scores.get(id);
    const span = document.createElement('span');
    span.className = `ww-ext-badge ww-ext-badge--${verdict.toLowerCase()}`;
    span.style.marginLeft = '6px';
    span.style.cursor = 'pointer';
    span.textContent = `${score} · ${verdict}`;
    span.dataset.postingId = id;
    anchor.insertAdjacentElement('afterend', span);
  });

  if (sidebarDirty) { saveScores(); renderSidebarList(); }
}

function refreshPageSize() {
  const count = document.querySelectorAll(ROW_SEL).length;
  if (count > detectedPageSize) detectedPageSize = count;
}

function startTableObserver() {
  const table = document.querySelector(TABLE_SEL);
  if (!table) return;
  let rafPending = false;
  const obs = new MutationObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      obs.disconnect();
      table.querySelectorAll('.ww-ext-badge').forEach(el => el.remove());
      injectRowScores();
      refreshPageSize();
      obs.observe(table, { childList: true, subtree: true });
      rafPending = false;
    });
  });
  obs.observe(table, { childList: true, subtree: true });
  refreshPageSize();
}

// ── Scan ──────────────────────────────────────────────────────────────────────

function setProgress(text, isError = false) {
  const el = document.getElementById('ww-ext-progress');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('ww-ext-error', isError);
}

async function scanAllJobs() {
  const scanBtn = document.getElementById('ww-ext-scan');
  const stopBtn = document.getElementById('ww-ext-stop');

  scanBtn.disabled = true;
  stopBtn.disabled = false;
  aborted = false;

  try {
    const tokens = await sendBridge('extractTokens');
    if (!tokens.selectAll) {
      setProgress('Error: selectAll token not found.', true);
      return;
    }

    const res = await fetch('/myAccount/co-op/full/jobs.htm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: tokens.selectAll }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await res.json();
    const postingIds = data.resultIds;
    if (!postingIds?.length) {
      setProgress('No jobs found.', true);
      return;
    }

    const settings = await chrome.storage.local.get(['apiKey', 'model', 'cvText', 'preferences']);
    if (!settings.apiKey || !settings.cvText) {
      setProgress('Open Settings (⚙) to set API key and Profile.', true);
      return;
    }

    // Ask background to create a context cache for this scan session.
    // The API key stays in the background context and is never sent through
    // chrome.runtime messages or exposed in the page's Network tab.
    // Requires ≥ 1,024 tokens of cached content — falls back to inline if it fails.
    cacheName = null;
    try {
      const cacheReply = await chrome.runtime.sendMessage({
        type:   'createCache',
        cvText: settings.cvText,
        model:  settings.model || 'gemini-2.5-flash'
      });
      if (cacheReply?.ok) cacheName = cacheReply.cacheName;
      // Cache create failures fall through silently — token counter shows the
      // impact (cached column stays at 0) and scoring proceeds inline.
    } catch (e) {
      // Messaging error — same fallback as above.
    }

    allPostingIds = postingIds.map(String);
    const toScore = allPostingIds.filter(id => !scores.has(id));
    if (!toScore.length) {
      setProgress('All jobs already scored.');
      return;
    }
    const rowMeta = indexVisibleRows();
    const total   = toScore.length;
    let done = 0, failed = 0;
    let lastError = '';

    for (const postingId of toScore) {
      if (aborted) break;
      setProgress(`Fetching ${done + failed + 1} of ${total}…`);

      let descriptionText = '';
      let extractedTitle  = '';
      try {
        const html = await sendBridge('fetchOverview', { postingId }, FETCH_TIMEOUT);
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        let rawText = doc.body.textContent.replace(/\s+/g, ' ').trim();
        const summaryIdx = rawText.indexOf('Job Summary');
        if (summaryIdx > 0) rawText = rawText.slice(summaryIdx);
        const appInfoIdx = rawText.indexOf('Application Information');
        if (appInfoIdx > 0) rawText = rawText.slice(0, appInfoIdx).trim();
        descriptionText = rawText.slice(0, DESC_CHAR_CAP);
        extractedTitle  = doc.querySelector('h1, h2, h3')?.textContent.trim() ?? '';
      } catch (e) {
        failed++; lastError = `fetch: ${e.message}`; continue;
      }

      const rowInfo = rowMeta[postingId];
      const meta = {
        title: rowInfo?.title || extractedTitle || `#${postingId}`,
        org:   rowInfo?.org   || ''
      };
      setProgress(`Scoring ${done + failed + 1} of ${total}…`);

      const reply = await chrome.runtime.sendMessage({
        type: 'scoreJob',
        meta,
        descriptionText,
        cvText:      settings.cvText,
        preferences: settings.preferences || '',
        cacheName,
        model:       settings.model || 'gemini-2.5-flash'
      });

      if (reply.ok) {
        scores.set(postingId, { ...reply.result, title: meta.title, org: meta.org });
        injectRowScores();
        scheduleFlush();
        done++;
      } else if (reply.code === 'RATE_LIMIT') {
        setProgress(`Rate limit reached after ${done} scored. Try again later.`, true);
        break;
      } else {
        failed++; lastError = reply.error || 'unknown';
      }

      await sleep(SCAN_DELAY_MS);
    }

    // Final flush — overrides the pending debounced one.
    saveScores();
    renderSidebarList();

    const skipped = failed ? ` (${failed} failed: ${lastError})` : '';
    const summary = aborted
      ? `Stopped at ${done} of ${total}.${skipped}`
      : `${done} of ${total} scored.${skipped}`;
    setProgress(summary, failed > 0);

  } catch (e) {
    setProgress(`Error: ${e.message}`, true);
  } finally {
    if (cacheName) {
      chrome.runtime.sendMessage({ type: 'deleteCache', cacheName }).catch(() => {});
      cacheName = null;
    }
    scanBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function indexVisibleRows() {
  const map = {};
  document.querySelectorAll(ROW_SEL).forEach(row => {
    const id    = row.querySelector('input[name="dataViewerSelection"]')?.value;
    const cells = row.querySelectorAll('td.table__value');
    const title = cells[0]?.querySelector('a')?.textContent.trim() ?? '';
    const org   = cells[1]?.querySelector('span')?.textContent.trim() ?? '';
    if (id) map[id] = { title: title || `#${id}`, org };
  });
  return map;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Sidebar list ──────────────────────────────────────────────────────────────

function renderSidebarList() {
  const ul = document.getElementById('ww-ext-results');
  if (!ul) return;
  if (!scores.size) {
    ul.innerHTML = `
      <li class="ww-ext-empty">
        <div class="ww-ext-guide-title">Get started</div>
        <div class="ww-ext-guide-step" id="ww-ext-step-key">
          <span class="ww-ext-step-num">1</span>
          <div>Set your API key in <button class="ww-ext-inline-link">Settings</button></div>
        </div>
        <div class="ww-ext-guide-step" id="ww-ext-step-cv">
          <span class="ww-ext-step-num">2</span>
          <div>Upload your application package in Profile &amp; Context</div>
        </div>
        <div class="ww-ext-guide-step">
          <span class="ww-ext-step-num">3</span>
          <div>Click <b>Scan All Jobs</b> above</div>
        </div>
      </li>`;
    ul.querySelector('.ww-ext-inline-link')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openOptions' });
    });
    chrome.storage.local.get(['apiKey', 'cvText'], data => {
      updateGuideSteps(!!data.apiKey, !!(data.cvText && data.cvText.trim()));
    });
    return;
  }
  // Sort: score desc → verdict (Apply > Consider > Skip) → title asc, for stable rendering.
  const sorted = [...scores.entries()].sort(([, a], [, b]) =>
    (b.score - a.score) ||
    ((VERDICT_ORDER[a.verdict] ?? 9) - (VERDICT_ORDER[b.verdict] ?? 9)) ||
    String(a.title).localeCompare(String(b.title))
  );
  ul.innerHTML = sorted.map(([id, { score, verdict, reason, title, org }]) => `
    <li class="ww-ext-card" data-posting-id="${esc(id)}">
      <div class="ww-ext-card-top">
        <span class="ww-ext-badge ww-ext-badge--${esc((verdict ?? '').toLowerCase())}">${esc(score)} · ${esc(verdict)}</span>
        <span class="ww-ext-card-org">${esc(org)}</span>
        <button class="ww-ext-save-btn" title="Save to folder">&#128193;</button>
      </div>
      <button class="ww-ext-card-title ww-ext-card-link">${esc(title)}</button>
      <div class="ww-ext-card-reason">${esc(reason)}</div>
    </li>
  `).join('');
}

// WW pagination puts `active` / `disabled` / aria-label on the inner
// <a class="pagination__link">, not on the <li> wrapper. We operate on the <a>s.
function paginationLinks() {
  return [...document.querySelectorAll('ul.pagination__list .pagination__link')];
}
function activeLink() {
  return paginationLinks().find(a => a.classList.contains('active'));
}
function activePageText() {
  return activeLink()?.textContent.trim();
}
function isLinkDisabled(a) {
  // The currently-active link also carries `disabled` — that's by design and
  // correctly makes it a no-op click target for our purposes.
  return a.classList.contains('disabled') || a.getAttribute('aria-disabled') === 'true';
}
function pageNumberLink(n) {
  return paginationLinks().find(a => a.textContent.trim() === String(n));
}
function nextPageLink() {
  const links = paginationLinks();
  const activeIdx = links.findIndex(a => a.classList.contains('active'));
  if (activeIdx < 0) return null;
  // 1: next visible numeric page after active.
  for (let i = activeIdx + 1; i < links.length; i++) {
    if (/^\d+$/.test(links[i].textContent.trim())) return links[i];
  }
  // 2: a "Next" arrow button — aria-label="Go to next page" in WW's markup.
  for (const a of links) {
    const lbl = (a.getAttribute('aria-label') || '').toLowerCase();
    if (lbl.includes('next') && !isLinkDisabled(a)) return a;
  }
  return null;
}
// Dispatch a synthetic click instead of .click(). Real .click() on an
// <a href="javascript:void(0);"> makes the browser try to navigate to the
// javascript: URL, which CSP blocks (harmless but noisy in the console).
// Synthetic events still fire Vue's @click handler.
function clickLink(a) {
  if (!a || isLinkDisabled(a)) return false;
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

// Watch pagination's active page text. Resolves as soon as predicate(active) is true,
// or after `timeout`. Fast path: ~1 frame for client-side DataViewer page changes.
function waitActive(predicate, timeout = 800) {
  return new Promise(resolve => {
    if (predicate(activePageText())) { resolve(true); return; }
    const pag = document.querySelector('ul.pagination__list');
    if (!pag) { resolve(false); return; }
    const obs = new MutationObserver(() => {
      if (predicate(activePageText())) { obs.disconnect(); resolve(true); }
    });
    obs.observe(pag, {
      subtree: true, childList: true,
      attributes: true, attributeFilter: ['class']
    });
    setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
  });
}

async function goToPage(pageNum) {
  const target = String(pageNum);
  if (activePageText() === target) return true;
  if (!clickLink(pageNumberLink(pageNum))) return false;
  return waitActive(t => t === target);
}

async function goNext() {
  const prev = activePageText();
  if (!clickLink(nextPageLink())) return false;
  return waitActive(t => t !== prev);
}

async function scrollToRow(postingId) {
  const idStr = String(postingId);
  // Posting IDs are numeric strings — no escaping needed for an attribute-value
  // selector. Lock to name="dataViewerSelection" so we never match a stray input.
  const selector = `${TABLE_SEL} tbody input[name="dataViewerSelection"][value="${idStr}"]`;
  const table = document.querySelector(TABLE_SEL);
  if (!table) return;

  refreshPageSize();
  const startPage = activePageText();

  let input = document.querySelector(selector);

  // 1. Direct jump using selectAll order + detected page size.
  if (!input && allPostingIds.length) {
    const idx = allPostingIds.indexOf(idStr);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / detectedPageSize) + 1;
      if (await goToPage(targetPage)) {
        // Active page changed — give the tbody one frame to render the new rows.
        await new Promise(r => requestAnimationFrame(r));
        input = document.querySelector(selector);
      }
    }
  }

  // 2. Fallback: row isn't on the page we computed (sort mismatch, distant page
  //    not in the visible pagination window, or stale allPostingIds). Walk from
  //    page 1 forward — each hop is ~1 frame.
  if (!input) {
    await goToPage(1);
    await new Promise(r => requestAnimationFrame(r));
    input = document.querySelector(selector);
    for (let hop = 0; !input && hop < 40; hop++) {
      if (!(await goNext())) break;
      await new Promise(r => requestAnimationFrame(r));
      input = document.querySelector(selector);
    }
  }

  if (!input) {
    setProgress(`Posting ${idStr} not in current view — filter or sort may have changed.`, true);
    // Don't leave the user stranded on whatever page the walk ended on.
    if (startPage && activePageText() !== startPage) {
      await goToPage(Number(startPage));
    }
    return;
  }
  const row = input.closest('tr.table__row--body');
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('ww-ext-highlight');
  setTimeout(() => row.classList.remove('ww-ext-highlight'), 1500);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Sidebar help text ─────────────────────────────────────────────────────────

const HELP_TEXTS = {
  folder: 'Set filters for which scored jobs get saved to your WaterlooWorks shortlist. Score ≥ sets the minimum score (1–10). Verdict toggles further filter by AI rating — Apply = strong fit, Consider = marginal, Skip = poor fit.'
};

// ── Sidebar ───────────────────────────────────────────────────────────────────

function injectSidebar() {
  const toggle = document.createElement('button');
  toggle.id = 'ww-ext-toggle';
  toggle.textContent = 'AI Score';
  document.body.appendChild(toggle);

  const sidebar = document.createElement('div');
  sidebar.id = 'ww-ext-sidebar';
  sidebar.innerHTML = `
    <div id="ww-ext-header">
      <span>WW AI Scorer</span>
      <div class="ww-ext-header-btns">
        <button id="ww-ext-help-open" title="How to use">?</button>
        <button id="ww-ext-settings" title="Settings">&#9881;</button>
        <button id="ww-ext-close">&#x2715;</button>
      </div>
    </div>
    <div id="ww-ext-controls">
      <div class="ww-ext-section">
        <div class="ww-ext-section-label">Scan</div>
        <button id="ww-ext-scan">Scan All Jobs</button>
        <button id="ww-ext-stop" disabled>Stop</button>
      </div>
      <div class="ww-ext-section">
        <div class="ww-ext-section-label">
          Save to Folder
          <button class="ww-ext-help-btn" data-help="folder" title="What is this?">?</button>
        </div>
        <div id="ww-ext-save-row">
          <label for="ww-ext-min-score">Score &ge;</label>
          <input id="ww-ext-min-score" type="number" min="1" max="10" value="7">
        </div>
        <div id="ww-ext-verdict-row">
          <label class="ww-ext-verdict-toggle" data-v="apply">
            <input type="checkbox" data-verdict="Apply" checked>Apply
          </label>
          <label class="ww-ext-verdict-toggle" data-v="consider">
            <input type="checkbox" data-verdict="Consider" checked>Consider
          </label>
          <label class="ww-ext-verdict-toggle" data-v="skip">
            <input type="checkbox" data-verdict="Skip">Skip
          </label>
        </div>
        <div id="ww-ext-action-row">
          <button id="ww-ext-save-all">Save to Folder</button>
          <button id="ww-ext-clear">Clear</button>
        </div>
      </div>
      <div id="ww-ext-progress"></div>
    </div>
    <ul id="ww-ext-results"></ul>
  `;
  document.body.appendChild(sidebar);

  // Apply saved theme
  chrome.storage.local.get('theme', data => { if (data.theme) applyThemeToContent(data.theme); });

  // Badge reason tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'ww-ext-badge-tooltip';
  document.body.appendChild(tooltip);

  // Help tooltip (for ? buttons inside controls)
  const helpTooltip = document.createElement('div');
  helpTooltip.id = 'ww-ext-help-tooltip';
  document.body.appendChild(helpTooltip);

  document.addEventListener('click', e => {
    // Badge tooltip
    const badge = e.target.closest('.ww-ext-badge[data-posting-id]');
    if (badge) {
      const reason = scores.get(badge.dataset.postingId)?.reason;
      if (!reason) return;
      tooltip.textContent = reason;
      const r = badge.getBoundingClientRect();
      tooltip.style.top  = (r.bottom + 6) + 'px';
      tooltip.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
      tooltip.classList.add('visible');
      helpTooltip.classList.remove('visible');
    } else if (!e.target.closest('#ww-ext-badge-tooltip')) {
      tooltip.classList.remove('visible');
    }

    // Help tooltip
    const helpBtn = e.target.closest('.ww-ext-help-btn');
    if (helpBtn) {
      e.stopPropagation();
      const key = helpBtn.dataset.help;
      const text = HELP_TEXTS[key] || '';
      helpTooltip.textContent = text;
      const r = helpBtn.getBoundingClientRect();
      helpTooltip.style.top  = (r.bottom + 6) + 'px';
      helpTooltip.style.left = Math.max(8, Math.min(r.left - 220, window.innerWidth - 300)) + 'px';
      helpTooltip.classList.toggle('visible', !helpTooltip.classList.contains('visible') || helpTooltip.dataset.open !== key);
      helpTooltip.dataset.open = key;
      tooltip.classList.remove('visible');
    } else if (!e.target.closest('#ww-ext-help-tooltip')) {
      helpTooltip.classList.remove('visible');
    }
  });

  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.getElementById('ww-ext-close').addEventListener('click', () => sidebar.classList.remove('open'));
  document.getElementById('ww-ext-help-open').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openWelcome' });
  });
  document.getElementById('ww-ext-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openOptions' });
  });
  document.getElementById('ww-ext-scan').addEventListener('click', scanAllJobs);
  document.getElementById('ww-ext-stop').addEventListener('click', () => { aborted = true; });
  document.getElementById('ww-ext-save-all').addEventListener('click', () => {
    const min = Number(document.getElementById('ww-ext-min-score').value);
    const verdicts = new Set(
      [...document.querySelectorAll('#ww-ext-verdict-row input:checked')].map(c => c.dataset.verdict)
    );
    const ids = [...scores.entries()]
      .filter(([, { score, verdict }]) => score >= min && verdicts.has(verdict))
      .map(([id]) => id);
    if (!ids.length) { setProgress('No jobs match the filter.', true); return; }
    sendBridge('openFolderSidebarBulk', { postingIds: ids });
  });
  document.getElementById('ww-ext-clear').addEventListener('click', clearScores);

  document.getElementById('ww-ext-results').addEventListener('click', e => {
    const card = e.target.closest('.ww-ext-card');
    if (!card) return;
    if (e.target.closest('.ww-ext-save-btn')) {
      sendBridge('openFolderSidebar', { postingId: card.dataset.postingId });
      return;
    }
    if (e.target.closest('.ww-ext-card-link')) {
      scrollToRow(card.dataset.postingId);
      return;
    }
    const reason = e.target.closest('.ww-ext-card-reason');
    if (reason) reason.classList.toggle('ww-ext-expanded');
  });
}

function updateGuideSteps(hasKey, hasCv) {
  const keyStep = document.getElementById('ww-ext-step-key');
  const cvStep  = document.getElementById('ww-ext-step-cv');
  if (keyStep) {
    keyStep.querySelector('.ww-ext-step-num').textContent = hasKey ? '✓' : '1';
    keyStep.classList.toggle('ww-ext-step-done', hasKey);
  }
  if (cvStep) {
    cvStep.querySelector('.ww-ext-step-num').textContent = hasCv ? '✓' : '2';
    cvStep.classList.toggle('ww-ext-step-done', hasCv);
  }
}
