// Shared foundation for the content scripts (split from content.js, v8.11).
// Load order is set in manifest.json: core → table → scan → sidebar → main.
// All five share one isolated-world scope; top-level declarations here are
// visible to (and assignable from) the other files.
const TABLE_SEL      = '#dataViewerPlaceholder table.data-viewer-table';
const ROW_SEL        = `${TABLE_SEL} tbody tr.table__row--body`;
const DESC_CHAR_CAP   = 6000;
// Hard cap on title/org sent as scan meta. A real job title is short; this
// guarantees no source (off-page heading, future change) overruns the
// server's 400-char cap and 422s the scan (v8.14).
const META_CHAR_CAP   = 200;
const FETCH_TIMEOUT   = 15000;
// 10 workers (v8.14). runScan warms Gemini's implicit prefix cache with one
// scan before fanning out, so only that first scan is a cache miss per batch
// (ADR 0051) — not the whole opening wave.
const SCAN_CONCURRENCY = 10;
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
// "Open in new tab" / external-link — the sidebar shortcut to the web app (v8.17).
const SVG_EXTERNAL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';
// Export (download) / import (upload) icons for the scan-backup row (v8.17).
const SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
const SVG_UPLOAD   = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>';

// Which WW job board this page is (v8.7.1). Entries are tagged at scan time;
// the sidebar list and bulk save only show the current board's jobs. Entries
// without a board tag predate v8.7 and were necessarily scanned on full.
const BOARD = location.pathname.includes('/co-op/direct/') ? 'direct' : 'full';
const onBoard = entry => (entry.board ?? 'full') === BOARD;

const scores = new Map(); // postingId → {score, verdict, reason, breakdown, title, org, board}
let allPostingIds = [];   // ordered list from selectAll — used for page navigation
let aborted = false;
let detectedPageSize = 50; // refined upward from observed row counts

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
      if (isValidScoreEntry(entry)) {
        if (!Array.isArray(entry.breakdown)) entry.breakdown = [];
        scores.set(id, entry);
      }
    }
    allPostingIds = Array.isArray(data.ww_posting_ids) ? data.ww_posting_ids : [];
    injectRowScores();
  }
  renderSidebarList();
}

// An entry matches the current scoring shape (ADR 0016) — the single guard for
// both the storage load and the file import (v8.17).
function isValidScoreEntry(entry) {
  return entry && typeof entry === 'object'
    && (Number.isInteger(entry.score) || (entry.score === null && entry.verdict === 'Excluded'))
    && VERDICT_ORDER[entry.verdict] !== undefined
    && typeof entry.reason === 'string';
}

// ── Backup: export / import scores (v8.17, ADR 0054) ────────────────────────────

// Download every score (both boards) as a JSON file. No `downloads` permission —
// a Blob URL + <a download> click in the page.
function exportScores() {
  if (!scores.size) { setProgress('No scores to export.', true); return; }
  const payload = {
    app: 'ww-extension',
    schema: SCORING_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    scores: Object.fromEntries(scores),
    postingIds: allPostingIds
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `ww-scores-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setProgress(`Exported ${scores.size} ${scores.size === 1 ? 'score' : 'scores'}.`);
}

// Import scores from a user-picked JSON file. Rejects a malformed / non-ww /
// wrong-schema file; otherwise warns that a merge overwrites current scores on
// a shared posting id, then merges — imported entries win on collision.
async function importScores(file) {
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    setProgress('Import failed: not a valid JSON file.', true);
    return;
  }
  if (data?.app !== 'ww-extension' || !data.scores || typeof data.scores !== 'object') {
    setProgress('Import failed: not a WW Scorer export.', true);
    return;
  }
  if (data.schema !== SCORING_SCHEMA_VERSION) {
    setProgress('Import failed: this file is from an older score version.', true);
    return;
  }
  const valid = Object.entries(data.scores).filter(([, e]) => isValidScoreEntry(e));
  if (!valid.length) { setProgress('Import failed: no usable scores in the file.', true); return; }

  const overlap = valid.filter(([id]) => scores.has(id)).length;
  const ok = await confirmDialog({
    title: `Import ${valid.length} ${valid.length === 1 ? 'score' : 'scores'}?`,
    msg: 'They merge into your current list.',
    warn: overlap
      ? `⚠ ${overlap} already-scored posting${overlap === 1 ? '' : 's'} will be overwritten — you can lose current scores.`
      : '',
    goLabel: 'Import'
  });
  if (!ok) { setProgress('Import cancelled.'); return; }

  for (const [id, entry] of valid) {
    if (!Array.isArray(entry.breakdown)) entry.breakdown = [];
    scores.set(id, entry);
  }
  if (Array.isArray(data.postingIds)) {
    allPostingIds = [...new Set([...allPostingIds, ...data.postingIds.map(String)])];
  }
  saveScores();
  injectRowScores();
  renderSidebarList();
  setProgress(`Imported ${valid.length} ${valid.length === 1 ? 'score' : 'scores'}.`);
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

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
