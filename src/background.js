const VALID_VERDICTS = new Set(['Apply', 'Consider', 'Skip']);
const RETRY_DELAYS = [2000, 4000, 8000];

const SYSTEM_TEXT =
`You are a job-fit scorer. Score how well the candidate fits the job.

score: 1–10 (10 = perfect fit)
verdict: Apply if strong fit, Consider if marginal, Skip if poor fit
reason: 2–3 sentences explaining the score`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    score:   { type: 'integer' },
    verdict: { type: 'string', enum: ['Apply', 'Consider', 'Skip'] },
    reason:  { type: 'string' }
  },
  required: ['score', 'verdict', 'reason']
};

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.local.get('welcomeShown', data => {
      if (!data.welcomeShown) {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
        chrome.storage.local.set({ welcomeShown: true });
      }
    });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type === 'openWelcome') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    return;
  }
  if (msg.type === 'scoreJob') {
    scoreJob(msg).then(sendResponse);
    return true; // keep message channel open for async response
  }
  if (msg.type === 'createCache') {
    createCache(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'deleteCache') {
    deleteCache(msg.cacheName);
    return; // fire-and-forget
  }
  if (msg.type === 'addTokens') {
    incrementTokenUsage(msg.usage);
    return; // fire-and-forget
  }
});

// API key stays in background context — never sent over chrome.runtime
// messages or exposed to the page's Network tab.
async function createCache({ cvText, model }) {
  try {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) return { ok: false };
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/cachedContents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({
          model: `models/${model || 'gemini-2.5-flash'}`,
          systemInstruction: { parts: [{ text: SYSTEM_TEXT }] },
          contents: [{ role: 'user', parts: [{ text: `Candidate Profile:\n${cvText}` }] }],
          ttl: '1800s'
        })
      }
    );
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, cacheName: data.name ?? null };
  } catch {
    return { ok: false };
  }
}

async function deleteCache(cacheName) {
  if (!cacheName) return;
  try {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) return;
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${cacheName}`,
      { method: 'DELETE', headers: { 'X-Goog-Api-Key': apiKey } }
    );
  } catch {
    // Cleanup failure is non-fatal — cache will expire on its 1800s TTL.
  }
}

async function scoreJob({ meta, descriptionText, cvText, preferences, cacheName, model }) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) return fail('NO_KEY', 'API key not configured');

  const resolvedModel = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`;

  const jobPart = `${preferences ? `Candidate Preferences:\n${preferences}\n\n` : ''}Job: ${meta.title} at ${meta.org}\nDescription:\n${descriptionText}`;

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 1024,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA
  };

  const body = cacheName
    ? JSON.stringify({
        cachedContent: cacheName,
        contents: [{ role: 'user', parts: [{ text: jobPart }] }],
        generationConfig
      })
    : JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_TEXT }] },
        contents: [{ role: 'user', parts: [{ text: `Candidate Profile:\n${cvText}\n\n${jobPart}` }] }],
        generationConfig
      });

  for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body
      });
    } catch (e) {
      if (attempt < RETRY_DELAYS.length) { await sleep(RETRY_DELAYS[attempt]); continue; }
      return fail('NETWORK', `Network error after retries: ${e.message}`);
    }

    if (res.status === 429) {
      if (attempt < RETRY_DELAYS.length) { await sleep(RETRY_DELAYS[attempt]); continue; }
      return fail('RATE_LIMIT', 'Rate limited after 3 retries');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return fail('HTTP', `HTTP ${res.status}: ${err?.error?.message ?? 'unknown'}`);
    }

    const data = await res.json();
    incrementTokenUsage(data.usageMetadata);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return fail('PARSE', `JSON parse failed: ${e.message}. Raw: ${raw.slice(0, 100)}`);
    }

    const result = validate(parsed);
    if (!result) return fail('SHAPE', `Invalid response shape: ${raw.slice(0, 120)}`);

    return { ok: true, result };
  }
}

function validate(p) {
  if (!p || typeof p !== 'object') return null;
  const score   = Number(p.score);
  const verdict = String(p.verdict ?? '');
  // Cap at 1000 chars to keep chrome.storage.local from bloating if the
  // model ever ignores the "2–3 sentences" instruction.
  const reason  = String(p.reason  ?? '').slice(0, 1000);
  if (!Number.isInteger(score) || score < 1 || score > 10) return null;
  if (!VALID_VERDICTS.has(verdict)) return null;
  if (!reason) return null;
  return { score, verdict, reason };
}

function fail(code, error) { return { ok: false, code, error }; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Serialize get→set so concurrent scoreJob calls don't lose increments.
let tokenWriteChain = Promise.resolve();
function incrementTokenUsage(usage) {
  if (!usage) return;
  tokenWriteChain = tokenWriteChain.then(() => new Promise(resolve => {
    chrome.storage.local.get('tokenUsage', stored => {
      const cur = stored.tokenUsage || { input: 0, cached: 0, output: 0 };
      chrome.storage.local.set({ tokenUsage: {
        input:  cur.input  + (usage.promptTokenCount        ?? 0),
        cached: cur.cached + (usage.cachedContentTokenCount ?? 0),
        output: cur.output + (usage.candidatesTokenCount    ?? 0)
      }}, resolve);
    });
  }));
}
