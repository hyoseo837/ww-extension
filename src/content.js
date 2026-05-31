const TABLE_SEL      = '#dataViewerPlaceholder table.data-viewer-table';
const ROW_SEL        = `${TABLE_SEL} tbody tr.table__row--body`;
const DESC_CHAR_CAP   = 6000;
const FETCH_TIMEOUT   = 15000;
const SCAN_CONCURRENCY = 5;
// Verdict ladder (ADR 0017), best → worst; index drives sort order. Excluded
// (a hard-criteria gate) sorts last, below Skip.
const VERDICT_ORDER  = { 'Strong Apply': 0, Apply: 1, Consider: 2, Unlikely: 3, Skip: 4, Excluded: 5 };
// Bump when the cached score/verdict shape changes; a mismatch clears the
// score cache on load so badges never mix scales (ADR 0016).
const SCORING_SCHEMA_VERSION = 2;

// Verdict → badge/toggle class slug ('Strong Apply' → 'strong-apply').
const verdictSlug = v => String(v ?? '').toLowerCase().replace(/\s+/g, '-');

const scores = new Map(); // postingId → {score, verdict, reason, breakdown, title, org}
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

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyThemeToContent(theme) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('ww-light', isLight);
  document.getElementById('ww-ext-sidebar')?.classList.toggle('ww-light', isLight);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.theme) applyThemeToContent(changes.theme.newValue ?? 'dark');
  if (changes.auth || changes.cvText) {
    chrome.storage.local.get(['auth', 'cvText'], data => {
      updateGuideSteps(!!data.auth?.access_token, !!(data.cvText && data.cvText.trim()));
    });
  }
  if (changes.auth || changes.creditBalance) {
    chrome.storage.local.get(['auth', 'creditBalance'], data => {
      renderCreditsChip(data.auth, data.creditBalance);
    });
  }
});

function renderCreditsChip(auth, balance) {
  const node = document.getElementById('ww-ext-credits');
  if (!node) return;
  const signedIn = !!auth?.access_token;
  if (!signedIn) {
    node.hidden = true;
    node.textContent = '';
    return;
  }
  node.hidden = false;
  const value = typeof balance === 'number' ? balance.toFixed(2) : '—';
  node.textContent = `⚡ ${value}`;
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
  const data = await chrome.storage.local.get(['ww_scores', 'ww_posting_ids', 'ww_scoring_schema']);
  // Clear-on-upgrade: scores cached under an older scoring shape (e.g. the
  // 1–10 scale) are dropped wholesale so badges never mix scales (ADR 0016).
  if (data.ww_scoring_schema !== SCORING_SCHEMA_VERSION) {
    chrome.storage.local.set({ ww_scoring_schema: SCORING_SCHEMA_VERSION });
    chrome.storage.local.remove(['ww_scores', 'ww_posting_ids']);
    renderSidebarList();
    return;
  }
  if (data.ww_scores) {
    // Drop entries that don't match the current shape — guards against
    // corrupted storage or future schema migrations.
    for (const [id, entry] of Object.entries(data.ww_scores)) {
      if (entry && typeof entry === 'object'
          && (Number.isInteger(entry.score) || (entry.score === null && entry.verdict === 'Excluded'))
          && VERDICT_ORDER[entry.verdict] !== undefined
          && typeof entry.reason === 'string') {
        if (!Array.isArray(entry.breakdown)) entry.breakdown = [];
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
    span.className = `ww-ext-badge ww-ext-badge--${verdictSlug(verdict)}`;
    span.style.marginLeft = '6px';
    span.style.cursor = 'pointer';
    span.textContent = score != null ? `${score} · ${verdict}` : verdict;
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

// Out-of-credits halt: show an actionable "Buy credits" prompt that opens
// the options page Account/Buy section (same openOptions hop as the
// empty-state guide and Settings button).
function setOutOfCreditsPrompt() {
  const el = document.getElementById('ww-ext-progress');
  if (!el) return;
  el.classList.add('ww-ext-error');
  el.textContent = "You're out of credits. ";
  const btn = document.createElement('button');
  btn.className = 'ww-ext-inline-link';
  btn.textContent = 'Buy credits';
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openOptions' });
  });
  el.appendChild(btn);
}

async function scanAllJobs() {
  const scanBtn = document.getElementById('ww-ext-scan');
  const stopBtn = document.getElementById('ww-ext-stop');

  scanBtn.disabled = true;
  stopBtn.disabled = false;
  aborted = false;

  // One id for this whole Scan run, sent on every /scan so the web app's
  // credit history can group the batch ("Scanned N jobs"). v6.2.
  const batchId = crypto.randomUUID();

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

    const settings = await chrome.storage.local.get(['model', 'hardFilterEnabled']);

    // Hard-exclusion pre-filter (ADR 0018): default on. Fetch the user's
    // "never"-tier locations once per batch so matching postings skip /scan
    // entirely (no credit). Any failure → leave null and scan normally.
    let excludedLocs = null;
    if (settings.hardFilterEnabled !== false) {
      try {
        const pr = await chrome.runtime.sendMessage({ type: 'backendFetch', path: '/profile' });
        if (pr?.ok) excludedLocs = excludedLocations(pr.data?.match_criteria);
      } catch { /* leave null → scan normally */ }
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
    let halted = false;
    let nextIdx = 0;

    async function scanOne(postingId) {
      const rowInfo = rowMeta[postingId];

      // Hard-exclusion pre-filter (ADR 0018): skip before fetch/score — no
      // /scan call, no credit. Conservative: fires only on a confident City
      // match; a missing City falls through to a normal scan.
      if (excludedLocs?.length) {
        const gate = hardExclusion(rowInfo, excludedLocs);
        if (gate) {
          scores.set(postingId, {
            score: null, verdict: 'Excluded', reason: gate, breakdown: [],
            excluded: true,
            title: rowInfo?.title || `#${postingId}`, org: rowInfo?.org || ''
          });
          injectRowScores();
          scheduleFlush();
          return { ok: true };
        }
      }

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
        return { ok: false, error: `fetch: ${e.message}` };
      }

      const meta = {
        title: rowInfo?.title || extractedTitle || `#${postingId}`,
        org:   rowInfo?.org   || ''
      };

      const reply = await chrome.runtime.sendMessage({
        type: 'scoreJob',
        meta,
        descriptionText,
        model:       settings.model || 'gemini-2.5-flash',
        postingId,
        batchId
      });

      if (reply?.ok) {
        scores.set(postingId, { ...reply.result, title: meta.title, org: meta.org });
        injectRowScores();
        scheduleFlush();
        return { ok: true };
      }
      // NO_CREDITS / NOT_SIGNED_IN / PROFILE_NOT_SET stop the whole batch —
      // no point burning wall time on calls we know will all fail the same way.
      const halt = reply?.code === 'NO_CREDITS'
        || reply?.code === 'NOT_SIGNED_IN'
        || reply?.code === 'PROFILE_NOT_SET';
      return { ok: false, error: reply?.error || 'unknown', halt, code: reply?.code };
    }

    async function worker() {
      while (!aborted && !halted) {
        const idx = nextIdx++;
        if (idx >= toScore.length) return;
        const postingId = toScore[idx];
        const result = await scanOne(postingId);
        if (result.ok) {
          done++;
        } else {
          failed++;
          lastError = result.error;
          if (result.halt) {
            halted = true;
            if (result.code === 'NO_CREDITS') {
              setOutOfCreditsPrompt();
            } else {
              setProgress(result.error, true);
            }
            return;
          }
        }
        if (!halted) setProgress(`Scored ${done + failed} of ${total}…`);
      }
    }

    const workerCount = Math.min(SCAN_CONCURRENCY, toScore.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Final flush — overrides the pending debounced one.
    saveScores();
    renderSidebarList();

    if (!halted) {
      const skipped = failed ? ` (${failed} failed: ${lastError})` : '';
      const summary = aborted
        ? `Stopped at ${done} of ${total}.${skipped}`
        : `${done} of ${total} scored.${skipped}`;
      setProgress(summary, failed > 0);
    }

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
    // City column (index 4: Title, Organization, Division, Openings, City …).
    // Feeds the hard-exclusion pre-filter (ADR 0018); only present for rows on
    // the currently-visible page — off-page postings fall through to a scan.
    const city  = (cells[4]?.querySelector('span')?.textContent ?? cells[4]?.textContent ?? '').trim();
    if (id) map[id] = { title: title || `#${id}`, org, city };
  });
  return map;
}

// ── Hard-exclusion pre-filter (ADR 0018) ──────────────────────────────────────

// The candidate's "never"-tier locations from match_criteria, trimmed.
function excludedLocations(matchCriteria) {
  const arr = matchCriteria?.preferred_locations?.excluded;
  return Array.isArray(arr) ? arr.map(s => String(s).trim()).filter(Boolean) : [];
}

// Returns a gate reason when the posting's City confidently matches a "never"
// location, else null. Conservative normalized containment; never fires on a
// missing City, so it can't wrongly hide a job.
function hardExclusion(rowInfo, excludedLocs) {
  const city = (rowInfo?.city || '').trim();
  if (!city) return null;
  const cityLc = city.toLowerCase();
  const hit = excludedLocs.find(loc => cityLc.includes(loc.toLowerCase()));
  return hit ? `Filtered: location “${city}” is on your never-list (“${hit}”)` : null;
}

// ── Sidebar list ──────────────────────────────────────────────────────────────

function renderSidebarList() {
  const ul = document.getElementById('ww-ext-results');
  if (!ul) return;
  if (!scores.size) {
    ul.innerHTML = `
      <li class="ww-ext-empty">
        <div class="ww-ext-guide-title">Get started</div>
        <div class="ww-ext-guide-step" id="ww-ext-step-auth">
          <span class="ww-ext-step-num">1</span>
          <div>Sign in with Google in <button class="ww-ext-inline-link">Settings</button></div>
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
    chrome.storage.local.get(['auth', 'cvText'], data => {
      updateGuideSteps(!!data.auth?.access_token, !!(data.cvText && data.cvText.trim()));
    });
    return;
  }
  // Sort: score desc → verdict ladder (Strong Apply → Skip) → title asc, for stable rendering.
  const sorted = [...scores.entries()].sort(([, a], [, b]) =>
    ((b.score ?? -1) - (a.score ?? -1)) ||
    ((VERDICT_ORDER[a.verdict] ?? 9) - (VERDICT_ORDER[b.verdict] ?? 9)) ||
    String(a.title).localeCompare(String(b.title))
  );
  ul.innerHTML = sorted.map(([id, { score, verdict, reason, breakdown, title, org }]) => `
    <li class="ww-ext-card" data-posting-id="${esc(id)}">
      <div class="ww-ext-card-top">
        <span class="ww-ext-badge ww-ext-badge--${esc(verdictSlug(verdict))}">${score != null ? esc(score) + ' · ' : ''}${esc(verdict)}</span>
        <span class="ww-ext-card-org">${esc(org)}</span>
        <button class="ww-ext-save-btn" title="Save to folder">&#128193;</button>
      </div>
      <button class="ww-ext-card-title ww-ext-card-link">${esc(title)}</button>
      <div class="ww-ext-card-reason">${esc(reason)}</div>
      ${renderBreakdown(breakdown)}
    </li>
  `).join('');
}

// Compact gain/loss list under the reason. Each point is prefixed by a
// signed marker so plus/minus reads without relying on colour alone.
function renderBreakdown(breakdown) {
  if (!Array.isArray(breakdown) || !breakdown.length) return '';
  const items = breakdown.map(({ point, effect }) =>
    `<li class="ww-ext-bd-${effect === 'minus' ? 'minus' : 'plus'}">${esc(point)}</li>`
  ).join('');
  return `<ul class="ww-ext-card-breakdown">${items}</ul>`;
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
  folder: 'Set filters for which scored jobs get saved to your WaterlooWorks shortlist. Score ≥ sets the minimum score (1–20). Verdict toggles further filter by AI rating — Strong Apply = prioritize, Apply = worth applying, Consider = marginal, Unlikely = weak, Skip = poor fit, Excluded = a hard requirement rules you out (e.g. citizenship, or a location you ruled out).'
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
      <div class="ww-ext-header-left">
        <span>WW AI Scorer</span>
        <span id="ww-ext-credits" hidden></span>
      </div>
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
          <input id="ww-ext-min-score" type="number" min="1" max="20" value="14">
        </div>
        <div id="ww-ext-verdict-row">
          <label class="ww-ext-verdict-toggle" data-v="strong-apply">
            <input type="checkbox" data-verdict="Strong Apply" checked>Strong Apply
          </label>
          <label class="ww-ext-verdict-toggle" data-v="apply">
            <input type="checkbox" data-verdict="Apply" checked>Apply
          </label>
          <label class="ww-ext-verdict-toggle" data-v="consider">
            <input type="checkbox" data-verdict="Consider">Consider
          </label>
          <label class="ww-ext-verdict-toggle" data-v="unlikely">
            <input type="checkbox" data-verdict="Unlikely">Unlikely
          </label>
          <label class="ww-ext-verdict-toggle" data-v="skip">
            <input type="checkbox" data-verdict="Skip">Skip
          </label>
          <label class="ww-ext-verdict-toggle" data-v="excluded">
            <input type="checkbox" data-verdict="Excluded">Excluded
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

  // Initial credits chip render
  chrome.storage.local.get(['auth', 'creditBalance'], data => {
    renderCreditsChip(data.auth, data.creditBalance);
  });

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
      .filter(([, { score, verdict }]) => (verdict === 'Excluded' || score >= min) && verdicts.has(verdict))
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

function updateGuideSteps(hasAuth, hasCv) {
  const authStep = document.getElementById('ww-ext-step-auth');
  const cvStep   = document.getElementById('ww-ext-step-cv');
  if (authStep) {
    authStep.querySelector('.ww-ext-step-num').textContent = hasAuth ? '✓' : '1';
    authStep.classList.toggle('ww-ext-step-done', hasAuth);
  }
  if (cvStep) {
    cvStep.querySelector('.ww-ext-step-num').textContent = hasCv ? '✓' : '2';
    cvStep.classList.toggle('ww-ext-step-done', hasCv);
  }
}
