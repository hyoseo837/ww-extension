// The scan engine: progress line, spend-confirmation dialogs, the batch
// worker loop, and posting-text fetch/trim.

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

// Confirm overlay. Rendered inside #ww-ext-sidebar so it inherits the --s-*
// theme vars + light-theme override; the sidebar uses transform, so a
// position:fixed child would be trapped in the panel — the overlay is
// position:absolute within it. Resolves true on the go button, false on
// Cancel / backdrop / Esc. `warn` adds a warning line; `extra` adds a middle
// button ({label, onClick}) whose action counts as a cancel (it navigates
// away rather than confirming).
function confirmDialog({ title, msg, goLabel, warn = '', extra = null }) {
  return new Promise(resolve => {
    const sidebar = document.getElementById('ww-ext-sidebar');
    if (!sidebar) { resolve(true); return; } // no UI to host the prompt

    const backdrop = document.createElement('div');
    backdrop.className = 'ww-ext-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="ww-ext-confirm-card" role="dialog" aria-modal="true">
        <div class="ww-ext-confirm-title">${esc(title)}</div>
        <div class="ww-ext-confirm-msg">${esc(msg)}</div>
        ${warn ? `<div class="ww-ext-confirm-warn">${esc(warn)}</div>` : ''}
        <div class="ww-ext-confirm-actions">
          <button class="ww-ext-confirm-cancel">Cancel</button>
          ${extra ? `<button class="ww-ext-confirm-buy">${esc(extra.label)}</button>` : ''}
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
    backdrop.querySelector('.ww-ext-confirm-buy')?.addEventListener('click', () => {
      extra.onClick();
      close(false);
    });
    document.addEventListener('keydown', onKey, true);

    sidebar.appendChild(backdrop);
    backdrop.querySelector('.ww-ext-confirm-go').focus();
  });
}

// Confirmation shown before a scan spends credits (v6.13). Estimated cost:
// ~2 credits/scan (measured live 2026-06-11, 35 scans → 67.9 credits; v8.5's
// richer prompt outgrew ADR 0034's ~1/scan). The real per-scan charge is
// token-variable, hence "~". When the balance can't cover the whole batch,
// warn and offer Buy credits → web app /buy (v7.5.1).
function confirmScan(count, balance) {
  const bal = Number.isFinite(balance) ? parseFloat(balance.toFixed(2)) : null;
  const estCost = count * 2;
  const short = bal != null && bal < estCost;
  return confirmDialog({
    title: `Scan ${count} unscored ${count === 1 ? 'job' : 'jobs'}?`,
    msg: `This costs ~${estCost} credits${bal != null ? ` — you have ${bal}` : ''}.`,
    warn: short ? '⚠ Not enough to scan them all.' : '',
    extra: short ? {
      label: 'Buy credits',
      onClick: () => chrome.runtime.sendMessage({ type: 'openWebApp', path: '/buy' })
    } : null,
    goLabel: short ? 'Scan anyway' : `Scan ${count}`
  });
}

// Posting ids whose last run ended in a non-halt failure (fetch/Gemini
// errors — refunded server-side). Feeds "Retry N failed"; reset by each run.
let failedIds = [];

// Scan/Stop button state shared by every run path. One button doubles as
// Stop while a run is live (the click handler in sidebar.js checks the
// ww-ext-scanning class).
async function withScanButton(run) {
  const scanBtn = document.getElementById('ww-ext-scan');
  scanBtn.classList.add('ww-ext-scanning');
  scanBtn.textContent = 'Stop';
  aborted = false;
  try {
    await run();
  } catch (e) {
    setProgress(`Error: ${e.message}`, true);
  } finally {
    scanBtn.classList.remove('ww-ext-scanning');
    scanBtn.textContent = 'Scan All Jobs';
    scanBtn.disabled = false;
  }
}

function scanAllJobs() {
  return withScanButton(async () => {
    const tokens = await sendBridge('extractTokens');
    if (!tokens.selectAll) {
      setProgress('Error: selectAll token not found.', true);
      return;
    }

    // Post to the current board's own path — Full-Cycle and Employer-Student
    // Direct share the page machinery but each posts to its own URL (v8.7.0).
    const res = await fetch(location.pathname, {
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

    await runScan(toScore);
  });
}

// Re-run only the failures from the last run (audit #12). Same loop, same
// cost confirmation — the failed scans were refunded, so a retry spends new
// credits and v6.13's confirm-before-spending rule applies.
function retryFailed() {
  return withScanButton(async () => {
    const ids = failedIds.filter(id => !scores.has(id));
    if (!ids.length) {
      setProgress('Nothing to retry.');
      return;
    }
    const balance = await new Promise(res =>
      chrome.storage.local.get('creditBalance', d => res(d.creditBalance))
    );
    if (!(await confirmScan(ids.length, balance))) {
      setProgress('Retry cancelled.');
      return;
    }
    await runScan(ids);
  });
}

// The batch loop: scores `toScore` with SCAN_CONCURRENCY workers. Shared by
// Scan All Jobs and Retry. Records non-halt failures in failedIds and offers
// the retry button when a completed run has any.
async function runScan(toScore) {
  // One id for this whole run, sent on every /scan so the web app's credit
  // history can group the batch ("Scanned N jobs"). v6.2.
  const batchId = crypto.randomUUID();
  const failures = [];

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

    // Truncate to META_CHAR_CAP so no source can exceed the server cap (v8.14).
    const meta = {
      title: (rowInfo?.title || extractedTitle || `#${postingId}`).slice(0, META_CHAR_CAP),
      org:   (rowInfo?.org   || '').slice(0, META_CHAR_CAP)
    };

    // No model field — the server picks the default (v8.11, audit #13).
    const reply = await chrome.runtime.sendMessage({
      type: 'scoreJob',
      meta,
      descriptionText,
      postingId,
      batchId
    });

    if (reply?.ok) {
      scores.set(postingId, { ...reply.result, scanId: reply.scanId, board: BOARD, title: meta.title, org: meta.org });
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

  // Score one id and fold the result into the shared run state. Used by both
  // the warm-up scan and the worker pool.
  async function processOne(postingId) {
    const result = await scanOne(postingId);
    if (result.ok) {
      done++;
    } else {
      failed++;
      lastError = result.error;
      if (!result.halt) failures.push(postingId);
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

  async function worker() {
    while (!aborted && !halted) {
      const idx = nextIdx++;
      if (idx >= toScore.length) return;
      await processOne(toScore[idx]);
    }
  }

  // Warm-up (ADR 0051): run the first scan alone so Gemini's implicit prefix
  // cache (system + CV) is populated before the rest fan out — otherwise the
  // whole opening wave of SCAN_CONCURRENCY scans races as cache misses. A halt
  // here (no credits / not signed in / profile unset) short-circuits the run.
  if (!aborted && toScore.length) {
    nextIdx = 1;
    await processOne(toScore[0]);
  }
  if (!aborted && !halted && nextIdx < toScore.length) {
    const workerCount = Math.min(SCAN_CONCURRENCY, toScore.length - nextIdx);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  // Final flush — overrides the pending debounced one.
  saveScores();
  renderSidebarList();

  failedIds = failures;
  if (!halted) {
    const skipped = failed ? ` (${failed} failed: ${lastError})` : '';
    const summary = aborted
      ? `Stopped at ${done} of ${total}.${skipped}`
      : `${done} of ${total} scored.${skipped}`;
    setProgress(summary, failed > 0);
    if (failures.length) offerRetry(failures.length);
  }
}

// Appends "Retry N failed" to the progress line after a run with failures.
// setProgress on the next run clears it (textContent wipes child nodes).
function offerRetry(n) {
  const el = document.getElementById('ww-ext-progress');
  if (!el) return;
  el.append(' ');
  const btn = document.createElement('button');
  btn.className = 'ww-ext-inline-link';
  btn.textContent = `Retry ${n} failed`;
  btn.addEventListener('click', retryFailed);
  el.appendChild(btn);
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
  // Off-page postings have no table row, so the title falls back to the
  // overview's first heading. That selector sometimes grabs description prose
  // (the live 422, v8.14): collapse whitespace and reject anything too long to
  // be a title, so the caller falls through to `#id` instead of sending prose.
  const heading = (doc.querySelector('h1, h2, h3')?.textContent ?? '')
    .replace(/\s+/g, ' ').trim();
  return {
    descriptionText: rawText.slice(0, DESC_CHAR_CAP),
    extractedTitle:  heading.length <= META_CHAR_CAP ? heading : ''
  };
}

function indexVisibleRows() {
  const map = {};
  document.querySelectorAll(ROW_SEL).forEach(row => {
    const id     = row.querySelector('input[name="dataViewerSelection"]')?.value;
    const anchor = findTitleAnchor(row);
    const title  = anchor?.textContent.trim() ?? '';
    const org    = anchor?.closest('td.table__value').nextElementSibling
      ?.querySelector('span')?.textContent.trim() ?? '';
    if (id) map[id] = { title: title || `#${id}`, org };
  });
  return map;
}
