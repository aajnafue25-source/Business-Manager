// ───────── Global state ─────────
let authMode = 'login';
let authScreenMode = 'business'; // 'business' | 'staff'
let currentRole = null; // 'manager' | 'sales'
let currentIsAdmin = false;

const API = '/api';
let products = [];
let customers = [];
let settings = {};
let currentBarcodeProduct = null;
let cart = [];
let payMode = 'full';
let lastBillForPrint = null;
let currentCustomerForModal = null;

// ───────── Auth: Business ─────────
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('expired-screen').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

function showExpiredScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('expired-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function expiredLogout() {
  fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
    document.getElementById('expired-screen').style.display = 'none';
    showAuthScreen();
  });
}

function hideAuthScreen(username, isAdmin, role, daysLeft) {
  currentRole = role || 'manager';
  currentIsAdmin = !!isAdmin;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('expired-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('logout-btn').style.display = 'inline-flex';
  if (isAdmin) { const adminNav = document.getElementById('nav-admin'); if (adminNav) adminNav.style.display = 'block'; }
  const roleLabel = isAdmin ? '<i class="ti ti-shield-check"></i> Admin' : (currentRole === 'manager' ? '<i class="ti ti-user-circle"></i> Manager' : '<i class="ti ti-user"></i> Sales');
  document.getElementById('topbar-user').textContent = roleLabel + ' · ' + username;

  const staffNav = document.getElementById('nav-staff');
  if (staffNav) staffNav.style.display = (currentRole === 'manager') ? 'block' : 'none';

  const badgeEl = document.getElementById('topbar-days-left');
  if (badgeEl) {
    if (daysLeft != null && !isAdmin) {
      badgeEl.style.display = 'inline-block';
      badgeEl.textContent = daysLeft <= 0 ? 'Expires today' : (daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left');
      badgeEl.style.color = daysLeft <= 5 ? 'var(--danger)' : 'var(--warn)';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  applyRolePermissions();
}

function applyRolePermissions() {
  const isManager = currentRole === 'manager';
  const settingsBlock = document.getElementById('settings-business-only');
  if (settingsBlock) settingsBlock.style.display = isManager ? 'block' : 'none';
  document.body.classList.toggle('role-sales', !isManager);
}

function switchAuthMode(mode) {
  authScreenMode = mode;
  const isBusiness = mode === 'business';
  document.getElementById('authmode-business').style.background = isBusiness ? 'var(--text)' : 'transparent';
  document.getElementById('authmode-business').style.color = isBusiness ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('authmode-staff').style.background = !isBusiness ? 'var(--text)' : 'transparent';
  document.getElementById('authmode-staff').style.color = !isBusiness ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('auth-business-block').style.display = isBusiness ? 'block' : 'none';
  document.getElementById('auth-staff-block').style.display = !isBusiness ? 'block' : 'none';
  document.getElementById('auth-error').style.display = 'none';
}

function switchTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login').style.background = isLogin ? 'var(--text)' : 'var(--surface-2)';
  document.getElementById('tab-login').style.color = isLogin ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('tab-signup').style.background = !isLogin ? 'var(--text)' : 'var(--surface-2)';
  document.getElementById('tab-signup').style.color = !isLogin ? 'var(--surface)' : 'var(--text-2)';
  document.getElementById('auth-confirm-row').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('auth-phone-row').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirmPw = document.getElementById('auth-confirm').value;
  const phone = document.getElementById('auth-phone').value.trim();
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';

  if (!username || !password) { showAuthError('Please enter username and password.'); return; }
  if (authMode === 'signup') {
    if (!phone) { showAuthError('Phone number is required.'); return; }
    if (password !== confirmPw) { showAuthError('Passwords do not match.'); return; }
  }

  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = 'Please wait...';
  btn.disabled = true;

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = authMode === 'login' ? { username, password } : { username, password, phone };
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();

    if (data.error === 'expired') { showExpiredScreen(); return; }

    if (!res.ok || data.status === 'pending') {
      const isPending = data.status === 'pending';
      showAuthError(isPending ? 'Account created! Waiting for admin approval.' : (data.message || data.error || 'Something went wrong.'), isPending);
      return;
    }
    hideAuthScreen(data.username, data.isAdmin, data.role || 'manager', data.daysLeft);
    initApp();
  } catch (e) {
    showAuthError('Network error. Please try again.');
  } finally {
    btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    btn.disabled = false;
  }
}

async function submitStaffAuth() {
  const phone = document.getElementById('staff-phone').value.trim();
  const password = document.getElementById('staff-password').value;
  if (!phone || !password) { showAuthError('Please enter phone number and password.'); return; }

  try {
    const res = await fetch('/api/auth/staff-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
    const data = await res.json();
    if (data.error === 'expired') { showExpiredScreen(); return; }
    if (!res.ok) { showAuthError(data.error || 'Invalid phone or password.'); return; }
    hideAuthScreen(data.username, false, data.role, null);
    initApp();
  } catch (e) {
    showAuthError('Network error. Please try again.');
  }
}

function showAuthError(msg, isPending) {
  const errEl = document.getElementById('auth-error');
  errEl.style.background = isPending ? 'var(--warn-bg, #2d2000)' : 'var(--danger-bg)';
  errEl.style.color = isPending ? 'var(--warn)' : 'var(--danger)';
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAuthScreen();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display === 'flex') {
    if (authScreenMode === 'business') submitAuth(); else submitStaffAuth();
  }
});

// ───────── App init (called after login) ─────────
function initApp() {
  settings = {};
  (async function () {
    settings = await apiGet('/settings');
    renderDashboard();
  })();
}

// ───────── Boot: check if already logged in ─────────
(async function boot() {
  document.getElementById('app').style.display = 'none';
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (res.ok) {
      hideAuthScreen(data.username, data.isAdmin, data.role || 'manager', data.daysLeft);
      initApp();
    } else if (data.error === 'expired') {
      showExpiredScreen();
    } else {
      showAuthScreen();
    }
  } catch (e) {
    showAuthScreen();
  }
})();

// ───────── Navigation ─────────
const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  admin: renderAdminPage,
  sales: function () { loadProductOptions(); loadCustomerOptions(); renderSalesPage(); },
  saleslist: renderSalesListPage,
  salesreturns: renderSalesReturnsPage,
  purchases: function () { setupPurchasePage(); renderPurchasePage(); },
  purchaselist: renderPurchaseListPage,
  purchasereturns: renderPurchaseReturnsPage,
  suppliers: renderSuppliersPage,
  expenses: renderExpensePage,
  dues: renderDuesPage,
  products: renderProductsPage,
  customers: renderCustomersPage,
  reports: renderReportsPage,
  settings: renderSettingsPage,
  staff: renderStaffPage
};

function navigateTo(page) {
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (!pageEl) return;
  pageEl.classList.add('active');
  // Mark matching nav buttons active
  document.querySelectorAll('nav button[data-page="' + page + '"]').forEach(function (b) {
    b.classList.add('active');
    // If inside a nav-dropdown, open its parent group
    const dropdown = b.closest('.nav-dropdown');
    if (dropdown) {
      const group = dropdown.closest('.nav-group');
      if (group) {
        document.querySelectorAll('.nav-group.open').forEach(function (g) { if (g !== group) g.classList.remove('open'); });
        group.classList.add('open');
        // also mark the group btn active
        const groupBtn = group.querySelector('.nav-group-btn');
        if (groupBtn) groupBtn.classList.add('active');
      }
    }
  });
  document.getElementById('nav').classList.remove('open');
  if (PAGE_RENDERERS[page]) PAGE_RENDERERS[page]();
}

document.getElementById('nav').addEventListener('click', function (e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  // Group header: toggle the accordion open/close
  if (btn.classList.contains('nav-group-btn')) {
    const group = btn.closest('.nav-group');
    const wasOpen = group.classList.contains('open');
    // close sibling groups (accordion behaviour)
    document.querySelectorAll('.nav-group.open').forEach(function (g) { if (g !== group) g.classList.remove('open'); });
    group.classList.toggle('open', !wasOpen);
    if (btn.dataset.page) navigateTo(btn.dataset.page);
    return;
  }
  if (btn.dataset.page) navigateTo(btn.dataset.page);
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('nav').classList.toggle('open');
});

// Sidebar collapse (desktop)
function toggleSidebar() {
  document.getElementById('app').classList.toggle('nav-collapsed');
  try { localStorage.setItem('bm-sidebar', document.getElementById('app').classList.contains('nav-collapsed') ? '1' : '0'); } catch (e) {}
}

// Theme toggle (light/dark)
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) icon.className = theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('bm-theme', next); } catch (e) {}
}
(function initThemeAndSidebar() {
  let theme = 'light';
  try { theme = localStorage.getItem('bm-theme') || 'light'; } catch (e) {}
  applyTheme(theme);
  try { if (localStorage.getItem('bm-sidebar') === '1') document.getElementById('app').classList.add('nav-collapsed'); } catch (e) {}
})();

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
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ───────── API helpers ─────────
async function apiGet(path) {
  const r = await fetch(API + path);
  if (r.status === 403) { const d = await r.json().catch(function () { return {}; }); if (d.error === 'expired') showExpiredScreen(); }
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
  setTimeout(function () { el.remove(); }, 1800);
}

function badge(type) {
  const map = { sale: ['success', 'Sale'], expense: ['danger', 'Expense'], due: ['warning', 'Due'], paid: ['info', 'Paid'] };
  const pair = map[type] || ['info', type];
  return '<span class="badge badge-' + pair[0] + '">' + pair[1] + '</span>';
}

async function deleteRow(table, id, after) {
  if (!confirm('Delete this entry?')) return;
  const res = await apiDelete('/' + table + '/' + id);
  if (res && res.error) { alert(res.error); return; }
  after();
}

function clearFilter(type) {
  if (type === 'sales') {
    const f = document.getElementById('sale-filter-from');
    const t = document.getElementById('sale-filter-to');
    if (f) f.value = '';
    if (t) t.value = '';
    renderSalesPage();
  }
  if (type === 'expenses') {
    document.getElementById('exp-filter-from').value = '';
    document.getElementById('exp-filter-to').value = '';
    renderExpensePage();
  }
}

// ───────── Entry detail "view" modal ─────────
function openViewEntryModal(title, rows, actions) {
  const content = document.getElementById('view-entry-content');
  let actionsHtml = '';
  if (actions && actions.length) {
    actionsHtml = '<div class="modal-actions" style="margin-top:18px">' +
      actions.map(function (a) {
        return '<button class="' + (a.danger ? 'btn-secondary danger-text' : 'btn-secondary') + '" onclick="' + a.onclick + '"><i class="ti ' + a.icon + '"></i> ' + esc(a.label) + '</button>';
      }).join('') + '</div>';
  }
  content.innerHTML = '<h3 style="margin:0 0 16px;font-size:16px">' + esc(title) + '</h3>' +
    rows.map(function (r) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px">' +
        '<span style="color:var(--text-2)">' + esc(r.label) + '</span><span style="font-weight:600;text-align:right">' + r.value + '</span></div>';
    }).join('') + actionsHtml;
  document.getElementById('viewEntryModal').style.display = 'flex';
}
function closeViewEntryModal() {
  document.getElementById('viewEntryModal').style.display = 'none';
}

async function printSaleBillFromRow(r) {
  if (!r.bill_id) { toast('This sale has no bill to print (manual entry).'); return; }
  const bill = await apiGet('/sales/bill/' + r.bill_id);
  if (bill && bill.error) { alert(bill.error); return; }
  await openPosModal(bill);
}

function viewSaleEntry(r) {
  const isManager = currentRole === 'manager';
  const actions = [];
  if (r.bill_id) actions.push({ label: 'Print bill', icon: 'ti-printer', onclick: 'printSaleBillFromRow(' + JSON.stringify(r).replace(/"/g, '&quot;') + ')' });
  if (isManager) {
    actions.push({ label: 'Edit', icon: 'ti-pencil', onclick: 'closeViewEntryModal();editSaleEntry(' + JSON.stringify(r).replace(/"/g, '&quot;') + ')' });
    actions.push({ label: 'Delete', icon: 'ti-trash', danger: true, onclick: 'closeViewEntryModal();deleteRow(\'sales\',' + r.id + ',renderSalesPage)' });
  }
  openViewEntryModal('Sale details', [
    { label: 'Date', value: esc(r.date) },
    { label: 'Bill #', value: r.bill_no ? '#' + r.bill_no : '—' },
    { label: 'Customer', value: esc(r.customer_name) || 'Walk-in customer' },
    { label: 'Description', value: esc(r.desc) },
    { label: 'Quantity', value: r.quantity != null ? r.quantity : '—' },
    { label: 'Unit price', value: r.unit_price != null ? fmt(r.unit_price) : '—' },
    { label: 'Amount', value: '<span style="color:var(--ok)">' + fmt(r.amount) + '</span>' }
  ], actions.length ? actions : null);
}
function viewExpenseEntry(r) {
  const isManager = currentRole === 'manager';
  openViewEntryModal('Expense details', [
    { label: 'Date', value: esc(r.date) },
    { label: 'Description', value: esc(r.desc) },
    { label: 'Amount', value: '<span style="color:var(--danger)">' + fmt(r.amount) + '</span>' }
  ], isManager ? [
    { label: 'Edit', icon: 'ti-pencil', onclick: 'closeViewEntryModal();editExpenseEntry(' + JSON.stringify(r).replace(/"/g, '&quot;') + ')' },
    { label: 'Delete', icon: 'ti-trash', danger: true, onclick: 'closeViewEntryModal();deleteRow(\'expenses\',' + r.id + ',renderExpensePage)' }
  ] : null);
}
function viewDueEntry(r, kind) {
  const isManager = currentRole === 'manager';
  const table = kind === 'paid' ? 'due-paid' : 'dues';
  openViewEntryModal(kind === 'paid' ? 'Payment details' : 'Due details', [
    { label: 'Date', value: esc(r.date) },
    { label: 'Party', value: esc(r.party) },
    { label: 'Note', value: esc(r.note) || '—' },
    { label: 'Amount', value: '<span style="color:' + (kind === 'paid' ? 'var(--ok)' : 'var(--warn)') + '">' + fmt(r.amount) + '</span>' }
  ], isManager ? [
    { label: 'Edit', icon: 'ti-pencil', onclick: 'closeViewEntryModal();editDueEntry(' + JSON.stringify(r).replace(/"/g, '&quot;') + ',\'' + table + '\')' },
    { label: 'Delete', icon: 'ti-trash', danger: true, onclick: 'closeViewEntryModal();deleteRow(\'' + table + '\',' + r.id + ',renderDuesPage)' }
  ] : null);
}

// ───────── Generic search-as-you-type picker ─────────
// Wires an <input id="{inputId}"> + results <div id="{resultsId}"> to a search API,
// calling onPick(item) when the user clicks a result or presses Enter on the highlighted one.
function wireSearchPicker(inputId, resultsId, searchFn, renderItemFn, onPick, opts) {
  opts = opts || {};
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input || !results) return;
  let items = [];
  let activeIndex = -1;
  let debounceTimer = null;

  function closeResults() {
    results.classList.remove('open');
    results.innerHTML = '';
    activeIndex = -1;
  }

  function renderResults(list) {
    items = list;
    activeIndex = -1;
    if (!list.length) {
      results.innerHTML = '<div class="search-pick-empty">' + (opts.emptyText || 'No matches found') + '</div>';
      results.classList.add('open');
      return;
    }
    results.innerHTML = list.map(function (item, i) {
      return '<div class="search-pick-item" data-idx="' + i + '">' + renderItemFn(item) + '</div>';
    }).join('');
    results.classList.add('open');
    Array.prototype.forEach.call(results.querySelectorAll('.search-pick-item'), function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const idx = parseInt(el.dataset.idx, 10);
        pick(items[idx]);
      });
    });
  }

  function pick(item) {
    onPick(item);
    closeResults();
  }

  input.addEventListener('input', function () {
    const q = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!q && !opts.showOnEmpty) { closeResults(); return; }
    debounceTimer = setTimeout(async function () {
      const list = await searchFn(q);
      renderResults(list);
    }, 180);
  });

  input.addEventListener('focus', function () {
    if (opts.showOnEmpty && !input.value.trim()) {
      searchFn('').then(renderResults);
    } else if (input.value.trim()) {
      searchFn(input.value.trim()).then(renderResults);
    }
  });

  input.addEventListener('keydown', function (e) {
    if (!results.classList.contains('open')) return;
    const els = results.querySelectorAll('.search-pick-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, els.length - 1);
      els.forEach(function (el, i) { el.classList.toggle('active', i === activeIndex); });
      if (els[activeIndex]) els[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      els.forEach(function (el, i) { el.classList.toggle('active', i === activeIndex); });
      if (els[activeIndex]) els[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) pick(items[activeIndex]);
      else if (items.length === 1) pick(items[0]);
    } else if (e.key === 'Escape') {
      closeResults();
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target !== input && !results.contains(e.target)) closeResults();
  });

  return { close: closeResults };
}

async function searchCustomersApi(q) {
  return await apiGet('/customers/search?q=' + encodeURIComponent(q));
}
async function searchProductsApi(q) {
  return await apiGet('/products/search?q=' + encodeURIComponent(q));
}
async function searchSuppliersApi(q) {
  return await apiGet('/suppliers/search?q=' + encodeURIComponent(q));
}

let selectedCartCustomer = null;

function renderCustomerSearchItem(c) {
  return '<div class="spi-main">' + esc(c.name) + '</div><div class="spi-sub">' + (esc(c.phone) || 'No phone') + '</div>';
}
function renderProductSearchItem(p) {
  return '<div class="spi-main">' + esc(p.name) + '<span class="spi-stock">stock ' + p.quantity + ' ' + esc(p.unit || 'pcs') + '</span></div><div class="spi-sub">' + esc(p.barcode) + ' · ' + fmt(p.sell_price) + '</div>';
}
function renderSupplierSearchItem(s) {
  return '<div class="spi-main">' + esc(s.name) + '</div><div class="spi-sub">' + (esc(s.phone) || 'No phone') + '</div>';
}

function setupCartCustomerPicker() {
  wireSearchPicker('cart-customer-search', 'cart-customer-results', searchCustomersApi, renderCustomerSearchItem, function (c) {
    selectedCartCustomer = c;
    document.getElementById('cart-customer').value = c.id;
    document.getElementById('cart-customer-search').value = c.name + (c.phone ? ' — ' + c.phone : '');
    document.getElementById('cart-customer-name-row').style.display = 'none';
  }, { showOnEmpty: true, emptyText: 'No customers yet — use "Add new customer" below' });

  const input = document.getElementById('cart-customer-search');
  if (input) {
    input.addEventListener('input', function () {
      if (!input.value.trim()) {
        selectedCartCustomer = null;
        document.getElementById('cart-customer').value = '';
        document.getElementById('cart-customer-name-row').style.display = 'flex';
      }
    });
  }
}

function setupCartProductPicker() {
  wireSearchPicker('cart-product-search', 'cart-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    // One click = auto add to cart (item qty 1 by default, editable before adding more)
    addProductDirectlyToCart(p);
    document.getElementById('cart-product-search').value = '';
  }, { showOnEmpty: true, emptyText: 'No products found — you can still type a custom item below' });
}

function addProductDirectlyToCart(p) {
  const costPrice = Number(p.purchase_price) || 0;
  cart.push({
    product_id: p.id, desc: p.name, quantity: 1, unit_price: Number(p.sell_price) || 0,
    amount: Number(p.sell_price) || 0, cost_price: costPrice, unit: p.unit || 'pcs'
  });
  renderCart();
  toast(p.name + ' added to cart');
}

async function loadProductOptions() {
  products = await apiGet('/products');
  setupCartProductPicker();
}

async function loadCustomerOptions() {
  customers = await apiGet('/customers');
  setupCartCustomerPicker();
}

// ───────── Quick add customer (from Sales page) ─────────
function openQuickAddCustomer() {
  document.getElementById('qc-name').value = '';
  document.getElementById('qc-phone').value = '';
  document.getElementById('qc-address').value = '';
  document.getElementById('quickCustomerModal').style.display = 'flex';
}
function closeQuickAddCustomer() {
  document.getElementById('quickCustomerModal').style.display = 'none';
}
async function submitQuickAddCustomer() {
  const name = document.getElementById('qc-name').value.trim();
  const phone = document.getElementById('qc-phone').value.trim();
  const address = document.getElementById('qc-address').value.trim();
  if (!name) return alert('Please enter a customer name.');
  const res = await apiPost('/customers', { name: name, phone: phone, address: address });
  selectedCartCustomer = { id: res.id, name: name, phone: phone };
  const customerSearchEl = document.getElementById('cart-customer-search');
  if (customerSearchEl) {
    document.getElementById('cart-customer').value = res.id;
    customerSearchEl.value = name + (phone ? ' — ' + phone : '');
    document.getElementById('cart-customer-name-row').style.display = 'none';
  }
  closeQuickAddCustomer();
  toast('Customer added');
}

// ───────── Cart: multi-product sale entry ─────────
function addCartItem() {
  const productId = document.getElementById('cart-product').value || null;
  const desc = document.getElementById('cart-desc').value.trim();
  const qty = parseFloat(document.getElementById('cart-qty').value);
  const unitPrice = parseFloat(document.getElementById('cart-unit-price').value);

  if (!desc) return alert('Please enter a custom item description (or search and click a product above to add it instantly).');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(unitPrice) || unitPrice < 0) return alert('Please enter a valid unit price.');

  let costPrice = null;
  if (productId) {
    const p = products.find(function (x) { return String(x.id) === String(productId); });
    if (p) { costPrice = Number(p.purchase_price) || 0; }
  }

  cart.push({
    product_id: productId, desc: desc, quantity: qty, unit_price: unitPrice,
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
    tb.innerHTML = cart.map(function (it, i) {
      return '<tr><td>' + esc(it.desc) + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmtPlain(it.unit_price) + '</td><td class="num" style="font-weight:600">' + fmtPlain(it.amount) + '</td><td><button class="cart-row-remove" onclick="removeCartItem(' + i + ')"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('');
  }
  const total = cart.reduce(function (s, it) { return s + it.amount; }, 0);
  document.getElementById('cart-total-val').textContent = fmt(total);
  updatePayPreview();
}

function setPayMode(mode) {
  payMode = mode;
  ['full', 'partial', 'due'].forEach(function (m) {
    document.getElementById('pay-' + m).classList.toggle('active', m === mode);
  });
  document.getElementById('cart-paid-row').style.display = mode === 'partial' ? 'flex' : 'none';
  updatePayPreview();
}

function updatePayPreview() {
  const total = cart.reduce(function (s, it) { return s + it.amount; }, 0);
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

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'cart-amount-paid') updatePayPreview();
});

async function checkout() {
  if (!cart.length) return alert('Add at least one item to the cart first.');

  const total = cart.reduce(function (s, it) { return s + it.amount; }, 0);
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
    date: date, customer_id: customerId, customerName: customerName,
    amountPaid: amountPaid, items: cart.map(function (it) {
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, cost_price: it.cost_price };
    })
  });

  if (res.error) return alert(res.error);

  lastBillForPrint = res;
  cart = [];
  renderCart();
  selectedCartCustomer = null;
  document.getElementById('cart-customer').value = '';
  document.getElementById('cart-customer-search').value = '';
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
  await apiPost('/expenses', { date: dateOf('exp-date'), desc: desc, amount: amount });
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
  await apiPost('/dues', { date: dateOf('due-date'), party: party, amount: amount, note: note });
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
  await apiPost('/due-paid', { date: dateOf('dpaid-date'), party: party, amount: amount, note: note });
  document.getElementById('dpaid-party').value = '';
  document.getElementById('dpaid-amount').value = '';
  document.getElementById('dpaid-note').value = '';
  renderDuesPage();
  toast('Payment recorded');
}

// ───────── Sales page ─────────
// Rows are click-to-open (view popup holds Print/Edit/Delete). No inline action column.

function salesRowHtml(r, rowRef) {
  return '<tr class="clickable-row" onclick="viewSaleEntry(' + rowRef + ')"><td>' + r.date + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '—') + '</td><td>' + (esc(r.customer_name) || '<span style="color:var(--text-3)">Walk-in</span>') + '</td><td>' + esc(r.desc) + '</td><td class="num">' + (r.quantity || '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
}

async function renderSalesPage() {
  const dateEl = document.getElementById('cart-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  let rows = await apiGet('/sales');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  window.__salesRows = rows;
  const recent = rows.slice(0, 10);
  const tb = document.getElementById('sales-tbody');
  if (!recent.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No sales yet. Make your first sale above.</td></tr>';
    document.getElementById('sales-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = recent.map(function (r, i) {
    return salesRowHtml(r, 'window.__salesRows[' + i + ']');
  }).join('');
  document.getElementById('sales-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + r.amount; }, 0));
}

async function renderSalesListPage() {
  const from = document.getElementById('saleslist-filter-from').value;
  const to = document.getElementById('saleslist-filter-to').value;
  const search = (document.getElementById('saleslist-search').value || '').toLowerCase();
  let rows = await apiGet('/sales');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  if (from) rows = rows.filter(function (r) { return r.date >= from; });
  if (to) rows = rows.filter(function (r) { return r.date <= to; });
  if (search) rows = rows.filter(function (r) {
    return (r.desc || '').toLowerCase().includes(search) ||
      (r.customer_name || '').toLowerCase().includes(search) ||
      (r.bill_no ? String(r.bill_no) : '').includes(search);
  });
  window.__salesListRows = rows;
  const tb = document.getElementById('saleslist-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No sales found.</td></tr>';
    document.getElementById('saleslist-total-val').textContent = fmt(0);
    document.getElementById('saleslist-count').textContent = '0 sales';
    return;
  }
  tb.innerHTML = rows.map(function (r, i) {
    return salesRowHtml(r, 'window.__salesListRows[' + i + ']');
  }).join('');
  document.getElementById('saleslist-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + r.amount; }, 0));
  document.getElementById('saleslist-count').textContent = rows.length + ' sale' + (rows.length === 1 ? '' : 's');
}

function clearSalesListFilter() {
  document.getElementById('saleslist-filter-from').value = '';
  document.getElementById('saleslist-filter-to').value = '';
  document.getElementById('saleslist-search').value = '';
  renderSalesListPage();
}

function editSaleEntry(r) {
  openEditModal('Edit Sale', [
    { key: 'date', label: 'Date', type: 'date', value: r.date },
    { key: 'desc', label: 'Description', type: 'text', value: r.desc },
    { key: 'quantity', label: 'Quantity', type: 'number', value: r.quantity },
    { key: 'unit_price', label: 'Unit price (Tk)', type: 'number', value: r.unit_price },
    { key: 'amount', label: 'Amount (Tk)', type: 'number', value: r.amount }
  ], async function () {
    const date = document.getElementById('edit-date').value;
    const desc = document.getElementById('edit-desc').value.trim();
    const quantity = document.getElementById('edit-quantity').value;
    const unit_price = document.getElementById('edit-unit_price').value;
    const amount = parseFloat(document.getElementById('edit-amount').value);
    if (!desc || isNaN(amount)) return alert('Please fill in description and amount.');
    const res = await apiPut('/sales/' + r.id, { date: date, desc: desc, amount: amount, quantity: quantity ? parseFloat(quantity) : null, unit_price: unit_price ? parseFloat(unit_price) : null });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderSalesPage();
    toast('Sale updated');
  });
}

async function renderExpensePage() {
  const dateEl = document.getElementById('exp-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  const from = document.getElementById('exp-filter-from').value;
  const to = document.getElementById('exp-filter-to').value;
  let rows = await apiGet('/expenses');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  if (from) rows = rows.filter(function (r) { return r.date >= from; });
  if (to) rows = rows.filter(function (r) { return r.date <= to; });
  const tb = document.getElementById('exp-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state">No expenses found.</td></tr>';
    document.getElementById('exp-total-val').textContent = fmt(0);
    return;
  }
  window.__expRows = rows;
  tb.innerHTML = rows.map(function (r, i) {
    const rowRef = 'window.__expRows[' + i + ']';
    return '<tr class="clickable-row" onclick="viewExpenseEntry(' + rowRef + ')"><td>' + r.date + '</td><td>' + esc(r.desc) + '</td><td class="num" style="color:var(--danger)">' + fmt(r.amount) + '</td></tr>';
  }).join('');
  document.getElementById('exp-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + r.amount; }, 0));
}

function editExpenseEntry(r) {
  openEditModal('Edit Expense', [
    { key: 'date', label: 'Date', type: 'date', value: r.date },
    { key: 'desc', label: 'Description', type: 'text', value: r.desc },
    { key: 'amount', label: 'Amount (Tk)', type: 'number', value: r.amount }
  ], async function () {
    const date = document.getElementById('edit-date').value;
    const desc = document.getElementById('edit-desc').value.trim();
    const amount = parseFloat(document.getElementById('edit-amount').value);
    if (!desc || isNaN(amount)) return alert('Please fill in description and amount.');
    const res = await apiPut('/expenses/' + r.id, { date: date, desc: desc, amount: amount });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderExpensePage();
    toast('Expense updated');
  });
}

async function renderDuesPage() {
  const dueDateEl = document.getElementById('due-date');
  if (dueDateEl && !dueDateEl.value) dueDateEl.value = new Date().toISOString().slice(0, 10);
  const dpaidDateEl = document.getElementById('dpaid-date');
  if (dpaidDateEl && !dpaidDateEl.value) dpaidDateEl.value = new Date().toISOString().slice(0, 10);

  const results = await Promise.all([apiGet('/dues'), apiGet('/due-paid')]);
  const outstanding = results[0], paid = results[1];
  outstanding.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  paid.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  window.__duesRows = outstanding;
  window.__paidRows = paid;

  const dtb = document.getElementById('dues-tbody');
  dtb.innerHTML = outstanding.length ? outstanding.map(function (r, i) {
    const rowRef = "window.__duesRows[" + i + "]";
    return '<tr class="clickable-row" onclick="viewDueEntry(' + rowRef + ",'due')\"><td>" + r.date + '</td><td style="font-weight:600">' + esc(r.party) + '</td><td style="color:var(--text-3);font-size:12.5px">' + (esc(r.note) || '—') + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty-state">No outstanding dues.</td></tr>';
  document.getElementById('dues-total-val').textContent = fmt(outstanding.reduce(function (s, r) { return s + r.amount; }, 0));

  const ptb = document.getElementById('paid-tbody');
  ptb.innerHTML = paid.length ? paid.map(function (r, i) {
    const rowRef = "window.__paidRows[" + i + "]";
    return '<tr class="clickable-row" onclick="viewDueEntry(' + rowRef + ",'paid')\"><td>" + r.date + '</td><td style="font-weight:600">' + esc(r.party) + '</td><td style="color:var(--text-3);font-size:12.5px">' + (esc(r.note) || '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty-state">No payments recorded.</td></tr>';
  document.getElementById('paid-total-val').textContent = fmt(paid.reduce(function (s, r) { return s + r.amount; }, 0));
}

function editDueEntry(r, table) {
  openEditModal(table === 'due-paid' ? 'Edit Payment' : 'Edit Due', [
    { key: 'date', label: 'Date', type: 'date', value: r.date },
    { key: 'party', label: 'Party', type: 'text', value: r.party },
    { key: 'amount', label: 'Amount (Tk)', type: 'number', value: r.amount },
    { key: 'note', label: 'Note', type: 'text', value: r.note }
  ], async function () {
    const date = document.getElementById('edit-date').value;
    const party = document.getElementById('edit-party').value.trim();
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const note = document.getElementById('edit-note').value.trim();
    if (!party || isNaN(amount)) return alert('Please fill in party and amount.');
    const res = await apiPut('/' + table + '/' + r.id, { date: date, party: party, amount: amount, note: note });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderDuesPage();
    toast('Entry updated');
  });
}

// ───────── Products ─────────
async function addProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const quantity = parseFloat(document.getElementById('prod-qty').value) || 0;
  const purchase_price = parseFloat(document.getElementById('prod-purchase').value) || 0;
  const sell_price = parseFloat(document.getElementById('prod-sell').value) || 0;
  const unit = document.getElementById('prod-unit').value || 'pcs';
  const barcode = document.getElementById('prod-barcode').value.trim();
  if (!name) return alert('Please enter a product name.');
  const res = await apiPost('/products', { name: name, quantity: quantity, purchase_price: purchase_price, sell_price: sell_price, unit: unit, barcode: barcode });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-qty').value = '';
  document.getElementById('prod-purchase').value = '';
  document.getElementById('prod-sell').value = '';
  document.getElementById('prod-barcode').value = '';
  toast('Product saved — barcode ' + res.barcode);
  renderProductsPage();
}

async function renderProductsPage() {
  products = await apiGet('/products');
  const searchEl = document.getElementById('prod-search');
  const search = (searchEl ? searchEl.value : '').toLowerCase();
  let list = products;
  if (search) list = list.filter(function (p) { return p.name.toLowerCase().includes(search) || p.barcode.toLowerCase().includes(search); });

  const isManager = currentRole === 'manager';
  const addProductSection = document.getElementById('add-product-section');
  if (addProductSection) addProductSection.style.display = isManager ? 'block' : 'none';

  const grid = document.getElementById('products-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-package-off"></i><br>No products found. Add one above.</div>';
    return;
  }
  grid.innerHTML = list.map(function (p) {
    const margin = p.sell_price - p.purchase_price;
    const lowStock = p.quantity <= 5;
    return '<div class="product-card">' +
      '<div class="pname">' + esc(p.name) + '</div>' +
      '<div class="pmeta"><span>' + esc(p.barcode) + '</span><span class="' + (lowStock ? 'stock-low' : '') + '">' + p.quantity + ' ' + esc(p.unit || 'pcs') + ' in stock</span></div>' +
      '<svg class="pbarcode-svg" data-barcode="' + esc(p.barcode) + '" style="background:#fff;border-radius:6px"></svg>' +
      '<div class="price-row"><span>Purchase</span><span class="v">' + fmt(p.purchase_price) + '</span></div>' +
      '<div class="price-row"><span>Sell</span><span class="v">' + fmt(p.sell_price) + '</span></div>' +
      '<div class="price-row"><span>Margin</span><span class="v" style="color:' + (margin >= 0 ? 'var(--ok)' : 'var(--danger)') + '">' + fmt(margin) + '</span></div>' +
      '<div class="actions">' +
      (isManager ? '<button onclick="editProduct(' + p.id + ')"><i class="ti ti-pencil"></i> Edit</button>' : '') +
      '<button onclick="openBarcodeModal(' + p.id + ')"><i class="ti ti-barcode"></i> Label</button>' +
      (isManager ? '<button class="danger" onclick="deleteProduct(' + p.id + ')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '</div></div>';
  }).join('');

  document.querySelectorAll('.pbarcode-svg').forEach(function (svg) {
    JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', width: 1.6, height: 38, fontSize: 12, margin: 6, background: '#ffffff', lineColor: '#000000', font: 'Roboto, Segoe UI, sans-serif' });
  });
}

function editProduct(id) {
  const p = products.find(function (x) { return x.id === id; });
  if (!p) return;
  openEditModal('Edit Product', [
    { key: 'name', label: 'Product Name', type: 'text', value: p.name },
    { key: 'quantity', label: 'Quantity', type: 'number', value: p.quantity },
    { key: 'unit', label: 'Unit (pcs, kg, l, etc.)', type: 'text', value: p.unit || 'pcs' },
    { key: 'purchase_price', label: 'Purchase Price (Tk)', type: 'number', value: p.purchase_price },
    { key: 'sell_price', label: 'Sell Price (Tk)', type: 'number', value: p.sell_price }
  ], async function () {
    const name = document.getElementById('edit-name').value.trim();
    const quantity = parseFloat(document.getElementById('edit-quantity').value) || 0;
    const unit = document.getElementById('edit-unit').value.trim() || 'pcs';
    const purchase_price = parseFloat(document.getElementById('edit-purchase_price').value) || 0;
    const sell_price = parseFloat(document.getElementById('edit-sell_price').value) || 0;
    if (!name) return alert('Please enter a product name.');
    const res = await apiPut('/products/' + id, { name: name, quantity: quantity, purchase_price: purchase_price, sell_price: sell_price, unit: unit });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderProductsPage();
    toast('Product updated');
  });
}

// ───────── Generic small edit modal ─────────
function openEditModal(title, fields, onSave) {
  const existing = document.getElementById('genericEditModal');
  if (existing) existing.remove();
  const fieldHtml = fields.map(function (f) {
    if (f.type === 'date') return '<div class="form-row"><label>' + esc(f.label) + '</label><input type="date" id="edit-' + f.key + '" value="' + esc(f.value || '') + '" /></div>';
    if (f.type === 'number') return '<div class="form-row"><label>' + esc(f.label) + '</label><input type="number" id="edit-' + f.key + '" value="' + esc(f.value) + '" min="0" step="0.01" /></div>';
    return '<div class="form-row"><label>' + esc(f.label) + '</label><input type="text" id="edit-' + f.key + '" value="' + esc(f.value || '') + '" /></div>';
  }).join('');
  const modal = document.createElement('div');
  modal.id = 'genericEditModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = '<div class="modal-box"><button class="modal-close" onclick="closeEditModal()"><i class="ti ti-x"></i></button>' +
    '<h3 style="margin:0 0 16px;font-size:16px">' + esc(title) + '</h3>' + fieldHtml +
    '<div class="modal-actions" style="margin-top:16px"><button class="btn-secondary" onclick="closeEditModal()">Cancel</button><button class="btn-save" style="width:auto;flex:1" id="generic-edit-save">Save changes</button></div></div>';
  document.body.appendChild(modal);
  document.getElementById('generic-edit-save').onclick = onSave;
}
function closeEditModal() {
  const modal = document.getElementById('genericEditModal');
  if (modal) modal.remove();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  const res = await apiDelete('/products/' + id);
  if (res && res.error) { alert(res.error); return; }
  renderProductsPage();
}

function openBarcodeModal(id) {
  const p = products.find(function (x) { return x.id === id; });
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
  content.innerHTML = '<div class="mp-name" style="font-size:' + nameSize + "px;font-family:'Roboto',sans-serif\">" + esc(p.name) + '</div><svg id="modal-barcode-svg"></svg>' +
    (showPrice ? '<div class="mp-price" style="font-size:' + priceSize + "px;font-weight:700;font-family:'Roboto',sans-serif\">Price: " + fmt(p.sell_price) + '</div>' : '');
  JsBarcode('#modal-barcode-svg', p.barcode, { format: 'CODE128', width: bcWidth, height: bcHeight, fontSize: Math.max(10, Math.round(bcHeight * 0.22)), margin: 8, background: '#ffffff', lineColor: '#000000', font: 'Roboto, Segoe UI, sans-serif' });
}

function closeBarcodeModal() {
  document.getElementById('barcodeModal').style.display = 'none';
  currentBarcodeProduct = null;
}

function printViaIframe(innerHtml, title) {
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
  doc.write('<html><head><title>' + esc(title) + '</title><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>' + innerHtml + '</body></html>');
  doc.close();

  const cleanup = function () { if (frame && frame.parentNode) frame.remove(); };
  frame.contentWindow.onafterprint = cleanup;
  setTimeout(cleanup, 8000);

  // Small delay lets the iframe finish laying out the content before the print dialog opens,
  // which avoids garbled/misaligned text on the printed page.
  setTimeout(function () {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }, 150);
}

function printBarcode() {
  if (!currentBarcodeProduct) return;
  const labelHtml = document.getElementById('modal-barcode-content').innerHTML;
  printViaIframe('<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;padding:30px">' + labelHtml + '</div>', 'Print label');
}

// ───────── Customers ─────────
async function addCustomer() {
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  if (!name) return alert('Please enter a customer name.');
  await apiPost('/customers', { name: name, phone: phone, address: address });
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-phone').value = '';
  document.getElementById('cust-address').value = '';
  toast('Customer saved');
  renderCustomersPage();
}

async function renderCustomersPage() {
  const list = await apiGet('/customers-summary');
  const searchEl = document.getElementById('cust-search');
  const search = (searchEl ? searchEl.value : '').toLowerCase();
  let filtered = list;
  if (search) filtered = list.filter(function (c) { return c.name.toLowerCase().includes(search) || (c.phone || '').toLowerCase().includes(search); });
  filtered.sort(function (a, b) { return b.id - a.id; });

  const isManager = currentRole === 'manager';
  const tb = document.getElementById('customers-tbody');
  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No customers found. Add one above.</td></tr>';
    return;
  }
  tb.innerHTML = filtered.map(function (c) {
    return '<tr style="cursor:pointer" onclick="openCustomerModal(' + c.id + ')"><td style="font-weight:600">' + esc(c.name) + '</td><td>' + (esc(c.phone) || '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(c.totalPurchased) + '</td><td class="num" style="color:' + (c.totalDue > 0 ? 'var(--warn)' : 'var(--text-3)') + '">' + (c.totalDue > 0 ? fmt(c.totalDue) : '—') + '</td><td>' +
      (isManager ? '<button class="del-btn" onclick="event.stopPropagation();deleteRow(\'customers\', ' + c.id + ', renderCustomersPage)"><i class="ti ti-trash"></i></button>' : '') + '</td></tr>';
  }).join('');
}

async function openCustomerModal(id) {
  const results = await Promise.all([apiGet('/customers-summary'), apiGet('/customers/' + id + '/bills')]);
  const summary = results[0], bills = results[1];
  const c = summary.find(function (x) { return x.id === id; });
  if (!c) return;
  currentCustomerForModal = c;
  window.__currentCustomerBills = bills;

  const content = document.getElementById('customer-modal-content');
  let billsHtml = '<div class="empty-state">No purchases yet.</div>';
  if (bills.length) {
    billsHtml = bills.map(function (b) {
      const safeBill = JSON.stringify(b).replace(/'/g, '&#39;');
      return '<div class="bill-history-item" onclick=\'openPosModalFromHistory(' + safeBill + ')\'><div class="bh-top"><span>' + (b.bill_no ? 'Bill #' + b.bill_no : 'Sale') + '</span><span>' + fmt(b.total) + '</span></div><div class="bh-sub">' + b.date + ' · ' + b.items.length + ' item' + (b.items.length > 1 ? 's' : '') + '</div></div>';
    }).join('');
  }
  content.innerHTML = '<div class="cust-detail-head"><div><div class="cd-name">' + esc(c.name) + '</div><div class="cd-meta">' + (esc(c.phone) || 'No phone') + (c.address ? ' · ' + esc(c.address) : '') + '</div></div></div>' +
    '<div class="cust-metric-row"><button type="button" class="metric-card metric-card-btn" onclick="openCustomerHistoryModal()"><div class="label">Total purchased <i class="ti ti-chevron-right" style="font-size:11px"></i></div><div class="value green">' + fmt(c.totalPurchased) + '</div></button><div class="metric-card"><div class="label">Outstanding due</div><div class="value ' + (c.totalDue > 0 ? 'amber' : '') + '">' + fmt(c.totalDue) + '</div></div><div class="metric-card"><div class="label">Bills</div><div class="value">' + c.billCount + '</div></div></div>' +
    '<div class="list-header" style="padding:0 0 10px"><i class="ti ti-history"></i> Purchase history</div>' +
    '<div id="cust-bill-history">' + billsHtml + '</div>';
  document.getElementById('customerModal').style.display = 'flex';
}

function openCustomerHistoryModal() {
  const c = currentCustomerForModal;
  const bills = window.__currentCustomerBills || [];
  if (!c) return;
  // Flatten every item across every bill, newest first
  const rows = [];
  bills.forEach(function (b) {
    b.items.forEach(function (it) {
      rows.push({ date: b.date, bill_no: b.bill_no, desc: it.desc, quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, id: it.id || 0 });
    });
  });
  rows.sort(function (a, b2) { return b2.date.localeCompare(a.date) || (b2.id - a.id); });

  const content = document.getElementById('customer-history-content');
  let rowsHtml = '<div class="empty-state">No purchases yet.</div>';
  if (rows.length) {
    rowsHtml = '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Bill</th><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.date) + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '—') + '</td><td>' + esc(r.desc) + '</td><td class="num">' + (r.quantity != null ? r.quantity : '—') + '</td><td class="num">' + (r.unit_price != null ? fmt(r.unit_price) : '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  content.innerHTML = '<h3 style="margin:0 0 4px;font-size:16px">' + esc(c.name) + ' — full purchase history</h3>' +
    '<div style="font-size:12.5px;color:var(--text-2);margin-bottom:16px">Every item purchased, sorted by most recent first</div>' + rowsHtml;
  document.getElementById('customerHistoryModal').style.display = 'flex';
}

function closeCustomerHistoryModal() {
  document.getElementById('customerHistoryModal').style.display = 'none';
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
  if (currentRole === 'manager') {
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
  // Profile picture
  renderProfilePic(settings.profile_picture || null);
  // Profile name display
  const nameEl = document.getElementById('profile-display-name');
  const roleEl = document.getElementById('profile-display-role');
  if (nameEl) nameEl.textContent = document.getElementById('topbar-user').textContent.split('·').pop().trim() || 'User';
  if (roleEl) roleEl.textContent = currentRole === 'manager' ? 'Manager' : 'Sales Staff';

  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-confirm').value = '';
}

function renderProfilePic(src) {
  const img = document.getElementById('profile-pic-img');
  const placeholder = document.getElementById('profile-pic-placeholder');
  if (img && placeholder) {
    if (src) {
      img.src = src; img.style.display = 'block'; placeholder.style.display = 'none';
    } else {
      img.style.display = 'none'; placeholder.style.display = 'flex';
    }
  }
  // Also update topbar if we add avatar there later
}

function handleProfilePicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB.'); return; }
  const reader = new FileReader();
  reader.onload = async function (e) {
    const base64 = e.target.result;
    renderProfilePic(base64);
    // Save to settings
    const existing = await apiGet('/settings');
    const patch = { ...existing, profile_picture: base64 };
    delete patch.id; delete patch.user_id;
    await apiPut('/settings', patch);
    settings.profile_picture = base64;
    toast('Profile photo saved');
  };
  reader.readAsDataURL(file);
}

async function removeProfilePic() {
  renderProfilePic(null);
  const existing = await apiGet('/settings');
  const patch = { ...existing, profile_picture: null };
  delete patch.id; delete patch.user_id;
  await apiPut('/settings', patch);
  settings.profile_picture = null;
  toast('Profile photo removed');
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
  const res = await apiPut('/settings', body);
  if (res && res.error) { alert(res.error); return; }
  settings = res;
  toast('Settings saved');
}

async function changePassword() {
  const currentPassword = document.getElementById('pw-current').value;
  const newPassword = document.getElementById('pw-new').value;
  const confirmPw = document.getElementById('pw-confirm').value;
  if (!currentPassword || !newPassword) return alert('Please fill in all password fields.');
  if (newPassword !== confirmPw) return alert('New passwords do not match.');
  if (newPassword.length < 6) return alert('New password must be at least 6 characters.');
  const res = await apiPost('/auth/change-password', { currentPassword: currentPassword, newPassword: newPassword });
  if (res.error) return alert(res.error);
  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-confirm').value = '';
  toast('Password updated successfully');
}

// ───────── Staff & Roles (manager only) ─────────
async function renderStaffPage() {
  const rows = await apiGet('/staff');
  const tb = document.getElementById('staff-tbody');
  if (!rows || !rows.length || rows.error) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state">No staff added yet.</td></tr>';
    return;
  }
  window.__staffRows = rows;
  tb.innerHTML = rows.map(function (s) {
    return '<tr><td style="font-weight:600">' + esc(s.name) + '</td><td>' + esc(s.phone) + '</td><td>' + (s.role === 'manager' ? '<i class="ti ti-user-circle"></i> Manager' : '<i class="ti ti-user"></i> Sales') + '</td><td style="white-space:nowrap"><button class="edit-btn" onclick="editStaff(' + s.id + ')" title="Edit"><i class="ti ti-pencil"></i></button><button class="del-btn" onclick="deleteStaff(' + s.id + ')" title="Delete"><i class="ti ti-trash"></i></button></td></tr>';
  }).join('');
}

async function addStaff() {
  const name = document.getElementById('staff-name').value.trim();
  const phone = document.getElementById('staff-add-phone').value.trim();
  const password = document.getElementById('staff-add-password').value;
  const role = document.getElementById('staff-role').value;
  if (!name || !phone || !password) return alert('Please fill in all fields.');
  if (password.length < 6) return alert('Password must be at least 6 characters.');
  const res = await apiPost('/staff', { name: name, phone: phone, password: password, role: role });
  if (res.error) return alert(res.error);
  document.getElementById('staff-name').value = '';
  document.getElementById('staff-add-phone').value = '';
  document.getElementById('staff-add-password').value = '';
  document.getElementById('staff-role').value = 'sales';
  toast('Staff member added');
  renderStaffPage();
}

function editStaff(id) {
  const list = window.__staffRows || [];
  let s = null;
  for (let i = 0; i < list.length; i++) if (list[i].id === id) s = list[i];
  if (!s) return;
  const existing = document.getElementById('genericEditModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'genericEditModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = '<div class="modal-box"><button class="modal-close" onclick="closeEditModal()"><i class="ti ti-x"></i></button>' +
    '<h3 style="margin:0 0 16px;font-size:16px">Edit Staff</h3>' +
    '<div class="form-row"><label>Name</label><input type="text" id="edit-staff-name" value="' + esc(s.name) + '" /></div>' +
    '<div class="form-row"><label>Role</label><select id="edit-staff-role"><option value="sales"' + (s.role !== 'manager' ? ' selected' : '') + '>Sales (view only, can sell)</option><option value="manager"' + (s.role === 'manager' ? ' selected' : '') + '>Manager (full access)</option></select></div>' +
    '<div class="form-row"><label>New password (leave blank to keep current)</label><input type="password" id="edit-staff-password" placeholder="At least 6 characters" /></div>' +
    '<div class="modal-actions" style="margin-top:16px"><button class="btn-secondary" onclick="closeEditModal()">Cancel</button><button class="btn-save" style="width:auto;flex:1" id="staff-edit-save">Save changes</button></div></div>';
  document.body.appendChild(modal);
  document.getElementById('staff-edit-save').onclick = async function () {
    const name = document.getElementById('edit-staff-name').value.trim();
    const role = document.getElementById('edit-staff-role').value;
    const password = document.getElementById('edit-staff-password').value;
    if (!name) return alert('Please enter a name.');
    if (password && password.length < 6) return alert('Password must be at least 6 characters.');
    const res = await apiPut('/staff/' + id, { name: name, role: role, password: password });
    if (res.error) return alert(res.error);
    closeEditModal();
    renderStaffPage();
    toast('Staff updated');
  };
}

async function deleteStaff(id) {
  if (!confirm('Delete this staff member? They will no longer be able to log in.')) return;
  await apiDelete('/staff/' + id);
  toast('Staff member removed');
  renderStaffPage();
}

// ───────── POS bill ─────────
function buildPosBillHtml(bill, widthMm) {
  const s = settings;
  const dt = new Date(bill.date + 'T00:00:00');
  const dateStr = isNaN(dt.getTime()) ? bill.date : dt.toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const billNoStr = bill.billNo != null ? String(bill.billNo).padStart(6, '0') : '—';
  const itemsHtml = bill.items.map(function (it) {
    return '<tr><td style="padding:3px 2px;vertical-align:top;word-break:break-word;width:40%">' + esc(it.desc) + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:15%">' + it.quantity + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:20%">' + fmt(it.unit_price != null ? it.unit_price : (it.amount / (it.quantity || 1))) + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:25%">' + fmt(it.amount) + '</td></tr>';
  }).join('');
  const totalQty = bill.items.reduce(function (s2, it) { return s2 + Number(it.quantity || 0); }, 0);
  const widthPx = Math.round(widthMm * 3.7795);
  const baseFont = widthMm <= 58 ? '11px' : '12px';
  const customerPhone = (bill.customer && bill.customer.phone) ? bill.customer.phone : '';

  return '<div style="width:' + widthPx + 'px;max-width:100%;background:#fff;color:#111;font-family:Roboto,Arial,sans-serif;font-size:' + baseFont + ';padding:14px 12px;box-sizing:border-box">' +
    '<div style="text-align:center">' +
    '<div style="font-weight:700;word-break:break-word;font-size:' + (s.nameFontSize || 14) + 'px">' + esc(s.businessName || 'My Business') + '</div>' +
    '<div style="font-size:12px;margin:2px 0;word-break:break-word">' + esc(s.address || '') + '</div>' +
    (s.phone ? '<div style="font-size:12px;margin:2px 0">' + esc(s.phone) + '</div>' : '') +
    (s.gst ? '<div style="font-size:12px;margin:2px 0">GST# ' + esc(s.gst) + '</div>' : '') +
    '<div style="font-weight:700;text-decoration:underline;margin:10px 0">Retail Invoice</div></div>' +
    '<div style="font-size:12px;margin:2px 0">Bill# ' + billNoStr + '</div>' +
    '<div style="font-size:12px;margin:2px 0">Date  ' + dateStr + '</div>' +
    (bill.customer && bill.customer.name ? '<div style="font-size:12px;margin:2px 0">Customer  ' + esc(bill.customer.name) + '</div>' : '') +
    (customerPhone ? '<div style="font-size:12px;margin:2px 0">Phone  ' + esc(customerPhone) + '</div>' : '') +
    '<div style="border-top:1px dashed #000;margin:8px 0"></div>' +
    '<table style="width:100%;font-size:' + baseFont + ';border-collapse:collapse;table-layout:fixed">' +
    '<thead><tr>' +
    '<th style="text-align:left;padding:3px 2px;font-weight:700;width:40%">Item</th>' +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:15%">Qty</th>' +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:20%">Rate</th>' +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:25%">Amount</th>' +
    '</tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
    '<div style="border-top:1px dashed #000;margin:8px 0"></div>' +
    '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:' + (s.priceFontSize ? s.priceFontSize + 4 : 17) + 'px;padding:4px 0"><span>TOTAL</span><span>' + fmt(bill.total) + '</span></div>' +
    '<div style="font-size:' + (s.priceFontSize || 13) + 'px;font-weight:700">' +
    '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>Paid</span><span>' + fmt(bill.amountPaid) + '</span></div>' +
    (bill.dueAmount > 0 ? '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>Due</span><span>' + fmt(bill.dueAmount) + '</span></div>' : '') +
    '</div>' +
    '<div style="border-top:1px dashed #000;margin:8px 0"></div>' +
    '<div style="font-size:12px;margin:2px 0">No of items: ' + bill.items.length + ', Total quantity: ' + totalQty + '</div>' +
    '<div style="text-align:center;font-weight:700;margin-top:12px;font-size:12.5px;word-break:break-word">' + esc(s.note || 'Thank you for your visit!') + '</div>' +
    '</div>';
}

// ───────── Bill format: Thermal 58mm / 80mm / A4 Invoice ─────────
let currentBillFormat = 'thermal80'; // default

function setBillFormat(format) {
  currentBillFormat = format;
  ['thermal58', 'thermal80', 'a4'].forEach(function (f) {
    const btn = document.getElementById('fmt-' + f);
    if (btn) btn.classList.toggle('active', f === format);
  });
  if (lastBillForPrint) refreshPosPreview();
}

function refreshPosPreview() {
  const el = document.getElementById('pos-bill-content');
  if (!el) return;
  if (currentBillFormat === 'a4') {
    el.innerHTML = buildA4InvoiceHtml(lastBillForPrint);
  } else {
    el.innerHTML = buildPosBillHtml(lastBillForPrint, currentBillFormat === 'thermal58' ? 58 : 80);
  }
}

// A4 formal invoice builder
function buildA4InvoiceHtml(bill) {
  const s = settings;
  const dt = new Date(bill.date + 'T00:00:00');
  const dateStr = isNaN(dt.getTime()) ? bill.date : dt.toLocaleDateString('en-GB');
  const billNoStr = bill.billNo != null ? String(bill.billNo).padStart(6, '0') : '—';
  const itemsHtml = bill.items.map(function (it, idx) {
    const unitPrice = it.unit_price != null ? it.unit_price : (it.amount / (it.quantity || 1));
    return '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e5e8ed;font-size:13px">' + (idx + 1) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e5e8ed;font-size:13px">' + (it.desc || '') + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e5e8ed;text-align:center;font-size:13px">' + it.quantity + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e5e8ed;text-align:right;font-size:13px">' + fmtPlain(unitPrice) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e5e8ed;text-align:right;font-size:13px;font-weight:600">' + fmtPlain(it.amount) + '</td>' +
      '</tr>';
  }).join('');

  return '<div style="background:#fff;font-family:Roboto,Arial,sans-serif;padding:36px 40px;max-width:700px;margin:0 auto;box-sizing:border-box;font-size:14px;color:#222">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">' +
    '<div>' +
    '<div style="font-size:26px;font-weight:800;color:#1b3a6b;letter-spacing:-0.5px">' + (s.businessName || 'BizSheba') + '</div>' +
    (s.address ? '<div style="color:#666;margin-top:4px;font-size:13px">' + (s.address || '') + '</div>' : '') +
    (s.phone ? '<div style="color:#666;font-size:13px">' + (s.phone) + '</div>' : '') +
    (s.gst ? '<div style="color:#666;font-size:13px">GST# ' + (s.gst) + '</div>' : '') +
    '</div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:22px;font-weight:700;color:#2f6fd0;letter-spacing:1px">INVOICE</div>' +
    '<div style="margin-top:6px;font-size:13px;color:#666"># <strong style="color:#222">' + billNoStr + '</strong></div>' +
    '<div style="font-size:13px;color:#666">Date: <strong style="color:#222">' + dateStr + '</strong></div>' +
    '</div></div>' +
    '<div style="height:2px;background:linear-gradient(90deg,#1b3a6b,#2aa9c9);border-radius:2px;margin-bottom:20px"></div>' +
    (bill.customer && bill.customer.name ? '<div style="background:#f3f7fb;border-radius:8px;padding:12px 16px;margin-bottom:20px">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:4px">Bill To</div>' +
    '<div style="font-weight:700;font-size:14px">' + (bill.customer.name || '') + '</div>' +
    (bill.customer.phone ? '<div style="color:#666;font-size:13px">' + bill.customer.phone + '</div>' : '') +
    '</div>' : '') +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:20px">' +
    '<thead><tr style="background:#f3f7fb">' +
    '<th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:600">#</th>' +
    '<th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:600">Item</th>' +
    '<th style="padding:10px 14px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:600">Qty</th>' +
    '<th style="padding:10px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:600">Unit Price</th>' +
    '<th style="padding:10px 14px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:600">Amount (Tk)</th>' +
    '</tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:24px">' +
    '<div style="min-width:240px">' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e8ed;font-size:13px"><span style="color:#666">Subtotal</span><span>' + fmtPlain(bill.total) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e8ed;font-size:13px"><span style="color:#666">Amount Paid</span><span style="color:#15a07a;font-weight:600">' + fmtPlain(bill.amountPaid) + '</span></div>' +
    (bill.dueAmount > 0 ? '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e8ed;font-size:13px"><span style="color:#666">Balance Due</span><span style="color:#d2890c;font-weight:600">' + fmtPlain(bill.dueAmount) + '</span></div>' : '') +
    '<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;color:#1b3a6b"><span>TOTAL</span><span>' + fmtPlain(bill.total) + ' Tk</span></div>' +
    '</div></div>' +
    '<div style="border-top:1px solid #e5e8ed;padding-top:16px;text-align:center;color:#888;font-size:12.5px">' + (s.note || 'Thank you for your business!') + '</div>' +
    '</div>';
}

async function openPosModal(bill) {
  if (!settings || !settings.businessName) settings = await apiGet('/settings');
  lastBillForPrint = bill;
  // Default format based on settings
  if (!currentBillFormat) currentBillFormat = 'thermal' + (settings.posWidthMm || 80);
  refreshPosPreview();
  document.getElementById('posModal').style.display = 'flex';
}

function closePosModal() {
  document.getElementById('posModal').style.display = 'none';
}

function printPosBill() {
  if (!lastBillForPrint) return;
  let html;
  if (currentBillFormat === 'a4') {
    html = '<div style="display:flex;justify-content:center;padding:20px;background:#fff">' + buildA4InvoiceHtml(lastBillForPrint) + '</div>';
  } else {
    const widthMm = currentBillFormat === 'thermal58' ? 58 : 80;
    html = '<div style="display:flex;justify-content:center;padding:6px 0;background:#fff">' + buildPosBillHtml(lastBillForPrint, widthMm) + '</div>';
  }
  printViaIframe(html, 'Print bill');
}

// ───────── Dashboard ─────────
let barChart = null, donutChart = null;
async function renderDashboard() {
  const results = await Promise.all([apiGet('/summary'), apiGet('/sales'), apiGet('/expenses'), apiGet('/dues')]);
  const summary = results[0], sales = results[1], expenses = results[2], dues = results[3];
  const profit = summary.netProfit;

  document.getElementById('dash-metrics').innerHTML =
    '<div class="metric-card grad grad-blue"><div class="label">Total sales</div><div class="value">' + fmt(summary.totalSales) + '</div></div>' +
    '<div class="metric-card grad grad-cyan"><div class="label">Net profit</div><div class="value">' + fmt(profit) + '</div></div>' +
    '<div class="metric-card grad grad-teal"><div class="label">Outstanding dues</div><div class="value">' + fmt(summary.totalDues) + '</div></div>' +
    '<div class="metric-card"><div class="label">Cost of goods sold</div><div class="value">' + fmt(summary.totalCOGS) + '</div></div>' +
    '<div class="metric-card"><div class="label">Total expenses</div><div class="value red">' + fmt(summary.totalExpenses) + '</div></div>' +
    '<div class="metric-card"><div class="label">Dues collected</div><div class="value">' + fmt(summary.totalDuePaid) + '</div></div>' +
    '<div class="metric-card"><div class="label">Products' + (summary.lowStockCount ? ' · low stock' : '') + '</div><div class="value ' + (summary.lowStockCount ? 'red' : '') + '">' + summary.productCount + (summary.lowStockCount ? ' (' + summary.lowStockCount + ')' : '') + '</div></div>';

  const last = function (arr) { return arr.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(-7).map(function (r) { return { x: r.date.slice(5), y: r.amount }; }); };
  const lastSales = last(sales), lastExp = last(expenses), lastDues = last(dues);
  const labelSet = {};
  lastSales.concat(lastExp, lastDues).forEach(function (r) { labelSet[r.x] = true; });
  const labels = Object.keys(labelSet).sort();
  const vals = function (arr) { return labels.map(function (l) { const found = arr.find(function (r) { return r.x === l; }); return found ? found.y : 0; }); };

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('dashChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
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
        y: { grid: { color: 'rgba(128,128,128,0.12)' }, ticks: { font: { size: 11 }, callback: function (v) { return 'Tk' + v; } } }
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

// ───────── Admin Panel ─────────
async function renderAdminPage() {
  const rows = await apiGet('/admin/users');
  const tb = document.getElementById('admin-users-tbody');
  if (!rows || !rows.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No users found.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(function (u) {
    const statusColor = u.status === 'approved' ? 'var(--ok)' : u.status === 'rejected' ? 'var(--danger)' : 'var(--warn)';
    const statusLabel = u.status === 'approved' ? '<i class="ti ti-circle-check" style="color:var(--ok)"></i> Approved' : u.status === 'rejected' ? '<i class="ti ti-circle-x" style="color:var(--danger)"></i> Rejected' : '<i class="ti ti-clock" style="color:var(--warn)"></i> Pending';
    let expiryLabel = '—';
    if (u.is_admin) expiryLabel = '∞';
    else if (u.status === 'approved') {
      if (u.isExpired) expiryLabel = '<span style="color:var(--danger);font-weight:600">Expired</span>';
      else expiryLabel = '<span style="color:' + (u.daysLeft <= 5 ? 'var(--danger)' : 'var(--text)') + '">' + u.daysLeft + ' day' + (u.daysLeft === 1 ? '' : 's') + ' left</span>';
    }
    return '<tr><td style="font-weight:600">' + esc(u.username) + '</td><td>' + (esc(u.phone) || '—') + '</td><td><span style="color:' + statusColor + ';font-weight:600">' + statusLabel + '</span></td><td>' + expiryLabel + '</td><td>' + (u.is_admin ? '<i class="ti ti-shield-check"></i> Admin' : '<i class="ti ti-user-circle"></i> User') + '</td><td style="white-space:nowrap">' +
      (u.status !== 'approved' ? '<button class="edit-btn" onclick="adminApprove(' + u.id + ')" title="Approve" style="color:var(--ok)"><i class="ti ti-check"></i> Approve</button>' : '') +
      (u.status !== 'rejected' && !u.is_admin ? '<button class="edit-btn" onclick="adminReject(' + u.id + ')" title="Reject" style="color:var(--warn)"><i class="ti ti-x"></i> Reject</button>' : '') +
      (!u.is_admin && u.status === 'approved' ? '<button class="edit-btn" onclick="adminRenew(' + u.id + ')" title="Renew 30 days" style="color:var(--info)"><i class="ti ti-refresh"></i> Renew</button>' : '') +
      (!u.is_admin ? '<button class="del-btn" onclick="adminDelete(' + u.id + ')" title="Delete"><i class="ti ti-trash"></i></button>' : '') +
      '</td></tr>';
  }).join('');
}

async function adminApprove(userId) {
  await apiPost('/admin/approve', { userId: userId });
  toast('Business approved — 30 day trial started');
  renderAdminPage();
}

async function adminReject(userId) {
  if (!confirm('Reject this business?')) return;
  await apiPost('/admin/reject', { userId: userId });
  toast('Business rejected');
  renderAdminPage();
}

async function adminRenew(userId) {
  if (!confirm('Renew this business for another 30 days?')) return;
  await apiPost('/admin/renew', { userId: userId, days: 30 });
  toast('Renewed for 30 days');
  renderAdminPage();
}

async function adminDelete(userId) {
  if (!confirm('Delete this business permanently? All their data (sales, products, staff, etc.) will be erased. This cannot be undone.')) return;
  await fetch('/api/admin/users/' + userId, { method: 'DELETE' });
  toast('Business deleted');
  renderAdminPage();
}

// ═══════════════════════════════════════════════════════
//  STAGE 2 — FULL ERP MODULES
// ═══════════════════════════════════════════════════════

// ───────── Suppliers ─────────
async function addSupplier() {
  const name = document.getElementById('sup-name').value.trim();
  const phone = document.getElementById('sup-phone').value.trim();
  const address = document.getElementById('sup-address').value.trim();
  if (!name) return alert('Please enter a supplier name.');
  const res = await apiPost('/suppliers', { name: name, phone: phone, address: address });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('sup-name').value = '';
  document.getElementById('sup-phone').value = '';
  document.getElementById('sup-address').value = '';
  toast('Supplier saved');
  renderSuppliersPage();
}

async function renderSuppliersPage() {
  const isManager = currentRole === 'manager';
  const formSection = document.getElementById('supplier-form-section');
  if (formSection) formSection.style.display = isManager ? 'block' : 'none';
  const list = await apiGet('/suppliers-summary');
  const search = (document.getElementById('sup-search').value || '').toLowerCase();
  let filtered = list;
  if (search) filtered = list.filter(function (s) { return s.name.toLowerCase().includes(search) || (s.phone || '').toLowerCase().includes(search); });
  filtered.sort(function (a, b) { return b.id - a.id; });
  const tb = document.getElementById('suppliers-tbody');
  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state">No suppliers found.</td></tr>';
    return;
  }
  window.__suppliersRows = filtered;
  tb.innerHTML = filtered.map(function (s) {
    return '<tr class="clickable-row" onclick="viewSupplier(' + s.id + ')"><td style="font-weight:600">' + esc(s.name) + '</td><td>' + (esc(s.phone) || '—') + '</td><td class="num">' + fmt(s.totalPurchased) + '</td><td class="num" style="color:' + (s.totalDue > 0 ? 'var(--warn)' : 'var(--text-3)') + '">' + (s.totalDue > 0 ? fmt(s.totalDue) : '—') + '</td></tr>';
  }).join('');
}

function viewSupplier(id) {
  const s = (window.__suppliersRows || []).find(function (x) { return x.id === id; });
  if (!s) return;
  const isManager = currentRole === 'manager';
  const actions = [];
  if (isManager && s.totalDue > 0) actions.push({ label: 'Pay due', icon: 'ti-cash', onclick: 'closeViewEntryModal();paySupplierDue(' + s.id + ',"' + esc(s.name).replace(/"/g, '&quot;') + '",' + s.totalDue + ')' });
  if (isManager) actions.push({ label: 'Edit', icon: 'ti-pencil', onclick: 'closeViewEntryModal();editSupplier(' + s.id + ')' });
  if (isManager) actions.push({ label: 'Delete', icon: 'ti-trash', danger: true, onclick: 'closeViewEntryModal();deleteRow(\'suppliers\',' + s.id + ',renderSuppliersPage)' });
  openViewEntryModal('Supplier — ' + esc(s.name), [
    { label: 'Phone', value: esc(s.phone) || '—' },
    { label: 'Address', value: esc(s.address) || '—' },
    { label: 'Total purchased', value: fmt(s.totalPurchased) },
    { label: 'Purchases', value: s.purchaseCount },
    { label: 'You owe (due)', value: '<span style="color:' + (s.totalDue > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + fmt(s.totalDue) + '</span>' }
  ], actions.length ? actions : null);
}

function editSupplier(id) {
  const s = (window.__suppliersRows || []).find(function (x) { return x.id === id; });
  if (!s) return;
  openEditModal('Edit Supplier', [
    { key: 'name', label: 'Name', type: 'text', value: s.name },
    { key: 'phone', label: 'Phone', type: 'text', value: s.phone },
    { key: 'address', label: 'Address', type: 'text', value: s.address }
  ], async function () {
    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const address = document.getElementById('edit-address').value.trim();
    if (!name) return alert('Please enter a name.');
    const res = await apiPut('/suppliers/' + id, { name: name, phone: phone, address: address });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderSuppliersPage();
    toast('Supplier updated');
  });
}

async function paySupplierDue(id, name, maxDue) {
  openEditModal('Pay supplier due — ' + name, [
    { key: 'date', label: 'Date', type: 'date', value: new Date().toISOString().slice(0, 10) },
    { key: 'amount', label: 'Amount paying (Tk)', type: 'number', value: maxDue },
    { key: 'note', label: 'Note', type: 'text', value: '' }
  ], async function () {
    const date = document.getElementById('edit-date').value;
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const note = document.getElementById('edit-note').value.trim();
    if (isNaN(amount) || amount <= 0) return alert('Please enter a valid amount.');
    const res = await apiPost('/supplier-due-paid', { date: date, party: name, supplier_id: id, amount: amount, note: note });
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    renderSuppliersPage();
    toast('Payment recorded');
  });
}

function openQuickAddSupplier() {
  document.getElementById('qs-name').value = '';
  document.getElementById('qs-phone').value = '';
  document.getElementById('qs-address').value = '';
  document.getElementById('quickSupplierModal').style.display = 'flex';
}
function closeQuickAddSupplier() {
  document.getElementById('quickSupplierModal').style.display = 'none';
}
async function submitQuickAddSupplier() {
  const name = document.getElementById('qs-name').value.trim();
  const phone = document.getElementById('qs-phone').value.trim();
  const address = document.getElementById('qs-address').value.trim();
  if (!name) return alert('Please enter a supplier name.');
  const res = await apiPost('/suppliers', { name: name, phone: phone, address: address });
  if (res && res.error) { alert(res.error); return; }
  selectedPurchaseSupplier = { id: res.id, name: name, phone: phone };
  const searchEl = document.getElementById('pur-supplier-search');
  if (searchEl) {
    document.getElementById('pur-supplier').value = res.id;
    searchEl.value = name + (phone ? ' — ' + phone : '');
  }
  closeQuickAddSupplier();
  toast('Supplier added');
}

// ───────── Purchases ─────────
let purchaseCart = [];
let purPayMode = 'full';
let selectedPurchaseSupplier = null;

function setupPurchasePage() {
  const dateEl = document.getElementById('pur-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  wireSearchPicker('pur-supplier-search', 'pur-supplier-results', searchSuppliersApi, renderSupplierSearchItem, function (s) {
    selectedPurchaseSupplier = s;
    document.getElementById('pur-supplier').value = s.id;
    document.getElementById('pur-supplier-search').value = s.name + (s.phone ? ' — ' + s.phone : '');
  }, { showOnEmpty: true, emptyText: 'No suppliers yet — use "Add new supplier"' });

  const supInput = document.getElementById('pur-supplier-search');
  if (supInput) supInput.addEventListener('input', function () {
    if (!supInput.value.trim()) { selectedPurchaseSupplier = null; document.getElementById('pur-supplier').value = ''; }
  });

  wireSearchPicker('pur-product-search', 'pur-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    document.getElementById('pur-product').value = p.id;
    document.getElementById('pur-desc').value = p.name;
    document.getElementById('pur-cost').value = (Number(p.purchase_price) || 0).toFixed(2);
    document.getElementById('pur-product-search').value = '';
    document.getElementById('pur-qty').focus();
  }, { showOnEmpty: true, emptyText: 'No products found — you can type a custom item' });
}

function renderPurchasePage() {
  renderPurchaseCart();
}

function addPurchaseItem() {
  const productId = document.getElementById('pur-product').value || null;
  const desc = document.getElementById('pur-desc').value.trim();
  const qty = parseFloat(document.getElementById('pur-qty').value);
  const unitCost = parseFloat(document.getElementById('pur-cost').value);
  if (!desc) return alert('Please enter or search for a product.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(unitCost) || unitCost < 0) return alert('Please enter a valid unit cost.');
  purchaseCart.push({ product_id: productId, desc: desc, quantity: qty, unit_cost: unitCost, amount: qty * unitCost, updatePurchasePrice: true });
  document.getElementById('pur-product').value = '';
  document.getElementById('pur-desc').value = '';
  document.getElementById('pur-qty').value = '1';
  document.getElementById('pur-cost').value = '';
  renderPurchaseCart();
}

function removePurchaseItem(idx) {
  purchaseCart.splice(idx, 1);
  renderPurchaseCart();
}

function renderPurchaseCart() {
  const tb = document.getElementById('pur-tbody');
  if (!purchaseCart.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No items added yet.</td></tr>';
  } else {
    tb.innerHTML = purchaseCart.map(function (it, i) {
      return '<tr><td>' + esc(it.desc) + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmtPlain(it.unit_cost) + '</td><td class="num" style="font-weight:600">' + fmtPlain(it.amount) + '</td><td><button class="cart-row-remove" onclick="removePurchaseItem(' + i + ')"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('');
  }
  const total = purchaseCart.reduce(function (s, it) { return s + it.amount; }, 0);
  document.getElementById('pur-total-val').textContent = fmt(total);
  updatePurPayPreview();
}

function setPurPayMode(mode) {
  purPayMode = mode;
  ['full', 'partial', 'due'].forEach(function (m) {
    document.getElementById('pur-pay-' + m).classList.toggle('active', m === mode);
  });
  document.getElementById('pur-paid-row').style.display = mode === 'partial' ? 'flex' : 'none';
  updatePurPayPreview();
}

function updatePurPayPreview() {
  const total = purchaseCart.reduce(function (s, it) { return s + it.amount; }, 0);
  let amountPaid = 0;
  if (purPayMode === 'full') amountPaid = total;
  if (purPayMode === 'due') amountPaid = 0;
  if (purPayMode === 'partial') amountPaid = parseFloat(document.getElementById('pur-amount-paid').value) || 0;
  const due = Math.max(0, total - amountPaid);
  const preview = document.getElementById('pur-due-preview');
  if (due > 0) { preview.style.display = 'flex'; document.getElementById('pur-due-val').textContent = fmt(due); }
  else preview.style.display = 'none';
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'pur-amount-paid') updatePurPayPreview();
});

async function savePurchase() {
  if (!purchaseCart.length) return alert('Add at least one item to the purchase.');
  const total = purchaseCart.reduce(function (s, it) { return s + it.amount; }, 0);
  let amountPaid = total;
  if (purPayMode === 'due') amountPaid = 0;
  if (purPayMode === 'partial') {
    amountPaid = parseFloat(document.getElementById('pur-amount-paid').value);
    if (isNaN(amountPaid) || amountPaid < 0) return alert('Please enter a valid amount paid.');
    if (amountPaid > total) amountPaid = total;
  }
  const supplierId = document.getElementById('pur-supplier').value || null;
  const date = document.getElementById('pur-date').value || new Date().toISOString().slice(0, 10);
  const res = await apiPost('/purchases', {
    date: date, supplier_id: supplierId, supplierName: selectedPurchaseSupplier ? selectedPurchaseSupplier.name : '',
    amountPaid: amountPaid, items: purchaseCart.map(function (it) {
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_cost: it.unit_cost, amount: it.amount, updatePurchasePrice: it.updatePurchasePrice };
    })
  });
  if (res && res.error) { alert(res.error); return; }
  purchaseCart = [];
  renderPurchaseCart();
  selectedPurchaseSupplier = null;
  document.getElementById('pur-supplier').value = '';
  document.getElementById('pur-supplier-search').value = '';
  document.getElementById('pur-amount-paid').value = '';
  setPurPayMode('full');
  toast('Purchase #' + res.purchaseNo + ' saved · stock updated');
}

async function renderPurchaseListPage() {
  const search = (document.getElementById('purchaselist-search').value || '').toLowerCase();
  let rows = await apiGet('/purchases');
  rows.sort(function (a, b) { return b.id - a.id; });
  if (search) rows = rows.filter(function (r) {
    return (r.supplier_name || '').toLowerCase().includes(search) || (r.purchase_no ? String(r.purchase_no) : '').includes(search);
  });
  window.__purchaseRows = rows;
  const tb = document.getElementById('purchaselist-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No purchases found.</td></tr>';
    document.getElementById('purchaselist-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(function (r, i) {
    return '<tr class="clickable-row" onclick="viewPurchase(' + i + ')"><td>' + r.date + '</td><td>#' + String(r.purchase_no || 0).padStart(5, '0') + '</td><td>' + (esc(r.supplier_name) || '<span style="color:var(--text-3)">—</span>') + '</td><td class="num">' + fmt(r.total) + '</td><td class="num" style="color:' + (r.due_amount > 0 ? 'var(--warn)' : 'var(--text-3)') + '">' + (r.due_amount > 0 ? fmt(r.due_amount) : '—') + '</td></tr>';
  }).join('');
  document.getElementById('purchaselist-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.total); }, 0));
}

async function viewPurchase(idx) {
  const r = (window.__purchaseRows || [])[idx];
  if (!r) return;
  const items = await apiGet('/purchases/' + r.id + '/items');
  let itemsHtml = '';
  if (items && items.length) {
    itemsHtml = '<div class="list-header" style="padding:14px 0 8px"><i class="ti ti-package"></i> Items</div><div class="table-scroll"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td>' + esc(it.desc) + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmt(it.unit_cost) + '</td><td class="num">' + fmt(it.amount) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  const isManager = currentRole === 'manager';
  const content = document.getElementById('view-entry-content');
  let actionsHtml = '';
  if (isManager) {
    actionsHtml = '<div class="modal-actions" style="margin-top:18px"><button class="btn-secondary danger-text" onclick="closeViewEntryModal();deletePurchase(' + r.id + ')"><i class="ti ti-trash"></i> Delete purchase</button></div>';
  }
  content.innerHTML = '<h3 style="margin:0 0 16px;font-size:16px">Purchase #' + String(r.purchase_no || 0).padStart(5, '0') + '</h3>' +
    [['Date', esc(r.date)], ['Supplier', esc(r.supplier_name) || '—'], ['Total', fmt(r.total)], ['Paid', fmt(r.amount_paid)], ['Due', '<span style="color:' + (r.due_amount > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + fmt(r.due_amount) + '</span>']].map(function (row) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px"><span style="color:var(--text-2)">' + row[0] + '</span><span style="font-weight:600;text-align:right">' + row[1] + '</span></div>';
    }).join('') + itemsHtml + actionsHtml;
  document.getElementById('viewEntryModal').style.display = 'flex';
}

async function deletePurchase(id) {
  if (!confirm('Delete this purchase record? Note: stock already added will NOT be automatically removed.')) return;
  const res = await apiDelete('/purchases/' + id);
  if (res && res.error) { alert(res.error); return; }
  toast('Purchase deleted');
  renderPurchaseListPage();
}

// ───────── Sales Returns ─────────
function setupSalesReturnPicker() {
  wireSearchPicker('sr-product-search', 'sr-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    document.getElementById('sr-product').value = p.id;
    document.getElementById('sr-desc').value = p.name;
    document.getElementById('sr-price').value = (Number(p.sell_price) || 0).toFixed(2);
    document.getElementById('sr-product-search').value = p.name;
  }, { showOnEmpty: true, emptyText: 'No products found' });
}

async function addSalesReturn() {
  const date = document.getElementById('sr-date').value || new Date().toISOString().slice(0, 10);
  const productId = document.getElementById('sr-product').value || null;
  const desc = document.getElementById('sr-desc').value.trim();
  const qty = parseFloat(document.getElementById('sr-qty').value);
  const price = parseFloat(document.getElementById('sr-price').value);
  const billNo = document.getElementById('sr-billno').value.trim();
  const note = document.getElementById('sr-note').value.trim();
  if (!desc) return alert('Please enter what was returned.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(price) || price < 0) return alert('Please enter a valid unit price.');
  const res = await apiPost('/sales-returns', {
    date: date, product_id: productId, desc: desc, quantity: qty, unit_price: price,
    amount: qty * price, bill_no: billNo || null, note: note
  });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('sr-product').value = '';
  document.getElementById('sr-product-search').value = '';
  document.getElementById('sr-desc').value = '';
  document.getElementById('sr-qty').value = '';
  document.getElementById('sr-price').value = '';
  document.getElementById('sr-billno').value = '';
  document.getElementById('sr-note').value = '';
  toast('Return recorded · stock restored');
  renderSalesReturnsPage();
}

async function renderSalesReturnsPage() {
  const dateEl = document.getElementById('sr-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  setupSalesReturnPicker();
  const isManager = currentRole === 'manager';
  const formSection = document.getElementById('salesreturn-form-section');
  if (formSection) formSection.style.display = isManager ? 'block' : 'none';
  const rows = await apiGet('/sales-returns');
  rows.sort(function (a, b) { return b.id - a.id; });
  const tb = document.getElementById('salesreturns-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No sales returns yet.</td></tr>';
    document.getElementById('salesreturns-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(function (r) {
    return '<tr><td>' + r.date + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '—') + '</td><td>' + esc(r.description) + '</td><td class="num">' + r.quantity + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td></tr>';
  }).join('');
  document.getElementById('salesreturns-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

// ───────── Purchase Returns ─────────
function setupPurchaseReturnPickers() {
  wireSearchPicker('pr-supplier-search', 'pr-supplier-results', searchSuppliersApi, renderSupplierSearchItem, function (s) {
    document.getElementById('pr-supplier').value = s.id;
    document.getElementById('pr-supplier-search').value = s.name + (s.phone ? ' — ' + s.phone : '');
  }, { showOnEmpty: true, emptyText: 'No suppliers found' });
  wireSearchPicker('pr-product-search', 'pr-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    document.getElementById('pr-product').value = p.id;
    document.getElementById('pr-desc').value = p.name;
    document.getElementById('pr-cost').value = (Number(p.purchase_price) || 0).toFixed(2);
    document.getElementById('pr-product-search').value = p.name;
  }, { showOnEmpty: true, emptyText: 'No products found' });
}

async function addPurchaseReturn() {
  const date = document.getElementById('pr-date').value || new Date().toISOString().slice(0, 10);
  const supplierId = document.getElementById('pr-supplier').value || null;
  const supplierName = document.getElementById('pr-supplier-search').value.split(' — ')[0].trim();
  const productId = document.getElementById('pr-product').value || null;
  const desc = document.getElementById('pr-desc').value.trim();
  const qty = parseFloat(document.getElementById('pr-qty').value);
  const cost = parseFloat(document.getElementById('pr-cost').value);
  const note = document.getElementById('pr-note').value.trim();
  if (!desc) return alert('Please enter what was returned.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(cost) || cost < 0) return alert('Please enter a valid unit cost.');
  const res = await apiPost('/purchase-returns', {
    date: date, supplier_id: supplierId, supplierName: supplierName, product_id: productId,
    desc: desc, quantity: qty, unit_cost: cost, amount: qty * cost, note: note
  });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('pr-supplier').value = '';
  document.getElementById('pr-supplier-search').value = '';
  document.getElementById('pr-product').value = '';
  document.getElementById('pr-product-search').value = '';
  document.getElementById('pr-desc').value = '';
  document.getElementById('pr-qty').value = '';
  document.getElementById('pr-cost').value = '';
  document.getElementById('pr-note').value = '';
  toast('Return recorded · stock & supplier due reduced');
  renderPurchaseReturnsPage();
}

async function renderPurchaseReturnsPage() {
  const dateEl = document.getElementById('pr-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  setupPurchaseReturnPickers();
  const isManager = currentRole === 'manager';
  const formSection = document.getElementById('purchasereturn-form-section');
  if (formSection) formSection.style.display = isManager ? 'block' : 'none';
  const rows = await apiGet('/purchase-returns');
  rows.sort(function (a, b) { return b.id - a.id; });
  const tb = document.getElementById('purchasereturns-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">No purchase returns yet.</td></tr>';
    document.getElementById('purchasereturns-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = rows.map(function (r) {
    return '<tr><td>' + r.date + '</td><td>' + (esc(r.supplier_name) || '—') + '</td><td>' + esc(r.description) + '</td><td class="num">' + r.quantity + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td></tr>';
  }).join('');
  document.getElementById('purchasereturns-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

// ───────── Reports ─────────
function clearReportsFilter() {
  document.getElementById('rep-from').value = '';
  document.getElementById('rep-to').value = '';
  renderReportsPage();
}

async function renderReportsPage() {
  const from = document.getElementById('rep-from').value;
  const to = document.getElementById('rep-to').value;
  const inRange = function (d) { return (!from || d >= from) && (!to || d <= to); };

  const results = await Promise.all([
    apiGet('/sales'), apiGet('/expenses'), apiGet('/products'),
    apiGet('/sales-returns'), apiGet('/purchases'), apiGet('/dues'),
    apiGet('/supplier-dues'), apiGet('/customers-summary'), apiGet('/suppliers-summary')
  ]);
  const sales = results[0].filter(function (r) { return inRange(r.date); });
  const expenses = results[1].filter(function (r) { return inRange(r.date); });
  const products = results[2];
  const salesReturns = results[3].filter(function (r) { return inRange(r.date); });
  const purchases = results[4].filter(function (r) { return inRange(r.date); });
  const dues = results[5];
  const supplierDues = results[6];
  const customers = results[7];
  const suppliers = results[8];

  const sum = function (arr, key) { return arr.reduce(function (s, r) { return s + Number(r[key] || 0); }, 0); };
  const totalSales = sum(sales, 'amount');
  const totalReturns = sum(salesReturns, 'amount');
  const netSales = totalSales - totalReturns;
  const totalExpenses = sum(expenses, 'amount');
  const cogs = sales.reduce(function (s, r) {
    if (r.cost_price != null && r.quantity) return s + Number(r.cost_price) * Number(r.quantity);
    if (r.product_id) { const p = products.find(function (x) { return String(x.id) === String(r.product_id); }); if (p && r.quantity) return s + Number(p.purchase_price || 0) * Number(r.quantity); }
    return s;
  }, 0);
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - totalExpenses;
  const totalPurchases = sum(purchases, 'total');

  const stockValue = products.reduce(function (s, p) { return s + Number(p.quantity || 0) * Number(p.purchase_price || 0); }, 0);
  const stockRetail = products.reduce(function (s, p) { return s + Number(p.quantity || 0) * Number(p.sell_price || 0); }, 0);
  const lowStock = products.filter(function (p) { return Number(p.quantity) <= 5; });
  const totalCustomerDue = sum(dues, 'amount');
  const totalSupplierDue = sum(supplierDues, 'amount');

  const prodSold = {};
  sales.forEach(function (r) {
    if (!r.product_id) return;
    if (!prodSold[r.product_id]) prodSold[r.product_id] = { name: r.desc, qty: 0, revenue: 0 };
    prodSold[r.product_id].qty += Number(r.quantity || 0);
    prodSold[r.product_id].revenue += Number(r.amount || 0);
  });
  const topProducts = Object.keys(prodSold).map(function (k) { return prodSold[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 5);

  const card = function (label, value, color) {
    return '<div class="metric-card"><div class="label">' + label + '</div><div class="value ' + (color || '') + '">' + value + '</div></div>';
  };

  const pnlHtml =
    '<div class="list-header" style="padding:6px 0 12px"><i class="ti ti-cash"></i> Profit &amp; Loss</div>' +
    '<div class="metrics-grid" style="margin-bottom:24px">' +
    card('Net sales', fmt(netSales), 'green') +
    card('Cost of goods sold', fmt(cogs)) +
    card('Gross profit', fmt(grossProfit), grossProfit >= 0 ? 'green' : 'red') +
    card('Expenses', fmt(totalExpenses), 'red') +
    card('Net profit', fmt(netProfit), netProfit >= 0 ? 'green' : 'red') +
    card('Sales returns', fmt(totalReturns), 'amber') +
    card('Total purchases', fmt(totalPurchases)) +
    '</div>';

  const stockHtml =
    '<div class="list-header" style="padding:6px 0 12px"><i class="ti ti-package"></i> Inventory</div>' +
    '<div class="metrics-grid" style="margin-bottom:16px">' +
    card('Stock value (at cost)', fmt(stockValue)) +
    card('Stock value (at retail)', fmt(stockRetail), 'green') +
    card('Potential margin', fmt(stockRetail - stockValue), 'green') +
    card('Products', String(products.length)) +
    card('Low stock items', String(lowStock.length), lowStock.length ? 'red' : '') +
    '</div>';

  let lowStockHtml = '';
  if (lowStock.length) {
    lowStockHtml = '<div class="list-card" style="margin-bottom:24px"><div class="list-header"><i class="ti ti-alert-triangle" style="color:var(--danger)"></i> Low stock alerts (5 or fewer)</div><div class="table-scroll"><table><thead><tr><th>Product</th><th>Barcode</th><th class="num">In stock</th></tr></thead><tbody>' +
      lowStock.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.barcode) + '</td><td class="num" style="color:var(--danger);font-weight:600">' + p.quantity + ' ' + esc(p.unit || 'pcs') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  let topHtml = '';
  if (topProducts.length) {
    topHtml = '<div class="list-card" style="margin-bottom:24px"><div class="list-header"><i class="ti ti-trophy" style="color:var(--warn)"></i> Top products (by revenue)</div><div class="table-scroll"><table><thead><tr><th>Product</th><th class="num">Qty sold</th><th class="num">Revenue</th></tr></thead><tbody>' +
      topProducts.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.qty + '</td><td class="num" style="color:var(--ok)">' + fmt(p.revenue) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  const custWithDue = customers.filter(function (c) { return c.totalDue > 0; }).sort(function (a, b) { return b.totalDue - a.totalDue; });
  const supWithDue = suppliers.filter(function (s) { return s.totalDue > 0; }).sort(function (a, b) { return b.totalDue - a.totalDue; });
  const ledgerHtml =
    '<div class="metrics-grid" style="margin-bottom:16px">' +
    card('Customers owe you', fmt(totalCustomerDue), 'amber') +
    card('You owe suppliers', fmt(totalSupplierDue), 'red') +
    '</div>' +
    '<div class="reports-2col">' +
    '<div class="list-card"><div class="list-header"><i class="ti ti-users"></i> Customer dues</div><div class="table-scroll"><table><thead><tr><th>Customer</th><th class="num">Owes</th></tr></thead><tbody>' +
    (custWithDue.length ? custWithDue.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td class="num" style="color:var(--warn)">' + fmt(c.totalDue) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="empty-state">No customer dues.</td></tr>') +
    '</tbody></table></div></div>' +
    '<div class="list-card"><div class="list-header"><i class="ti ti-building-warehouse"></i> Supplier dues</div><div class="table-scroll"><table><thead><tr><th>Supplier</th><th class="num">You owe</th></tr></thead><tbody>' +
    (supWithDue.length ? supWithDue.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td class="num" style="color:var(--danger)">' + fmt(s.totalDue) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="empty-state">No supplier dues.</td></tr>') +
    '</tbody></table></div></div>' +
    '</div>';

  document.getElementById('reports-content').innerHTML = pnlHtml + stockHtml + lowStockHtml + topHtml +
    '<div class="list-header" style="padding:6px 0 12px"><i class="ti ti-book"></i> Ledgers</div>' + ledgerHtml;
}

// ═══════════════════════════════════════════════════════

// ───────── Misc / modal close on Escape ─────────
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (document.getElementById('barcodeModal').style.display === 'flex') closeBarcodeModal();
  if (document.getElementById('posModal').style.display === 'flex') closePosModal();
  if (document.getElementById('customerModal').style.display === 'flex') closeCustomerModal();
  const histModal = document.getElementById('customerHistoryModal');
  if (histModal && histModal.style.display === 'flex') closeCustomerHistoryModal();
  const quickCust = document.getElementById('quickCustomerModal');
  if (quickCust && quickCust.style.display === 'flex') closeQuickAddCustomer();
  const quickSup = document.getElementById('quickSupplierModal');
  if (quickSup && quickSup.style.display === 'flex') closeQuickAddSupplier();
  const viewModal = document.getElementById('viewEntryModal');
  if (viewModal && viewModal.style.display === 'flex') closeViewEntryModal();
  const genericModal = document.getElementById('genericEditModal');
  if (genericModal) closeEditModal();
});
