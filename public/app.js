// ───────── Auth ─────────
let authMode = 'login';

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

function hideAuthScreen(username) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-flex';
  document.getElementById('topbar-user').textContent = '👤 ' + username;
}

function switchTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login').style.background = isLogin ? 'var(--text)' : 'var(--surface-2)';
  document.getElementById('tab-login').style.color = isLogin ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('tab-signup').style.background = !isLogin ? 'var(--text)' : 'var(--surface-2)';
  document.getElementById('tab-signup').style.color = !isLogin ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('auth-confirm-row').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm = document.getElementById('auth-confirm').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';

  if (!username || !password) { errEl.textContent = 'Please enter username and password.'; errEl.style.display = 'block'; return; }
  if (authMode === 'signup' && password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = 'Please wait...';
  btn.disabled = true;

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Something went wrong.'; errEl.style.display = 'block'; return; }
    hideAuthScreen(data.username);
    initApp();
  } catch (e) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    btn.disabled = false;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAuthScreen();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display === 'flex') submitAuth();
});

// ───────── App init (called after login) ─────────
function initApp() {
  settings = {};
  (async function() {
    settings = await apiGet('/settings');
    renderDashboard();
  })();
}

// ───────── Boot: check if already logged in ─────────
(async function boot() {
  document.getElementById('app').style.display = 'none';
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      hideAuthScreen(data.username);
      initApp();
    } else {
      showAuthScreen();
    }
  } catch(e) {
    showAuthScreen();
  }
})();

const API = '/api';
let products = [];
let customers = [];
let settings = {};
let currentBarcodeProduct = null;
let cart = [];
let payMode = 'full';
let lastBillForPrint = null;
let currentCustomerForModal = null;

// ───────── Navigation ─────────
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
    document.getElementById('nav').classList.remove('open');
    if (btn.dataset.page === 'dashboard') renderDashboard();
    if (btn.dataset.page === 'sales') { loadProductOptions(); loadCustomerOptions(); renderSalesPage(); }
    if (btn.dataset.page === 'expenses') renderExpensePage();
    if (btn.dataset.page === 'dues') renderDuesPage();
    if (btn.dataset.page === 'products') renderProductsPage();
    if (btn.dataset.page === 'customers') renderCustomersPage();
    if (btn.dataset.page === 'settings') renderSettingsPage();
  });
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('nav').classList.toggle('open');
});

function fmt(n) {
  return 'Tk ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPlain(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateOf(fieldId) {
  const el = document.getElementById(fieldId);
  const v = el && el.value;
  return v || new Date().toISOString().slice(0, 10);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--surface);padding:10px 20px;border-radius:8px;font-size:13.5px;font-weight:500;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,0.2)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function badge(type) {
  const map = { sale: ['success', 'Sale'], expense: ['danger', 'Expense'], due: ['warning', 'Due'], paid: ['info', 'Paid'] };
  const [cls, lbl] = map[type] || ['info', type];
  return `<span class="badge badge-${cls}">${lbl}</span>`;
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

// ───────── Product & customer option loaders (used by the sale cart) ─────────
async function loadProductOptions() {
  products = await apiGet('/products');
  const sel = document.getElementById('cart-product');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select product / custom item —</option>' +
    products.map(p => `<option value="${p.id}" data-price="${p.sell_price}" data-cost="${p.purchase_price}" data-name="${esc(p.name)}">${esc(p.name)} (${esc(p.barcode)}) — stock ${p.quantity}</option>`).join('');
}

async function loadCustomerOptions() {
  customers = await apiGet('/customers');
  const sel = document.getElementById('cart-customer');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Walk-in customer —</option>' +
    customers.map(c => `<option value="${c.id}">${esc(c.name)}${c.phone ? ' — ' + esc(c.phone) : ''}</option>`).join('');
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'cart-customer') {
    const nameRow = document.getElementById('cart-customer-name-row');
    nameRow.style.display = e.target.value ? 'none' : 'flex';
  }
  if (e.target && e.target.id === 'cart-product') {
    const opt = e.target.selectedOptions[0];
    const descEl = document.getElementById('cart-desc');
    const priceEl = document.getElementById('cart-unit-price');
    if (opt && opt.value) {
      descEl.value = opt.dataset.name;
      priceEl.value = parseFloat(opt.dataset.price).toFixed(2);
    }
  }
});

// ───────── Cart: multi-product sale entry ─────────
function addCartItem() {
  const productId = document.getElementById('cart-product').value || null;
  const desc = document.getElementById('cart-desc').value.trim();
  const qty = parseFloat(document.getElementById('cart-qty').value);
  const unitPrice = parseFloat(document.getElementById('cart-unit-price').value);

  if (!desc) return alert('Please enter or select an item.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(unitPrice) || unitPrice < 0) return alert('Please enter a valid unit price.');

  let costPrice = null;
  let productName = desc;
  if (productId) {
    const p = products.find(x => String(x.id) === String(productId));
    if (p) { costPrice = Number(p.purchase_price) || 0; productName = p.name; }
  }

  cart.push({
    product_id: productId, desc, quantity: qty, unit_price: unitPrice,
    amount: qty * unitPrice, cost_price: costPrice
  });

  document.getElementById('cart-product').value = '';
  document.getElementById('cart-desc').value = '';
  document.getElementById('cart-qty').value = '1';
  document.getElementById('cart-unit-price').value = '';
  renderCart();
}

function removeCartItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function renderCart() {
  const tb = document.getElementById('cart-tbody');
  if (!cart.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No items added yet.</td></tr>';
  } else {
    tb.innerHTML = cart.map((it, i) => `<tr>
      <td>${esc(it.desc)}</td>
      <td class="num">${it.quantity}</td>
      <td class="num">${fmtPlain(it.unit_price)}</td>
      <td class="num" style="font-weight:600">${fmtPlain(it.amount)}</td>
      <td><button class="cart-row-remove" onclick="removeCartItem(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`).join('');
  }
  const total = cart.reduce((s, it) => s + it.amount, 0);
  document.getElementById('cart-total-val').textContent = fmt(total);
  updatePayPreview();
}

function setPayMode(mode) {
  payMode = mode;
  ['full', 'partial', 'due'].forEach(m => {
    document.getElementById('pay-' + m).classList.toggle('active', m === mode);
  });
  document.getElementById('cart-paid-row').style.display = mode === 'partial' ? 'flex' : 'none';
  updatePayPreview();
}

function updatePayPreview() {
  const total = cart.reduce((s, it) => s + it.amount, 0);
  let amountPaid = 0;
  if (payMode === 'full') amountPaid = total;
  if (payMode === 'due') amountPaid = 0;
  if (payMode === 'partial') amountPaid = parseFloat(document.getElementById('cart-amount-paid').value) || 0;

  const due = Math.max(0, total - amountPaid);
  const preview = document.getElementById('cart-due-preview');
  if (due > 0) {
    preview.style.display = 'flex';
    document.getElementById('cart-due-val').textContent = fmt(due);
  } else {
    preview.style.display = 'none';
  }
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'cart-amount-paid') updatePayPreview();
});

async function checkout() {
  if (!cart.length) return alert('Add at least one item to the cart first.');

  const total = cart.reduce((s, it) => s + it.amount, 0);
  let amountPaid = total;
  if (payMode === 'due') amountPaid = 0;
  if (payMode === 'partial') {
    amountPaid = parseFloat(document.getElementById('cart-amount-paid').value);
    if (isNaN(amountPaid) || amountPaid < 0) return alert('Please enter a valid amount received.');
    if (amountPaid > total) amountPaid = total;
  }

  const customerId = document.getElementById('cart-customer').value || null;
  const customerName = document.getElementById('cart-customer-name').value.trim();
  const date = dateOf('cart-date');

  const res = await apiPost('/checkout', {
    date, customer_id: customerId, customerName,
    amountPaid, items: cart.map(it => ({
      product_id: it.product_id, desc: it.desc, quantity: it.quantity,
      unit_price: it.unit_price, amount: it.amount, cost_price: it.cost_price
    }))
  });

  if (res.error) return alert(res.error);

  lastBillForPrint = res;
  cart = [];
  renderCart();
  document.getElementById('cart-customer').value = '';
  document.getElementById('cart-customer-name').value = '';
  document.getElementById('cart-customer-name-row').style.display = 'flex';
  document.getElementById('cart-amount-paid').value = '';
  setPayMode('full');

  await loadProductOptions();
  renderSalesPage();
  toast('Sale recorded');
  openPosModal(res);
}

// ───────── Expenses ─────────
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

// ───────── Dues ─────────
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

// ───────── Sales page ─────────
async function renderSalesPage() {
  const dateEl = document.getElementById('cart-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  const from = document.getElementById('sale-filter-from').value;
  const to = document.getElementById('sale-filter-to').value;
  let rows = await apiGet('/sales');
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  const tb = document.getElementById('sales-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No sales found.</td></tr>';
    document.getElementById('sales-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(r => `<tr>
    <td>${r.date}</td>
    <td>${r.bill_no ? '#' + r.bill_no : '—'}</td>
    <td>${esc(r.desc)}</td>
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
    <td>${esc(r.desc)}</td>
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
    <td style="font-weight:600">${esc(r.party)}</td>
    <td style="color:var(--text-3);font-size:12.5px">${esc(r.note) || '—'}</td>
    <td class="num" style="color:var(--warn)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('dues', ${r.id}, renderDuesPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No outstanding dues.</td></tr>';
  document.getElementById('dues-total-val').textContent = fmt(outstanding.reduce((s, r) => s + r.amount, 0));

  const ptb = document.getElementById('paid-tbody');
  ptb.innerHTML = paid.length ? paid.map(r => `<tr>
    <td>${r.date}</td>
    <td style="font-weight:600">${esc(r.party)}</td>
    <td style="color:var(--text-3);font-size:12.5px">${esc(r.note) || '—'}</td>
    <td class="num" style="color:var(--ok)">${fmt(r.amount)}</td>
    <td><button class="del-btn" onclick="deleteRow('due-paid', ${r.id}, renderDuesPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No payments recorded.</td></tr>';
  document.getElementById('paid-total-val').textContent = fmt(paid.reduce((s, r) => s + r.amount, 0));
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
      <div class="pname">${esc(p.name)}</div>
      <div class="pmeta"><span>${esc(p.barcode)}</span><span class="${lowStock ? 'stock-low' : ''}">${p.quantity} in stock</span></div>
      <svg class="pbarcode-svg" data-barcode="${esc(p.barcode)}" style="background:#fff;border-radius:6px"></svg>
      <div class="price-row"><span>Purchase</span><span class="v">${fmt(p.purchase_price)}</span></div>
      <div class="price-row"><span>Sell</span><span class="v">${fmt(p.sell_price)}</span></div>
      <div class="price-row"><span>Margin</span><span class="v" style="color:${margin >= 0 ? 'var(--ok)' : 'var(--danger)'}">${fmt(margin)}</span></div>
      <div class="actions">
        <button onclick='openBarcodeModal(${p.id})'><i class="ti ti-barcode"></i> Label</button>
        <button class="danger" onclick="deleteProduct(${p.id})"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>`;
  }).join('');

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
  document.getElementById('ctl-name-size').value = settings.nameFontSize || 14;
  document.getElementById('ctl-price-size').value = settings.priceFontSize || 13;
  document.getElementById('ctl-bc-width').value = settings.barcodeWidth || 2;
  document.getElementById('ctl-bc-height').value = settings.barcodeHeight || 56;
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
  content.innerHTML = `<div class="mp-name" style="font-size:${nameSize}px">${esc(p.name)}</div><svg id="modal-barcode-svg"></svg>${showPrice ? `<div class="mp-price" style="font-size:${priceSize}px">Price: ${fmt(p.sell_price)}</div>` : ''}`;
  JsBarcode('#modal-barcode-svg', p.barcode, { format: 'CODE128', width: bcWidth, height: bcHeight, fontSize: Math.max(10, Math.round(bcHeight * 0.22)), margin: 8, background: '#ffffff', lineColor: '#000000' });
}

function closeBarcodeModal() {
  document.getElementById('barcodeModal').style.display = 'none';
  currentBarcodeProduct = null;
}

function printViaIframe(innerHtml, title) {
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
  doc.write(`<html><head><title>${esc(title)}</title></head><body style="margin:0">${innerHtml}</body></html>`);
  doc.close();

  const cleanup = () => { if (frame && frame.parentNode) frame.remove(); };
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(cleanup, 5000);

  frame.contentWindow.focus();
  frame.contentWindow.print();
}

function printBarcode() {
  if (!currentBarcodeProduct) return;
  const labelHtml = document.getElementById('modal-barcode-content').innerHTML;
  printViaIframe(`<div style="text-align:center;font-family:sans-serif;padding:30px">${labelHtml}</div>`, 'Print label');
}

// ───────── Customers ─────────
async function addCustomer() {
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  if (!name) return alert('Please enter a customer name.');
  await apiPost('/customers', { name, phone, address });
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('cust-address').value = '';
  toast('Customer saved');
  renderCustomersPage();
}

async function renderCustomersPage() {
  const list = await apiGet('/customers-summary');
  const search = (document.getElementById('cust-search')?.value || '').toLowerCase();
  let filtered = list;
  if (search) filtered = list.filter(c => c.name.toLowerCase().includes(search) || (c.phone || '').toLowerCase().includes(search));
  filtered.sort((a, b) => b.id - a.id);

  const tb = document.getElementById('customers-tbody');
  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No customers found. Add one above.</td></tr>';
    return;
  }
  tb.innerHTML = filtered.map(c => `<tr style="cursor:pointer" onclick="openCustomerModal(${c.id})">
    <td style="font-weight:600">${esc(c.name)}</td>
    <td>${esc(c.phone) || '—'}</td>
    <td class="num" style="color:var(--ok)">${fmt(c.totalPurchased)}</td>
    <td class="num" style="color:${c.totalDue > 0 ? 'var(--warn)' : 'var(--text-3)'}">${c.totalDue > 0 ? fmt(c.totalDue) : '—'}</td>
    <td><button class="del-btn" onclick="event.stopPropagation();deleteRow('customers', ${c.id}, renderCustomersPage)"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('');
}

async function openCustomerModal(id) {
  const [summary, bills] = await Promise.all([apiGet('/customers-summary'), apiGet(`/customers/${id}/bills`)]);
  const c = summary.find(x => x.id === id);
  if (!c) return;
  currentCustomerForModal = c;

  const content = document.getElementById('customer-modal-content');
  content.innerHTML = `
    <div class="cust-detail-head">
      <div>
        <div class="cd-name">${esc(c.name)}</div>
        <div class="cd-meta">${esc(c.phone) || 'No phone'} ${c.address ? '· ' + esc(c.address) : ''}</div>
      </div>
    </div>
    <div class="cust-metric-row">
      <div class="metric-card"><div class="label">Total purchased</div><div class="value green">${fmt(c.totalPurchased)}</div></div>
      <div class="metric-card"><div class="label">Outstanding due</div><div class="value ${c.totalDue > 0 ? 'amber' : ''}">${fmt(c.totalDue)}</div></div>
      <div class="metric-card"><div class="label">Bills</div><div class="value">${c.billCount}</div></div>
    </div>
    <div class="list-header" style="padding:0 0 10px"><i class="ti ti-history"></i> Purchase history</div>
    <div id="cust-bill-history">
      ${bills.length ? bills.map(b => `<div class="bill-history-item" onclick='openPosModalFromHistory(${JSON.stringify(b).replace(/'/g, "&#39;")})'>
        <div class="bh-top"><span>${b.bill_no ? 'Bill #' + b.bill_no : 'Sale'}</span><span>${fmt(b.total)}</span></div>
        <div class="bh-sub">${b.date} · ${b.items.length} item${b.items.length > 1 ? 's' : ''}</div>
      </div>`).join('') : '<div class="empty-state">No purchases yet.</div>'}
    </div>
  `;
  document.getElementById('customerModal').style.display = 'flex';
}

function closeCustomerModal() {
  document.getElementById('customerModal').style.display = 'none';
  currentCustomerForModal = null;
}

function openPosModalFromHistory(bill) {
  const billData = {
    billNo: bill.bill_no, date: bill.date, total: bill.total,
    amountPaid: bill.total, dueAmount: 0,
    items: bill.items, customer: currentCustomerForModal
  };
  openPosModal(billData);
}

// ───────── Settings ─────────
async function renderSettingsPage() {
  settings = await apiGet('/settings');
  document.getElementById('set-business-name').value = settings.businessName || '';
  document.getElementById('set-address').value = settings.address || '';
  document.getElementById('set-phone').value = settings.phone || '';
  document.getElementById('set-gst').value = settings.gst || '';
  document.getElementById('set-note').value = settings.note || '';
  document.getElementById('set-pos-width').value = String(settings.posWidthMm || 80);
  document.getElementById('set-name-size').value = settings.nameFontSize || 14;
  document.getElementById('set-price-size').value = settings.priceFontSize || 13;
  document.getElementById('set-bc-width').value = settings.barcodeWidth || 2;
  document.getElementById('set-bc-height').value = settings.barcodeHeight || 56;
}

async function saveSettings() {
  const body = {
    businessName: document.getElementById('set-business-name').value.trim(),
    address: document.getElementById('set-address').value.trim(),
    phone: document.getElementById('set-phone').value.trim(),
    gst: document.getElementById('set-gst').value.trim(),
    note: document.getElementById('set-note').value.trim(),
    posWidthMm: Number(document.getElementById('set-pos-width').value) || 80,
    nameFontSize: Number(document.getElementById('set-name-size').value) || 14,
    priceFontSize: Number(document.getElementById('set-price-size').value) || 13,
    barcodeWidth: Number(document.getElementById('set-bc-width').value) || 2,
    barcodeHeight: Number(document.getElementById('set-bc-height').value) || 56
  };
  settings = await apiPut('/settings', body);
  toast('Settings saved');
}

// ───────── POS bill ─────────
function buildPosBillHtml(bill, widthMm) {
  const s = settings;
  const dt = new Date(bill.date + 'T00:00:00');
  const dateStr = isNaN(dt.getTime()) ? bill.date : dt.toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const itemsHtml = bill.items.map(it => `<tr>
    <td>${esc(it.desc)}</td>
    <td class="num">${it.quantity}</td>
    <td class="num">${fmt(it.unit_price != null ? it.unit_price : (it.amount / (it.quantity || 1)))}</td>
    <td class="num">${fmt(it.amount)}</td>
  </tr>`).join('');
  const totalQty = bill.items.reduce((s2, it) => s2 + Number(it.quantity || 0), 0);

  return `<div class="pos-bill" style="width:${widthMm}mm;font-size:${widthMm <= 58 ? '11px' : '12px'}">
    <div class="pb-center">
      <div class="pb-name" style="font-size:${s.nameFontSize || 14}px">${esc(s.businessName || 'My Business')}</div>
      <div class="pb-sub">${esc(s.address || '')}</div>
      ${s.phone ? `<div class="pb-sub">${esc(s.phone)}</div>` : ''}
      ${s.gst ? `<div class="pb-sub">GST# ${esc(s.gst)}</div>` : ''}
      <div class="pb-title">Retail Invoice</div>
    </div>
    <div class="pb-meta">Bill# ${bill.billNo != null ? bill.billNo : '—'}</div>
    <div class="pb-meta">Date  ${dateStr}</div>
    ${bill.customer && bill.customer.name ? `<div class="pb-meta">Customer  ${esc(bill.customer.name)}</div>` : ''}
    <div class="pb-rule"></div>
    <table class="pb-items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    </table>
    <div class="pb-rule"></div>
    <table class="pb-items"><tbody>${itemsHtml}</tbody></table>
    <div class="pb-rule"></div>
    <div class="pb-total-line" style="font-size:${s.priceFontSize ? s.priceFontSize + 4 : 17}px">
      <span>TOTAL</span><span>${fmt(bill.total)}</span>
    </div>
    <div class="pb-totals" style="font-size:${s.priceFontSize || 13}px">
      <div class="pb-paid-line"><span>Paid</span><span>${fmt(bill.amountPaid)}</span></div>
      ${bill.dueAmount > 0 ? `<div class="pb-paid-line" style="font-weight:700"><span>Due</span><span>${fmt(bill.dueAmount)}</span></div>` : ''}
    </div>
    <div class="pb-rule"></div>
    <div class="pb-meta">No of items: ${bill.items.length}, Total quantity: ${totalQty}</div>
    <div class="pb-footer">${esc(s.note || 'Thank you for your visit!')}</div>
  </div>`;
}

async function openPosModal(bill) {
  if (!settings || !settings.businessName) settings = await apiGet('/settings');
  lastBillForPrint = bill;
  const widthMm = settings.posWidthMm || 80;
  document.getElementById('pos-bill-content').innerHTML = buildPosBillHtml(bill, widthMm);
  document.getElementById('posModal').style.display = 'flex';
}

function closePosModal() {
  document.getElementById('posModal').style.display = 'none';
}

function printPosBill() {
  if (!lastBillForPrint) return;
  const widthMm = settings.posWidthMm || 80;
  const billHtml = buildPosBillHtml(lastBillForPrint, widthMm);
  printViaIframe(`<div style="display:flex;justify-content:center;padding:6px 0">${billHtml}</div>`, 'Print bill');
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
  if (e.key !== 'Escape') return;
  if (document.getElementById('barcodeModal').style.display === 'flex') closeBarcodeModal();
  if (document.getElementById('posModal').style.display === 'flex') closePosModal();
  if (document.getElementById('customerModal').style.display === 'flex') closeCustomerModal();
});
