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

if (!window.__wwExtensionInjected) {
  window.__wwExtensionInjected = true;
  waitForTable().then(async () => {
    injectBridge();
    injectSidebar();
    startTableObserver();
    await loadScores();
  });
}

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
    for (const [id, entry] of Object.entries(data.ww_scores)) scores.set(id, entry);
    allPostingIds = data.ww_posting_ids ?? [];
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
    span.textContent = `${score} · ${verdict}`;
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

    const settings = await chrome.storage.local.get(['apiKey', 'model', 'cvText']);
    if (!settings.apiKey || !settings.cvText) {
      setProgress('Open extension popup to set API key and CV.', true);
      return;
    }

    allPostingIds = postingIds;
    const toScore = postingIds.filter(id => !scores.has(id));
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
        descriptionText = doc.body.textContent.trim().slice(0, DESC_CHAR_CAP);
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
        cvText:  settings.cvText,
        apiKey:  settings.apiKey,
        model:   settings.model || 'gemini-2.5-flash'
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
    ul.innerHTML = `<li class="ww-ext-empty">No jobs scored yet. Click <b>Scan All Jobs</b> to start.</li>`;
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

function paginationItems() {
  return [...document.querySelectorAll('ul.pagination__list li.pagination__item')];
}
function pageNumberItem(n) {
  return paginationItems().find(li => li.textContent.trim() === String(n));
}
function activePageItem() {
  return paginationItems().find(li => li.classList.contains('active'));
}
function nextPageItem() {
  const items = paginationItems();
  const activeIdx = items.findIndex(li => li.classList.contains('active'));
  if (activeIdx < 0) return null;
  // Prefer the next numeric page; otherwise fall back to the last item (Next/Last button).
  for (let i = activeIdx + 1; i < items.length; i++) {
    if (/^\d+$/.test(items[i].textContent.trim())) return items[i];
  }
  return activeIdx < items.length - 1 ? items[items.length - 1] : null;
}
function clickPaginationItem(li) {
  if (!li || li.classList.contains('disabled')) return false;
  (li.querySelector('a, button') ?? li).click();
  return true;
}
function waitForRowOrIdle(table, selector, timeout) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) { resolve(true); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector(selector)) { obs.disconnect(); resolve(true); }
    });
    obs.observe(table, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
  });
}

async function scrollToRow(postingId) {
  const escId = CSS.escape(postingId);
  const selector = `${TABLE_SEL} tbody input[value="${escId}"]`;
  const table = document.querySelector(TABLE_SEL);
  if (!table) return;

  refreshPageSize();

  let input = document.querySelector(selector);

  // 1. Try direct page-button click using selectAll order + detected page size.
  if (!input && allPostingIds.length) {
    const idx = allPostingIds.indexOf(postingId);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / detectedPageSize) + 1;
      const onTarget = activePageItem()?.textContent.trim() === String(targetPage);
      if (!onTarget && clickPaginationItem(pageNumberItem(targetPage))) {
        await waitForRowOrIdle(table, selector, 2000);
      }
      input = document.querySelector(selector);
    }
  }

  // 2. Fallback: row didn't show up where we expected (target page missing from
  //    pagination, sort order differs from selectAll, or list is stale).
  //    Reset to page 1 and walk forward.
  if (!input) {
    if (activePageItem()?.textContent.trim() !== '1') {
      if (clickPaginationItem(pageNumberItem(1))) {
        await waitForRowOrIdle(table, selector, 1500);
      }
    }
    input = document.querySelector(selector);

    for (let hop = 0; !input && hop < 40; hop++) {
      const prevActive = activePageItem();
      if (!clickPaginationItem(nextPageItem())) break;
      await waitForRowOrIdle(table, selector, 1500);
      input = document.querySelector(selector);
      // Safety: bail if the active page didn't actually change.
      if (!input && activePageItem() === prevActive) break;
    }
  }

  if (!input) return;
  const row = input.closest('tr.table__row--body');
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('ww-ext-highlight');
  setTimeout(() => row.classList.remove('ww-ext-highlight'), 1500);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
      <button id="ww-ext-close">&#x2715;</button>
    </div>
    <div id="ww-ext-controls">
      <button id="ww-ext-scan">Scan All Jobs</button>
      <button id="ww-ext-stop" disabled>Stop</button>
      <div id="ww-ext-save-row">
        <label for="ww-ext-min-score">Score ≥</label>
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
      <div id="ww-ext-progress"></div>
    </div>
    <ul id="ww-ext-results"></ul>
  `;
  document.body.appendChild(sidebar);

  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.getElementById('ww-ext-close').addEventListener('click', () => sidebar.classList.remove('open'));
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
