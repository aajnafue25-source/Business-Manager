const API = '/api';
let products = [];
let currentBarcodeProduct = null;

// ───────── Navigation ─────────
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
    document.getElementById('nav').classList.remove('open');
    if (btn.dataset.page === 'dashboard') renderDashboard();
    if (btn.dataset.page === 'sales') { loadProductOptions(); renderSalesPage(); }
    if (btn.dataset.page === 'expenses') renderExpensePage();
    if (btn.dataset.page === 'dues') renderDuesPage();
    if (btn.dataset.page === 'products') renderProductsPage();
  });
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('nav').classList.toggle('open');
});

function fmt(n) {
  return 'Tk ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateOf(fieldId) {
  const el = document.getElementById(fieldId);
  const v = el && el.value;
  return v || new Date().toISOString().slice(0, 10);
}

// ───────── API helpers ─────────
async function apiGet(path) {
  const r = await fetch(API + path);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(API + path, { method: 'DELETE' });
  return r.json();
}

// ───────── Entry: Sales / Expenses / Dues / Due paid ─────────
async function loadProductOptions() {
  products = await apiGet('/products');
  const sel = document.getElementById('sale-product');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">— No product / custom sale —</option>' +
    products.map(p => `<option value="${p.id}" data-price="${p.sell_price}" data-cost="${p.purchase_price}">${p.name} (${p.barcode}) — stock ${p.quantity}</option>`).join('');
  if (prevVal) sel.value = prevVal;
}

function recalcSaleAmount() {
  const unitPriceEl = document.getElementById('sale-unit-price');
  const qtyEl = document.getElementById('sale-qty');
  const amountEl = document.getElementById('sale-amount');
  const unitPrice = parseFloat(unitPriceEl.value);
  const qty = parseFloat(qtyEl.value);
  if (!isNaN(unitPrice) && unitPrice >= 0 && !isNaN(qty) && qty > 0) {
    amountEl.value = (unitPrice * qty).toFixed(2);
  }
}

function bindSaleFormListeners() {
  const sel = document.getElementById('sale-product');
  const qtyEl = document.getElementById('sale-qty');
  const unitPriceEl = document.getElementById('sale-unit-price');
  if (!sel || sel.dataset.bound) return; // avoid double-binding across re-renders
  sel.dataset.bound = '1';

  sel.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.value) {
      document.getElementById('sale-desc').value = opt.textContent.split(' (')[0];
      unitPriceEl.value = parseFloat(opt.dataset.price).toFixed(2);
      if (!qtyEl.value || parseFloat(qtyEl.value) <= 0) qtyEl.value = 1;
      recalcSaleAmount();
    }
  });

  qtyEl.addEventListener('input', recalcSaleAmount);
  unitPriceEl.addEventListener('input', recalcSaleAmount);
}

async function addSale() {
  const desc = document.getElementById('sale-desc').value.trim();
  const amount = parseFloat(document.getElementById('sale-amount').value);
  const qty = parseFloat(document.getElementById('sale-qty').value) || null;
  const unitPrice = parseFloat(document.getElementById('sale-unit-price').value) || null;
  const productId = document.getElementById('sale-product').value || null;
  if (!desc || isNaN(amount) || amount <= 0) return alert('Please fill in description and a valid amount.');

  let costPrice = null;
  if (productId) {
    const p = products.find(x => String(x.id) === String(productId));
    if (p) costPrice = Number(p.purchase_price) || 0;
  }

  await apiPost('/sales', {
    date: dateOf('sale-date'), desc, amount, product_id: productId, quantity: qty,
    unit_price: unitPrice, cost_price: costPrice
  });
  document.getElementById('sale-desc').value = '';
  document.getElementById('sale-amount').value = '';
  document.getElementById('sale-qty').value = '';
  document.getElementById('sale-unit-price').value = '';
  document.getElementById('sale-product').value = '';
  await loadProductOptions();
  renderSalesPage();
  toast('Sale saved');
}

async function addExpense() {
  const desc = document.getElementById('exp-desc').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  if (!desc || isNaN(amount) || amount <= 0) return alert('Please fill in description and a valid amount.');
  await apiPost('/expenses', { date: dateOf('exp-date'), desc, amount });
  document.getElementById('exp-desc').value = '';
  document.getElementById('exp-amount').value = '';
  renderExpensePage();
  toast('Expense saved');
}

async function addDue() {
  const party = document.getElementById('due-party').value.trim();
  const amount = parseFloat(document.getElementById('due-amount').value);
  const note = document.getElementById('due-note').value.trim();
  if (!party || isNaN(amount) || amount <= 0) return alert('Please fill in party name and a valid amount.');
  await apiPost('/dues', { date: dateOf('due-date'), party, amount, note });
  document.getElementById('due-party').value = '';
  document.getElementById('due-amount').value = '';
  document.getElementById('due-note').value = '';
  renderDuesPage();
  toast('Due saved');
}

async function addDuePaid() {
  const party = document.getElementById('dpaid-party').value.trim();
  const amount = parseFloat(document.getElementById('dpaid-amount').value);
  const note = document.getElementById('dpaid-note').value.trim();
  if (!party || isNaN(amount) || amount <= 0) return alert('Please fill in party name and a valid amount.');
  await apiPost('/due-paid', { date: dateOf('dpaid-date'), party, amount, note });
  document.getElementById('dpaid-party').value = '';
  document.getElementById('dpaid-amount').value = '';
  document.getElementById('dpaid-note').value = '';
  renderDuesPage();
  toast('Payment recorded');
}

function badge(type) {
  const map = { sale: ['success', 'Sale'], expense: ['danger', 'Expense'], due: ['warning', 'Due'], paid: ['info', 'Paid'] };
  const [cls, lbl] = map[type] || ['info', type];
  return `<span class="badge badge-${cls}">${lbl}</span>`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--surface);padding:10px 20px;border-radius:8px;font-size:13.5px;font-weight:500;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,0.2)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ───────── Sales page ─────────
async function renderSalesPage() {
  const dateEl = document.getElementById('sale-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  bindSaleFormListeners();

  const from = document.getElementById('sale-filter-from').value;
  const to = document.getElementById('sale-filter-to').value;
  let rows = await apiGet('/sales');
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  const tb = document.getElementById('sales-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No sales found.</td></tr>';
    document.getElementById('sales-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(r => `<tr>
    <td>${r.date}</td>
    <td>${r.desc}</td>
    <td class="num">${r.quantity || '—'}</td>
    <td class="num" style="color:var(--ok)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('sales', ${r.id}, renderSalesPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('');
  document.getElementById('sales-total-val').textContent = fmt(rows.reduce((s, r) => s + r.amount, 0));
}

async function renderExpensePage() {
  const dateEl = document.getElementById('exp-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  const from = document.getElementById('exp-filter-from').value;
  const to = document.getElementById('exp-filter-to').value;
  let rows = await apiGet('/expenses');
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  const tb = document.getElementById('exp-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state">No expenses found.</td></tr>';
    document.getElementById('exp-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(r => `<tr>
    <td>${r.date}</td>
    <td>${r.desc}</td>
    <td class="num" style="color:var(--danger)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('expenses', ${r.id}, renderExpensePage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('');
  document.getElementById('exp-total-val').textContent = fmt(rows.reduce((s, r) => s + r.amount, 0));
}

async function renderDuesPage() {
  const dueDateEl = document.getElementById('due-date');
  if (dueDateEl && !dueDateEl.value) dueDateEl.value = new Date().toISOString().slice(0, 10);
  const dpaidDateEl = document.getElementById('dpaid-date');
  if (dpaidDateEl && !dpaidDateEl.value) dpaidDateEl.value = new Date().toISOString().slice(0, 10);

  const [outstanding, paid] = await Promise.all([apiGet('/dues'), apiGet('/due-paid')]);
  outstanding.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  paid.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const dtb = document.getElementById('dues-tbody');
  dtb.innerHTML = outstanding.length ? outstanding.map(r => `<tr>
    <td>${r.date}</td>
    <td style="font-weight:600">${r.party}</td>
    <td style="color:var(--text-3);font-size:12.5px">${r.note || '—'}</td>
    <td class="num" style="color:var(--warn)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('dues', ${r.id}, renderDuesPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No outstanding dues.</td></tr>';
  document.getElementById('dues-total-val').textContent = fmt(outstanding.reduce((s, r) => s + r.amount, 0));

  const ptb = document.getElementById('paid-tbody');
  ptb.innerHTML = paid.length ? paid.map(r => `<tr>
    <td>${r.date}</td>
    <td style="font-weight:600">${r.party}</td>
    <td style="color:var(--text-3);font-size:12.5px">${r.note || '—'}</td>
    <td class="num" style="color:var(--ok)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('due-paid', ${r.id}, renderDuesPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No payments recorded.</td></tr>';
  document.getElementById('paid-total-val').textContent = fmt(paid.reduce((s, r) => s + r.amount, 0));
}

async function deleteRow(table, id, after) {
  if (!confirm('Delete this entry?')) return;
  await apiDelete(`/${table}/${id}`);
  after();
}

function clearFilter(type) {
  if (type === 'sales') {
    document.getElementById('sale-filter-from').value = '';
    document.getElementById('sale-filter-to').value = '';
    renderSalesPage();
  }
  if (type === 'expenses') {
    document.getElementById('exp-filter-from').value = '';
    document.getElementById('exp-filter-to').value = '';
    renderExpensePage();
  }
}

// ───────── Products ─────────
async function addProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const quantity = parseFloat(document.getElementById('prod-qty').value) || 0;
  const purchase_price = parseFloat(document.getElementById('prod-purchase').value) || 0;
  const sell_price = parseFloat(document.getElementById('prod-sell').value) || 0;
  if (!name) return alert('Please enter a product name.');
  const res = await apiPost('/products', { name, quantity, purchase_price, sell_price });
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-qty').value = '';
  document.getElementById('prod-purchase').value = '';
  document.getElementById('prod-sell').value = '';
  toast(`Product saved — barcode ${res.barcode}`);
  renderProductsPage();
}

async function renderProductsPage() {
  products = await apiGet('/products');
  const search = (document.getElementById('prod-search')?.value || '').toLowerCase();
  let list = products;
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search) || p.barcode.toLowerCase().includes(search));

  const grid = document.getElementById('products-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-package-off"></i><br>No products found. Add one above.</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const margin = p.sell_price - p.purchase_price;
    const lowStock = p.quantity <= 5;
    return `<div class="product-card">
      <div class="pname">${p.name}</div>
      <div class="pmeta"><span>${p.barcode}</span><span class="${lowStock ? 'stock-low' : ''}">${p.quantity} in stock</span></div>
      <svg class="pbarcode-svg" data-barcode="${p.barcode}" style="background:#fff;border-radius:6px"></svg>
      <div class="price-row"><span>Purchase</span><span class="v">${fmt(p.purchase_price)}</span></div>
      <div class="price-row"><span>Sell</span><span class="v">${fmt(p.sell_price)}</span></div>
      <div class="price-row"><span>Margin</span><span class="v" style="color:${margin >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(margin)}</span></div>
      <div class="actions">
        <button onclick='openBarcodeModal(${p.id})'><i class="ti ti-barcode"></i> Label</button>
        <button class="danger" onclick="deleteProduct(${p.id})"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>`;
  }).join('');

  // Render barcodes
  document.querySelectorAll('.pbarcode-svg').forEach(svg => {
    JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', width: 1.6, height: 38, fontSize: 12, margin: 6, background: '#ffffff', lineColor: '#000000' });
  });
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await apiDelete(`/products/${id}`);
  renderProductsPage();
}

function openBarcodeModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  currentBarcodeProduct = p;
  // Reset controls to sensible defaults each time the modal opens
  document.getElementById('ctl-name-size').value = 14;
  document.getElementById('ctl-price-size').value = 13;
  document.getElementById('ctl-bc-width').value = 2;
  document.getElementById('ctl-bc-height').value = 56;
  document.getElementById('ctl-show-price').checked = true;
  updateBarcodePreview();
  document.getElementById('barcodeModal').style.display = 'flex';
}

function updateBarcodePreview() {
  const p = currentBarcodeProduct;
  if (!p) return;
  const nameSize = parseFloat(document.getElementById('ctl-name-size').value) || 14;
  const priceSize = parseFloat(document.getElementById('ctl-price-size').value) || 13;
  const bcWidth = parseFloat(document.getElementById('ctl-bc-width').value) || 2;
  const bcHeight = parseFloat(document.getElementById('ctl-bc-height').value) || 56;
  const showPrice = document.getElementById('ctl-show-price').checked;

  const content = document.getElementById('modal-barcode-content');
  content.innerHTML = `<div class="mp-name" style="font-size:${nameSize}px">${p.name}</div><svg id="modal-barcode-svg"></svg>${showPrice ? `<div class="mp-price" style="font-size:${priceSize}px">Price: ${fmt(p.sell_price)}</div>` : ''}`;
  JsBarcode('#modal-barcode-svg', p.barcode, { format: 'CODE128', width: bcWidth, height: bcHeight, fontSize: Math.max(10, Math.round(bcHeight * 0.22)), margin: 8, background: '#ffffff', lineColor: '#000000' });
}

function closeBarcodeModal() {
  document.getElementById('barcodeModal').style.display = 'none';
  currentBarcodeProduct = null;
}

function printBarcode() {
  if (!currentBarcodeProduct) return;
  const labelHtml = document.getElementById('modal-barcode-content').innerHTML;

  // Print via a hidden iframe instead of window.open(). A popup window that
  // fails to open (blocked) or whose print dialog is cancelled can be left
  // stuck with no way back to the app; an iframe stays inside the page and
  // is removed immediately after printing, so the app is never blocked.
  let frame = document.getElementById('print-frame');
  if (frame) frame.remove();
  frame = document.createElement('iframe');
  frame.id = 'print-frame';
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<html><head><title>Print label</title></head><body style="text-align:center;font-family:sans-serif;padding:30px">${labelHtml}</body></html>`);
  doc.close();

  const cleanup = () => { if (frame && frame.parentNode) frame.remove(); };
  frame.contentWindow.onafterprint = cleanup;
  // Fallback cleanup in case onafterprint doesn't fire (some browsers/print-cancel flows)
  setTimeout(cleanup, 5000);

  frame.contentWindow.focus();
  frame.contentWindow.print();
}

// ───────── Dashboard ─────────
let barChart = null, donutChart = null;
async function renderDashboard() {
  const [summary, sales, expenses, dues] = await Promise.all([
    apiGet('/summary'), apiGet('/sales'), apiGet('/expenses'), apiGet('/dues')
  ]);
  const profit = summary.netProfit;

  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric-card"><div class="label">Total sales</div><div class="value green">${fmt(summary.totalSales)}</div></div>
    <div class="metric-card"><div class="label">Cost of goods sold</div><div class="value">${fmt(summary.totalCOGS)}</div></div>
    <div class="metric-card"><div class="label">Total expenses</div><div class="value red">${fmt(summary.totalExpenses)}</div></div>
    <div class="metric-card"><div class="label">Net profit</div><div class="value ${profit >= 0 ? 'green' : 'red'}">${fmt(profit)}</div></div>
    <div class="metric-card"><div class="label">Outstanding dues</div><div class="value amber">${fmt(summary.totalDues)}</div></div>
    <div class="metric-card"><div class="label">Dues collected</div><div class="value">${fmt(summary.totalDuePaid)}</div></div>
    <div class="metric-card"><div class="label">Products${summary.lowStockCount ? ' · low stock' : ''}</div><div class="value ${summary.lowStockCount ? 'red' : ''}">${summary.productCount}${summary.lowStockCount ? ' (' + summary.lowStockCount + ')' : ''}</div></div>
  `;

  const last = (arr) => [...arr].sort((a, b) => a.date.localeCompare(b.date)).slice(-7).map(r => ({ x: r.date.slice(5), y: r.amount }));
  const lastSales = last(sales), lastExp = last(expenses), lastDues = last(dues);
  const labels = [...new Set([...lastSales, ...lastExp, ...lastDues].map(r => r.x))].sort();
  const vals = (arr) => labels.map(l => arr.find(r => r.x === l)?.y || 0);

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('dashChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Sales', data: vals(lastSales), backgroundColor: '#3b82f6cc', borderRadius: 4 },
        { label: 'Expenses', data: vals(lastExp), backgroundColor: '#ef4444cc', borderRadius: 4 },
        { label: 'Due', data: vals(lastDues), backgroundColor: '#f59e0bcc', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(128,128,128,0.12)' }, ticks: { font: { size: 11 }, callback: v => 'Tk' + v } }
      }
    }
  });

  if (donutChart) donutChart.destroy();
  donutChart = new Chart(document.getElementById('donutChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Cost of goods sold', 'Expenses', 'Net profit', 'Outstanding dues'],
      datasets: [{ data: [summary.totalCOGS, summary.totalExpenses, Math.max(summary.netProfit, 0), summary.totalDues], backgroundColor: ['#8b5cf6', '#ef4444', '#10b981', '#f59e0b'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 14, boxWidth: 12 } } }
    }
  });
}

// ───────── Init ─────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('barcodeModal').style.display === 'flex') {
    closeBarcodeModal();
  }
});
renderDashboard();
