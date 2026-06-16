// Sidebar UI: the panel shell, credits chip, results list, score breakdown,
// and the 👍/👎 feedback flow (ADR 0044).

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

// ── Sidebar list ──────────────────────────────────────────────────────────────

function renderSidebarList() {
  const ul = document.getElementById('ww-ext-results');
  if (!ul) return;
  // Only this board's scored jobs (v8.7.1) — full-cycle and direct each get
  // their own list, even though the cache (and credits) are shared.
  const boardEntries = [...scores.entries()].filter(([, e]) => onBoard(e));
  if (!boardEntries.length) {
    ul.innerHTML = `
      <li class="ww-ext-empty">
        <div class="ww-ext-guide-title">Get started</div>
        <div class="ww-ext-guide-step" id="ww-ext-step-auth">
          <span class="ww-ext-step-num">1</span>
          <div>Sign in with your UWaterloo account in <button class="ww-ext-inline-link" id="ww-ext-guide-signin">Settings</button></div>
        </div>
        <div class="ww-ext-guide-step">
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
    chrome.storage.local.get('auth', data => {
      updateGuideSteps(!!data.auth?.access_token);
    });
    return;
  }
  // Sort: score desc → verdict ladder (Strong Apply → Skip) → title asc, for stable rendering.
  const sorted = boardEntries.sort(([, a], [, b]) =>
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
// 3+ points collapse to ~2 (ww-ext-clamp); click expands, like the reason.
function renderBreakdown(breakdown) {
  if (!Array.isArray(breakdown) || !breakdown.length) return '';
  const items = breakdown.map(({ point, effect }) =>
    `<li class="ww-ext-bd-${effect === 'minus' ? 'minus' : 'plus'}">${esc(point)}</li>`
  ).join('');
  const clamp = breakdown.length > 2 ? ' ww-ext-clamp' : '';
  return `<ul class="ww-ext-card-breakdown${clamp}">${items}</ul>`;
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
        <div id="ww-ext-scan-one">
          <input id="ww-ext-scan-one-id" type="text" inputmode="numeric"
            maxlength="12" placeholder="Posting ID" autocomplete="off">
          <button id="ww-ext-scan-one-btn">Scan one</button>
        </div>
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

  // Scan one job by id (v8.16): ignored while a scan (all or one) is running —
  // scanOneJob shares withScanButton's Stop state, so the Scan/Stop button is
  // the single stop control.
  const scanOneBtn = document.getElementById('ww-ext-scan-one-btn');
  const scanOneId  = document.getElementById('ww-ext-scan-one-id');
  const startScanOne = () => {
    if (!scanBtn.classList.contains('ww-ext-scanning')) scanOneJob();
  };
  scanOneBtn.addEventListener('click', startScanOne);
  scanOneId.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); startScanOne(); }
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
      .filter(([, entry]) => onBoard(entry)
        && (entry.verdict === 'Excluded' || entry.score >= min) && verdicts.has(entry.verdict))
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
    const breakdown = e.target.closest('.ww-ext-card-breakdown');
    if (breakdown) breakdown.classList.toggle('ww-ext-expanded');
  });
}

// Guide ✓ exists only for the sign-in step — auth is the one state the
// extension can see locally. The profile lives server-side (v6.4), so step 2
// stays a plain numbered link rather than guessing at completion.
function updateGuideSteps(hasAuth) {
  const authStep = document.getElementById('ww-ext-step-auth');
  if (!authStep) return;
  authStep.querySelector('.ww-ext-step-num').textContent = hasAuth ? '✓' : '1';
  authStep.classList.toggle('ww-ext-step-done', hasAuth);
}
