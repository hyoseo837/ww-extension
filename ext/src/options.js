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
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=azure&scopes=email&redirect_to=${encodeURIComponent(redirectUrl)}`;

  el('signIn').disabled = true;
  setAuthStatus('Opening UWaterloo sign-in…');

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
