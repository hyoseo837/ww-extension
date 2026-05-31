const el = id => document.getElementById(id);

// Web app — account, profile, preferences, billing all live here now (v6.4).
const WEB_APP_URL = 'https://ww-extension.hyoseo.dev';

// ── Help popovers ─────────────────────────────────────────────────────────────

const HELP_CONTENT = {
  model: 'Flash: cheaper per scan (~$0.001 CAD). Pro: more accurate, ~10× the cost. Flash is recommended.',
};

// ── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.tab) return;  // external link (WaterlooWorks)
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Status helper (Model tab) ──────────────────────────────────────────────────

function setStatus(msg, type) {
  const s = el('status');
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light', isLight);
  const pill = el('themeToggle');
  if (pill) {
    pill.classList.toggle('on', isLight);
    pill.setAttribute('aria-checked', String(isLight));
  }
  const dark = el('themeOptDark');
  const light = el('themeOptLight');
  if (dark && light) {
    dark.classList.toggle('active', !isLight);
    light.classList.toggle('active', isLight);
  }
}

el('themeToggle').addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light');
  const theme = isLight ? 'light' : 'dark';
  applyTheme(theme);
  chrome.storage.local.set({ theme });
});

// ── Hard-exclusion pre-filter toggle (ADR 0018) ───────────────────────────────

function applyHardFilter(enabled) {
  const pill = el('hardFilterToggle');
  if (pill) {
    pill.classList.toggle('on', enabled);
    pill.setAttribute('aria-checked', String(enabled));
  }
}

el('hardFilterToggle').addEventListener('click', () => {
  const enabled = !el('hardFilterToggle').classList.contains('on');
  applyHardFilter(enabled);
  chrome.storage.local.set({ hardFilterEnabled: enabled });
});

chrome.storage.local.get('hardFilterEnabled', d => applyHardFilter(d.hardFilterEnabled !== false));

// ── Model (load + save) ────────────────────────────────────────────────────────

chrome.storage.local.get(['model', 'theme'], data => {
  if (data.model) el('model').value = data.model;
  applyTheme(data.theme);
});

el('save').addEventListener('click', () => {
  chrome.storage.local.set({ model: el('model').value }, () => setStatus('Saved.', 'ok'));
});

// ── Open the web app (account / profile / billing) ─────────────────────────────

document.querySelectorAll('.open-web').forEach(btn => {
  btn.addEventListener('click', () => {
    chrome.tabs.create({ url: WEB_APP_URL + (btn.dataset.path || '/') });
  });
});

// ── Account / Auth ────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://bumrzedwwfhbxlttwboh.supabase.co';

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

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

el('signIn').addEventListener('click', async () => {
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

  el('signIn').disabled = true;
  setAuthStatus('Opening Google sign-in…');

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    if (!responseUrl) {
      setAuthStatus('Sign-in cancelled.', 'err');
      return;
    }
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const errorDesc = params.get('error_description') || params.get('error');
    if (errorDesc) {
      setAuthStatus(`Sign-in failed: ${errorDesc}`, 'err');
      return;
    }
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    if (!accessToken) {
      setAuthStatus('Sign-in failed: no access token returned.', 'err');
      return;
    }
    const claims = decodeJwtPayload(accessToken) || {};
    const auth = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + expiresIn * 1000,
      email: claims.email,
      user_id: claims.sub,
    };
    await chrome.storage.local.set({ auth });
    setAuthStatus('Signed in.', 'ok');
    chrome.runtime.sendMessage({ type: 'refreshBalance' });
  } catch (e) {
    setAuthStatus(`Sign-in failed: ${e.message || e}`, 'err');
  } finally {
    el('signIn').disabled = false;
  }
});

el('signOut').addEventListener('click', async () => {
  // Clear the session and any locally cached profile/balance.
  await chrome.storage.local.remove([
    'auth', 'creditBalance', 'cvText', 'profileJson', 'profileSupplement', 'preferences', 'matchCriteria',
  ]);
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

// ── Help popover toggle ───────────────────────────────────────────────────────

const helpPopover = el('opts-help-popover');

document.addEventListener('click', e => {
  const btn = e.target.closest('.opts-help-btn');
  if (btn) {
    const key = btn.dataset.help;
    const isSame = helpPopover.classList.contains('visible') && helpPopover.dataset.open === key;
    if (isSame) { helpPopover.classList.remove('visible'); return; }
    helpPopover.textContent = HELP_CONTENT[key] || '';
    helpPopover.dataset.open = key;
    const r = btn.getBoundingClientRect();
    helpPopover.style.top = (r.bottom + 8) + 'px';
    helpPopover.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - 300)) + 'px';
    helpPopover.classList.add('visible');
  } else if (!e.target.closest('#opts-help-popover')) {
    helpPopover.classList.remove('visible');
  }
});
