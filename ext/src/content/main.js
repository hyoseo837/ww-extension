// Entry point: injection guard, init sequence, and storage reactions.
// Loads last — the only file that executes at top level beyond declarations.


if (!window.__wwExtensionInjected) {
  window.__wwExtensionInjected = true;
  waitForTable().then(async () => {
    injectBridge();
    injectSidebar();
    startTableObserver();
    await loadScores();
  });
}

// ── Storage reactions ──────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.auth || changes.cvText) {
    chrome.storage.local.get(['auth', 'cvText'], data => {
      updateGuideSteps(!!data.auth?.access_token, !!(data.cvText && data.cvText.trim()));
    });
  }
  if (changes.auth || changes.creditBalance) {
    chrome.storage.local.get(['auth', 'creditBalance'], data => {
      renderCreditsChip(data.auth, data.creditBalance);
    });
  }
});
