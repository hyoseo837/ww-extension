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

    // Estimated cost: ~2 credits/scan (measured live 2026-06-11, 35 scans →
    // 67.9 credits; v8.5's richer prompt outgrew ADR 0034's ~1/scan). The real
    // per-scan charge is token-variable, hence "~". Warn when the balance can't
    // cover the whole batch (v7.5.1).
    const estCost = count * 2;
    const short = bal != null && bal < estCost;

    const backdrop = document.createElement('div');
    backdrop.className = 'ww-ext-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="ww-ext-confirm-card" role="dialog" aria-modal="true">
        <div class="ww-ext-confirm-title">Scan ${count} unscored ${jobWord}?</div>
        <div class="ww-ext-confirm-msg">This costs ~${estCost} credits${bal != null ? ` — you have ${bal}` : ''}.</div>
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
    const id     = row.querySelector('input[name="dataViewerSelection"]')?.value;
    const anchor = findTitleAnchor(row);
    const title  = anchor?.textContent.trim() ?? '';
    const org    = anchor?.closest('td.table__value').nextElementSibling
      ?.querySelector('span')?.textContent.trim() ?? '';
    if (id) map[id] = { title: title || `#${id}`, org };
  });
  return map;
}
