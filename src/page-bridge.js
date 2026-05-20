// Runs in page context. Communicates with content.js via postMessage.
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.source !== '__ww_ext_cs') return;
  const { reqId, op, data } = e.data;
  try {
    switch (op) {
      case 'extractTokens':
        respond(reqId, extractTokens());
        break;
      case 'fetchOverview':
        getPostingOverview(data.postingId, html => respond(reqId, html));
        break;
      case 'openFolderSidebar':
        dataViewerApp.sidebarPostingIds = Number(data.postingId);
        dataViewerApp.jobFolderEditSidebar = true;
        respond(reqId, true);
        break;
      default:
        respondErr(reqId, `Unknown op: ${op}`);
    }
  } catch (err) {
    respondErr(reqId, err.message);
  }
});

function extractTokens() {
  const text = Array.from(document.querySelectorAll('script:not([src])'))
    .map(s => s.textContent).join('\n');
  const selectAllMatch  = text.match(/onSelectAll[\s\S]{0,400}?action:\s*['"](_-_-[A-Za-z0-9_-]+)['"]/);
  const overviewMatch   = text.match(/function\s+getPostingOverview[\s\S]{0,400}?action:\s*['"](_-_-[A-Za-z0-9_-]+)['"]/);
  return {
    selectAll:          selectAllMatch?.[1] ?? null,
    getPostingOverview: overviewMatch?.[1]  ?? null
  };
}

function respond(reqId, result) {
  window.postMessage({ source: '__ww_ext_page', reqId, result }, '*');
}
function respondErr(reqId, error) {
  window.postMessage({ source: '__ww_ext_page', reqId, error }, '*');
}
