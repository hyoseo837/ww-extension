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

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type !== 'scoreJob') return;
  scoreJob(msg).then(sendResponse);
  return true; // keep message channel open for async response
});

async function scoreJob({ meta, descriptionText, cvText, preferences, cacheName, apiKey, model }) {
  const resolvedModel = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

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
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } catch (e) {
      return fail('NETWORK', `Network error: ${e.message}`);
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
    const usage = data.usageMetadata;
    if (usage) console.log(`[ww] tokens — prompt: ${usage.promptTokenCount}, cached: ${usage.cachedContentTokenCount ?? 0}, output: ${usage.candidatesTokenCount}, total: ${usage.totalTokenCount}`);
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
  const reason  = String(p.reason  ?? '');
  if (!Number.isInteger(score) || score < 1 || score > 10) return null;
  if (!VALID_VERDICTS.has(verdict)) return null;
  if (!reason) return null;
  return { score, verdict, reason };
}

function fail(code, error) { return { ok: false, code, error }; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
