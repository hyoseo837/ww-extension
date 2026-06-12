// Job-table integration: waiting for the WW table, inline score badges,
// the re-render observer, pagination navigation, and scroll-to-row.

// ── Table wait ────────────────────────────────────────────────────────────────

function waitForTable() {
  return new Promise(resolve => {
    if (document.querySelector(TABLE_SEL)) { resolve(); return; }
    const obs = new MutationObserver(() => {
      if (document.querySelector(TABLE_SEL)) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

// ── Score inline in title cell ────────────────────────────────────────────────

// The Job Title link is the only anchored cell on both boards, but the boards
// order their columns differently (Direct leads with Term, shifting the title
// out of cells[0]) — locate the anchor rather than assume a position.
function findTitleAnchor(row) {
  return row.querySelector('td.table__value a');
}

function injectRowScores() {
  let sidebarDirty = false;
  document.querySelectorAll(ROW_SEL).forEach(row => {
    const id = row.querySelector('input[name="dataViewerSelection"]')?.value;
    if (!id || !scores.has(id)) return;

    const anchor = findTitleAnchor(row);
    if (!anchor) return;
    const titleCell = anchor.closest('td.table__value');

    const entry = scores.get(id);
    if (!entry.title || entry.title === `#${id}`) {
      const title = anchor.textContent.trim();
      const org   = titleCell.nextElementSibling?.querySelector('span')?.textContent.trim();
      if (title) {
        scores.set(id, { ...entry, title, org: org || entry.org });
        sidebarDirty = true;
      }
    }

    if (titleCell.querySelector('.ww-ext-badge')) return;
    const { score, verdict } = scores.get(id);
    const span = document.createElement('span');
    span.className = `ww-ext-badge ww-ext-badge--${verdictSlug(verdict)}`;
    span.style.marginLeft = '6px';
    span.style.cursor = 'pointer';
    span.textContent = score != null ? `${score} · ${verdict}` : verdict;
    span.dataset.postingId = id;
    anchor.insertAdjacentElement('afterend', span);
  });

  if (sidebarDirty) { saveScores(); renderSidebarList(); }
}

function refreshPageSize() {
  const count = document.querySelectorAll(ROW_SEL).length;
  if (count > detectedPageSize) detectedPageSize = count;
}

function startTableObserver() {
  const table = document.querySelector(TABLE_SEL);
  if (!table) return;
  let rafPending = false;
  const obs = new MutationObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      obs.disconnect();
      table.querySelectorAll('.ww-ext-badge').forEach(el => el.remove());
      injectRowScores();
      refreshPageSize();
      obs.observe(table, { childList: true, subtree: true });
      rafPending = false;
    });
  });
  obs.observe(table, { childList: true, subtree: true });
  refreshPageSize();
}

// WW pagination puts `active` / `disabled` / aria-label on the inner
// <a class="pagination__link">, not on the <li> wrapper. We operate on the <a>s.
function paginationLinks() {
  return [...document.querySelectorAll('ul.pagination__list .pagination__link')];
}
function activeLink() {
  return paginationLinks().find(a => a.classList.contains('active'));
}
function activePageText() {
  return activeLink()?.textContent.trim();
}
function isLinkDisabled(a) {
  // The currently-active link also carries `disabled` — that's by design and
  // correctly makes it a no-op click target for our purposes.
  return a.classList.contains('disabled') || a.getAttribute('aria-disabled') === 'true';
}
function pageNumberLink(n) {
  return paginationLinks().find(a => a.textContent.trim() === String(n));
}
function nextPageLink() {
  const links = paginationLinks();
  const activeIdx = links.findIndex(a => a.classList.contains('active'));
  if (activeIdx < 0) return null;
  // 1: next visible numeric page after active.
  for (let i = activeIdx + 1; i < links.length; i++) {
    if (/^\d+$/.test(links[i].textContent.trim())) return links[i];
  }
  // 2: a "Next" arrow button — aria-label="Go to next page" in WW's markup.
  for (const a of links) {
    const lbl = (a.getAttribute('aria-label') || '').toLowerCase();
    if (lbl.includes('next') && !isLinkDisabled(a)) return a;
  }
  return null;
}
// Dispatch a synthetic click instead of .click(). Real .click() on an
// <a href="javascript:void(0);"> makes the browser try to navigate to the
// javascript: URL, which CSP blocks (harmless but noisy in the console).
// Synthetic events still fire Vue's @click handler.
function clickLink(a) {
  if (!a || isLinkDisabled(a)) return false;
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

// Watch pagination's active page text. Resolves as soon as predicate(active) is true,
// or after `timeout`. Fast path: ~1 frame for client-side DataViewer page changes.
function waitActive(predicate, timeout = 800) {
  return new Promise(resolve => {
    if (predicate(activePageText())) { resolve(true); return; }
    const pag = document.querySelector('ul.pagination__list');
    if (!pag) { resolve(false); return; }
    const obs = new MutationObserver(() => {
      if (predicate(activePageText())) { obs.disconnect(); resolve(true); }
    });
    obs.observe(pag, {
      subtree: true, childList: true,
      attributes: true, attributeFilter: ['class']
    });
    setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
  });
}

async function goToPage(pageNum) {
  const target = String(pageNum);
  if (activePageText() === target) return true;
  if (!clickLink(pageNumberLink(pageNum))) return false;
  return waitActive(t => t === target);
}

async function goNext() {
  const prev = activePageText();
  if (!clickLink(nextPageLink())) return false;
  return waitActive(t => t !== prev);
}

async function scrollToRow(postingId) {
  const idStr = String(postingId);
  // Posting IDs are numeric strings — no escaping needed for an attribute-value
  // selector. Lock to name="dataViewerSelection" so we never match a stray input.
  const selector = `${TABLE_SEL} tbody input[name="dataViewerSelection"][value="${idStr}"]`;
  const table = document.querySelector(TABLE_SEL);
  if (!table) return;

  refreshPageSize();
  const startPage = activePageText();

  let input = document.querySelector(selector);

  // 1. Direct jump using selectAll order + detected page size.
  if (!input && allPostingIds.length) {
    const idx = allPostingIds.indexOf(idStr);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / detectedPageSize) + 1;
      if (await goToPage(targetPage)) {
        // Active page changed — give the tbody one frame to render the new rows.
        await new Promise(r => requestAnimationFrame(r));
        input = document.querySelector(selector);
      }
    }
  }

  // 2. Fallback: row isn't on the page we computed (sort mismatch, distant page
  //    not in the visible pagination window, or stale allPostingIds). Walk from
  //    page 1 forward — each hop is ~1 frame.
  if (!input) {
    await goToPage(1);
    await new Promise(r => requestAnimationFrame(r));
    input = document.querySelector(selector);
    for (let hop = 0; !input && hop < 40; hop++) {
      if (!(await goNext())) break;
      await new Promise(r => requestAnimationFrame(r));
      input = document.querySelector(selector);
    }
  }

  if (!input) {
    setProgress(`Posting ${idStr} not in current view — filter or sort may have changed.`, true);
    // Don't leave the user stranded on whatever page the walk ended on.
    if (startPage && activePageText() !== startPage) {
      await goToPage(Number(startPage));
    }
    return;
  }
  const row = input.closest('tr.table__row--body');
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('ww-ext-highlight');
  setTimeout(() => row.classList.remove('ww-ext-highlight'), 1500);
}
