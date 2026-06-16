const SUPABASE_URL = "https://bumrzedwwfhbxlttwboh.supabase.co";
// Public key by design — embedded in Supabase web app bundles too. Paste
// the sb_publishable_... value from server/.env before loading the extension.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bQlHXw98CvV4gZ6Z_5ExLg_u2Td-M5Q";
const BACKEND_URL = "https://ww-extension-backend-x5h6h.ondigitalocean.app";
const WEB_APP_URL = "https://ww-extension.hyoseo.dev";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.get("welcomeShown", (data) => {
      if (!data.welcomeShown) {
        chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
        chrome.storage.local.set({ welcomeShown: true });
      }
    });
  }
});

// Toolbar icon → the web app dashboard (account/profile/billing live there
// now, v6). Options stays reachable via right-click → Options and the sidebar
// gear (ADR 0035). "/account" resolves to the dashboard when signed in and to
// the landing page when signed out (the web app's catch-all route).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: WEB_APP_URL + "/account" });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type === "openWelcome") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    return;
  }
  if (msg.type === "openWebApp") {
    chrome.tabs.create({ url: WEB_APP_URL + (msg.path || "/") });
    return;
  }
  if (msg.type === "scoreJob") {
    scoreJob(msg).then(sendResponse);
    return true; // keep message channel open for async response
  }
  if (msg.type === "backendFetch") {
    backendFetch(msg.path, msg.init).then(sendResponse);
    return true;
  }
  if (msg.type === "sendFeedback") {
    sendFeedback(msg).then(sendResponse);
    return true;
  }
  if (msg.type === "refreshBalance") {
    refreshBalance().then(sendResponse);
    return true;
  }
  if (msg.type === "signIn") {
    signIn().then(sendResponse);
    return true;
  }
});

// Auto-refresh balance on sign-in (auth set in storage) and clear it on
// sign-out. Storage change is the single source of truth for auth state,
// so the listener covers both options-page sign-in and any future caller.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.auth) return;
  const next = changes.auth.newValue;
  if (next?.access_token) {
    refreshBalance();
  } else {
    chrome.storage.local.remove("creditBalance");
  }
});

// SW startup: if already signed in (e.g. browser reopened, SW woke up),
// refresh once so the cached balance doesn't drift.
chrome.storage.local.get("auth", (data) => {
  if (data.auth?.access_token) refreshBalance();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

// UWaterloo (Azure/Microsoft, ADR 0036) OAuth through Supabase. Runs here, not
// in callers, because chrome.identity is unavailable in content scripts — the
// options page and the sidebar both trigger it via { type: 'signIn' } (ADR
// 0055). Writes `auth` to storage; the storage.onChanged listener above then
// refreshes the balance, so callers only react to the resulting auth state.
async function signIn() {
  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=azure&scopes=email&redirect_to=${encodeURIComponent(redirectUrl)}`;
  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    if (!responseUrl) return { ok: false, error: "Sign-in cancelled." };
    const params = new URLSearchParams(new URL(responseUrl).hash.substring(1));
    const errorDesc = params.get("error_description") || params.get("error");
    if (errorDesc) return { ok: false, error: `Sign-in failed: ${errorDesc}` };
    const accessToken = params.get("access_token");
    if (!accessToken) return { ok: false, error: "Sign-in failed: no access token returned." };
    const claims = decodeJwtPayload(accessToken) || {};
    await chrome.storage.local.set({
      auth: {
        access_token: accessToken,
        refresh_token: params.get("refresh_token"),
        email: claims.email,
        user_id: claims.sub,
      },
    });
    return { ok: true, email: claims.email };
  } catch (e) {
    return { ok: false, error: `Sign-in failed: ${e.message || e}` };
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

// One scan = one POST /scan with a fresh scan_id (idempotency key on the
// backend). The backend handles Gemini, ledger debit/refund, and returns
// the new balance alongside the result so we can update creditBalance
// without a follow-up /credits/balance fetch. No model field is sent — the
// server owns the default (v8.11), so a model retirement is a server deploy.
async function scoreJob({ meta, descriptionText, postingId, batchId }) {
  const scan_id = crypto.randomUUID();
  const res = await backendFetch("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scan_id,
      meta,
      description_text: descriptionText,
      posting_id: postingId,
      batch_id: batchId,
    }),
  });

  if (res.ok && res.data?.result) {
    if (typeof res.data.balance === "number") {
      chrome.storage.local.set({ creditBalance: res.data.balance });
    }
    // scan_id rides along so the content script can key feedback to this
    // exact scan row (ADR 0044).
    return { ok: true, result: res.data.result, scanId: scan_id };
  }

  if (res.status === 0) {
    return { ok: false, code: "NOT_SIGNED_IN", error: "Sign in to scan." };
  }
  if (res.status === 400 && res.data?.detail?.error === "profile_not_set") {
    return {
      ok: false,
      code: "PROFILE_NOT_SET",
      error: "Set up your profile on the web app before scanning.",
    };
  }
  if (res.status === 402) {
    const d = res.data?.detail || {};
    return {
      ok: false,
      code: "NO_CREDITS",
      error: `Out of credits (balance ${fmtBalance(d.balance)}, need ${fmtBalance(d.required)}).`,
      balance: d.balance,
      required: d.required,
    };
  }
  if (res.status === 502) {
    const msg = res.data?.detail?.message ?? "Gemini failed";
    return { ok: false, code: "GEMINI_FAILED", error: `Backend error: ${msg}` };
  }
  return {
    ok: false,
    code: "HTTP",
    error: `HTTP ${res.status}: ${JSON.stringify(res.data ?? {}).slice(0, 200)}`,
  };
}

// 👍/👎 on a scored posting (ADR 0044). Free — no credit interaction.
async function sendFeedback({ scanId, rating, comment, descriptionText }) {
  const res = await backendFetch("/scan/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scan_id: scanId,
      rating,
      comment: comment || "",
      description_text: descriptionText || "",
    }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
}

function fmtBalance(n) {
  return typeof n === "number" ? n.toFixed(2) : "?";
}

// ── Authenticated backend fetch with one-shot token refresh ───────────────────

async function refreshBalance() {
  const res = await backendFetch("/credits/balance");
  if (res.ok && typeof res.data?.balance === "number") {
    await chrome.storage.local.set({ creditBalance: res.data.balance });
  }
  return res;
}

async function backendFetch(path, init = {}) {
  let auth = await getAuth();
  if (!auth?.access_token) return { ok: false, status: 0, error: "NOT_SIGNED_IN" };

  let res = await callBackend(path, init, auth.access_token);
  if (res.status === 401 && auth.refresh_token) {
    const refreshed = await refreshSession(auth.refresh_token);
    if (refreshed) res = await callBackend(path, init, refreshed.access_token);
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function callBackend(path, init, accessToken) {
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
}

function getAuth() {
  return new Promise((resolve) =>
    chrome.storage.local.get("auth", (d) => resolve(d.auth)),
  );
}

// Supabase rotates the refresh token on each call, so concurrent 401s must
// share one in-flight refresh — otherwise the second call sees an invalidated
// refresh token and signs the user out.
let refreshInFlight = null;
function refreshSession(refreshToken) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        await chrome.storage.local.remove("auth");
        return null;
      }
      const data = await res.json();
      const claims = decodeJwtPayload(data.access_token) || {};
      const auth = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        email: claims.email,
        user_id: claims.sub,
      };
      await chrome.storage.local.set({ auth });
      return auth;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
