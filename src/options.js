const el = id => document.getElementById(id);

// ── Help popovers ─────────────────────────────────────────────────────────────

const HELP_CONTENT = {
  model:    'Flash: cheaper per scan (~$0.001 CAD). Pro: more accurate, ~10× the cost. Flash is recommended.',
  workAuth: 'Your work-authorization status in Canada. The AI uses this to judge eligibility — e.g. an international student is flagged on roles that require citizenship or a security clearance. Leave unset to skip eligibility checks.',
  prefs:    'What you want in a role, as comma-separated values per tier. Preferred = ideal (full marks); under “More”, Acceptable = fine (no penalty), Avoid = allowed but penalized, Excluded = never. Weight sets how heavily a field counts. Leave a field blank for no preference.',
  criteria: 'Free-form notes the AI weighs alongside your structured criteria. Examples: "prioritize high salary", "ignore Web3 or crypto", "prefer early-stage startups". Leave empty to score purely on profile + criteria fit — no extra token cost.'
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

// ── Load saved settings (local cache) ─────────────────────────────────────────

chrome.storage.local.get(['model', 'cvText', 'profileJson', 'preferences', 'matchCriteria', 'theme'], data => {
  if (data.model)         el('model').value       = data.model;
  renderProfile(data.profileJson, data.cvText || '');
  if (data.preferences)   el('preferences').value = data.preferences;
  if (data.matchCriteria) applyMatchCriteria(data.matchCriteria);
  if (data.theme)         applyTheme(data.theme);
});

// ── Structured profile view (read-only render of profile_json) ────────────────
// Renders the extracted structured profile by section; falls back to the legacy
// cv_text blob for users who haven't re-extracted (ADR 0015).

const esc = s => String(s == null ? '' : s).replace(
  /[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function profileHasContent(p) {
  return !!(p && (p.summary || (p.education || []).length || (p.experience || []).length ||
    (p.skills || []).length || (p.projects || []).length || (p.languages || []).length));
}

const section = (label, inner) =>
  `<div class="profile-section"><div class="profile-section-label">${label}</div>${inner}</div>`;
const entry = (head, desc) =>
  `<div class="profile-entry">${head ? `<span class="profile-entry-head">${head}</span>` : ''}` +
  `${desc ? `<div class="profile-entry-desc">${desc}</div>` : ''}</div>`;

function profileSectionsHtml(p) {
  const out = [];
  if (p.summary) out.push(section('Summary', entry('', esc(p.summary))));
  if ((p.education || []).length) out.push(section('Education', p.education.map(e =>
    entry([e.credential, e.field].filter(Boolean).map(esc).join(', '),
          [e.institution, e.dates, e.grade].filter(Boolean).map(esc).join(' · '))).join('')));
  if ((p.experience || []).length) out.push(section('Experience', p.experience.map(x =>
    entry([x.title, x.org, x.dates].filter(Boolean).map(esc).join(' · '), esc(x.description))).join('')));
  if ((p.skills || []).length) out.push(section('Skills',
    `<div class="profile-chips">${esc(p.skills.join(', '))}</div>`));
  if ((p.projects || []).length) out.push(section('Projects', p.projects.map(pr =>
    entry(esc(pr.title), esc(pr.description))).join('')));
  if ((p.languages || []).length) out.push(section('Languages',
    `<div class="profile-chips">${esc(p.languages.join(', '))}</div>`));
  return out.join('');
}

function renderProfile(profileJson, cvText) {
  const view = el('profileView');
  if (!view) return;
  if (profileHasContent(profileJson)) {
    view.innerHTML = profileSectionsHtml(profileJson);
  } else if (cvText && cvText.trim()) {
    view.innerHTML = '<div class="profile-legacy"><div class="profile-section-label">' +
      'Profile (legacy text)</div><pre>' + esc(cvText) + '</pre></div>';
  } else {
    view.innerHTML = '<div class="profile-empty">No profile yet. Upload your ' +
      'application package PDF and click Extract Profile.</div>';
  }
}

// ── Structured match criteria (form ⇄ object) ─────────────────────────────────
// The five weighted/tiered preference fields share one shape, so they're
// rendered from a config and read back by iterating the rendered blocks.
// applyMatchCriteria populates the form from a match_criteria object;
// buildMatchCriteria reads it back into a full object for PUT /profile.

const CRITERIA_FIELDS = [
  { key: 'preferred_locations', label: 'Locations',        placeholder: 'e.g. Toronto, Waterloo' },
  { key: 'work_modes',          label: 'Work Mode',        placeholder: 'e.g. remote, hybrid' },
  { key: 'target_term',         label: 'Target Term',      placeholder: 'e.g. Fall 2026, Winter 2027' },
  { key: 'target_length',       label: 'Term Length',      placeholder: 'e.g. 4-month, 8-month' },
  { key: 'languages',           label: 'Spoken Languages', placeholder: 'e.g. English, French' },
];
const TIERS = ['preferred', 'acceptable', 'avoid', 'excluded'];
const TIER_HINTS = {
  preferred:  'Preferred — ideal',
  acceptable: 'Acceptable — no penalty',
  avoid:      'Avoid — penalized',
  excluded:   'Excluded — never',
};
const WEIGHTS = ['nice-to-have', 'strong', 'must'];

const splitCsv = s => s.split(',').map(v => v.trim()).filter(Boolean);

// Render the five preference blocks once. The common case (Preferred only)
// stays visible; weight + the other tiers collapse into a <details>.
function renderCriteriaFields() {
  const root = el('criteriaFields');
  if (!root) return;
  root.innerHTML = CRITERIA_FIELDS.map(f => `
    <div class="criterion" data-key="${f.key}">
      <span class="field-label" style="margin-bottom:0;">${f.label}</span>
      <input type="text" data-tier="preferred" placeholder="${f.placeholder} (comma-separated)" />
      <details>
        <summary>Weight &amp; more tiers</summary>
        <label class="tier-label">Weight</label>
        <select data-weight>
          ${WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('')}
        </select>
        ${['acceptable', 'avoid', 'excluded'].map(t => `
          <label class="tier-label">${TIER_HINTS[t]}</label>
          <input type="text" data-tier="${t}" placeholder="comma-separated" />`).join('')}
      </details>
    </div>`).join('');
}

function applyMatchCriteria(mc) {
  mc = mc || {};
  el('workAuth').value = mc.work_authorization || '';
  document.querySelectorAll('#criteriaFields .criterion').forEach(block => {
    const c = mc[block.dataset.key] || {};
    block.querySelector('[data-weight]').value = c.weight || 'nice-to-have';
    TIERS.forEach(t => {
      block.querySelector(`[data-tier="${t}"]`).value = (c[t] || []).join(', ');
    });
  });
}

function buildMatchCriteria() {
  const out = { work_authorization: el('workAuth').value || null };
  document.querySelectorAll('#criteriaFields .criterion').forEach(block => {
    const c = { weight: block.querySelector('[data-weight]').value };
    TIERS.forEach(t => {
      c[t] = splitCsv(block.querySelector(`[data-tier="${t}"]`).value);
    });
    out[block.dataset.key] = c;
  });
  return out;
}

renderCriteriaFields();

// ── Profile fetch (server is authoritative) ───────────────────────────────────

async function loadProfileFromServer() {
  const res = await chrome.runtime.sendMessage({
    type: 'backendFetch',
    path: '/profile',
    init: { method: 'GET' }
  });
  if (res?.ok && res.data) {
    renderProfile(res.data.profile_json || {}, res.data.cv_text || '');
    el('preferences').value = res.data.preferences || '';
    applyMatchCriteria(res.data.match_criteria || {});
    chrome.storage.local.set({
      cvText:        res.data.cv_text || '',
      profileJson:   res.data.profile_json || {},
      preferences:   res.data.preferences || '',
      matchCriteria: res.data.match_criteria || {}
    });
  }
  // Not-signed-in: keep whatever local cache has; sign-in flow will refresh.
}

async function putProfile(patch) {
  const res = await chrome.runtime.sendMessage({
    type: 'backendFetch',
    path: '/profile',
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }
  });
  if (res?.ok && res.data) {
    chrome.storage.local.set({
      cvText:        res.data.cv_text || '',
      profileJson:   res.data.profile_json || {},
      preferences:   res.data.preferences || '',
      matchCriteria: res.data.match_criteria || {}
    });
    return { ok: true, data: res.data };
  }
  return { ok: false, error: res?.data?.detail || res?.error || `HTTP ${res?.status}` };
}

// ── Save handlers ─────────────────────────────────────────────────────────────

el('save').addEventListener('click', () => {
  chrome.storage.local.set({ model: el('model').value }, () => setStatus('Saved.', 'ok'));
});

el('saveProfile').addEventListener('click', async () => {
  setProfileStatus('Saving…');
  const res = await putProfile({
    preferences: el('preferences').value.trim(),
    match_criteria: buildMatchCriteria()
  });
  if (res.ok) setProfileStatus('Profile updated.', 'ok');
  else setProfileStatus(`Save failed: ${JSON.stringify(res.error).slice(0, 200)}`, 'err');
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

// ── Extract from PDF (via backend) ────────────────────────────────────────────

el('extract').addEventListener('click', async () => {
  const file = droppedFile || el('packageFile').files[0];
  if (!file) { setExtractStatus('Select a PDF first.', 'err'); return; }
  if (file.size > 5 * 1024 * 1024) { setExtractStatus('File exceeds 5 MB limit.', 'err'); return; }

  el('extract').disabled = true;
  setExtractStatus('Extracting…');

  try {
    const pdf_b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.replace(/^data:[^;]+;base64,/, ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const res = await chrome.runtime.sendMessage({
      type: 'backendFetch',
      path: '/profile/extract',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_id: crypto.randomUUID(),
          model: el('model').value || 'gemini-2.5-flash',
          pdf_b64
        })
      }
    });

    if (res?.ok && res.data?.profile) {
      renderProfile(res.data.profile, '');
      // Local cache + push balance to storage so the chip ticks down.
      chrome.storage.local.set({ profileJson: res.data.profile });
      if (typeof res.data.balance === 'number') {
        chrome.storage.local.set({ creditBalance: res.data.balance });
      }
      setExtractStatus(`Profile extracted (cost ${res.data.cost?.toFixed(2)} credits).`, 'ok');
    } else if (res?.status === 0) {
      setExtractStatus('Sign in first under Settings.', 'err');
    } else if (res?.status === 402) {
      const d = res.data?.detail || {};
      setExtractStatus(`Out of credits (balance ${d.balance?.toFixed?.(2) ?? '?'}, need ${d.required?.toFixed?.(2) ?? '?'}).`, 'err');
    } else {
      const msg = res?.data?.detail?.message || res?.data?.detail || res?.error || `HTTP ${res?.status}`;
      setExtractStatus(`Error: ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200)}`, 'err');
    }
  } catch (e) {
    setExtractStatus(`Request failed: ${e.message}`, 'err');
  } finally {
    el('extract').disabled = false;
  }
});

// ── About / Settings tab ──────────────────────────────────────────────────────

el('extVersion').textContent = 'v' + chrome.runtime.getManifest().version;

el('showWelcome').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

// ── Clear CV text ─────────────────────────────────────────────────────────────

el('clearCv').addEventListener('click', async () => {
  if (!confirm('Clear your profile? You will need to re-upload your application package to score new jobs.')) return;
  // Clear both the structured profile and the legacy cv_text fallback so /scan
  // is blocked until the user re-extracts.
  const res = await putProfile({ cv_text: '', profile_json: {} });
  if (res.ok) {
    renderProfile({}, '');
    el('fileName').textContent = '';
    droppedFile = null;
    setExtractStatus('Profile cleared.', 'ok');
  } else {
    setExtractStatus(`Clear failed: ${JSON.stringify(res.error).slice(0, 200)}`, 'err');
  }
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
    // Pull the server-authoritative profile into the form now that we have auth.
    loadProfileFromServer();
  } catch (e) {
    setAuthStatus(`Sign-in failed: ${e.message || e}`, 'err');
  } finally {
    el('signIn').disabled = false;
  }
});

el('signOut').addEventListener('click', async () => {
  await chrome.storage.local.remove(['auth', 'cvText', 'profileJson', 'preferences', 'matchCriteria']);
  renderProfile({}, '');
  el('preferences').value = '';
  applyMatchCriteria({});
  setAuthStatus('Signed out.', 'ok');
});

chrome.storage.local.get(['auth', 'creditBalance'], data => {
  renderAuth(data.auth);
  renderBalance(data.creditBalance);
  if (data.auth?.access_token) loadProfileFromServer();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.auth) renderAuth(changes.auth.newValue);
  if (changes.creditBalance) renderBalance(changes.creditBalance.newValue);
});

// ── Buy credits (Stripe Checkout) ─────────────────────────────────────────────

function setBuyStatus(msg, type) {
  const s = el('buyStatus');
  if (!s) return;
  s.textContent = msg;
  s.className = 'status-line' + (type ? ' ' + type : '');
}

const buyButtons = () => document.querySelectorAll('.buy-credits');

buyButtons().forEach(btn => {
  btn.addEventListener('click', async () => {
    buyButtons().forEach(b => (b.disabled = true));
    setBuyStatus('Opening Stripe Checkout…');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'createCheckout',
        packageId: btn.dataset.package,
      });
      if (res?.ok && res.url) {
        chrome.tabs.create({ url: res.url });
        setBuyStatus('Complete payment in the new tab; your balance updates within a few seconds.', 'ok');
      } else {
        setBuyStatus(res?.error || "Couldn't start checkout.", 'err');
      }
    } catch (e) {
      setBuyStatus(`Checkout failed: ${e.message || e}`, 'err');
    } finally {
      buyButtons().forEach(b => (b.disabled = false));
    }
  });
});

// Returning from the Stripe tab, the webhook may have just granted credits.
// Refresh the balance on focus, plus one delayed retry for webhook lag. The
// creditBalance storage listener above re-renders — no manual refresh control.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  chrome.storage.local.get('auth', d => {
    if (!d.auth?.access_token) return;
    chrome.runtime.sendMessage({ type: 'refreshBalance' });
    setTimeout(() => chrome.runtime.sendMessage({ type: 'refreshBalance' }), 3000);
  });
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
