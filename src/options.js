const el = id => document.getElementById(id);

function setStatus(msg, type) {
  const s = el('status');
  s.textContent = msg;
  s.className = type ?? '';
}

function setExtractStatus(msg, type) {
  const s = el('extractStatus');
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

el('extract').addEventListener('click', async () => {
  const file = el('packageFile').files[0];
  if (!file) { setExtractStatus('Select a PDF first.', 'err'); return; }
  if (file.size > 20 * 1024 * 1024) { setExtractStatus('File exceeds 20 MB limit.', 'err'); return; }

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
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
