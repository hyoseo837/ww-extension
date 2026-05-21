const VALID_VERDICTS = new Set(['Apply', 'Consider', 'Skip']);
const RETRY_DELAYS = [2000, 4000, 8000];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'scoreJob') return;
  scoreJob(msg).then(sendResponse);
  return true; // keep message channel open for async response
});

async function scoreJob({ meta, descriptionText, cvText, apiKey, model }) {
  const prompt =
`You are a job-fit scorer. Respond with ONLY a JSON object — no markdown, no explanation.

Fields:
- score: integer 1–10 (10 = perfect fit)
- verdict: exactly one of "Apply", "Consider", or "Skip"
- reason: 2–3 sentences explaining the score

CV Summary:
${cvText}

Job: ${meta.title} at ${meta.org}
Description:
${descriptionText}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 }
    }
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
    if (usage) console.log(`[ww] tokens — prompt: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount}, total: ${usage.totalTokenCount}`);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return fail('PARSE', `JSON parse failed: ${e.message}. Raw: ${raw.slice(0, 100)}`);
    }

    const result = validate(parsed);
    if (!result) return fail('SHAPE', `Invalid response shape: ${cleaned.slice(0, 120)}`);

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
