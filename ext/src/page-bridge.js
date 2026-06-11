// Runs in page context. Communicates with content.js via postMessage.

const VERDICT_ORDER = { Apply: 0, Consider: 1, Skip: 2 };
let cachedTokens = null;

window.addEventListener('message', e => {
  if (e.source !== window || e.data?.source !== '__ww_ext_cs') return;
  const { reqId, op, data } = e.data;
  try {
    switch (op) {
      case 'extractTokens':
        respond(reqId, getTokens());
        break;

      case 'fetchOverview':
        fetchOverview(data.postingId)
          .then(html => respond(reqId, html))
          .catch(err => respondErr(reqId, err.message));
        break;

      case 'openFolderSidebar':
        dataViewerApp.sidebarPostingIds = Number(data.postingId);
        dataViewerApp.jobFolderEditSidebar = true;
        respond(reqId, true);
        break;

      case 'openFolderSidebarBulk':
        dataViewerApp.sidebarPostingIds = data.postingIds.map(Number);
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

function getTokens() {
  if (cachedTokens?.selectAll && cachedTokens?.getPostingOverview) return cachedTokens;
  const text = Array.from(document.querySelectorAll('script:not([src])'))
    .map(s => s.textContent).join('\n');
  const selectAll = text.match(/onSelectAll[\s\S]{0,400}?action:\s*['"](_-_-[A-Za-z0-9_-]+)['"]/)?.[1] ?? null;
  const overview  = text.match(/function\s+getPostingOverview[\s\S]{0,400}?action:\s*['"](_-_-[A-Za-z0-9_-]+)['"]/)?.[1] ?? null;
  cachedTokens = { selectAll, getPostingOverview: overview };
  return cachedTokens;
}

// Bypasses getPostingOverview() so the global loading overlay doesn't flicker per request.
function fetchOverview(postingId) {
  const { getPostingOverview: token } = getTokens();
  if (!token) return Promise.reject(new Error('getPostingOverview token not found'));
  return new Promise((resolve, reject) => {
    // The board posts to its own path (full/ or direct/ — v8.7.0).
    $.post(location.pathname, { action: token, postingId })
      .done(resolve)
      .fail(xhr => reject(new Error(`HTTP ${xhr.status}`)));
  });
}

function respond(reqId, result) {
  window.postMessage({ source: '__ww_ext_page', reqId, result }, '*');
}
function respondErr(reqId, error) {
  window.postMessage({ source: '__ww_ext_page', reqId, error }, '*');
}
