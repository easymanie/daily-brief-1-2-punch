const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const numbersEl = document.getElementById('numbers');
const linksEl = document.getElementById('links');
const datesEl = document.getElementById('dates');
const criticalEl = document.getElementById('critical');
const summaryEl = document.getElementById('summary');
const filtersEl = document.getElementById('filters');

let currentFilter = 'all';
let lastData = null;

const statusLabel = (status) => {
  if (status === 'green') return 'Green';
  if (status === 'yellow') return 'Yellow';
  return 'Red';
};

const badgeClass = (status) => `badge badge-${status}`;

const renderList = (items, renderItem) => {
  if (!items.length) {
    return '<p class="empty">Nothing to show yet.</p>';
  }
  return items.map(renderItem).join('');
};

const highlightNumbers = (text) => {
  if (!text) return '';
  const numberPattern = /([₹$€£]?\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[₹$€£]?\s?\d+(?:\.\d+)?)(\s?%|\s?(?:cr|crore|lakh|mn|million|bn|billion))?/gi;
  return text.replace(numberPattern, (match) => `<span class="hl-number">${match}</span>`);
};

const copyClaim = async (payload) => {
  try {
    await navigator.clipboard.writeText(payload);
    setStatus('Copied to clipboard.', 'success');
  } catch (error) {
    setStatus('Copy failed. Your browser blocked clipboard access.', 'warn');
  }
};

const renderClaim = (item) => {
  const highlighted = highlightNumbers(item.text);
  const copyPayload = `${item.text}\nStatus: ${statusLabel(item.status)}\nNotes: ${item.notes}`;
  return `
    <div class="card">
      <div class="card-header">
        <span class="${badgeClass(item.status)}">${statusLabel(item.status)}</span>
        <span class="claim-id">${item.claim_id}</span>
        <button class="copy-btn" data-copy="${encodeURIComponent(copyPayload)}">Copy</button>
      </div>
      <p class="claim-text">${highlighted}</p>
      ${item.numbers ? `<p class="meta">Numbers: ${item.numbers.join(', ')}</p>` : ''}
      ${item.dates ? `<p class="meta">Dates: ${item.dates.join(', ')}</p>` : ''}
      <p class="notes">${item.notes}</p>
      ${item.links && item.links.length ? `<p class="meta">Links: ${item.links.join(', ')}</p>` : ''}
    </div>
  `;
};

const renderLink = (item) => {
  const copyPayload = `${item.anchor || 'Linked source'}\n${item.url}\nStatus: ${statusLabel(item.status)}\nNotes: ${item.notes}`;
  return `
    <div class="card">
      <div class="card-header">
        <span class="${badgeClass(item.status)}">${statusLabel(item.status)}</span>
        <button class="copy-btn" data-copy="${encodeURIComponent(copyPayload)}">Copy</button>
      </div>
      <p class="claim-text">${item.anchor || 'Linked source'}</p>
      <p class="meta">${item.url}</p>
      <p class="notes">${item.notes}</p>
    </div>
  `;
};

const renderCritical = (item) => {
  return `
    <div class="card">
      <div class="card-header">
        <span class="badge badge-${item.severity}">${item.severity.toUpperCase()}</span>
      </div>
      <p class="claim-text">${item.note}</p>
    </div>
  `;
};

const summarize = (items) => {
  const counts = { green: 0, yellow: 0, red: 0 };
  items.forEach((item) => {
    if (counts[item.status] !== undefined) counts[item.status] += 1;
  });
  return counts;
};

const renderSummary = (data) => {
  const numCounts = summarize(data.numbers || []);
  const linkCounts = summarize(data.links || []);
  const dateCounts = summarize(data.dates || []);
  summaryEl.innerHTML = `
    <div class="summary-card">
      <h3>Report Summary</h3>
      <div class="summary-grid">
        <div>
          <p class="summary-label">Numbers</p>
          <p class="summary-count"><span class="badge badge-green">${numCounts.green}</span> <span class="badge badge-yellow">${numCounts.yellow}</span> <span class="badge badge-red">${numCounts.red}</span></p>
        </div>
        <div>
          <p class="summary-label">Links</p>
          <p class="summary-count"><span class="badge badge-green">${linkCounts.green}</span> <span class="badge badge-yellow">${linkCounts.yellow}</span> <span class="badge badge-red">${linkCounts.red}</span></p>
        </div>
        <div>
          <p class="summary-label">Dates</p>
          <p class="summary-count"><span class="badge badge-green">${dateCounts.green}</span> <span class="badge badge-yellow">${dateCounts.yellow}</span> <span class="badge badge-red">${dateCounts.red}</span></p>
        </div>
      </div>
    </div>
  `;
};

const applyFilter = (items) => {
  if (currentFilter === 'all') return items;
  return items.filter((item) => item.status === currentFilter);
};

const renderAll = () => {
  if (!lastData) return;
  renderSummary(lastData);
  numbersEl.innerHTML = renderList(applyFilter(lastData.numbers || []), renderClaim);
  linksEl.innerHTML = renderList(applyFilter(lastData.links || []), renderLink);
  datesEl.innerHTML = renderList(applyFilter(lastData.dates || []), renderClaim);
  criticalEl.innerHTML = renderList(lastData.critical || [], renderCritical);

  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const payload = decodeURIComponent(btn.getAttribute('data-copy') || '');
      copyClaim(payload);
    });
  });
};

const setStatus = (message, tone = 'info') => {
  statusEl.innerHTML = `<div class="status-${tone}">${message}</div>`;
};

const verifyDoc = async () => {
  const docUrl = document.getElementById('docUrl').value.trim();
  if (!docUrl) {
    setStatus('Please paste a Google Doc link.', 'warn');
    return;
  }

  setStatus('Checking the doc and linked sources. This can take a minute...', 'info');
  resultsEl.hidden = true;

  try {
    const response = await fetch('/.netlify/functions/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_url: docUrl }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Request failed');
    }

    const data = await response.json();
    lastData = data;
    renderAll();

    resultsEl.hidden = false;
    setStatus(`Done. Document ID: ${data.doc_id}`, 'success');
  } catch (error) {
    setStatus(`Error: ${error.message}`, 'error');
  }
};

document.getElementById('verifyBtn').addEventListener('click', verifyDoc);

filtersEl.addEventListener('click', (event) => {
  const button = event.target.closest('.filter-btn');
  if (!button) return;
  currentFilter = button.dataset.filter || 'all';
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn === button);
  });
  renderAll();
});
