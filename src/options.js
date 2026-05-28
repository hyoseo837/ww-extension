const el = id => document.getElementById(id);

// ── Help popovers ─────────────────────────────────────────────────────────────

const HELP_CONTENT = {
  model:    'Flash: faster and cheaper (~$0.15 / 1M input tokens). Pro: more accurate, better reasoning, but ~10× the cost. Flash is recommended — it scores jobs very well.',
  tokens:   'Input: tokens you send to Gemini (job + profile). Output: tokens in the AI\'s reply. Cached: input tokens that hit a server-side cache, billed at ~25% of normal — already counted inside Input. Reset the counter anytime; it\'s only stored locally.',
  criteria: 'Free-form preferences the AI weighs when scoring. Examples: "Remote or hybrid only", "Toronto preferred", "No Web3 or crypto". Leave empty to score purely on profile fit — no extra token cost.'
};

// ── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  const s = el('status');
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

function setExtractStatus(msg, type) {
  const s = el('extractStatus');
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

function setProfileStatus(msg, type) {
  const s = el('profileStatus');
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

// ── Token usage ───────────────────────────────────────────────────────────────

function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : '—'; }

function renderTokens(usage) {
  el('tokIn').textContent     = fmt(usage?.input);
  el('tokOut').textContent    = fmt(usage?.output);
  el('tokCached').textContent = fmt(usage?.cached);
}

// Route through background so there's a single serialized writer to
// tokenUsage — prevents lost updates when an options-page PDF extract
// races with a content-script scan.
function incrementTokenUsage(usage) {
  if (!usage) return;
  chrome.runtime.sendMessage({ type: 'addTokens', usage }).catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tokenUsage) renderTokens(changes.tokenUsage.newValue);
});

el('resetTokens').addEventListener('click', () => {
  const zero = { input: 0, cached: 0, output: 0 };
  chrome.storage.local.set({ tokenUsage: zero }, () => renderTokens(zero));
});

// ── Theme toggle ──────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light', isLight);
  const pill = el('themeToggle');
  if (pill) {
    pill.classList.toggle('on', isLight);
    pill.setAttribute('aria-checked', String(isLight));
  }
  const dark  = el('themeOptDark');
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

// ── Load saved settings ───────────────────────────────────────────────────────

chrome.storage.local.get(['apiKey', 'model', 'cvText', 'preferences', 'theme', 'tokenUsage'], data => {
  if (data.apiKey)      el('apiKey').value        = data.apiKey;
  if (data.model)       el('model').value          = data.model;
  if (data.cvText)      el('extractedText').value  = data.cvText;
  if (data.preferences) el('preferences').value    = data.preferences;
  if (data.theme)       applyTheme(data.theme);
  renderTokens(data.tokenUsage);
});

// ── Save handlers ─────────────────────────────────────────────────────────────

function saveAll(onDone) {
  chrome.storage.local.set({
    apiKey:      el('apiKey').value.trim(),
    model:       el('model').value,
    cvText:      el('extractedText').value.trim(),
    preferences: el('preferences').value.trim()
  }, onDone);
}

el('save').addEventListener('click', () => {
  saveAll(() => setStatus('Saved.', 'ok'));
});

el('saveProfile').addEventListener('click', () => {
  saveAll(() => setProfileStatus('Profile updated.', 'ok'));
});

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

let droppedFile = null;

const dropZone = el('dropZone');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) { droppedFile = file; el('fileName').textContent = file.name; }
});

el('packageFile').addEventListener('change', () => {
  droppedFile = null;
  const file = el('packageFile').files[0];
  if (file) el('fileName').textContent = file.name;
});

// ── Extract from PDF ──────────────────────────────────────────────────────────

el('extract').addEventListener('click', async () => {
  const file = droppedFile || el('packageFile').files[0];
  if (!file) { setExtractStatus('Select a PDF first.', 'err'); return; }
  if (file.size > 5 * 1024 * 1024) { setExtractStatus('File exceeds 5 MB limit.', 'err'); return; }

  const apiKey = el('apiKey').value.trim();
  const model  = el('model').value;
  if (!apiKey) { setExtractStatus('Enter an API key first.', 'err'); return; }

  el('extract').disabled = true;
  setExtractStatus('Extracting...');

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.replace(/^data:[^;]+;base64,/, ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extract all relevant content from this application package PDF as plain text. Include education, work experience, skills, projects, grades, and any other candidate information. Output only the extracted text — no commentary, no markdown.' },
              { inline_data: { mime_type: 'application/pdf', data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      el('extractedText').value = text;
      setExtractStatus(`Extracted ${text.length.toLocaleString()} characters.`, 'ok');
      incrementTokenUsage(data.usageMetadata);
    } else {
      const err = await res.json().catch(() => ({}));
      setExtractStatus(`Error ${res.status}: ${err?.error?.message ?? 'unknown'}`, 'err');
    }
  } catch (e) {
    setExtractStatus(`Request failed: ${e.message}`, 'err');
  } finally {
    el('extract').disabled = false;
  }
});

// ── Test API key ──────────────────────────────────────────────────────────────

el('test').addEventListener('click', async () => {
  const apiKey = el('apiKey').value.trim();
  const model  = el('model').value;
  if (!apiKey) { setStatus('Enter an API key first.', 'err'); return; }
  setStatus('Testing...');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }]
        })
      }
    );
    if (res.ok) {
      setStatus('API key works.', 'ok');
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(`Error ${res.status}: ${err?.error?.message ?? 'unknown'}`, 'err');
    }
  } catch (e) {
    setStatus(`Request failed: ${e.message}`, 'err');
  }
});

// ── About / Settings tab ──────────────────────────────────────────────────────

el('extVersion').textContent = 'v' + chrome.runtime.getManifest().version;

el('showWelcome').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

// ── Clear CV text ─────────────────────────────────────────────────────────────

el('clearCv').addEventListener('click', () => {
  if (!confirm('Clear extracted profile text? You will need to re-upload your application package to score new jobs.')) return;
  chrome.storage.local.remove('cvText', () => {
    el('extractedText').value = '';
    el('fileName').textContent = '';
    droppedFile = null;
    setExtractStatus('Profile text cleared.', 'ok');
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
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
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
  } catch (e) {
    setAuthStatus(`Sign-in failed: ${e.message || e}`, 'err');
  } finally {
    el('signIn').disabled = false;
  }
});

el('signOut').addEventListener('click', async () => {
  await chrome.storage.local.remove('auth');
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
    helpPopover.style.top  = (r.bottom + 8) + 'px';
    helpPopover.style.left = Math.max(8, Math.min(r.left - 8, window.innerWidth - 300)) + 'px';
    helpPopover.classList.add('visible');
  } else if (!e.target.closest('#opts-help-popover')) {
    helpPopover.classList.remove('visible');
  }
});
