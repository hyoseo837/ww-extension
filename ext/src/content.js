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

// Inline SVG icons — Material Symbols are CDN-only, so the design's icons are
// reproduced as local inline SVG (ADR 0030).
const SVG_FOLDER = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const SVG_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const SVG_GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

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

// ── Storage reactions ──────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
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

// Delete one score: from the in-memory map, persisted cache, the inline table
// badge, and the sidebar list. Leaves the rest untouched (allPostingIds is the
// full posting list, not the scored set, so it is not touched here).
function removeScore(id) {
  if (!scores.has(id)) return;
  scores.delete(id);
  saveScores();
  document.querySelectorAll('.ww-ext-badge[data-posting-id]').forEach(el => {
    if (el.dataset.postingId === id) el.remove();
  });
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

// Halt prompt: a message plus an inline link that opens the web app at
// `path` (account/profile/buy now live there, v6.4).
function setActionPrompt(text, linkLabel, path) {
  const el = document.getElementById('ww-ext-progress');
  if (!el) return;
  el.classList.add('ww-ext-error');
  el.textContent = text + ' ';
  const btn = document.createElement('button');
  btn.className = 'ww-ext-inline-link';
  btn.textContent = linkLabel;
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openWebApp', path });
  });
  el.appendChild(btn);
}

// Confirmation shown before a scan spends credits (v6.13). Rendered inside
// #ww-ext-sidebar so it inherits the --s-* theme vars + light-theme override;
// the sidebar uses transform, so a position:fixed child would be trapped in the
// panel — the overlay is position:absolute within it. Resolves true on Scan,
// false on Cancel / backdrop / Esc.
function confirmScan(count, balance) {
  return new Promise(resolve => {
    const sidebar = document.getElementById('ww-ext-sidebar');
    if (!sidebar) { resolve(true); return; } // no UI to host the prompt

    const bal = Number.isFinite(balance) ? parseFloat(balance.toFixed(2)) : null;
    const jobWord = count === 1 ? 'job' : 'jobs';

    // Estimated cost: ~1 credit/scan (ADR 0034) — N jobs ≈ N credits. The real
    // per-scan charge is token-variable, hence "~". Warn when the balance can't
    // cover the whole batch (v7.5.1).
    const costWord = count === 1 ? 'credit' : 'credits';
    const short = bal != null && bal < count;

    const backdrop = document.createElement('div');
    backdrop.className = 'ww-ext-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="ww-ext-confirm-card" role="dialog" aria-modal="true">
        <div class="ww-ext-confirm-title">Scan ${count} unscored ${jobWord}?</div>
        <div class="ww-ext-confirm-msg">This costs ~${count} ${costWord}${bal != null ? ` — you have ${bal}` : ''}.</div>
        ${short ? '<div class="ww-ext-confirm-warn">⚠ Not enough to scan them all.</div>' : ''}
        <div class="ww-ext-confirm-actions">
          <button class="ww-ext-confirm-cancel">Cancel</button>
          ${short ? '<button class="ww-ext-confirm-buy">Buy credits</button>' : ''}
          <button class="ww-ext-confirm-go">${short ? 'Scan anyway' : `Scan ${count}`}</button>
        </div>
      </div>`;

    let settled = false;
    const close = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });
    backdrop.querySelector('.ww-ext-confirm-cancel').addEventListener('click', () => close(false));
    backdrop.querySelector('.ww-ext-confirm-go').addEventListener('click', () => close(true));
    // Buy credits → web app /buy; treated as a cancel (navigating away, not scanning).
    backdrop.querySelector('.ww-ext-confirm-buy')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openWebApp', path: '/buy' });
      close(false);
    });
    document.addEventListener('keydown', onKey, true);

    sidebar.appendChild(backdrop);
    backdrop.querySelector('.ww-ext-confirm-go').focus();
  });
}

// Generic confirm overlay (same chrome as confirmScan). Resolves true on
// confirm, false on cancel / backdrop / Esc.
function confirmDialog({ title, msg, goLabel }) {
  return new Promise(resolve => {
    const sidebar = document.getElementById('ww-ext-sidebar');
    if (!sidebar) { resolve(true); return; }

    const backdrop = document.createElement('div');
    backdrop.className = 'ww-ext-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="ww-ext-confirm-card" role="dialog" aria-modal="true">
        <div class="ww-ext-confirm-title">${esc(title)}</div>
        <div class="ww-ext-confirm-msg">${esc(msg)}</div>
        <div class="ww-ext-confirm-actions">
          <button class="ww-ext-confirm-cancel">Cancel</button>
          <button class="ww-ext-confirm-go">${esc(goLabel)}</button>
        </div>
      </div>`;

    let settled = false;
    const close = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      resolve(result);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });
    backdrop.querySelector('.ww-ext-confirm-cancel').addEventListener('click', () => close(false));
    backdrop.querySelector('.ww-ext-confirm-go').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey, true);

    sidebar.appendChild(backdrop);
    backdrop.querySelector('.ww-ext-confirm-go').focus();
  });
}

async function scanAllJobs() {
  // One button doubles as Stop while a scan runs (the click handler checks
  // the ww-ext-scanning class).
  const scanBtn = document.getElementById('ww-ext-scan');
  scanBtn.classList.add('ww-ext-scanning');
  scanBtn.textContent = 'Stop';
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

    allPostingIds = postingIds.map(String);
    const toScore = allPostingIds.filter(id => !scores.has(id));
    if (!toScore.length) {
      setProgress('All jobs already scored.');
      return;
    }

    // Confirm before spending credits (v6.13). The list fetch above is free —
    // no /scan has run yet, so cancelling here costs nothing. The finally block
    // resets the buttons on this early return.
    const balance = await new Promise(res =>
      chrome.storage.local.get('creditBalance', d => res(d.creditBalance))
    );
    if (!(await confirmScan(toScore.length, balance))) {
      setProgress('Scan cancelled.');
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

      let descriptionText = '';
      let extractedTitle  = '';
      try {
        ({ descriptionText, extractedTitle } = await fetchPostingText(postingId));
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
        model:       'gemini-2.5-flash',
        postingId,
        batchId
      });

      if (reply?.ok) {
        scores.set(postingId, { ...reply.result, scanId: reply.scanId, title: meta.title, org: meta.org });
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
              setActionPrompt("You're out of credits.", 'Buy credits', '/buy');
            } else if (result.code === 'PROFILE_NOT_SET') {
              setActionPrompt('Set up your profile to start scoring.', 'Set up profile', '/profile');
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
    scanBtn.classList.remove('ww-ext-scanning');
    scanBtn.textContent = 'Scan All Jobs';
    scanBtn.disabled = false;
  }
}

// Fetch + trim a posting's overview text. Used by the scan loop and by 👎
// feedback (ADR 0044), which re-fetches instead of storing descriptions.
async function fetchPostingText(postingId) {
  const html = await sendBridge('fetchOverview', { postingId }, FETCH_TIMEOUT);
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  let rawText = doc.body.textContent.replace(/\s+/g, ' ').trim();
  const summaryIdx = rawText.indexOf('Job Summary');
  if (summaryIdx > 0) rawText = rawText.slice(summaryIdx);
  const appInfoIdx = rawText.indexOf('Application Information');
  if (appInfoIdx > 0) rawText = rawText.slice(0, appInfoIdx).trim();
  return {
    descriptionText: rawText.slice(0, DESC_CHAR_CAP),
    extractedTitle:  doc.querySelector('h1, h2, h3')?.textContent.trim() ?? ''
  };
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
          <div>Sign in with your UWaterloo account in <button class="ww-ext-inline-link" id="ww-ext-guide-signin">Settings</button></div>
        </div>
        <div class="ww-ext-guide-step" id="ww-ext-step-cv">
          <span class="ww-ext-step-num">2</span>
          <div>Set up your <button class="ww-ext-inline-link" id="ww-ext-guide-profile">profile</button> on the web app</div>
        </div>
        <div class="ww-ext-guide-step">
          <span class="ww-ext-step-num">3</span>
          <div>Click <b>Scan All Jobs</b> above</div>
        </div>
      </li>`;
    ul.querySelector('#ww-ext-guide-signin')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openOptions' });
    });
    ul.querySelector('#ww-ext-guide-profile')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'openWebApp', path: '/profile' });
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
  ul.innerHTML = sorted.map(([id, entry]) => {
    const { score, verdict, reason, breakdown, title, org } = entry;
    return `
    <li class="ww-ext-card" data-posting-id="${esc(id)}">
      <div class="ww-ext-card-top">
        <div class="ww-ext-card-verdict ww-ext-v--${esc(verdictSlug(verdict))}">
          <span class="ww-ext-card-score">${score != null ? esc(score) : '–'}</span>
          <span class="ww-ext-card-pill">${esc(verdict)}</span>
        </div>
        <div class="ww-ext-card-actions">
          <button class="ww-ext-save-btn" title="Save to folder">${SVG_FOLDER}</button>
          <button class="ww-ext-del-btn" title="Remove from list">${SVG_X}</button>
        </div>
      </div>
      <button class="ww-ext-card-title ww-ext-card-link">${esc(title)}</button>
      <div class="ww-ext-card-org">${esc(org)}</div>
      <div class="ww-ext-card-reason">${esc(reason)}</div>
      ${renderBreakdown(breakdown)}
      ${renderFeedback(entry)}
    </li>
  `;
  }).join('');
}

// 👍/👎 footer (ADR 0044). Only for entries that know their scan row —
// pre-v8.6 cache entries have no scanId and get no buttons. Once feedback
// is sent the row disappears (one vote per scan; no re-vote UI).
function renderFeedback(entry) {
  if (!entry.scanId || entry.feedback) return '';
  return `
    <div class="ww-ext-card-feedback">
      <span class="ww-ext-fb-label">Was this score right?</span>
      <button class="ww-ext-fb-btn ww-ext-fb-up" title="Good score">👍</button>
      <button class="ww-ext-fb-btn ww-ext-fb-down" title="Bad score">👎</button>
    </div>`;
}

// 👎 opens an optional one-liner before sending. Sends the posting text too
// (re-fetched, free) so a bad score can be debugged server-side.
function openFeedbackForm(card) {
  const box = card.querySelector('.ww-ext-card-feedback');
  if (!box || box.querySelector('input')) return;
  box.innerHTML = `
    <input class="ww-ext-fb-input" type="text" maxlength="200"
           placeholder="What was wrong? (optional)">
    <button class="ww-ext-fb-btn ww-ext-fb-send" title="Send">Send</button>
    <button class="ww-ext-fb-btn ww-ext-fb-cancel" title="Cancel">✕</button>`;
  const input = box.querySelector('input');
  input.focus();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitFeedback(card.dataset.postingId, 'down', input.value);
    if (e.key === 'Escape') renderSidebarList();
  });
}

async function submitFeedback(postingId, rating, comment = '') {
  const entry = scores.get(postingId);
  if (!entry?.scanId) return;
  let descriptionText = '';
  if (rating === 'down') {
    try { ({ descriptionText } = await fetchPostingText(postingId)); }
    catch { /* description is best-effort context — send feedback anyway */ }
  }
  const reply = await chrome.runtime.sendMessage({
    type: 'sendFeedback',
    scanId: entry.scanId,
    rating,
    comment: comment.trim(),
    descriptionText
  });
  if (reply?.ok) {
    scores.set(postingId, { ...entry, feedback: rating });
    saveScores();
  } else {
    setProgress('Could not send feedback — try again later.', true);
  }
  renderSidebarList();
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
        <span class="ww-ext-title">WW Scorer</span>
        <span id="ww-ext-credits" hidden></span>
      </div>
      <div class="ww-ext-header-btns">
        <button id="ww-ext-settings" title="Settings">${SVG_GEAR}</button>
        <button id="ww-ext-close" title="Close">${SVG_X}</button>
      </div>
    </div>
    <div id="ww-ext-controls">
      <div class="ww-ext-section">
        <button id="ww-ext-scan">Scan All Jobs</button>
        <div id="ww-ext-progress"></div>
      </div>
      <div class="ww-ext-section" id="ww-ext-save-section">
        <div class="ww-ext-section-label" id="ww-ext-save-toggle">
          Save to Folder
          <button class="ww-ext-help-btn" data-help="folder" title="What is this?">?</button>
          <span id="ww-ext-save-chevron">▾</span>
        </div>
        <div id="ww-ext-save-body">
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
      </div>
    </div>
    <ul id="ww-ext-results"></ul>
  `;
  document.body.appendChild(sidebar);

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
  document.getElementById('ww-ext-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openOptions' });
  });
  const scanBtn = document.getElementById('ww-ext-scan');
  scanBtn.addEventListener('click', () => {
    if (scanBtn.classList.contains('ww-ext-scanning')) {
      aborted = true;
      scanBtn.disabled = true;
      scanBtn.textContent = 'Stopping…';
    } else {
      scanAllJobs();
    }
  });

  // Save-to-Folder section collapses to "Score ≥ n  [Save to Folder]";
  // collapsed is the default so the results list gets the room.
  const saveSection = document.getElementById('ww-ext-save-section');
  chrome.storage.local.get('ww_save_collapsed', d => {
    saveSection.classList.toggle('ww-ext-collapsed', d.ww_save_collapsed !== false);
  });
  document.getElementById('ww-ext-save-toggle').addEventListener('click', e => {
    if (e.target.closest('.ww-ext-help-btn')) return;
    const collapsed = saveSection.classList.toggle('ww-ext-collapsed');
    chrome.storage.local.set({ ww_save_collapsed: collapsed });
  });
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
  document.getElementById('ww-ext-clear').addEventListener('click', async () => {
    if (!scores.size) return;
    const n = scores.size;
    const ok = await confirmDialog({
      title: `Clear all ${n} ${n === 1 ? 'score' : 'scores'}?`,
      msg: 'This removes every score from the list and the job table. It can’t be undone.',
      goLabel: 'Clear all'
    });
    if (ok) clearScores();
  });

  document.getElementById('ww-ext-results').addEventListener('click', e => {
    const card = e.target.closest('.ww-ext-card');
    if (!card) return;
    if (e.target.closest('.ww-ext-del-btn')) {
      removeScore(card.dataset.postingId);
      return;
    }
    if (e.target.closest('.ww-ext-save-btn')) {
      sendBridge('openFolderSidebar', { postingId: card.dataset.postingId });
      return;
    }
    if (e.target.closest('.ww-ext-card-link')) {
      scrollToRow(card.dataset.postingId);
      return;
    }
    if (e.target.closest('.ww-ext-fb-up')) {
      const entry = scores.get(card.dataset.postingId);
      if (entry?.feedback !== 'up') submitFeedback(card.dataset.postingId, 'up');
      return;
    }
    if (e.target.closest('.ww-ext-fb-down')) {
      openFeedbackForm(card);
      return;
    }
    if (e.target.closest('.ww-ext-fb-send')) {
      const input = card.querySelector('.ww-ext-fb-input');
      submitFeedback(card.dataset.postingId, 'down', input?.value || '');
      return;
    }
    if (e.target.closest('.ww-ext-fb-cancel')) {
      renderSidebarList();
      return;
    }
    if (e.target.closest('.ww-ext-fb-input')) return;
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
