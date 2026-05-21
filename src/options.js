const el = id => document.getElementById(id);

function setStatus(msg, type) {
  const s = el('status');
  s.textContent = msg;
  s.className = type ?? '';
}

chrome.storage.local.get(['apiKey', 'model', 'cvText'], data => {
  if (data.apiKey) el('apiKey').value = data.apiKey;
  if (data.model)  el('model').value  = data.model;
  if (data.cvText) el('cvText').value = data.cvText;
});

el('save').addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: el('apiKey').value.trim(),
    model:  el('model').value,
    cvText: el('cvText').value.trim()
  }, () => setStatus('Saved.', 'ok'));
});

el('test').addEventListener('click', async () => {
  const apiKey = el('apiKey').value.trim();
  const model  = el('model').value;
  if (!apiKey) { setStatus('Enter an API key first.', 'err'); return; }
  setStatus('Testing...');
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
