const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const numbersEl = document.getElementById('numbers');
const linksEl = document.getElementById('links');
const datesEl = document.getElementById('dates');
const criticalEl = document.getElementById('critical');

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

const renderClaim = (item) => {
  return `
    <div class="card">
      <div class="card-header">
        <span class="${badgeClass(item.status)}">${statusLabel(item.status)}</span>
        <span class="claim-id">${item.claim_id}</span>
      </div>
      <p class="claim-text">${item.text}</p>
      ${item.numbers ? `<p class="meta">Numbers: ${item.numbers.join(', ')}</p>` : ''}
      ${item.dates ? `<p class="meta">Dates: ${item.dates.join(', ')}</p>` : ''}
      <p class="notes">${item.notes}</p>
      ${item.links && item.links.length ? `<p class="meta">Links: ${item.links.join(', ')}</p>` : ''}
    </div>
  `;
};

const renderLink = (item) => {
  return `
    <div class="card">
      <div class="card-header">
        <span class="${badgeClass(item.status)}">${statusLabel(item.status)}</span>
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
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_url: docUrl }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Request failed');
    }

    const data = await response.json();
    numbersEl.innerHTML = renderList(data.numbers, renderClaim);
    linksEl.innerHTML = renderList(data.links, renderLink);
    datesEl.innerHTML = renderList(data.dates, renderClaim);
    criticalEl.innerHTML = renderList(data.critical, renderCritical);

    resultsEl.hidden = false;
    setStatus(`Done. Document ID: ${data.doc_id}`, 'success');
  } catch (error) {
    setStatus(`Error: ${error.message}`, 'error');
  }
};

document.getElementById('verifyBtn').addEventListener('click', verifyDoc);
