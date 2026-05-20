if (!window.__wwExtensionInjected) {
  window.__wwExtensionInjected = true;
  waitForTable().then(() => {
    injectBridge();
    injectSidebar();
    startTableObserver();
  });
}

const scores = new Map(); // postingId → {score, verdict, reason, title, org}
let aborted = false;

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
    if (document.querySelector('#dataViewerPlaceholder table.data-viewer-table')) {
      resolve(); return;
    }
    const obs = new MutationObserver(() => {
      if (document.querySelector('#dataViewerPlaceholder table.data-viewer-table')) {
        obs.disconnect(); resolve();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

// ── Score column ──────────────────────────────────────────────────────────────

function injectHeader() {
  const headerRow = document.querySelector(
    '#dataViewerPlaceholder table.data-viewer-table thead tr.table__row--header'
  );
  if (!headerRow || headerRow.querySelector('th[data-ww-score-header]')) return;
  const th = document.createElement('th');
  th.setAttribute('data-v-76d37ef8', '');
  th.setAttribute('data-v-612a1958', '');
  th.className = 'table__heading overflow--hidden';
  th.setAttribute('scope', 'col');
  th.setAttribute('data-ww-score-header', '');
  th.style.width = '110px';
  th.innerHTML = `
    <div data-v-76d37ef8="" class="display--flex align--middle match--padding">
      <div data-v-76d37ef8="" class="display--flex align--middle">
        <span data-v-76d37ef8="" class="js--data-grid--header--label margin--l--s" style="padding-left:0px;">AI Score</span>
      </div>
    </div>
    <div data-v-76d37ef8="" class="resize--handle display--flex align--center" tabindex="0" role="button" aria-label="Resize AI Score column">
      <div data-v-76d37ef8="" class=""></div>
    </div>
  `;
  headerRow.insertBefore(th, headerRow.children[1]);
}

function injectRowBadges() {
  document.querySelectorAll(
    '#dataViewerPlaceholder table.data-viewer-table tbody tr.table__row--body'
  ).forEach(row => {
    const id = row.querySelector('input[name="dataViewerSelection"]')?.value;
    let td = row.querySelector('td[data-ww-score]');
    if (!td) {
      td = document.createElement('td');
      td.className = 'table__value overflow--hidden';
      td.setAttribute('data-v-612a1958', '');
      td.setAttribute('data-ww-score', '');
      row.insertBefore(td, row.querySelector('td.table__value'));
    }
    if (id && scores.has(id) && !td.querySelector('.ww-ext-badge')) {
      const { score, verdict, reason } = scores.get(id);
      const escaped = reason.replace(/"/g, '&quot;');
      td.innerHTML = `<span class="ww-ext-badge ww-ext-badge--${verdict.toLowerCase()}" title="${escaped}">${score} · ${verdict}</span>`;
    }
  });
}


function startTableObserver() {
  const table = document.querySelector('#dataViewerPlaceholder table.data-viewer-table');
  if (!table) return;
  const obs = new MutationObserver(() => {
    injectHeader();
    injectRowBadges();
  });
  obs.observe(table, { childList: true, subtree: true });
}

// ── Scan ──────────────────────────────────────────────────────────────────────

async function scanAllJobs() {
  const scanBtn    = document.getElementById('ww-ext-scan');
  const stopBtn    = document.getElementById('ww-ext-stop');
  const progressEl = document.getElementById('ww-ext-progress');

  scanBtn.disabled = true;
  stopBtn.disabled = false;
  aborted = false;

  try {
    const tokens = await sendBridge('extractTokens');
    if (!tokens.selectAll) {
      progressEl.textContent = 'Error: selectAll token not found.';
      return;
    }

    const res = await fetch('/myAccount/co-op/full/jobs.htm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: tokens.selectAll })
    });
    const data = await res.json();
    const postingIds = data.resultIds;
    if (!postingIds?.length) {
      progressEl.textContent = 'No jobs found.';
      return;
    }

    const settings = await chrome.storage.local.get(['apiKey', 'model', 'cvText']);
    if (!settings.apiKey || !settings.cvText) {
      progressEl.textContent = 'Open settings — API key and CV required.';
      return;
    }

    const rowMeta = indexVisibleRows();
    const total   = postingIds.length;
    let done = 0;

    injectHeader();

    for (const postingId of postingIds) {
      if (aborted) break;
      progressEl.textContent = `Fetching ${done + 1} of ${total}…`;

      let descriptionText = '';
      try {
        const html = await sendBridge('fetchOverview', { postingId }, 15000);
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        descriptionText = doc.body.textContent.trim().slice(0, 6000);
      } catch {
        done++; continue;
      }

      const meta = rowMeta[postingId] ?? { title: `#${postingId}`, org: '' };
      progressEl.textContent = `Scoring ${done + 1} of ${total}…`;

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
        injectRowBadges();
        renderSidebarList();
      } else if (reply.error?.includes('Rate limited')) {
        progressEl.textContent = `Rate limit reached after ${done} scored. Try again later.`;
        break;
      }

      done++;
      progressEl.textContent = `${done} of ${total} scored`;
      await sleep(600);
    }

    progressEl.textContent = aborted
      ? `Stopped at ${done} of ${total}.`
      : `${done} of ${total} scored.`;

  } catch (e) {
    progressEl.textContent = `Error: ${e.message}`;
  } finally {
    scanBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function indexVisibleRows() {
  const map = {};
  document.querySelectorAll(
    '#dataViewerPlaceholder table.data-viewer-table tbody tr.table__row--body'
  ).forEach(row => {
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
  const sorted = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  ul.innerHTML = sorted.map(([id, { score, verdict, reason, title, org }]) => `
    <li class="ww-ext-card" data-posting-id="${id}">
      <div class="ww-ext-card-top">
        <span class="ww-ext-badge ww-ext-badge--${verdict.toLowerCase()}">${score} · ${verdict}</span>
        <span class="ww-ext-card-org">${esc(org)}</span>
      </div>
      <div class="ww-ext-card-title">${esc(title)}</div>
      <div class="ww-ext-card-reason">${esc(reason)}</div>
    </li>
  `).join('');
}

function scrollToRow(postingId) {
  const input = document.querySelector(
    `#dataViewerPlaceholder table.data-viewer-table tbody input[value="${postingId}"]`
  );
  if (!input) return;
  const row = input.closest('tr.table__row--body');
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('ww-ext-highlight');
  setTimeout(() => row.classList.remove('ww-ext-highlight'), 1500);
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      <div id="ww-ext-progress"></div>
    </div>
    <ul id="ww-ext-results"></ul>
  `;
  document.body.appendChild(sidebar);

  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.getElementById('ww-ext-close').addEventListener('click', () => sidebar.classList.remove('open'));
  document.getElementById('ww-ext-scan').addEventListener('click', scanAllJobs);
  document.getElementById('ww-ext-stop').addEventListener('click', () => { aborted = true; });

  // Delegated click handler for sidebar cards
  document.getElementById('ww-ext-results').addEventListener('click', e => {
    const card = e.target.closest('.ww-ext-card');
    if (card) scrollToRow(card.dataset.postingId);
  });
}
