const el = id => document.getElementById(id);

// Web app — account, profile, preferences, billing all live here now (v6.4).
const WEB_APP_URL = 'https://ww-extension.hyoseo.dev';

// ── Open the web app (account / profile / billing) ─────────────────────────────

document.querySelectorAll('.open-web').forEach(btn => {
  btn.addEventListener('click', () => {
    chrome.tabs.create({ url: WEB_APP_URL + (btn.dataset.path || '/') });
  });
});

// ── Account / Auth ────────────────────────────────────────────────────────────

function setAuthStatus(msg, type) {
  const s = el('authStatus');
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

function renderAuth(auth) {
  const out = el('auth-out');
  const inn = el('auth-in');
  if (auth && auth.access_token) {
    out.style.display = 'none';
    inn.style.display = 'block';
    el('authEmail').textContent = auth.email || '(no email)';
  } else {
    out.style.display = 'block';
    inn.style.display = 'none';
  }
}

function renderBalance(balance) {
  const node = el('creditBalance');
  if (!node) return;
  node.textContent = typeof balance === 'number' ? balance.toFixed(2) : '—';
}

// Sign-in runs in the background worker (ADR 0055) — one shared flow for the
// options page and the sidebar. On success the background writes `auth` and the
// storage.onChanged listeners (here + background) refresh the UI and balance.
el('signIn').addEventListener('click', async () => {
  el('signIn').disabled = true;
  setAuthStatus('Opening UWaterloo sign-in…');
  const res = await chrome.runtime.sendMessage({ type: 'signIn' });
  if (res?.ok) {
    setAuthStatus('Signed in.', 'ok');
  } else {
    setAuthStatus(res?.error || 'Sign-in failed.', 'err');
  }
  el('signIn').disabled = false;
});

el('signOut').addEventListener('click', async () => {
  // Clear the session and the cached balance (profile data lives
  // server-side since v6.4 — nothing else is stored locally).
  await chrome.storage.local.remove(['auth', 'creditBalance']);
  renderBalance(undefined);
  setAuthStatus('Signed out.', 'ok');
});

chrome.storage.local.get(['auth', 'creditBalance'], data => {
  renderAuth(data.auth);
  renderBalance(data.creditBalance);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.auth) renderAuth(changes.auth.newValue);
  if (changes.creditBalance) renderBalance(changes.creditBalance.newValue);
});

// Returning from the web app tab (e.g. after buying credits), the webhook may
// have just granted credits — refresh the balance on focus + one delayed retry.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  chrome.storage.local.get('auth', d => {
    if (!d.auth?.access_token) return;
    chrome.runtime.sendMessage({ type: 'refreshBalance' });
    setTimeout(() => chrome.runtime.sendMessage({ type: 'refreshBalance' }), 3000);
  });
});

// ── About / version ────────────────────────────────────────────────────────────

el('extVersion').textContent = 'v' + chrome.runtime.getManifest().version;

el('showWelcome').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});
