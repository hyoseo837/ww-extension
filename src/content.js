if (!window.__wwExtensionInjected) {
  window.__wwExtensionInjected = true;
  waitForTable().then(() => {
    injectBridge();
    injectSidebar();
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
}
