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

  const retryDelays = [2000, 4000, 8000];

  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } catch (e) {
      return { ok: false, error: `Network error: ${e.message}` };
    }

    if (res.status === 429) {
      if (attempt < 3) { await sleep(retryDelays[attempt]); continue; }
      return { ok: false, error: 'Rate limited after 3 retries' };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: `HTTP ${res.status}: ${err?.error?.message ?? 'unknown'}` };
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (e) {
      return { ok: false, error: `JSON parse failed: ${e.message}. Raw: ${raw.slice(0, 100)}` };
    }

    return { ok: true, result };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
