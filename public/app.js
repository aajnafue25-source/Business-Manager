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
  window.__currentUsername = username;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('expired-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  // logout-btn is now inside the profile dropdown only
  const oldLogout = document.getElementById('logout-btn');
  if (oldLogout) oldLogout.style.display = 'none';

  // Show Admin panel link in profile dropdown only for platform admin
  const profileAdmin = document.getElementById('profile-drop-admin');
  if (profileAdmin) profileAdmin.style.display = isAdmin ? 'flex' : 'none';

  const roleText = isAdmin ? 'Admin' : (currentRole === 'manager' ? 'Manager' : 'Sales');
  const roleIcon = isAdmin ? 'ti-shield-check' : (currentRole === 'manager' ? 'ti-user-circle' : 'ti-user');

  // Update avatar circle with initials
  const initials = (username || 'U').charAt(0).toUpperCase();
  const avatarInner = document.getElementById('profile-avatar-inner');
  if (avatarInner) avatarInner.innerHTML = '<span class="avatar-initials">' + initials + '</span>';

  // Dropdown header
  const profileName = document.getElementById('profile-drop-name');
  const profileRole = document.getElementById('profile-drop-role');
  if (profileName) profileName.innerHTML = '<i class="ti ' + roleIcon + '"></i> ' + esc(username);
  if (profileRole) profileRole.textContent = roleText;

  // Show Manage staff link for managers only
  const profileStaff = document.getElementById('profile-drop-staff');
  if (profileStaff) profileStaff.style.display = (currentRole === 'manager') ? 'flex' : 'none';

  // Show Staff nav group for managers only
  const staffNavGroup = document.getElementById('nav-group-staff');
  if (staffNavGroup) staffNavGroup.style.display = (currentRole === 'manager') ? 'block' : 'none';

  // Load staff into salesman dropdown for all users
  loadSalesmanDropdown();

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
    updateTopbarBizName();
    renderDashboard();
  })();
}

function updateTopbarBizName() {
  var bizNameEl = document.getElementById('topbar-biz-name');
  if (bizNameEl) bizNameEl.textContent = (settings && settings.businessName) ? settings.businessName : 'Your Business';
  // Also update profile pic if saved
  var avatarInner = document.getElementById('profile-avatar-inner');
  if (avatarInner && settings && settings.profile_picture) {
    avatarInner.innerHTML = '<img src="' + settings.profile_picture + '" alt="Profile" />';
  }
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
  sales: function () { loadProductOptions(); loadCustomerOptions(); renderSalesPage(); loadSalesmanDropdown(); },
  saleslist: renderSalesListPage,
  saledetail: renderSaleDetailPage,
  salesreturns: renderSalesReturnsPage,
  exchanges: renderExchangesPage,
  purchases: function () { setupPurchasePage(); renderPurchasePage(); },
  purchaselist: renderPurchaseListPage,
  purchasereturns: renderPurchaseReturnsPage,
  suppliers: renderSuppliersPage,
  expenses: renderExpensePage,
  cashflow: renderCashFlowPage,
  dues: function () { navigateTo('duepaid'); },
  dueentry: function () { navigateTo('duepaid'); },
  duepaid: renderDuePaidPage,
  products: renderProductsPage,
  categories: renderCategoriesPage,
  brands: renderBrandsPage,
  customers: renderCustomersPage,
  reports: renderReportsPage,
  settings: renderSettingsPage,
  staff: renderStaffPage,
  attendance: renderAttendancePage,
  staffsales: renderStaffSalesPage,
  staffreports: renderStaffReportsPage,
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
  // Group header: toggle the accordion open/close ONLY — navigation via sub-items
  if (btn.classList.contains('nav-group-btn')) {
    e.stopPropagation();
    var isCollapsed = document.getElementById('app').classList.contains('nav-collapsed');
    if (isCollapsed) {
      // In collapsed mode: icon click navigates to the group's default page
      var defaultPage = btn.dataset.default || btn.dataset.page;
      if (defaultPage) navigateTo(defaultPage);
      return;
    }
    const group = btn.closest('.nav-group');
    const wasOpen = group.classList.contains('open');
    document.querySelectorAll('.nav-group.open').forEach(function (g) { if (g !== group) g.classList.remove('open'); });
    group.classList.toggle('open', !wasOpen);
    return;
  }
  if (btn.dataset.page) navigateTo(btn.dataset.page);
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('nav').classList.toggle('open');
});

// Mobile: clicking outside the nav closes it automatically
document.addEventListener('click', function (e) {
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('menuToggle');
  if (nav && nav.classList.contains('open') && !nav.contains(e.target) && toggle && !toggle.contains(e.target)) {
    nav.classList.remove('open');
  }
});

// Sidebar collapse (desktop)
// ───────── Profile avatar dropdown ─────────
function toggleProfileDrop() {
  const drop = document.getElementById('profile-dropdown');
  if (!drop) return;
  const isOpen = drop.classList.contains('open');
  drop.classList.toggle('open', !isOpen);
}
// Close profile dropdown on outside click
document.addEventListener('click', function (e) {
  const btn = document.getElementById('profile-avatar-btn');
  const drop = document.getElementById('profile-dropdown');
  if (drop && btn && !btn.contains(e.target) && !drop.contains(e.target)) {
    drop.classList.remove('open');
  }
});

// ───────── Quick sales return from Sales List ─────────
function openQuickReturnModal(r) {
  // Pre-fill a quick return from a sales row
  const today = new Date().toISOString().slice(0, 10);
  const existing = document.getElementById('quickReturnModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'quickReturnModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML = '<div class="modal-box" style="text-align:left">' +
    '<button class="modal-close" onclick="document.getElementById(\'quickReturnModal\').remove()"><i class="ti ti-x"></i></button>' +
    '<h3 style="margin:0 0 16px;font-size:16px"><i class="ti ti-arrow-back-up" style="color:var(--warn)"></i> Return / Exchange</h3>' +
    '<div style="background:var(--surface-2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px">' +
    '<div style="font-weight:600">' + esc(r.desc) + '</div>' +
    '<div style="color:var(--text-2)">Bill #' + (r.bill_no || '—') + ' · ' + esc(r.date) + '</div>' +
    '</div>' +
    '<div class="form-row"><label>Return date</label><input type="date" id="qr-date" value="' + today + '" /></div>' +
    '<div class="form-row"><label>Item name</label><input type="text" id="qr-desc" value="' + esc(r.desc) + '" /></div>' +
    '<div class="form-row"><label>Quantity to return</label><input type="number" id="qr-qty" value="' + (r.quantity || 1) + '" min="0.01" step="0.01" /></div>' +
    '<div class="form-row"><label>Unit price (Tk)</label><input type="number" id="qr-price" value="' + (r.unit_price || r.amount || 0) + '" min="0" step="0.01" /></div>' +
    '<div class="form-row"><label>Reason / Note (optional)</label><input type="text" id="qr-note" placeholder="Damaged, wrong size, exchange, etc." /></div>' +
    '<div class="modal-actions" style="margin-top:16px">' +
    '<button class="btn-secondary" onclick="document.getElementById(\'quickReturnModal\').remove()">Cancel</button>' +
    '<button class="btn-save" style="width:auto;flex:1" onclick="submitQuickReturn(' + r.id + ',' + (r.product_id || 'null') + ',' + (r.bill_no || 'null') + ')"><i class="ti ti-arrow-back-up"></i> Record return</button>' +
    '</div></div>';
  document.body.appendChild(modal);
}

async function submitQuickReturn(saleId, productId, billNo) {
  const date = document.getElementById('qr-date').value;
  const desc = document.getElementById('qr-desc').value.trim();
  const qty = parseFloat(document.getElementById('qr-qty').value);
  const price = parseFloat(document.getElementById('qr-price').value);
  const note = document.getElementById('qr-note').value.trim();
  if (!desc) return alert('Please enter the item name.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(price) || price < 0) return alert('Please enter a valid unit price.');
  const res = await apiPost('/sales-returns', {
    date: date, product_id: productId, desc: desc, quantity: qty,
    unit_price: price, amount: qty * price, bill_no: billNo, note: note, sale_id: saleId
  });
  if (res && res.error) { alert(res.error); return; }
  const modal = document.getElementById('quickReturnModal');
  if (modal) modal.remove();
  closeViewEntryModal();
  toast('Return recorded · stock restocked');
  renderSalesListPage();
}

function toggleSidebar() {
  document.getElementById('app').classList.toggle('nav-collapsed');
  try { localStorage.setItem('bm-sidebar', document.getElementById('app').classList.contains('nav-collapsed') ? '1' : '0'); } catch (e) {}
}

// ───────── Purchase price visibility toggle ─────────
var __showPurchasePrice = true;

function togglePurchasePrice() {
  __showPurchasePrice = !__showPurchasePrice;
  applyPurchasePriceVisibility();
  try { localStorage.setItem('bm-show-cost', __showPurchasePrice ? '1' : '0'); } catch (e) {}
}

function applyPurchasePriceVisibility() {
  var btn = document.getElementById('toggle-cost-btn');
  var icon = document.getElementById('toggle-cost-icon');
  var label = document.getElementById('toggle-cost-label');
  if (__showPurchasePrice) {
    document.body.classList.remove('hide-purchase-price');
    if (btn) btn.classList.remove('cost-hidden');
    if (icon) icon.className = 'ti ti-eye';
    if (label) label.textContent = 'Hide cost';
  } else {
    document.body.classList.add('hide-purchase-price');
    if (btn) btn.classList.add('cost-hidden');
    if (icon) icon.className = 'ti ti-eye-off';
    if (label) label.textContent = 'Show cost';
  }
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
  try { __showPurchasePrice = localStorage.getItem('bm-show-cost') !== '0'; applyPurchasePriceVisibility(); } catch (e) {}
})();

function fmt(n) {
  return 'Tk ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPlain(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Bill-specific formatter: numbers only (no Tk prefix — currency shown in bill header)
function bfmt(n) {
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

function toast(msg, type) {
  const el = document.createElement('div');
  el.textContent = msg;
  var bg = type === 'warn' ? 'var(--warn)' : type === 'ok' ? 'var(--ok)' : 'var(--text)';
  var color = (type === 'warn' || type === 'ok') ? '#fff' : 'var(--surface)';
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + bg + ';color:' + color + ';padding:10px 20px;border-radius:8px;font-size:13.5px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:90vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 2500);
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
    const expSearch = document.getElementById('exp-search');
    if (expSearch) expSearch.value = '';
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
  window.__currentSaleRow = r;
  navigateTo('saledetail');
}

async function renderSaleDetailPage() {
  var r = window.__currentSaleRow;
  if (!r) { navigateTo('saleslist'); return; }
  var isManager = currentRole === 'manager';
  var content = document.getElementById('saledetail-content');
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-2)"><i class="ti ti-clock" style="font-size:24px"></i><br>Loading...</div>';

  var billItems = [];
  var billTotal = 0, billAmountPaid = 0, billDueAmount = 0;
  if (r.bill_id) {
    var billData = await apiGet('/sales/bill/' + r.bill_id);
    if (billData && !billData.error) {
      billItems = billData.items || [];
      billTotal = billData.total || 0;
      billAmountPaid = billData.amountPaid || 0;
      billDueAmount = billData.dueAmount || 0;
    }
  }
  if (!billItems.length) {
    billItems = [r];
    billTotal = Number(r.amount) || 0;
    billAmountPaid = billTotal;
  }

  var billNoStr = r.bill_no ? '#' + String(r.bill_no).padStart(6, '0') : '\u2014';
  var customerName = esc(r.customer_name) || 'Walk-in customer';
  var customerPhone = r.customer_phone || '';

  // Store items globally for return/exchange access
  window.__currentBillItems = billItems;
  window.__currentBillData = { billId: r.bill_id, billNo: r.bill_no, customerId: r.customer_id, customerName: r.customer_name };

  var itemsHtml = billItems.map(function (it, idx) {
    return '<tr>' +
      '<td>' + esc(it.desc || it.description || '') + '</td>' +
      '<td class="num">' + (it.quantity != null ? it.quantity : '\u2014') + '</td>' +
      '<td class="num">' + (it.unit_price != null ? fmt(it.unit_price) : '\u2014') + '</td>' +
      '<td class="num" style="font-weight:700;color:var(--ok)">' + fmt(it.amount) + '</td>' +
      '<td style="white-space:nowrap"><button class="btn-secondary" style="font-size:11.5px;padding:5px 10px;color:var(--warn);border-color:var(--warn)" onclick="addItemToReturn(' + idx + ')"><i class="ti ti-arrow-back-up"></i> Return</button></td>' +
      '</tr>';
  }).join('');

  content.innerHTML =
    '<div class="detail-page-grid">' +
    '<div class="detail-main">' +
    '<div class="detail-card">' +
    '<div class="detail-card-header"><i class="ti ti-receipt"></i> Bill ' + billNoStr + '</div>' +
    '<div class="detail-meta-grid">' +
    '<div class="detail-meta-item"><span class="detail-meta-label">Date</span><span class="detail-meta-val">' + esc(r.date) + '</span></div>' +
    '<div class="detail-meta-item"><span class="detail-meta-label">Customer</span><span class="detail-meta-val">' + customerName + '</span></div>' +
    (customerPhone ? '<div class="detail-meta-item"><span class="detail-meta-label">Phone</span><span class="detail-meta-val">' + esc(customerPhone) + '</span></div>' : '') +
    '</div></div>' +
    '<div class="detail-card"><div class="detail-card-header"><i class="ti ti-list"></i> Items (' + billItems.length + ') <span style="font-size:12px;color:var(--text-2);font-weight:400">— click Return to return an item</span></div>' +
    '<div class="table-scroll"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th></th></tr></thead>' +
    '<tbody>' + itemsHtml + '</tbody></table></div></div>' +

    // Pending returns section (hidden until items added)
    '<div id="pending-returns-section" style="display:none">' +
    '<div class="detail-card" style="margin-top:16px;border-color:var(--warn)">' +
    '<div class="detail-card-header" style="background:var(--warn-bg);color:var(--warn)"><i class="ti ti-arrow-back-up"></i> Pending returns — save when ready</div>' +
    '<div class="table-scroll"><table><thead><tr><th>Item</th><th class="num">Return qty</th><th class="num">Unit price</th><th class="num">Refund</th><th></th></tr></thead>' +
    '<tbody id="pending-returns-tbody"></tbody></table></div>' +
    '<div style="padding:14px;display:flex;gap:10px;align-items:center">' +
    '<div style="flex:1"><label style="font-size:12px;font-weight:600;color:var(--text-2)">Note (reason)</label><input type="text" id="return-note" placeholder="Reason for return" style="display:block;width:100%;margin-top:4px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface-2);color:var(--text)" /></div>' +
    '</div>' +
    '<div style="padding:0 14px 14px"><button class="btn-save" onclick="saveInlineReturns()"><i class="ti ti-arrow-back-up"></i> Save returns &amp; restock</button></div>' +
    '</div></div>' +
    '</div>' +

    '<div class="detail-sidebar">' +
    '<div class="detail-card detail-summary-card">' +
    '<div class="detail-card-header"><i class="ti ti-coin"></i> Summary</div>' +
    '<div class="detail-summary-row"><span>Total</span><span style="font-weight:700">' + fmt(billTotal) + '</span></div>' +
    '<div class="detail-summary-row"><span>Paid</span><span style="color:var(--ok);font-weight:700">' + fmt(billAmountPaid) + '</span></div>' +
    (billDueAmount > 0 ? '<div class="detail-summary-row" style="color:var(--warn)"><span>Balance due</span><span style="font-weight:700">' + fmt(billDueAmount) + '</span></div>' : '<div class="detail-summary-row" style="color:var(--ok)"><span>Status</span><span style="font-weight:700">Fully paid</span></div>') +
    '</div>' +
    '<div class="detail-card"><div class="detail-card-header"><i class="ti ti-bolt"></i> Actions</div>' +
    '<div class="detail-actions-grid">' +
    (r.bill_id ? '<button class="detail-action-btn detail-action-print" onclick="renderSaleDetailPrint()"><i class="ti ti-printer"></i><span>Print Bill</span></button>' : '') +
    (r.bill_id ? '<button class="detail-action-btn" style="background:linear-gradient(135deg,#7c3aed,#8b5cf6)" onclick="openExchangeFromBill()"><i class="ti ti-switch-3"></i><span>Exchange</span></button>' : '') +
    (isManager ? '<button class="detail-action-btn detail-action-edit" onclick="renderSaleDetailEdit()"><i class="ti ti-pencil"></i><span>Edit</span></button>' : '') +
    (isManager ? '<button class="detail-action-btn detail-action-delete" onclick="renderSaleDetailDelete()"><i class="ti ti-trash"></i><span>Delete</span></button>' : '') +
    '</div></div>' +
    '</div></div>';

  // Init pending returns
  window.__pendingReturns = [];
}

// ───────── Inline return helpers ─────────
var __pendingReturns = [];

function addItemToReturn(itemIdx) {
  var item = (window.__currentBillItems || [])[itemIdx];
  if (!item) return;
  // Check if already in pending list
  var already = __pendingReturns.find(function (p) { return p.itemIdx === itemIdx; });
  if (already) { toast('Item already in return list'); return; }
  var unitPrice = item.unit_price != null ? Number(item.unit_price) : Number(item.amount) / (Number(item.quantity) || 1);
  __pendingReturns.push({ itemIdx: itemIdx, desc: item.desc || item.description, quantity: Number(item.quantity) || 1, maxQty: Number(item.quantity) || 1, unitPrice: unitPrice, productId: item.product_id || null, amount: Number(item.amount) || 0 });
  renderPendingReturns();
  document.getElementById('pending-returns-section').style.display = 'block';
}

function removePendingReturn(idx) {
  __pendingReturns.splice(idx, 1);
  renderPendingReturns();
  if (!__pendingReturns.length) document.getElementById('pending-returns-section').style.display = 'none';
}

function renderPendingReturns() {
  var tb = document.getElementById('pending-returns-tbody');
  if (!tb) return;
  tb.innerHTML = __pendingReturns.map(function (p, i) {
    var refund = p.quantity * p.unitPrice;
    return '<tr>' +
      '<td>' + esc(p.desc) + '</td>' +
      '<td class="num"><input type="number" value="' + p.quantity + '" min="1" max="' + p.maxQty + '" style="width:70px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;text-align:center;background:var(--surface-2);color:var(--text)" onchange="updateReturnQty(' + i + ',this.value)" /></td>' +
      '<td class="num">' + fmt(p.unitPrice) + '</td>' +
      '<td class="num" style="color:var(--ok);font-weight:700">' + fmt(refund) + '</td>' +
      '<td><button class="del-btn" onclick="removePendingReturn(' + i + ')"><i class="ti ti-trash"></i></button></td>' +
      '</tr>';
  }).join('');
}

function updateReturnQty(idx, val) {
  var p = __pendingReturns[idx];
  if (!p) return;
  var qty = Math.min(Math.max(1, parseInt(val) || 1), p.maxQty);
  p.quantity = qty;
  renderPendingReturns();
}

async function saveInlineReturns() {
  if (!__pendingReturns.length) return alert('No items in return list.');
  var note = document.getElementById('return-note') ? document.getElementById('return-note').value.trim() : '';
  var billData = window.__currentBillData || {};
  var r = window.__currentSaleRow;
  var date = (r && r.date) || new Date().toISOString().slice(0, 10);
  var errors = [];
  for (var i = 0; i < __pendingReturns.length; i++) {
    var p = __pendingReturns[i];
    var res = await apiPost('/sales-returns', {
      date: date, product_id: p.productId, desc: p.desc, quantity: p.quantity,
      unit_price: p.unitPrice, amount: p.quantity * p.unitPrice,
      bill_no: billData.billNo || null, bill_id: billData.billId || null,
      customer_id: billData.customerId || null, note: note || 'Return from Bill #' + (billData.billNo || '')
    });
    if (res && res.error) errors.push(p.desc + ': ' + res.error);
  }
  if (errors.length) { alert('Some returns failed:\n' + errors.join('\n')); return; }
  __pendingReturns = [];
  toast(__pendingReturns.length + ' items returned & restocked', 'ok');
  toast('Returns saved — stock restocked', 'ok');
  navigateTo('salesreturns');
}

function openExchangeFromBill() {
  var r = window.__currentSaleRow;
  if (!r || !r.bill_id) return;
  window.__exchangeSourceBill = window.__currentBillData;
  window.__exchangeSourceBillItems = window.__currentBillItems;
  navigateTo('exchanges');
}

function renderSaleDetailPrint() { var r = window.__currentSaleRow; if (r) printSaleBillFromRow(r); }
function renderSaleDetailEdit() { var r = window.__currentSaleRow; if (r) editSaleEntry(r); }
function renderSaleDetailDelete() {
  var r = window.__currentSaleRow;
  if (!r) return;
  var billLabel = r.bill_no ? 'Bill #' + r.bill_no : 'this sale';
  var items = window.__currentBillItems || [];
  var msg = 'Delete ' + billLabel + '?\n\n' +
    'This will permanently:\n' +
    '• Delete ' + items.length + ' item(s) from sales records\n' +
    '• Clear the associated outstanding due (if any)\n' +
    '• Restore stock for all products in this bill\n\n' +
    'This action cannot be undone.';
  if (!confirm(msg)) return;
  deleteRow('sales', r.id, function () {
    toast('Bill deleted — dues cleared, stock restored', 'ok');
    navigateTo('saleslist');
  });
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
  wireSearchPicker('cart-customer-search', 'cart-customer-results', searchCustomersApi, renderCustomerSearchItem, async function (c) {
    selectedCartCustomer = c;
    document.getElementById('cart-customer').value = c.id;
    document.getElementById('cart-customer-search').value = c.name + (c.phone ? ' — ' + c.phone : '');
    document.getElementById('cart-customer-name-row').style.display = 'none';
    // Show this customer's outstanding balance as a warning in the cart
    showCartCustomerDue(c);
  }, { showOnEmpty: true, emptyText: 'No customers yet — use "Add new customer" below' });

  const input = document.getElementById('cart-customer-search');
  if (input) {
    input.addEventListener('input', function () {
      if (!input.value.trim()) {
        selectedCartCustomer = null;
        document.getElementById('cart-customer').value = '';
        document.getElementById('cart-customer-name-row').style.display = 'flex';
        hideCartCustomerDue();
        // Reset to full cash if walk-in
        setPayMode('full');
      }
    });
  }
}

async function showCartCustomerDue(c) {
  var noticeEl = document.getElementById('cart-customer-due-notice');
  if (!noticeEl) return;
  noticeEl.innerHTML = '<div style="font-size:12px;color:var(--text-2)"><i class="ti ti-refresh"></i> Checking balance...</div>';
  noticeEl.style.display = 'block';
  try {
    var nameLower = (c.name || '').toLowerCase();
    var results = await Promise.all([apiGet('/dues'), apiGet('/due-paid')]);
    var allDues = results[0], allPaid = results[1];
    var custDues = allDues.filter(function (d) { return d.customer_id === c.id || (d.party || '').toLowerCase() === nameLower; });
    var custPaid = allPaid.filter(function (p) { return (p.customer_id && p.customer_id === c.id) || (p.party || '').toLowerCase() === nameLower; });
    var gross = custDues.reduce(function (s, d) { return s + Number(d.amount); }, 0);
    var paid = custPaid.reduce(function (s, p) { return s + Number(p.amount); }, 0);
    var net = Math.max(0, gross - paid);
    __cartPreviousBalance = net;
    renderCartTotals(); // update grand total to include previous balance
    if (net > 0.009) {
      noticeEl.innerHTML = '<i class="ti ti-alert-circle" style="color:var(--warn)"></i> <strong>' + esc(c.name) + '</strong> has a previous outstanding of <strong style="color:var(--warn)">' + fmt(net) + '</strong> — added to this bill\'s total.';
      noticeEl.className = 'cart-due-notice cart-due-warn';
    } else {
      noticeEl.innerHTML = '<i class="ti ti-circle-check" style="color:var(--ok)"></i> <strong>' + esc(c.name) + '</strong> — no outstanding dues.';
      noticeEl.className = 'cart-due-notice cart-due-ok';
    }
  } catch (e) {
    noticeEl.style.display = 'none';
  }
}

function hideCartCustomerDue() {
  var noticeEl = document.getElementById('cart-customer-due-notice');
  if (noticeEl) { noticeEl.style.display = 'none'; noticeEl.innerHTML = ''; }
  __cartPreviousBalance = 0;
  renderCartTotals();
}

function setupCartProductPicker() {
  wireSearchPicker('cart-product-search', 'cart-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    // One click = auto add to cart (item qty 1 by default, editable before adding more)
    addProductDirectlyToCart(p);
    document.getElementById('cart-product-search').value = '';
  }, { showOnEmpty: true, emptyText: 'No products found — you can still type a custom item below' });
}

function addProductDirectlyToCart(p) {
  var costPrice = Number(p.purchase_price) || 0;
  cart.push({
    product_id: p.id, desc: p.name, quantity: 1, unit_price: Number(p.sell_price) || 0,
    amount: Number(p.sell_price) || 0, cost_price: costPrice, unit: p.unit || 'pcs'
  });
  // Decrement local stock display
  var local = products.find(function (x) { return x.id === p.id; });
  if (local) { local.quantity = Math.max(0, Number(local.quantity) - 1); renderPosProductGrid(); }
  renderCart();
  toast(p.name + ' added');
}

async function loadProductOptions() {
  products = await apiGet('/products');
  setupCartProductPicker();
  renderPosProductGrid();
}

function renderPosProductGrid() {
  var grid = document.getElementById('pos-product-grid');
  if (!grid) return;
  if (!products || !products.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:20px">No products yet. Add products in the Inventory tab.</div>';
    return;
  }
  // Sort: in-stock first, then alphabetical
  var sorted = products.slice().sort(function (a, b) {
    if (Number(a.quantity) <= 0 && Number(b.quantity) > 0) return 1;
    if (Number(a.quantity) > 0 && Number(b.quantity) <= 0) return -1;
    return a.name.localeCompare(b.name);
  });
  grid.innerHTML = sorted.map(function (p) {
    var stockLow = Number(p.quantity) <= 5;
    var outOfStock = Number(p.quantity) <= 0;
    return '<div class="pos-prod-card' + (outOfStock ? ' pos-prod-out' : '') + '" onclick="addProductDirectlyToCart(' + JSON.stringify(p).replace(/"/g, '&quot;') + ')" title="' + esc(p.name) + ' — click to add">' +
      '<div class="pos-prod-icon"><i class="ti ti-package"></i></div>' +
      '<div class="pos-prod-name">' + esc(p.name) + '</div>' +
      '<div class="pos-prod-price">' + fmt(p.sell_price) + '</div>' +
      '<div class="pos-prod-stock' + (stockLow ? ' low' : '') + '">' + (outOfStock ? 'Out of stock' : 'Stock: ' + p.quantity + ' ' + esc(p.unit || 'pcs')) + '</div>' +
      '</div>';
  }).join('');
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

var __cartPreviousBalance = 0; // outstanding balance of selected customer

function getCartTotals() {
  var subtotal = cart.reduce(function (s, it) { return s + it.amount; }, 0);
  var discPct = parseFloat(document.getElementById('cart-discount-pct') ? document.getElementById('cart-discount-pct').value : 0) || 0;
  var discAmt = parseFloat(document.getElementById('cart-discount-amt') ? document.getElementById('cart-discount-amt').value : 0) || 0;
  var vatPct = parseFloat(document.getElementById('cart-vat-pct') ? document.getElementById('cart-vat-pct').value : 0) || 0;
  var discApplied = discAmt > 0 ? Math.min(discAmt, subtotal) : (subtotal * discPct / 100);
  var afterDiscount = Math.max(0, subtotal - discApplied);
  var vatApplied = afterDiscount * vatPct / 100;
  var itemsTotal = afterDiscount + vatApplied;
  var previousBalance = __cartPreviousBalance || 0;
  var grandTotal = itemsTotal + previousBalance;
  return { subtotal: subtotal, discApplied: discApplied, discPct: discPct, discAmt: discAmt, vatPct: vatPct, vatApplied: vatApplied, itemsTotal: itemsTotal, previousBalance: previousBalance, total: grandTotal };
}

function renderCart() {
  const tb = document.getElementById('cart-tbody');
  if (!cart.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty-state">Click a product card to add it to cart.</td></tr>';
  } else {
    tb.innerHTML = cart.map(function (it, i) {
      return '<tr><td>' + esc(it.desc) + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmtPlain(it.unit_price) + '</td><td class="num" style="font-weight:600">' + fmtPlain(it.amount) + '</td><td><button class="cart-row-remove" onclick="removeCartItem(' + i + ')"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('');
  }
  renderCartTotals();
  updatePayPreview();
}

function renderCartTotals() {
  var t = getCartTotals();
  var subtotalEl = document.getElementById('cart-subtotal-val');
  if (subtotalEl) subtotalEl.textContent = fmt(t.subtotal);
  // Show/hide previous balance row
  var prevRow = document.getElementById('cart-prev-balance-row');
  if (prevRow) {
    if (t.previousBalance > 0) {
      prevRow.style.display = 'flex';
      document.getElementById('cart-prev-balance-val').textContent = fmt(t.previousBalance);
    } else {
      prevRow.style.display = 'none';
    }
  }
  var totalEl = document.getElementById('cart-total-val');
  if (totalEl) totalEl.textContent = fmt(t.total);
  var vatDisplay = document.getElementById('cart-vat-display');
  if (vatDisplay) vatDisplay.textContent = t.vatApplied > 0 ? '+VAT ' + fmt(t.vatApplied) : '';
  updatePayPreview();
}

function setPayMode(mode) {
  // Block credit/partial for walk-in customers — must select a customer first
  if ((mode === 'partial' || mode === 'due') && !document.getElementById('cart-customer').value) {
    toast('⚠ Please select a customer first. Walk-in customers cannot have dues.', 'warn');
    return; // stay on full cash
  }
  payMode = mode;
  ['full', 'partial', 'due'].forEach(function (m) {
    document.getElementById('pay-' + m).classList.toggle('active', m === mode);
  });
  document.getElementById('cart-paid-row').style.display = mode === 'partial' ? 'flex' : 'none';
  updatePayPreview();
}

function updatePayPreview() {
  var t = getCartTotals();
  var total = t.total;
  var amountPaid = 0;
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

  const customerId = document.getElementById('cart-customer').value || null;

  // Hard block: no due/partial for walk-in customers
  if ((payMode === 'partial' || payMode === 'due') && !customerId) {
    alert('Walk-in customers cannot have dues.\n\nPlease search and select a customer before using Partial or Full Due payment.');
    setPayMode('full');
    document.getElementById('cart-customer-search').focus();
    return;
  }

  var t = getCartTotals();
  var total = t.total;
  var amountPaid = total;
  if (payMode === 'due') amountPaid = 0;
  if (payMode === 'partial') {
    amountPaid = parseFloat(document.getElementById('cart-amount-paid').value);
    if (isNaN(amountPaid) || amountPaid < 0) return alert('Please enter a valid amount received.');
    if (amountPaid > total) amountPaid = total;
  }

  const customerName = document.getElementById('cart-customer-name').value.trim();
  const date = dateOf('cart-date');

  var salesmanSel = document.getElementById('cart-salesman');
  var salesmanId = salesmanSel ? salesmanSel.value || null : null;
  var salesmanName = salesmanSel && salesmanSel.value ? salesmanSel.options[salesmanSel.selectedIndex].dataset.name : null;

  const res = await apiPost('/checkout', {
    date: date, customer_id: customerId, customerName: customerName,
    amountPaid: amountPaid,
    previousBalance: t.previousBalance,
    discountPct: t.discPct, discountAmt: t.discAmt, vatPct: t.vatPct,
    salesman_id: salesmanId, salesman_name: salesmanName,
    items: cart.map(function (it) {
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, cost_price: it.cost_price };
    })
  });

  if (res.error) return alert(res.error);

  lastBillForPrint = res;
  lastBillForPrint.salesman_name = salesmanName;
  __cartPreviousBalance = 0;
  hideCartCustomerDue();
  cart = [];
  var salesmanSelEl = document.getElementById('cart-salesman');
  if (salesmanSelEl) salesmanSelEl.value = '';
  renderCart();
  selectedCartCustomer = null;
  document.getElementById('cart-customer').value = '';
  document.getElementById('cart-customer-search').value = '';
  document.getElementById('cart-customer-name').value = '';
  document.getElementById('cart-customer-name-row').style.display = 'flex';
  document.getElementById('cart-amount-paid').value = '';
  var discPctEl = document.getElementById('cart-discount-pct'); if (discPctEl) discPctEl.value = '';
  var discAmtEl = document.getElementById('cart-discount-amt'); if (discAmtEl) discAmtEl.value = '';
  var vatEl = document.getElementById('cart-vat-pct'); if (vatEl) vatEl.value = '';
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
  const customerId = document.getElementById('due-customer-id') ? document.getElementById('due-customer-id').value || null : null;
  const amount = parseFloat(document.getElementById('due-amount').value);
  const note = document.getElementById('due-note').value.trim();
  if (!party || isNaN(amount) || amount <= 0) return alert('Please fill in party name and a valid amount.');
  await apiPost('/dues', { date: dateOf('due-date'), party: party, amount: amount, note: note, customer_id: customerId });
  document.getElementById('due-party').value = '';
  document.getElementById('due-amount').value = '';
  document.getElementById('due-note').value = '';
  if (document.getElementById('due-customer-id')) document.getElementById('due-customer-id').value = '';
  if (document.getElementById('due-customer-search')) document.getElementById('due-customer-search').value = '';
  renderDueEntryList();
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
  if (document.getElementById('dpaid-customer-search')) document.getElementById('dpaid-customer-search').value = '';
  if (document.getElementById('dpaid-outstanding-info')) document.getElementById('dpaid-outstanding-info').style.display = 'none';
  __customerOutstandingDue = 0;
  renderDuePaidList();
  renderDueEntryList(); // refresh outstanding dues to reflect payment
  toast('Payment recorded');
}


// ───────── Sales page ─────────
// Rows are click-to-open (view popup holds Print/Edit/Delete). No inline action column.

function salesRowHtml(r, rowRef) {
  return '<tr class="clickable-row" onclick="viewSaleEntry(' + rowRef + ')"><td>' + r.date + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '—') + '</td><td>' + (esc(r.customer_name) || '<span style="color:var(--text-3)">Walk-in</span>') + '</td><td>' + esc(r.desc) + '</td><td class="num">' + (r.quantity || '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
}

// Group raw sales rows into bills (one entry per bill_no, or one per standalone row)
function groupSalesIntoBills(rows) {
  var bills = [];
  var billMap = {};
  rows.forEach(function (r) {
    if (r.bill_id) {
      var key = r.bill_id;
      if (!billMap[key]) {
        billMap[key] = { bill_id: r.bill_id, bill_no: r.bill_no, date: r.date, customer_name: r.customer_name, customer_phone: r.customer_phone, items: [], total: 0, id: r.id };
        bills.push(billMap[key]);
      }
      billMap[key].items.push(r);
      billMap[key].total += Number(r.amount || 0);
    } else {
      bills.push({ bill_id: null, bill_no: r.bill_no, date: r.date, customer_name: r.customer_name, items: [r], total: Number(r.amount || 0), id: r.id, _singleRow: r });
    }
  });
  return bills;
}

function billRowHtml(bill, rowRef) {
  var billNoStr = bill.bill_no ? '#' + String(bill.bill_no).padStart(5, '0') : '—';
  var itemSummary = bill.items.length === 1 ? esc(bill.items[0].desc) : bill.items.length + ' items';
  var customer = esc(bill.customer_name) || '<span style="color:var(--text-3)">Walk-in</span>';
  return '<tr class="clickable-row" onclick="viewSaleEntry(' + rowRef + ')"><td>' + bill.date + '</td><td style="font-weight:700">' + billNoStr + '</td><td>' + customer + '</td><td>' + itemSummary + '</td><td class="num">' + bill.items.length + '</td><td class="num" style="color:var(--ok);font-weight:700">' + fmt(bill.total) + '</td></tr>';
}

async function renderSalesPage() {
  const dateEl = document.getElementById('cart-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  let rows = await apiGet('/sales');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  var bills = groupSalesIntoBills(rows);
  window.__salesBills = bills;
  const recent = bills.slice(0, 10);
  const tb = document.getElementById('sales-tbody');
  if (!recent.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No sales yet. Make your first sale above.</td></tr>';
    document.getElementById('sales-total-val').textContent = fmt(0);
    return;
  }
  tb.innerHTML = recent.map(function (b, i) {
    var rowRef = b._singleRow ? 'window.__salesBills[' + i + ']._singleRow' : 'window.__salesBills[' + i + ']';
    return billRowHtml(b, rowRef);
  }).join('');
  var grandTotal = rows.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  document.getElementById('sales-total-val').textContent = fmt(grandTotal);
}

async function renderSalesListPage() {
  const from = document.getElementById('saleslist-filter-from').value;
  const to = document.getElementById('saleslist-filter-to').value;
  const search = (document.getElementById('saleslist-search').value || '').toLowerCase();
  let rows = await apiGet('/sales');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  if (from) rows = rows.filter(function (r) { return r.date >= from; });
  if (to) rows = rows.filter(function (r) { return r.date <= to; });
  var bills = groupSalesIntoBills(rows);
  if (search) bills = bills.filter(function (b) {
    return (b.customer_name || '').toLowerCase().includes(search) ||
      (b.bill_no ? String(b.bill_no) : '').includes(search) ||
      b.items.some(function (r) { return (r.desc || '').toLowerCase().includes(search); });
  });
  window.__salesListBills = bills;
  const tb = document.getElementById('saleslist-tbody');
  if (!bills.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">No sales found.</td></tr>';
    document.getElementById('saleslist-total-val').textContent = fmt(0);
    document.getElementById('saleslist-count').textContent = '0 bills';
    return;
  }
  tb.innerHTML = bills.map(function (b, i) {
    var rowRef = b._singleRow ? 'window.__salesListBills[' + i + ']._singleRow' : 'window.__salesListBills[' + i + ']';
    return billRowHtml(b, rowRef);
  }).join('');
  var total = bills.reduce(function (s, b) { return s + b.total; }, 0);
  document.getElementById('saleslist-total-val').textContent = fmt(total);
  document.getElementById('saleslist-count').textContent = bills.length + ' bill' + (bills.length === 1 ? '' : 's');
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
  const search = (document.getElementById('exp-search') ? document.getElementById('exp-search').value : '').toLowerCase();
  let rows = await apiGet('/expenses');
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  if (from) rows = rows.filter(function (r) { return r.date >= from; });
  if (to) rows = rows.filter(function (r) { return r.date <= to; });
  if (search) rows = rows.filter(function (r) { return (r.desc || r.description || '').toLowerCase().includes(search); });
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

async function renderDueEntryPage() {
  const dueDateEl = document.getElementById('due-date');
  if (dueDateEl && !dueDateEl.value) dueDateEl.value = new Date().toISOString().slice(0, 10);
  // Wire customer search for due entry
  wireSearchPicker('due-customer-search', 'due-customer-results', searchCustomersApi, renderCustomerSearchItem, function (c) {
    document.getElementById('due-customer-id').value = c.id;
    document.getElementById('due-party').value = c.name;
    document.getElementById('due-customer-search').value = c.name + (c.phone ? ' — ' + c.phone : '');
  }, { showOnEmpty: false });
  renderDueEntryList();
}

async function renderDueEntryList() {
  const search = (document.getElementById('dueentry-search') ? document.getElementById('dueentry-search').value : '').toLowerCase();
  const from = document.getElementById('dueentry-from') ? document.getElementById('dueentry-from').value : '';
  const to = document.getElementById('dueentry-to') ? document.getElementById('dueentry-to').value : '';

  const [dues, paid] = await Promise.all([apiGet('/dues'), apiGet('/due-paid')]);

  // Sum payments per party (case-insensitive) and per customer_id
  const paidByParty = {};
  const paidByCustomer = {};
  (paid || []).forEach(function (p) {
    var key = (p.party || '').toLowerCase().trim();
    if (key) paidByParty[key] = (paidByParty[key] || 0) + Number(p.amount || 0);
    if (p.customer_id) paidByCustomer[p.customer_id] = (paidByCustomer[p.customer_id] || 0) + Number(p.amount || 0);
  });

  // Aggregate dues per party, then subtract their total payments
  const partyGroups = {};
  (dues || []).forEach(function (d) {
    var key = (d.party || '').toLowerCase().trim() || ('id_' + d.customer_id);
    if (!partyGroups[key]) partyGroups[key] = { party: d.party, customer_id: d.customer_id, date: d.date, note: d.note, gross: 0, rows: [] };
    partyGroups[key].gross += Number(d.amount || 0);
    partyGroups[key].rows.push(d);
    // keep most recent date + note
    if (d.date > partyGroups[key].date) { partyGroups[key].date = d.date; partyGroups[key].note = d.note; }
  });

  // Build outstanding list: gross dues minus payments
  var outstanding = [];
  Object.keys(partyGroups).forEach(function (key) {
    var g = partyGroups[key];
    var paidAmt = (paidByParty[key] || 0);
    // also match payments by customer_id if party name didn't match
    if (g.customer_id && paidByCustomer[g.customer_id] && !paidByParty[key]) paidAmt = paidByCustomer[g.customer_id];
    var net = g.gross - paidAmt;
    if (net > 0.009) {
      outstanding.push({ party: g.party, customer_id: g.customer_id, date: g.date, note: g.note, amount: net, gross: g.gross, paid: paidAmt, rows: g.rows });
    }
  });

  outstanding.sort(function (a, b) { return b.date.localeCompare(a.date); });
  if (from) outstanding = outstanding.filter(function (r) { return r.date >= from; });
  if (to) outstanding = outstanding.filter(function (r) { return r.date <= to; });
  if (search) outstanding = outstanding.filter(function (r) { return (r.party || '').toLowerCase().includes(search) || (r.note || '').toLowerCase().includes(search); });

  window.__duesRows = outstanding;
  const dtb = document.getElementById('dues-tbody');
  if (dtb) dtb.innerHTML = outstanding.length ? outstanding.map(function (r, i) {
    var partialNote = r.paid > 0 ? '<span style="color:var(--ok);font-size:11px"> (paid ' + fmt(r.paid) + ' of ' + fmt(r.gross) + ')</span>' : '';
    return '<tr class="clickable-row" onclick="viewDueEntry(window.__duesRows[' + i + '],\'due\')"><td>' + r.date + '</td><td style="font-weight:600">' + esc(r.party) + '</td><td style="color:var(--text-3);font-size:12.5px">' + (esc(r.note) || '—') + partialNote + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty-state">No outstanding dues.</td></tr>';
  const totalEl = document.getElementById('dues-total-val');
  if (totalEl) totalEl.textContent = fmt(outstanding.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

function clearDueEntryFilter() {
  ['dueentry-search', 'dueentry-from', 'dueentry-to'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  renderDueEntryList();
}

var __duePaidMode = 'full';
var __customerOutstandingDue = 0;

async function renderDuePaidPage() {
  const dpaidDateEl = document.getElementById('dpaid-date');
  if (dpaidDateEl && !dpaidDateEl.value) dpaidDateEl.value = new Date().toISOString().slice(0, 10);

  // Load outstanding dues at the top
  renderDueEntryList();

  // Wire customer search — auto-fills NET outstanding due (gross dues minus payments)
  wireSearchPicker('dpaid-customer-search', 'dpaid-customer-results', searchCustomersApi, renderCustomerSearchItem, async function (c) {
    document.getElementById('dpaid-customer-id').value = c.id;
    document.getElementById('dpaid-party').value = c.name;
    document.getElementById('dpaid-customer-search').value = c.name + (c.phone ? ' — ' + c.phone : '');
    // Fetch this customer's dues AND payments
    const [allDues, allPaid] = await Promise.all([apiGet('/dues'), apiGet('/due-paid')]);
    const nameLower = (c.name || '').toLowerCase();
    const customerDues = allDues.filter(function (d) { return d.customer_id === c.id || (d.party || '').toLowerCase() === nameLower; });
    const customerPaid = allPaid.filter(function (p) { return (p.customer_id && p.customer_id === c.id) || (p.party || '').toLowerCase() === nameLower; });
    const grossDue = customerDues.reduce(function (s, d) { return s + Number(d.amount); }, 0);
    const totalPaid = customerPaid.reduce(function (s, p) { return s + Number(p.amount); }, 0);
    const netDue = Math.max(0, grossDue - totalPaid);
    __customerOutstandingDue = netDue;
    const infoBox = document.getElementById('dpaid-outstanding-info');
    if (netDue > 0.009) {
      infoBox.style.display = 'block';
      infoBox.innerHTML = '<div style="font-size:12px;color:var(--ok);margin-bottom:6px"><i class="ti ti-check"></i> Outstanding balance for ' + esc(c.name) + '</div>' +
        '<div class="due-item"><span>Total dues</span><span>' + fmt(grossDue) + '</span></div>' +
        (totalPaid > 0 ? '<div class="due-item" style="color:var(--text-2)"><span>Already paid</span><span>-' + fmt(totalPaid) + '</span></div>' : '') +
        '<div style="border-top:1px solid var(--ok);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:700"><span>Remaining due</span><span>' + fmt(netDue) + '</span></div>';
      if (__duePaidMode === 'full') document.getElementById('dpaid-amount').value = netDue.toFixed(2);
    } else {
      infoBox.style.display = 'block';
      infoBox.innerHTML = '<div style="color:var(--text-2);font-size:13px"><i class="ti ti-check"></i> No outstanding dues for this customer' + (totalPaid > 0 ? ' (fully paid)' : '') + '.</div>';
      __customerOutstandingDue = 0;
      if (__duePaidMode === 'full') document.getElementById('dpaid-amount').value = '';
    }
  }, { showOnEmpty: false });
  renderDuePaidList();
}

function setDuePaidMode(mode) {
  __duePaidMode = mode;
  ['full', 'partial'].forEach(function (m) {
    const btn = document.getElementById('dpaid-mode-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  if (mode === 'full' && __customerOutstandingDue > 0) {
    document.getElementById('dpaid-amount').value = __customerOutstandingDue.toFixed(2);
  } else if (mode === 'partial') {
    document.getElementById('dpaid-amount').value = '';
    document.getElementById('dpaid-amount').focus();
  }
}

async function renderDuePaidList() {
  const search = (document.getElementById('duepaid-search') ? document.getElementById('duepaid-search').value : '').toLowerCase();
  const from = document.getElementById('duepaid-from') ? document.getElementById('duepaid-from').value : '';
  const to = document.getElementById('duepaid-to') ? document.getElementById('duepaid-to').value : '';
  let paid = await apiGet('/due-paid');
  paid.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });
  if (from) paid = paid.filter(function (r) { return r.date >= from; });
  if (to) paid = paid.filter(function (r) { return r.date <= to; });
  if (search) paid = paid.filter(function (r) { return (r.party || '').toLowerCase().includes(search); });
  window.__paidRows = paid;
  const ptb = document.getElementById('paid-tbody');
  if (ptb) ptb.innerHTML = paid.length ? paid.map(function (r, i) {
    return '<tr class="clickable-row" onclick="viewDueEntry(window.__paidRows[' + i + '],\'paid\')"><td>' + r.date + '</td><td style="font-weight:600">' + esc(r.party) + '</td><td style="color:var(--text-3);font-size:12.5px">' + (esc(r.note) || '—') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="empty-state">No payments recorded.</td></tr>';
  const totalEl = document.getElementById('paid-total-val');
  if (totalEl) totalEl.textContent = fmt(paid.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

function clearDuePaidFilter() {
  ['duepaid-search', 'duepaid-from', 'duepaid-to'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  renderDuePaidList();
}

async function renderDuesPage() { navigateTo('dueentry'); }


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
  if (nameEl) nameEl.textContent = window.__currentUsername || 'User';
  if (roleEl) roleEl.textContent = currentRole === 'manager' ? 'Manager' : (currentIsAdmin ? 'Admin' : 'Sales Staff');

  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-confirm').value = '';
}

function renderProfilePic(src) {
  // Update settings page preview
  const img = document.getElementById('profile-pic-img');
  const placeholder = document.getElementById('profile-pic-placeholder');
  if (img && placeholder) {
    if (src) { img.src = src; img.style.display = 'block'; placeholder.style.display = 'none'; }
    else { img.style.display = 'none'; placeholder.style.display = 'flex'; }
  }
  // Update topbar avatar inner circle
  const avatarInner = document.getElementById('profile-avatar-inner');
  if (avatarInner) {
    if (src) {
      avatarInner.innerHTML = '<img src="' + src + '" alt="Profile" />';
    } else {
      const initials = (window.__currentUsername || 'U').charAt(0).toUpperCase();
      avatarInner.innerHTML = '<span class="avatar-initials">' + initials + '</span>';
    }
  }
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
  updateTopbarBizName();
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
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:20%">' + bfmt(it.unit_price != null ? it.unit_price : (it.amount / (it.quantity || 1))) + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:25%">' + bfmt(it.amount) + '</td></tr>';
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
    (bill.salesman_name ? '<div style="font-size:' + baseFont + ';margin:2px 0">Salesman: ' + esc(bill.salesman_name) + '</div>' : '') +
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
    (bill.discountApplied > 0 ? '<div style="display:flex;justify-content:space-between;font-size:' + baseFont + ';padding:2px 0"><span>Subtotal</span><span>' + bfmt(bill.subtotal || bill.total) + '</span></div><div style="display:flex;justify-content:space-between;font-size:' + baseFont + ';padding:2px 0;color:#c00"><span>Discount</span><span>-' + bfmt(bill.discountApplied) + '</span></div>' : '') +
    (bill.vatApplied > 0 ? '<div style="display:flex;justify-content:space-between;font-size:' + baseFont + ';padding:2px 0"><span>VAT (' + (bill.vatPct || 0) + '%)</span><span>+' + bfmt(bill.vatApplied) + '</span></div>' : '') +
    (bill.previousBalance > 0 ? '<div style="display:flex;justify-content:space-between;font-size:' + baseFont + ';padding:2px 0;color:#c00"><span>Previous balance</span><span>+' + bfmt(bill.previousBalance) + '</span></div>' : '') +
    '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:' + (s.priceFontSize ? s.priceFontSize + 4 : 17) + 'px;padding:4px 0"><span>TOTAL</span><span>' + bfmt(bill.total) + '</span></div>' +
    '<div style="font-size:' + (s.priceFontSize || 13) + 'px;font-weight:700">' +
    '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>Paid</span><span>' + bfmt(bill.amountPaid) + '</span></div>' +
    (bill.dueAmount > 0 ? '<div style="display:flex;justify-content:space-between;padding:2px 0"><span>Due</span><span>' + bfmt(bill.dueAmount) + '</span></div>' : '') +
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
    (bill.salesman_name ? '<div style="color:#666;font-size:13px;margin-top:4px">Salesman: ' + esc(bill.salesman_name) + '</div>' : '') +
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
    (bill.previousBalance > 0 ? '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e8ed;font-size:13px"><span style="color:#666">Previous balance</span><span style="color:#c00;font-weight:600">+' + fmtPlain(bill.previousBalance) + '</span></div>' : '') +
    (bill.dueAmount > 0 ? '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e8ed;font-size:13px"><span style="color:#666">Balance Due</span><span style="color:#d2890c;font-weight:600">' + fmtPlain(bill.dueAmount) + '</span></div>' : '') +
    '<div style="display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;color:#1b3a6b"><span>TOTAL</span><span>' + bfmt(bill.total) + '</span></div>' +
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
// ───────── Dashboard period filter ─────────
var __dashPeriod = 'today';

function setDashPeriod(period) {
  __dashPeriod = period;
  document.querySelectorAll('.dash-period-btn').forEach(function (b) { b.classList.remove('active'); });
  var activeBtn = document.getElementById('dp-' + period);
  if (activeBtn) activeBtn.classList.add('active');
  // For custom, don't override the date inputs
  if (period !== 'custom') {
    var today = new Date();
    var toDate = today.toISOString().slice(0, 10);
    var fromDate = toDate;
    if (period === '7d') { var d = new Date(today); d.setDate(d.getDate() - 6); fromDate = d.toISOString().slice(0, 10); }
    if (period === '1m') { var d2 = new Date(today); d2.setMonth(d2.getMonth() - 1); fromDate = d2.toISOString().slice(0, 10); }
    if (period === '6m') { var d3 = new Date(today); d3.setMonth(d3.getMonth() - 6); fromDate = d3.toISOString().slice(0, 10); }
    if (period === '1y') { var d4 = new Date(today); d4.setFullYear(d4.getFullYear() - 1); fromDate = d4.toISOString().slice(0, 10); }
    if (period === 'all') { fromDate = '2000-01-01'; }
    var fromEl = document.getElementById('dash-from');
    var toEl = document.getElementById('dash-to');
    if (fromEl) fromEl.value = fromDate;
    if (toEl) toEl.value = toDate;
  }
  renderDashboard();
}

async function renderDashboard() {
  var fromEl = document.getElementById('dash-from');
  var toEl = document.getElementById('dash-to');
  var fromDate = fromEl ? fromEl.value : new Date().toISOString().slice(0, 10);
  var toDate = toEl ? toEl.value : new Date().toISOString().slice(0, 10);
  // Default to today if not set
  if (!fromDate || !toDate) {
    fromDate = toDate = new Date().toISOString().slice(0, 10);
    if (fromEl) fromEl.value = fromDate;
    if (toEl) toEl.value = toDate;
  }
  var inRange = function (d) { return d >= fromDate && d <= toDate; };


  const results = await Promise.all([apiGet('/sales'), apiGet('/expenses'), apiGet('/dues'), apiGet('/purchases'), apiGet('/sales-returns'), apiGet('/exchanges'), apiGet('/due-paid'), apiGet('/purchases')]);
  const allSales = results[0], allExpenses = results[1], allDues = results[2], allPurchases = results[3], allReturns = results[4], allExchanges = results[5], allDuePaid = results[6];

  // Filter to selected period
  const sales = allSales.filter(function (r) { return inRange(r.date); });
  const expenses = allExpenses.filter(function (r) { return inRange(r.date); });
  const purchases = allPurchases.filter(function (r) { return inRange(r.date); });
  const returns = (allReturns || []).filter(function (r) { return inRange(r.date); });
  const exchanges = (allExchanges || []).filter(function (r) { return inRange(r.date); });
  const duePaid = (allDuePaid || []).filter(function (r) { return inRange(r.date); });

  // ── Core accounting calculations ──
  const grossSales   = sales.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const totalReturns = returns.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const totalExchangeDiff = exchanges.reduce(function (s, r) { return s + Number(r.price_diff || 0); }, 0);
  const netRevenue   = grossSales - totalReturns + totalExchangeDiff;

  // Outstanding dues: ALL time (gross dues created − all payments ever made)
  const allGrossDues = allDues.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const allDuePaidTotal = (allDuePaid || []).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const netOutstandingDues = Math.max(0, allGrossDues - allDuePaidTotal);

  const totalExp     = expenses.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const totalPurchases = purchases.reduce(function (s, r) { return s + Number(r.total || 0); }, 0);

  // ── Cash Flow ──
  // Cash collected = net revenue − still-outstanding dues
  // Outstanding dues are ALL-TIME (not period), so adjust:
  const periodGrossDues = allDues.filter(function (r) { return inRange(r.date); }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const periodDuePaidCollected = duePaid.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const cashFromSales = netRevenue - periodGrossDues; // collected immediately from sales
  const cashCollected = cashFromSales + periodDuePaidCollected; // + due payments received this period
  const refunds = totalReturns + Math.max(0, -totalExchangeDiff); // cash given back
  const cashOut = totalExp + refunds;
  const netCash = cashCollected - cashOut;

  const profit = netRevenue - totalExp - totalPurchases;
  var periodLabel = fromDate === toDate ? fromDate : fromDate + ' → ' + toDate;

  // Hero gradient cards
  document.getElementById('dash-metrics').innerHTML =
    '<div class="metric-card grad grad-blue"><div class="label">Net Revenue <span style="font-size:10px;opacity:0.8">(' + periodLabel + ')</span></div><div class="value">' + fmt(netRevenue) + '</div></div>' +
    '<div class="metric-card grad grad-navy"><div class="label">Net Cash (' + periodLabel + ')</div><div class="value">' + fmt(netCash) + '</div></div>' +
    '<div class="metric-card grad grad-cyan"><div class="label">Net Profit (' + periodLabel + ')</div><div class="value">' + fmt(profit) + '</div></div>' +
    '<div class="metric-card grad grad-teal"><div class="label">Outstanding Dues (all time)</div><div class="value">' + fmt(netOutstandingDues) + '</div></div>';

  // Summary mini cards row
  function summaryCard(icon, color, label, val) {
    return '<div class="dash-summary-card"><div class="dash-summary-icon" style="background:' + color + '"><i class="ti ' + icon + '"></i></div><div><div class="dash-summary-label">' + label + '</div><div class="dash-summary-val">' + val + '</div></div></div>';
  }
  var sumEl = document.getElementById('dash-summary');
  if (sumEl) sumEl.innerHTML =
    summaryCard('ti-coin', '#3b82f6', 'Gross Sales', fmt(grossSales)) +
    summaryCard('ti-arrow-back-up', '#ef4444', 'Returns', fmt(totalReturns)) +
    summaryCard('ti-switch-3', totalExchangeDiff >= 0 ? '#10b981' : '#f59e0b', 'Exchange diff', (totalExchangeDiff >= 0 ? '+' : '') + fmt(totalExchangeDiff)) +
    summaryCard('ti-cash', '#10b981', 'Cash collected', fmt(cashCollected)) +
    summaryCard('ti-receipt-2', '#ef4444', 'Expenses', fmt(totalExp)) +
    summaryCard('ti-clock', '#f59e0b', 'Outstanding dues', fmt(netOutstandingDues));

  // 30-day trend — aggregate by day
  var now = new Date();
  var days30Labels = [];
  var daySales = {}, dayPurch = {}, dayExp = {};
  for (var i = 29; i >= 0; i--) {
    var d = new Date(now); d.setDate(now.getDate() - i);
    var key = d.toISOString().slice(5, 10);
    days30Labels.push(key); daySales[key] = 0; dayPurch[key] = 0; dayExp[key] = 0;
  }
  var minDate = now.toISOString().slice(0, 10).replace(/\d{2}$/, '') + String(now.getDate() - 29).padStart(2, '0');
  // 30-day trend uses ALL data (not period-filtered), net of returns + exchanges
  allSales.forEach(function (r) { var k = r.date ? r.date.slice(5, 10) : ''; if (daySales[k] !== undefined) daySales[k] += Number(r.amount || 0); });
  (allReturns || []).forEach(function (r) { var k = r.date ? r.date.slice(5, 10) : ''; if (daySales[k] !== undefined) daySales[k] -= Number(r.amount || 0); });
  (allExchanges || []).forEach(function (r) { var k = r.date ? r.date.slice(5, 10) : ''; if (daySales[k] !== undefined) daySales[k] += Number(r.price_diff || 0); });
  allPurchases.forEach(function (r) { var k = r.date ? r.date.slice(5, 10) : ''; if (dayPurch[k] !== undefined) dayPurch[k] += Number(r.total || 0); });
  allExpenses.forEach(function (r) { var k = r.date ? r.date.slice(5, 10) : ''; if (dayExp[k] !== undefined) dayExp[k] += Number(r.amount || 0); });

  // Show every 3rd label to avoid crowding
  var sparseLabels = days30Labels.map(function (l, i) { return i % 3 === 0 ? l : ''; });

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('dashChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: sparseLabels,
      datasets: [
        { label: 'Sales', data: days30Labels.map(function (k) { return daySales[k]; }), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', fill: true, tension: 0.4, pointRadius: 2 },
        { label: 'Purchases', data: days30Labels.map(function (k) { return dayPurch[k]; }), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)', fill: true, tension: 0.4, pointRadius: 2 },
        { label: 'Expenses', data: days30Labels.map(function (k) { return dayExp[k]; }), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, tension: 0.4, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 14, boxWidth: 12 } },
        tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': Tk ' + ctx.parsed.y.toLocaleString(); } } }
      },
      scales: {
        x: { grid: { color: 'rgba(128,128,128,0.08)' }, ticks: { font: { size: 10 } } },
        y: { grid: { color: 'rgba(128,128,128,0.10)' }, ticks: { font: { size: 11 }, callback: function (v) { return v >= 1000 ? (v/1000).toFixed(0) + 'k' : v; } } }
      }
    }
  });

  // Calculate COGS from filtered sales
  var cogs = sales.reduce(function (s, r) {
    if (r.cost_price != null && r.quantity) return s + Number(r.cost_price) * Number(r.quantity);
    return s;
  }, 0);
  var netProfit = Math.max(0, netRevenue - cogs - totalExp);

  if (donutChart) donutChart.destroy();
  var donutCanvas = document.getElementById('donutChart');
  if (donutCanvas) {
    donutChart = new Chart(donutCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['COGS', 'Expenses', 'Net profit', 'Customer dues'],
        datasets: [{ data: [cogs, totalExp, netProfit, netOutstandingDues], backgroundColor: ['#8b5cf6', '#ef4444', '#10b981', '#f59e0b'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 10 } } }
      }
    });
  }
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


function renderPurchaseCart() {
  const tb = document.getElementById('pur-tbody');
  if (!purchaseCart.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty-state">Search a product above to add it, or fill the form below for a new product.</td></tr>';
  } else {
    tb.innerHTML = purchaseCart.map(function (it, i) {
      return '<tr><td>' + esc(it.desc) + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmtPlain(it.unit_cost) + '</td><td class="num" style="color:var(--ok)">' + (it.sell_price > 0 ? fmtPlain(it.sell_price) : '—') + '</td><td class="num" style="font-weight:600">' + fmtPlain(it.amount) + '</td><td><button class="cart-row-remove" onclick="removePurchaseItem(' + i + ')"><i class="ti ti-trash"></i></button></td></tr>';
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
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_cost: it.unit_cost, sell_price: it.sell_price || 0, amount: it.amount, updatePurchasePrice: it.updatePurchasePrice, category_name: it.category_name || null, brand_name: it.brand_name || null };
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
  const isManager = currentRole === 'manager';
  tb.innerHTML = rows.map(function (r, i) {
    var delBtn = isManager ? '<button class="del-btn" title="Delete purchase & reduce stock" onclick="event.stopPropagation();deletePurchase(' + r.id + ')"><i class="ti ti-trash"></i></button>' : '';
    return '<tr class="clickable-row" onclick="viewPurchase(' + i + ')"><td>' + r.date + '</td><td>#' + String(r.purchase_no || 0).padStart(5, '0') + '</td><td>' + (esc(r.supplier_name) || '<span style="color:var(--text-3)">—</span>') + '</td><td class="num">' + fmt(r.total) + '</td><td class="num" style="color:' + (r.due_amount > 0 ? 'var(--warn)' : 'var(--text-3)') + '">' + (r.due_amount > 0 ? fmt(r.due_amount) : '—') + '</td><td>' + delBtn + '</td></tr>';
  }).join('');
  document.getElementById('purchaselist-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.total); }, 0));
}

function deletePurchase(id) {
  if (!confirm('Delete this purchase?\n\nThis will:\n• Remove all items from your stock\n• Clear associated supplier dues\n\nThis cannot be undone.')) return;
  deleteRow('purchases', id, function () { toast('Purchase deleted — stock reduced', 'ok'); renderPurchaseListPage(); });
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
    var delBtn = isManager ? '<button class="del-btn" title="Delete & undo restock" onclick="deleteSalesReturn(' + r.id + ')"><i class="ti ti-trash"></i></button>' : '';
    return '<tr><td>' + r.date + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '—') + '</td><td>' + esc(r.description) + '</td><td class="num">' + r.quantity + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td><td>' + delBtn + '</td></tr>';
  }).join('');
  document.getElementById('salesreturns-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

function deleteSalesReturn(id) {
  if (!confirm('Delete this return?\n\nThis will undo the restock — the product quantity will be reduced back.')) return;
  deleteRow('sales-returns', id, function () { toast('Return deleted — stock reversed', 'ok'); renderSalesReturnsPage(); });
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
    var delBtn = isManager ? '<button class="del-btn" title="Delete & restore stock" onclick="deletePurchaseReturn(' + r.id + ')"><i class="ti ti-trash"></i></button>' : '';
    return '<tr><td>' + r.date + '</td><td>' + (esc(r.supplier_name) || '—') + '</td><td>' + esc(r.description) + '</td><td class="num">' + r.quantity + '</td><td class="num" style="color:var(--warn)">' + fmt(r.amount) + '</td><td>' + delBtn + '</td></tr>';
  }).join('');
  document.getElementById('purchasereturns-total-val').textContent = fmt(rows.reduce(function (s, r) { return s + Number(r.amount); }, 0));
}

function deletePurchaseReturn(id) {
  if (!confirm('Delete this purchase return?\n\nThis will remove the returned item from stock again.')) return;
  deleteRow('purchase-returns', id, function () { toast('Purchase return deleted — stock adjusted', 'ok'); renderPurchaseReturnsPage(); });
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
    apiGet('/supplier-dues'), apiGet('/customers-summary'), apiGet('/suppliers-summary'),
    apiGet('/exchanges')
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
  const exchanges = (results[9] || []).filter(function (r) { return inRange(r.date); });

  const sum = function (arr, key) { return arr.reduce(function (s, r) { return s + Number(r[key] || 0); }, 0); };
  const totalSales = sum(sales, 'amount');
  const totalReturns = sum(salesReturns, 'amount');
  const totalExchangeDiff = sum(exchanges, 'price_diff');
  const netSales = totalSales - totalReturns + totalExchangeDiff;
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

  // Top sellers (products, categories, brands)
  var topSellersHtml = '<div class="list-header" style="padding:6px 0 12px"><i class="ti ti-trophy"></i> Top Sellers</div>' +
    renderTopSellersTables(sales, products);

  // Export buttons (manager only)
  var exportHtml = '';
  if (currentRole === 'manager') {
    exportHtml = '<div class="detail-card" style="margin-bottom:16px"><div class="detail-card-header"><i class="ti ti-download"></i> Export Data (CSV)</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;padding:14px">' +
      '<button class="btn-secondary" onclick="exportCSV(\'sales\')"><i class="ti ti-receipt"></i> Sales</button>' +
      '<button class="btn-secondary" onclick="exportCSV(\'purchases\')"><i class="ti ti-truck-delivery"></i> Purchases</button>' +
      '<button class="btn-secondary" onclick="exportCSV(\'expenses\')"><i class="ti ti-receipt-2"></i> Expenses</button>' +
      '<button class="btn-secondary" onclick="exportCSV(\'products\')"><i class="ti ti-package"></i> Products</button>' +
      '<button class="btn-secondary" onclick="exportCSV(\'customers\')"><i class="ti ti-users"></i> Customers</button>' +
      '</div></div>';
  }

  document.getElementById('reports-content').innerHTML = exportHtml + pnlHtml + stockHtml + lowStockHtml + topHtml +
    topSellersHtml +
    '<div class="list-header" style="padding:6px 0 12px"><i class="ti ti-book"></i> Ledgers</div>' + ledgerHtml;
}

// ═══════════════════════════════════════════════════════

// ───────── Categories ─────────
var __categories = [];
var __brands = [];

async function loadCategoriesAndBrands() {
  __categories = await apiGet('/categories') || [];
  __brands = await apiGet('/brands') || [];
}

function populateCatBrandSelects(catId, brandId) {
  ['prod-category', 'pur-category'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">— No category —</option>' +
      __categories.map(function (c) { return '<option value="' + c.id + '"' + (c.id === catId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  });
  ['prod-brand', 'pur-brand'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">— No brand —</option>' +
      __brands.map(function (b) { return '<option value="' + b.id + '"' + (b.id === brandId ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('');
  });
}

async function renderCategoriesPage() {
  if (!__categories.length) await loadCategoriesAndBrands();
  const allProducts = await apiGet('/products');
  const tb = document.getElementById('categories-tbody');
  if (!__categories.length) {
    tb.innerHTML = '<tr><td colspan="3" class="empty-state">No categories yet.</td></tr>';
    return;
  }
  tb.innerHTML = __categories.map(function (c) {
    var count = allProducts.filter(function (p) { return p.category_id === c.id; }).length;
    return '<tr><td style="font-weight:600">' + esc(c.name) + '</td><td>' + count + ' products</td><td><button class="del-btn" onclick="deleteCategory(' + c.id + ')"><i class="ti ti-trash"></i></button></td></tr>';
  }).join('');
}

async function addCategory() {
  var name = document.getElementById('cat-name').value.trim();
  if (!name) return alert('Please enter a category name.');
  var res = await apiPost('/categories', { name: name });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('cat-name').value = '';
  await loadCategoriesAndBrands();
  toast('Category added');
  renderCategoriesPage();
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  await apiDelete('/categories/' + id);
  await loadCategoriesAndBrands();
  toast('Category deleted');
  renderCategoriesPage();
}

async function renderBrandsPage() {
  if (!__brands.length) await loadCategoriesAndBrands();
  const allProducts = await apiGet('/products');
  const tb = document.getElementById('brands-tbody');
  if (!__brands.length) {
    tb.innerHTML = '<tr><td colspan="3" class="empty-state">No brands yet.</td></tr>';
    return;
  }
  tb.innerHTML = __brands.map(function (b) {
    var count = allProducts.filter(function (p) { return p.brand_id === b.id; }).length;
    return '<tr><td style="font-weight:600">' + esc(b.name) + '</td><td>' + count + ' products</td><td><button class="del-btn" onclick="deleteBrand(' + b.id + ')"><i class="ti ti-trash"></i></button></td></tr>';
  }).join('');
}

async function addBrand() {
  var name = document.getElementById('brand-name').value.trim();
  if (!name) return alert('Please enter a brand name.');
  var res = await apiPost('/brands', { name: name });
  if (res && res.error) { alert(res.error); return; }
  document.getElementById('brand-name').value = '';
  await loadCategoriesAndBrands();
  toast('Brand added');
  renderBrandsPage();
}

async function deleteBrand(id) {
  if (!confirm('Delete this brand?')) return;
  await apiDelete('/brands/' + id);
  await loadCategoriesAndBrands();
  toast('Brand deleted');
  renderBrandsPage();
}

// ───────── Updated addProduct to include category + brand ─────────
async function addProduct() {
  var name = document.getElementById('prod-name').value.trim();
  var qty = parseFloat(document.getElementById('prod-qty').value) || 0;
  var purchasePrice = parseFloat(document.getElementById('prod-purchase').value) || 0;
  var sellPrice = parseFloat(document.getElementById('prod-sell').value) || 0;
  var unit = document.getElementById('prod-unit').value || 'pcs';
  var barcode = document.getElementById('prod-barcode').value.trim();
  var catEl = document.getElementById('prod-category');
  var brandEl = document.getElementById('prod-brand');
  var catId = catEl && catEl.value ? Number(catEl.value) : null;
  var brandId = brandEl && brandEl.value ? Number(brandEl.value) : null;
  var catName = catEl && catEl.value ? catEl.options[catEl.selectedIndex].text : null;
  var brandName = brandEl && brandEl.value ? brandEl.options[brandEl.selectedIndex].text : null;
  if (!name) return alert('Please enter a product name.');
  var res = await apiPost('/products', { name: name, quantity: qty, purchase_price: purchasePrice, sell_price: sellPrice, unit: unit, barcode: barcode, category_id: catId, brand_id: brandId, category_name: catName, brand_name: brandName });
  if (res && res.error) { alert(res.error); return; }
  ['prod-name', 'prod-barcode'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('prod-qty').value = '0';
  document.getElementById('prod-purchase').value = '';
  document.getElementById('prod-sell').value = '';
  if (catEl) catEl.value = '';
  if (brandEl) brandEl.value = '';
  toast('Product added (barcode: ' + (res.barcode || '—') + ')');
  renderProductsPage();
}

// ───────── Updated renderProductsPage to load categories/brands ─────────
async function renderProductsPage() {
  if (!__categories.length || !__brands.length) await loadCategoriesAndBrands();
  populateCatBrandSelects(null, null);
  const isManager = currentRole === 'manager';
  const formSection = document.getElementById('product-form-section');
  if (formSection) formSection.style.display = isManager ? 'block' : 'none';
  let prods = await apiGet('/products');
  prods.sort(function (a, b) { return a.name.localeCompare(b.name); });
  const grid = document.getElementById('products-grid');
  if (!prods.length) {
    grid.innerHTML = '<div class="empty-state">No products yet.</div>';
    return;
  }
  grid.innerHTML = prods.map(function (p) {
    var lowStock = Number(p.quantity) <= 5;
    return '<div class="product-card' + (lowStock ? ' product-card-low' : '') + '">' +
      '<div class="product-card-name">' + esc(p.name) + '</div>' +
      (p.brand_name ? '<div class="product-card-badge">' + esc(p.brand_name) + '</div>' : '') +
      (p.category_name ? '<div class="product-card-badge cat">' + esc(p.category_name) + '</div>' : '') +
      '<div class="product-card-bc"><i class="ti ti-barcode"></i> ' + esc(p.barcode) + '</div>' +
      '<div class="product-card-row"><span class="product-card-label">Stock</span><span class="' + (lowStock ? 'text-danger' : '') + '">' + p.quantity + ' ' + esc(p.unit || 'pcs') + '</span></div>' +
      '<div class="product-card-row product-cost-row"><span class="product-card-label">Buy</span><span>' + fmt(p.purchase_price) + '</span></div>' +
      '<div class="product-card-row"><span class="product-card-label">Sell</span><span style="color:var(--ok);font-weight:700">' + fmt(p.sell_price) + '</span></div>' +
      (isManager ? '<div class="product-card-actions"><button class="edit-btn" onclick="editProduct(' + p.id + ')"><i class="ti ti-pencil"></i></button><button class="del-btn" onclick="deleteRow(\'products\',' + p.id + ',renderProductsPage)"><i class="ti ti-trash"></i></button></div>' : '') +
      '</div>';
  }).join('');
}

// ───────── Updated setupPurchasePage: one-click add from search ─────────
function setupPurchasePage() {
  const dateEl = document.getElementById('pur-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // Load category/brand dropdowns
  loadCategoriesAndBrands().then(function () { populateCatBrandSelects(null, null); });

  wireSearchPicker('pur-supplier-search', 'pur-supplier-results', searchSuppliersApi, renderSupplierSearchItem, function (s) {
    selectedPurchaseSupplier = s;
    document.getElementById('pur-supplier').value = s.id;
    document.getElementById('pur-supplier-search').value = s.name + (s.phone ? ' — ' + s.phone : '');
  }, { showOnEmpty: true, emptyText: 'No suppliers yet — use "Add new supplier"' });

  var supInput = document.getElementById('pur-supplier-search');
  if (supInput) supInput.addEventListener('input', function () {
    if (!supInput.value.trim()) { selectedPurchaseSupplier = null; document.getElementById('pur-supplier').value = ''; }
  });

  // Product search: one-click auto-adds to cart
  wireSearchPicker('pur-product-search', 'pur-product-results', searchProductsApi, renderProductSearchItem, function (p) {
    // Auto-add to cart immediately, no extra button click needed
    var unitCost = Number(p.purchase_price) || 0;
    purchaseCart.push({ product_id: p.id, desc: p.name, quantity: 1, unit_cost: unitCost, sell_price: Number(p.sell_price) || 0, amount: unitCost, updatePurchasePrice: true });
    document.getElementById('pur-product').value = '';
    document.getElementById('pur-product-search').value = '';
    renderPurchaseCart();
    toast(p.name + ' added to purchase');
  }, { showOnEmpty: true, emptyText: 'No products found — fill the fields below for a new product' });
}

// ───────── Updated addPurchaseItem to include sell_price + category/brand ─────────
function addPurchaseItem() {
  var productId = document.getElementById('pur-product').value || null;
  var desc = document.getElementById('pur-desc').value.trim();
  var qty = parseFloat(document.getElementById('pur-qty').value);
  var unitCost = parseFloat(document.getElementById('pur-cost').value);
  var sellPrice = parseFloat(document.getElementById('pur-sell').value) || 0;
  var catEl = document.getElementById('pur-category');
  var brandEl = document.getElementById('pur-brand');
  var catName = catEl && catEl.value ? catEl.options[catEl.selectedIndex].text : null;
  var brandName = brandEl && brandEl.value ? brandEl.options[brandEl.selectedIndex].text : null;
  if (!desc) return alert('Please enter a product name.');
  if (isNaN(qty) || qty <= 0) return alert('Please enter a valid quantity.');
  if (isNaN(unitCost) || unitCost < 0) return alert('Please enter a valid cost price.');
  purchaseCart.push({ product_id: productId, desc: desc, quantity: qty, unit_cost: unitCost, sell_price: sellPrice, amount: qty * unitCost, category_name: catName, brand_name: brandName, updatePurchasePrice: true });
  document.getElementById('pur-product').value = '';
  document.getElementById('pur-desc').value = '';
  document.getElementById('pur-qty').value = '1';
  document.getElementById('pur-cost').value = '';
  document.getElementById('pur-sell').value = '';
  if (catEl) catEl.value = '';
  if (brandEl) brandEl.value = '';
  renderPurchaseCart();
}

// ═══════════════════════════════════════════════════════
//  EXCHANGE SYSTEM
// ═══════════════════════════════════════════════════════

var __pendingExchanges = [];
var __exchangeBillData = null;

async function renderExchangesPage() {
  var excDateEl = document.getElementById('exc-date');
  if (excDateEl && !excDateEl.value) excDateEl.value = new Date().toISOString().slice(0, 10);

  // If arriving from sale detail "Exchange" button, pre-load that bill
  if (window.__exchangeSourceBill && window.__exchangeSourceBillItems) {
    loadBillIntoExchangePage(window.__exchangeSourceBill, window.__exchangeSourceBillItems);
    window.__exchangeSourceBill = null;
    window.__exchangeSourceBillItems = null;
  }
  renderExchangeList();
}

async function searchExchangeBill() {
  var query = (document.getElementById('exc-bill-search').value || '').toLowerCase().trim();
  if (query.length < 1) { document.getElementById('exc-bill-results').innerHTML = ''; return; }
  var rows = await apiGet('/sales');
  // Group into bills
  var bills = groupSalesIntoBills(rows);
  var matches = bills.filter(function (b) {
    return (b.bill_no ? String(b.bill_no) : '').includes(query) ||
      (b.customer_name || '').toLowerCase().includes(query);
  }).slice(0, 8);
  var resultsEl = document.getElementById('exc-bill-results');
  if (!matches.length) { resultsEl.innerHTML = '<div class="empty-state" style="padding:12px">No bills found.</div>'; return; }
  resultsEl.innerHTML = matches.map(function (b) {
    var safeBill = JSON.stringify({ billId: b.bill_id, billNo: b.bill_no, customerId: b.customer_id, customerName: b.customer_name }).replace(/"/g, '&quot;');
    var safeItems = JSON.stringify(b.items).replace(/"/g, '&quot;');
    return '<div class="exc-bill-result-item" onclick="loadBillIntoExchangePage(' + safeBill + ',' + safeItems + ')">' +
      '<strong>Bill #' + (b.bill_no || '—') + '</strong> · ' + b.date +
      (b.customer_name ? ' · ' + esc(b.customer_name) : ' · Walk-in') +
      ' · ' + fmt(b.total) + ' (' + b.items.length + ' item' + (b.items.length > 1 ? 's' : '') + ')' +
      '</div>';
  }).join('');
}

function loadBillIntoExchangePage(billData, items) {
  __exchangeBillData = billData;
  window.__exchangeBillItems = items;
  __pendingExchanges = [];
  var panel = document.getElementById('exc-bill-panel');
  var pendingSection = document.getElementById('exc-pending-section');
  if (panel) panel.style.display = 'block';
  if (pendingSection) pendingSection.style.display = 'none';
  var header = document.getElementById('exc-bill-header');
  if (header) header.innerHTML = '<i class="ti ti-receipt"></i> Bill #' + (billData.billNo || '—') + (billData.customerName ? ' · ' + esc(billData.customerName) : '');
  var resultsEl = document.getElementById('exc-bill-results');
  if (resultsEl) resultsEl.innerHTML = '';
  var searchEl = document.getElementById('exc-bill-search');
  if (searchEl) searchEl.value = 'Bill #' + (billData.billNo || '—') + (billData.customerName ? ' · ' + billData.customerName : '');
  renderExchangeBillItems(items);
}

function renderExchangeBillItems(items) {
  var tb = document.getElementById('exc-bill-items');
  if (!tb) return;
  tb.innerHTML = (items || []).map(function (it, idx) {
    var unitPrice = it.unit_price != null ? Number(it.unit_price) : (Number(it.amount) / (Number(it.quantity) || 1));
    var alreadyPending = __pendingExchanges.some(function (p) { return p.origIdx === idx; });
    return '<tr>' +
      '<td>' + esc(it.desc || it.description || '') + '</td>' +
      '<td class="num">' + (it.quantity || 1) + '</td>' +
      '<td class="num">' + fmt(unitPrice) + '</td>' +
      '<td class="num">' + fmt(it.amount) + '</td>' +
      '<td><button class="btn-secondary" style="font-size:11.5px;padding:5px 10px;' + (alreadyPending ? 'opacity:0.4' : 'color:var(--accent);border-color:var(--accent)') + '" onclick="addItemToExchange(' + idx + ')" ' + (alreadyPending ? 'disabled' : '') + '><i class="ti ti-switch-3"></i> Exchange</button></td>' +
      '</tr>';
  }).join('');
}

function addItemToExchange(itemIdx) {
  var item = (window.__exchangeBillItems || [])[itemIdx];
  if (!item) return;
  var unitPrice = item.unit_price != null ? Number(item.unit_price) : (Number(item.amount) / (Number(item.quantity) || 1));
  __pendingExchanges.push({
    origIdx: itemIdx,
    origProductId: item.product_id || null,
    origDesc: item.desc || item.description || '',
    origQty: Number(item.quantity) || 1,
    origPrice: unitPrice,
    newProductId: null, newDesc: '', newQty: 1, newPrice: 0
  });
  renderExchangeBillItems(window.__exchangeBillItems); // refresh to show disabled state
  renderPendingExchanges();
  document.getElementById('exc-pending-section').style.display = 'block';
}

function removeExchangeItem(idx) {
  __pendingExchanges.splice(idx, 1);
  renderExchangeBillItems(window.__exchangeBillItems);
  renderPendingExchanges();
  if (!__pendingExchanges.length) document.getElementById('exc-pending-section').style.display = 'none';
}

function updateExchangeField(idx, field, value) {
  if (!__pendingExchanges[idx]) return;
  __pendingExchanges[idx][field] = value;
  renderPendingExchanges();
}

function renderPendingExchanges() {
  var tb = document.getElementById('exc-pending-tbody');
  var netDiff = 0;
  if (tb) tb.innerHTML = __pendingExchanges.map(function (p, i) {
    var diff = (p.newPrice * p.newQty) - (p.origPrice * p.origQty);
    netDiff += diff;
    var diffColor = diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--danger)' : 'var(--text-2)';
    var diffStr = (diff >= 0 ? '+' : '') + fmt(diff);
    return '<tr>' +
      '<td style="font-size:12.5px">' + esc(p.origDesc) + '</td>' +
      '<td class="num">' + p.origQty + '</td>' +
      '<td class="num">' + fmt(p.origPrice) + '</td>' +
      '<td><div class="search-pick-wrap" style="min-width:160px">' +
        '<input type="text" class="search-pick-input" id="exc-new-search-' + i + '" placeholder="Search replacement..." autocomplete="off" oninput="searchExchangeNewProduct(' + i + ',this.value)" />' +
        '<div id="exc-new-results-' + i + '" class="search-pick-results"></div>' +
      '</div>' +
      (p.newDesc ? '<div style="font-size:11.5px;color:var(--ok);margin-top:3px"><i class="ti ti-check"></i> ' + esc(p.newDesc) + '</div>' : '') +
      '</td>' +
      '<td class="num"><input type="number" value="' + p.newQty + '" min="1" style="width:60px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;text-align:center;background:var(--surface-2);color:var(--text)" onchange="updateExchangeField(' + i + ',\'newQty\',+this.value||1);updateExchangeField(' + i + ',\'newQty\',+this.value||1)" /></td>' +
      '<td class="num"><input type="number" value="' + p.newPrice + '" min="0" step="0.01" style="width:80px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;text-align:center;background:var(--surface-2);color:var(--text)" onchange="updateExchangeField(' + i + ',\'newPrice\',+this.value||0)" /></td>' +
      '<td class="num" style="font-weight:700;color:' + diffColor + '">' + diffStr + '</td>' +
      '<td><button class="del-btn" onclick="removeExchangeItem(' + i + ')"><i class="ti ti-trash"></i></button></td>' +
      '</tr>';
  }).join('');
  var netEl = document.getElementById('exc-net-diff-val');
  if (netEl) {
    netEl.textContent = (netDiff >= 0 ? '+' : '') + fmt(netDiff);
    netEl.style.color = netDiff > 0 ? 'var(--ok)' : netDiff < 0 ? 'var(--danger)' : 'var(--text-2)';
  }
  var netRow = document.getElementById('exc-net-diff-row');
  if (netRow) {
    var label = netRow.querySelector('span');
    if (label) label.textContent = netDiff > 0 ? 'Customer pays (net)' : netDiff < 0 ? 'Refund to customer (net)' : 'No price difference';
  }
}

async function searchExchangeNewProduct(exchIdx, query) {
  var resultsEl = document.getElementById('exc-new-results-' + exchIdx);
  if (!resultsEl) return;
  if (!query || query.length < 1) { resultsEl.style.display = 'none'; return; }
  var prods = await searchProductsApi(query);
  if (!prods || !prods.length) { resultsEl.innerHTML = '<div class="search-pick-empty">No products found</div>'; resultsEl.style.display = 'block'; return; }
  resultsEl.innerHTML = prods.slice(0, 6).map(function (p) {
    return '<div class="search-pick-item" onmousedown="selectExchangeNewProduct(' + exchIdx + ',' + JSON.stringify(p).replace(/"/g, '&quot;') + ')">' +
      '<div class="spi-name">' + esc(p.name) + '</div>' +
      '<div class="spi-meta">Stock: ' + p.quantity + ' · Sell: ' + fmt(p.sell_price) + '</div>' +
      '</div>';
  }).join('');
  resultsEl.style.display = 'block';
}

function selectExchangeNewProduct(exchIdx, p) {
  var ex = __pendingExchanges[exchIdx];
  if (!ex) return;
  ex.newProductId = p.id;
  ex.newDesc = p.name;
  ex.newPrice = Number(p.sell_price) || 0;
  var searchEl = document.getElementById('exc-new-search-' + exchIdx);
  if (searchEl) searchEl.value = p.name;
  var resultsEl = document.getElementById('exc-new-results-' + exchIdx);
  if (resultsEl) resultsEl.style.display = 'none';
  renderPendingExchanges();
}

async function saveExchanges() {
  if (!__pendingExchanges.length) return alert('No items to exchange.');
  var invalid = __pendingExchanges.filter(function (p) { return !p.newDesc; });
  if (invalid.length) return alert('Please select a replacement product for all exchange items.');
  var billData = __exchangeBillData || {};
  var date = document.getElementById('exc-date') ? document.getElementById('exc-date').value : new Date().toISOString().slice(0, 10);
  var note = document.getElementById('exc-note') ? document.getElementById('exc-note').value : '';
  for (var i = 0; i < __pendingExchanges.length; i++) {
    var ex = __pendingExchanges[i];
    var res = await apiPost('/exchanges', {
      date: date, original_bill_id: billData.billId, original_bill_no: billData.billNo,
      customer_name: billData.customerName, customer_id: billData.customerId,
      original_product_id: ex.origProductId, original_desc: ex.origDesc, original_qty: ex.origQty, original_price: ex.origPrice,
      new_product_id: ex.newProductId, new_desc: ex.newDesc, new_qty: ex.newQty, new_price: ex.newPrice,
      note: note
    });
    if (res && res.error) { alert('Error: ' + res.error); return; }
  }
  toast('Exchanges saved — stock updated', 'ok');
  __pendingExchanges = [];
  renderExchangeList();
  document.getElementById('exc-bill-panel').style.display = 'none';
  document.getElementById('exc-pending-section').style.display = 'none';
  document.getElementById('exc-bill-search').value = '';
}

async function renderExchangeList() {
  var search = (document.getElementById('exchlist-search') ? document.getElementById('exchlist-search').value : '').toLowerCase();
  var from = document.getElementById('exchlist-from') ? document.getElementById('exchlist-from').value : '';
  var to = document.getElementById('exchlist-to') ? document.getElementById('exchlist-to').value : '';
  var rows = await apiGet('/exchanges');
  rows.sort(function (a, b) { return b.id - a.id; });
  if (from) rows = rows.filter(function (r) { return r.date >= from; });
  if (to) rows = rows.filter(function (r) { return r.date <= to; });
  if (search) rows = rows.filter(function (r) {
    return (r.customer_name || '').toLowerCase().includes(search) ||
      (r.original_bill_no ? String(r.original_bill_no) : '').includes(search) ||
      (r.original_desc || '').toLowerCase().includes(search) ||
      (r.new_desc || '').toLowerCase().includes(search);
  });
  var tb = document.getElementById('exchangelist-tbody');
  if (!tb) return;
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="empty-state">No exchanges yet.</td></tr>'; return; }
  window.__exchangeRows = rows;
  var isManager = currentRole === 'manager';
  tb.innerHTML = rows.map(function (r, i) {
    var diff = Number(r.price_diff || 0);
    var diffStr = (diff >= 0 ? '+' : '') + fmt(diff);
    var diffColor = diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--danger)' : 'var(--text-2)';
    var delBtn = isManager ? '<button class="del-btn" title="Delete & reverse exchange" onclick="event.stopPropagation();deleteExchange(' + r.id + ')"><i class="ti ti-trash"></i></button>' : '';
    return '<tr class="clickable-row" onclick="viewExchangeDetail(window.__exchangeRows[' + i + '])">' +
      '<td>' + r.date + '</td>' +
      '<td>' + (r.original_bill_no ? '#' + r.original_bill_no : '—') + '</td>' +
      '<td>' + (esc(r.customer_name) || '<span style="color:var(--text-3)">Walk-in</span>') + '</td>' +
      '<td><span style="color:var(--danger)">↩</span> ' + esc(r.original_desc) + ' ×' + r.original_qty + '</td>' +
      '<td><span style="color:var(--ok)">↪</span> ' + esc(r.new_desc) + ' ×' + r.new_qty + '</td>' +
      '<td class="num" style="font-weight:700;color:' + diffColor + '">' + diffStr + '</td>' +
      '<td>' + delBtn + '</td>' +
      '</tr>';
  }).join('');
}

function deleteExchange(id) {
  if (!confirm('Delete this exchange?\n\nThis will reverse the stock swap:\n• New item returned to stock\n• Original item removed from stock')) return;
  deleteRow('exchanges', id, function () { toast('Exchange deleted — stock reversed', 'ok'); renderExchangeList(); });
}

function viewExchangeDetail(r) {
  var diff = Number(r.price_diff || 0);
  var diffLabel = diff > 0 ? 'Customer paid extra' : diff < 0 ? 'Refunded to customer' : 'No difference';
  openViewEntryModal('Exchange — Bill #' + (r.original_bill_no || '—'), [
    { label: 'Date', value: r.date },
    { label: 'Customer', value: esc(r.customer_name) || 'Walk-in' },
    { label: 'Original bill', value: r.original_bill_no ? '#' + r.original_bill_no : '—' },
    { label: 'Returned item', value: esc(r.original_desc) + ' ×' + r.original_qty + ' @ ' + fmt(r.original_price) },
    { label: 'New item', value: esc(r.new_desc) + ' ×' + r.new_qty + ' @ ' + fmt(r.new_price) },
    { label: diffLabel, value: '<span style="font-weight:700;color:' + (diff > 0 ? 'var(--ok)' : diff < 0 ? 'var(--danger)' : 'var(--text-2)') + '">' + (diff >= 0 ? '+' : '') + fmt(diff) + '</span>' },
    { label: 'Note', value: esc(r.note) || '—' }
  ]);
}

function clearExchFilter() {
  ['exchlist-search', 'exchlist-from', 'exchlist-to'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  renderExchangeList();
}

// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  CASH FLOW PAGE
// ═══════════════════════════════════════════════════════

var __cfPeriod = 'today';

function setCFPeriod(period) {
  __cfPeriod = period;
  document.querySelectorAll('[id^="cf-"]').forEach(function (b) { if (b.tagName === 'BUTTON') b.classList.remove('active'); });
  var btn = document.getElementById('cf-' + period);
  if (btn) btn.classList.add('active');
  var today = new Date().toISOString().slice(0, 10);
  var fromDate = today, toDate = today;
  if (period === '7d') { var d = new Date(); d.setDate(d.getDate() - 6); fromDate = d.toISOString().slice(0, 10); }
  if (period === '1m') { var d2 = new Date(); d2.setMonth(d2.getMonth() - 1); fromDate = d2.toISOString().slice(0, 10); }
  if (period === '1y') { var d3 = new Date(); d3.setFullYear(d3.getFullYear() - 1); fromDate = d3.toISOString().slice(0, 10); }
  if (period === 'all') { fromDate = '2000-01-01'; }
  var fromEl = document.getElementById('cf-from'); if (fromEl) fromEl.value = fromDate;
  var toEl = document.getElementById('cf-to'); if (toEl) toEl.value = toDate;
  renderCashFlowPage();
}

async function renderCashFlowPage() {
  var fromEl = document.getElementById('cf-from');
  var toEl = document.getElementById('cf-to');
  var today = new Date().toISOString().slice(0, 10);
  if (!fromEl.value) { fromEl.value = today; toEl.value = today; }
  var from = fromEl.value, to = toEl.value;
  var inRange = function (d) { return d >= from && d <= to; };
  var content = document.getElementById('cashflow-content');
  content.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-2)"><i class="ti ti-refresh"></i> Calculating...</div>';

  var results = await Promise.all([
    apiGet('/sales'), apiGet('/expenses'), apiGet('/dues'), apiGet('/due-paid'),
    apiGet('/sales-returns'), apiGet('/exchanges'), apiGet('/purchases')
  ]);
  var allSales = results[0], allExpenses = results[1], allDues = results[2], allDuePaid = results[3],
      allReturns = results[4], allExchanges = results[5], allPurchases = results[6];

  var sales     = allSales.filter(function (r) { return inRange(r.date); });
  var expenses  = allExpenses.filter(function (r) { return inRange(r.date); });
  var returns   = allReturns.filter(function (r) { return inRange(r.date); });
  var exchanges = allExchanges.filter(function (r) { return inRange(r.date); });
  var duePaid   = allDuePaid.filter(function (r) { return inRange(r.date); });
  var periodDues = allDues.filter(function (r) { return inRange(r.date); });

  // ── Revenue ──
  var grossSales     = sales.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var totalReturns   = returns.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var exchangeDiff   = exchanges.reduce(function (s, r) { return s + Number(r.price_diff || 0); }, 0);
  var netRevenue     = grossSales - totalReturns + exchangeDiff;

  // ── Cash In ──
  var duesCreated    = periodDues.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var directCash     = netRevenue - duesCreated; // collected at point of sale
  var dueCollected   = duePaid.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var totalCashIn    = directCash + dueCollected;

  // ── Cash Out ──
  var totalExpenses  = expenses.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var refundsGiven   = totalReturns + Math.max(0, -exchangeDiff); // cash given back
  var totalCashOut   = totalExpenses + refundsGiven;

  // ── Net Position ──
  var netCash = totalCashIn - totalCashOut;

  // ── Outstanding (all time) ──
  var allGrossDues   = allDues.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var allDuePaidTot  = allDuePaid.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  var netOutstanding = Math.max(0, allGrossDues - allDuePaidTot);

  var periodLabel = from === to ? from : from + ' → ' + to;

  function cfRow(label, value, color, indent, bold) {
    var col = color || 'var(--text)';
    var sign = (value > 0 && color === 'var(--ok)') ? '+' : '';
    return '<div class="cf-row' + (bold ? ' cf-row-total' : '') + (indent ? ' cf-row-indent' : '') + '">' +
      '<span class="cf-label">' + label + '</span>' +
      '<span class="cf-value" style="color:' + col + '">' + sign + fmt(value) + '</span>' +
      '</div>';
  }
  function cfDivider(title) {
    return '<div class="cf-divider">' + title + '</div>';
  }

  content.innerHTML =
    '<div class="cf-period-note">Period: <strong>' + periodLabel + '</strong></div>' +
    '<div class="cf-columns">' +

    // LEFT: Revenue Statement
    '<div class="detail-card cf-card">' +
    '<div class="detail-card-header"><i class="ti ti-chart-bar"></i> Revenue Statement</div>' +
    '<div class="cf-body">' +
    cfRow('Gross Sales', grossSales) +
    cfRow('Sales Returns', -totalReturns, 'var(--danger)', true) +
    cfRow('Exchange Difference', exchangeDiff, exchangeDiff >= 0 ? 'var(--ok)' : 'var(--danger)', true) +
    cfRow('Net Revenue', netRevenue, netRevenue >= 0 ? 'var(--ok)' : 'var(--danger)', false, true) +
    '</div></div>' +

    // MIDDLE: Cash Flow
    '<div class="detail-card cf-card">' +
    '<div class="detail-card-header"><i class="ti ti-cash"></i> Cash Flow</div>' +
    '<div class="cf-body">' +
    cfDivider('Cash In') +
    cfRow('Collected at sale', directCash, 'var(--ok)', true) +
    cfRow('Due payments received', dueCollected, 'var(--ok)', true) +
    cfRow('Total Cash In', totalCashIn, 'var(--ok)', false, true) +
    cfDivider('Cash Out') +
    cfRow('Expenses paid', totalExpenses, 'var(--danger)', true) +
    cfRow('Refunds given', refundsGiven, 'var(--danger)', true) +
    cfRow('Total Cash Out', totalCashOut, 'var(--danger)', false, true) +
    cfDivider('') +
    cfRow('NET CASH POSITION', netCash, netCash >= 0 ? 'var(--ok)' : 'var(--danger)', false, true) +
    '</div></div>' +

    // RIGHT: Outstanding
    '<div class="detail-card cf-card">' +
    '<div class="detail-card-header"><i class="ti ti-clock"></i> Receivables (All time)</div>' +
    '<div class="cf-body">' +
    cfRow('Total dues created', allGrossDues) +
    cfRow('Total dues collected', allDuePaidTot, 'var(--ok)', true) +
    cfRow('Net outstanding', netOutstanding, netOutstanding > 0 ? 'var(--warn)' : 'var(--ok)', false, true) +
    (netOutstanding > 0 ? '<div style="font-size:11.5px;color:var(--text-2);padding:12px 16px;line-height:1.5">Tk ' + netOutstanding.toLocaleString('en-US', {minimumFractionDigits:2}) + ' is owed by customers and not yet collected.</div>' : '<div style="font-size:12px;color:var(--ok);padding:12px 16px"><i class="ti ti-circle-check"></i> All dues fully collected!</div>') +
    '</div></div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  SALESMAN TRACKING
// ═══════════════════════════════════════════════════════

async function loadSalesmanDropdown() {
  var sel = document.getElementById('cart-salesman');
  if (!sel) return;
  try {
    var staff = await apiGet('/staff');
    var current = sel.value;
    sel.innerHTML = '<option value="">— Walk-in / self —</option>' +
      (staff || []).map(function (s) {
        return '<option value="' + s.id + '" data-name="' + esc(s.name) + '">' + esc(s.name) + '</option>';
      }).join('');
    if (current) sel.value = current;
  } catch (e) { console.warn('Could not load staff for salesman dropdown', e); }
}

// ═══════════════════════════════════════════════════════
//  ATTENDANCE RULES
// ═══════════════════════════════════════════════════════

var __attRules = { entryTime: '09:00', lunchMaxMinutes: 60 };

function loadAttRules() {
  try {
    var saved = localStorage.getItem('bm-att-rules');
    if (saved) __attRules = JSON.parse(saved);
  } catch (e) {}
}

function saveAttRules() {
  var entryTime = (document.getElementById('att-rule-entry').value || '09:00');
  var lunchMax = parseInt(document.getElementById('att-rule-lunch').value) || 60;
  __attRules = { entryTime: entryTime, lunchMaxMinutes: lunchMax };
  try { localStorage.setItem('bm-att-rules', JSON.stringify(__attRules)); } catch (e) {}
  toast('Rules saved', 'ok');
  updateAttRulesInfo();
  renderAttendancePage();
}

function updateAttRulesInfo() {
  var el = document.getElementById('att-rules-info');
  if (el) el.textContent = 'Staff arriving after ' + (__attRules.entryTime || '09:00') + ' will be marked Late. Max lunch: ' + (__attRules.lunchMaxMinutes || 60) + ' minutes.';
}

function calcLateMinutes(entryTime) {
  if (!entryTime || !__attRules.entryTime) return 0;
  var ruleMin = timeToMinutes(__attRules.entryTime);
  var actualMin = timeToMinutes(entryTime);
  return Math.max(0, actualMin - ruleMin);
}

function calcLunchMinutes(lunchOut, lunchIn) {
  if (!lunchOut || !lunchIn) return 0;
  return Math.max(0, timeToMinutes(lunchIn) - timeToMinutes(lunchOut));
}

function timeToMinutes(t) {
  if (!t) return 0;
  var parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

function minsToLabel(mins) {
  if (mins <= 0) return '';
  if (mins < 60) return mins + 'm';
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
}

// ═══════════════════════════════════════════════════════
//  ATTENDANCE SYSTEM
// ═══════════════════════════════════════════════════════

var __attChart = null, __attLateChart = null;

async function renderAttendancePage() {
  loadAttRules();

  // Show/hide rules panel for managers
  var rulesSection = document.getElementById('att-rules-section');
  if (rulesSection) rulesSection.style.display = (currentRole === 'manager') ? 'block' : 'none';
  // Populate rules inputs
  var ruleEntry = document.getElementById('att-rule-entry');
  var ruleLunch = document.getElementById('att-rule-lunch');
  if (ruleEntry) ruleEntry.value = __attRules.entryTime || '09:00';
  if (ruleLunch) ruleLunch.value = __attRules.lunchMaxMinutes || 60;
  updateAttRulesInfo();

  var dateEl = document.getElementById('att-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  var dateFilter = dateEl ? dateEl.value : '';
  var search = (document.getElementById('att-search') ? document.getElementById('att-search').value : '').toLowerCase();

  // Load staff into select
  var staffSel = document.getElementById('att-staff-select');
  if (staffSel && staffSel.options.length <= 1) {
    var staffList = await apiGet('/staff') || [];
    staffList.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id; opt.dataset.name = s.name; opt.textContent = s.name;
      staffSel.appendChild(opt);
    });
  }

  var allRows = await apiGet('/attendance') || [];
  var rows = allRows;
  if (dateFilter) rows = rows.filter(function (r) { return r.date === dateFilter; });
  if (search) rows = rows.filter(function (r) { return (r.staff_name || '').toLowerCase().includes(search); });
  rows.sort(function (a, b) { return b.date.localeCompare(a.date) || b.id - a.id; });

  var tb = document.getElementById('attendance-tbody');
  if (tb) {
    window.__attRows = rows;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9" class="empty-state">No records' + (dateFilter ? ' for ' + dateFilter : '') + '.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r, i) {
        var lateMin = (r.status === 'present' || r.status === 'late') ? calcLateMinutes(r.entry_time) : 0;
        var isLate = lateMin > 0;
        var displayStatus = isLate ? 'late' : (r.status || 'present');
        var statusColor = displayStatus === 'present' ? 'var(--ok)' : displayStatus === 'late' ? 'var(--warn)' : displayStatus === 'leave' ? '#6366f1' : 'var(--danger)';
        var statusLabel = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
        var lunchMin = calcLunchMinutes(r.lunch_out, r.lunch_in);
        var lunchOverMin = lunchMin - (__attRules.lunchMaxMinutes || 60);
        var lunchLabel = lunchMin > 0 ? minsToLabel(lunchMin) + (lunchOverMin > 0 ? ' <span style="color:var(--danger)">(+' + minsToLabel(lunchOverMin) + ')</span>' : '') : '—';
        return '<tr>' +
          '<td>' + r.date + '</td>' +
          '<td style="font-weight:600">' + esc(r.staff_name) + '</td>' +
          '<td><span style="color:' + statusColor + ';font-weight:600">' + statusLabel + '</span></td>' +
          '<td>' + (r.entry_time || '—') + '</td>' +
          '<td>' + (isLate ? '<span style="color:var(--warn);font-weight:600">+' + minsToLabel(lateMin) + '</span>' : '<span style="color:var(--ok)">On time</span>') + '</td>' +
          '<td>' + (r.exit_time || '—') + '</td>' +
          '<td>' + lunchLabel + '</td>' +
          '<td style="color:var(--text-2);font-size:12px">' + (esc(r.note) || '') + '</td>' +
          '<td style="white-space:nowrap">' +
          '<button class="edit-btn" onclick="openAttEdit(' + i + ')" title="Edit"><i class="ti ti-pencil"></i></button> ' +
          '<button class="del-btn" onclick="deleteRow(\'attendance\',' + r.id + ',renderAttendancePage)" title="Delete"><i class="ti ti-trash"></i></button>' +
          '</td></tr>';
      }).join('');
    }
  }

  renderAttendanceCharts(allRows);
}

function openAttEdit(idx) {
  var r = (window.__attRows || [])[idx];
  if (!r) return;
  document.getElementById('att-edit-id').value = r.id;
  document.getElementById('att-edit-status').value = r.status || 'present';
  document.getElementById('att-edit-entry').value = r.entry_time || '';
  document.getElementById('att-edit-exit').value = r.exit_time || '';
  document.getElementById('att-edit-lunch-out').value = r.lunch_out || '';
  document.getElementById('att-edit-lunch-in').value = r.lunch_in || '';
  document.getElementById('att-edit-note').value = r.note || '';
  document.getElementById('att-edit-section').style.display = 'block';
  document.getElementById('att-edit-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveAttEdit() {
  var id = document.getElementById('att-edit-id').value;
  if (!id) return;
  var status = document.getElementById('att-edit-status').value;
  var entryTime = document.getElementById('att-edit-entry').value;
  var exitTime = document.getElementById('att-edit-exit').value;
  var lunchOut = document.getElementById('att-edit-lunch-out').value;
  var lunchIn = document.getElementById('att-edit-lunch-in').value;
  var note = document.getElementById('att-edit-note').value;
  // Auto-detect late
  var lateMin = (status === 'present') ? calcLateMinutes(entryTime) : 0;
  if (lateMin > 0) status = 'late';
  var res = await fetch('/api/attendance/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status, entry_time: entryTime || null, exit_time: exitTime || null, lunch_out: lunchOut || null, lunch_in: lunchIn || null, note: note }) });
  document.getElementById('att-edit-section').style.display = 'none';
  toast('Attendance updated', 'ok');
  renderAttendancePage();
}

async function addAttendance() {
  var staffSel = document.getElementById('att-staff-select');
  var staffId = staffSel ? staffSel.value : null;
  var staffName = staffSel && staffSel.value ? staffSel.options[staffSel.selectedIndex].dataset.name : '';
  if (!staffName) return alert('Please select a staff member.');
  var dateEl = document.getElementById('att-date');
  var date = dateEl ? dateEl.value : new Date().toISOString().slice(0, 10);
  var status = document.getElementById('att-status').value;
  var entryTime = document.getElementById('att-entry').value;
  var exitTime = document.getElementById('att-exit').value;
  var lunchOut = document.getElementById('att-lunch-out').value;
  var lunchIn = document.getElementById('att-lunch-in').value;
  var note = document.getElementById('att-note').value;
  // Auto-calculate late based on rules
  if (status === 'present' && entryTime) {
    var lateMin = calcLateMinutes(entryTime);
    if (lateMin > 0) status = 'late';
  }
  var res = await apiPost('/attendance', { staff_id: staffId, staff_name: staffName, date: date, status: status, entry_time: entryTime || null, exit_time: exitTime || null, lunch_out: lunchOut || null, lunch_in: lunchIn || null, note: note });
  if (res && res.error) { alert(res.error); return; }
  ['att-entry', 'att-exit', 'att-lunch-out', 'att-lunch-in', 'att-note'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  if (staffSel) staffSel.value = '';
  document.getElementById('att-status').value = 'present';
  toast(staffName + ' attendance saved' + (status === 'late' ? ' — marked Late' : ''), 'ok');
  renderAttendancePage();
}

function renderAttendanceCharts(rows) {
  var counts = { present: 0, late: 0, absent: 0, leave: 0 };
  rows.forEach(function (r) {
    var lateMin = (r.status === 'present' || r.status === 'late') ? calcLateMinutes(r.entry_time) : 0;
    var effective = lateMin > 0 ? 'late' : (r.status || 'present');
    if (counts[effective] !== undefined) counts[effective]++;
    else counts.present++;
  });

  var attCanvas = document.getElementById('att-chart');
  if (attCanvas) {
    if (__attChart) __attChart.destroy();
    __attChart = new Chart(attCanvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Present', 'Late', 'Absent', 'Leave'], datasets: [{ data: [counts.present, counts.late, counts.absent, counts.leave], backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6366f1'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 10 } } } }
    });
  }

  var lateCounts = {};
  rows.forEach(function (r) {
    var lateMin = (r.status === 'present' || r.status === 'late') ? calcLateMinutes(r.entry_time) : 0;
    if (lateMin > 0) lateCounts[r.staff_name] = (lateCounts[r.staff_name] || 0) + 1;
  });
  var lateNames = Object.keys(lateCounts).sort(function (a, b) { return lateCounts[b] - lateCounts[a]; });

  var lateCanvas = document.getElementById('att-late-chart');
  if (lateCanvas) {
    if (__attLateChart) __attLateChart.destroy();
    __attLateChart = new Chart(lateCanvas.getContext('2d'), {
      type: 'bar',
      data: { labels: lateNames.length ? lateNames : ['No late records'], datasets: [{ label: 'Late count', data: lateNames.length ? lateNames.map(function (n) { return lateCounts[n]; }) : [0], backgroundColor: '#f59e0b', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }
}

// ═══════════════════════════════════════════════════════
//  STAFF REPORTS — Per-staff attendance + sales breakdown
// ═══════════════════════════════════════════════════════

async function renderStaffReportsPage() {
  var from = document.getElementById('sr-from') ? document.getElementById('sr-from').value : '';
  var to = document.getElementById('sr-to') ? document.getElementById('sr-to').value : '';
  var inRange = function (d) { return (!from || d >= from) && (!to || d <= to); };
  var content = document.getElementById('staffreports-content');
  content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-2)">Loading...</div>';
  loadAttRules();

  var results = await Promise.all([apiGet('/staff'), apiGet('/attendance'), apiGet('/sales')]);
  var staffList = results[0] || [], allAtt = results[1] || [], allSales = results[2] || [];

  var att = allAtt.filter(function (r) { return inRange(r.date); });
  var sales = allSales.filter(function (r) { return inRange(r.date); });

  if (!staffList.length) { content.innerHTML = '<div class="empty-state" style="padding:30px">No staff found. Add staff in Manage Staff.</div>'; return; }

  var html = '<div class="cf-columns">';
  staffList.forEach(function (s) {
    var sAtt = att.filter(function (r) { return r.staff_id === s.id || (r.staff_name || '').toLowerCase() === (s.name || '').toLowerCase(); });
    var sSales = sales.filter(function (r) { return r.salesman_id === s.id || (r.salesman_name || '').toLowerCase() === (s.name || '').toLowerCase(); });
    var totalSales = sSales.reduce(function (t, r) { return t + Number(r.amount || 0); }, 0);
    var bills = new Set(sSales.map(function (r) { return r.bill_id; })).size;

    var attCounts = { present: 0, late: 0, absent: 0, leave: 0 };
    var totalLateMin = 0;
    sAtt.forEach(function (r) {
      var lateMin = (r.status === 'present' || r.status === 'late') ? calcLateMinutes(r.entry_time) : 0;
      var eff = lateMin > 0 ? 'late' : (r.status || 'present');
      totalLateMin += lateMin;
      if (attCounts[eff] !== undefined) attCounts[eff]++; else attCounts.present++;
    });
    var totalDays = sAtt.length;

    html += '<div class="detail-card" style="cursor:pointer" onclick="openStaffDetailReport(' + s.id + ',\'' + esc(s.name) + '\')">' +
      '<div class="detail-card-header"><i class="ti ti-user"></i> ' + esc(s.name) + ' <span style="font-size:11px;color:var(--text-2);font-weight:400">— ' + esc(s.role) + '</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)"><div style="font-size:11px;color:var(--text-2)">Total Sales</div><div style="font-size:18px;font-weight:700;color:var(--ok)">' + fmt(totalSales) + '</div><div style="font-size:11px;color:var(--text-2)">' + bills + ' bills</div></div>' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--border)"><div style="font-size:11px;color:var(--text-2)">Attendance</div><div style="font-size:15px;font-weight:700">' + totalDays + ' days</div><div style="font-size:11px;color:var(--text-2)">' + attCounts.present + ' present · ' + attCounts.late + ' late · ' + attCounts.absent + ' absent</div></div>' +
      '<div style="padding:12px 16px;border-right:1px solid var(--border)"><div style="font-size:11px;color:var(--text-2)">Total late time</div><div style="font-size:15px;font-weight:700;color:' + (totalLateMin > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + (totalLateMin > 0 ? minsToLabel(totalLateMin) : 'Never late') + '</div></div>' +
      '<div style="padding:12px 16px"><div style="font-size:11px;color:var(--text-2)">Leave / Absent</div><div style="font-size:15px;font-weight:700">' + attCounts.leave + ' leave · ' + attCounts.absent + ' absent</div></div>' +
      '</div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--border);font-size:12px;color:var(--accent)"><i class="ti ti-arrow-right"></i> Click for full report</div>' +
      '</div>';
  });
  html += '</div>';
  content.innerHTML = html;
}

async function openStaffDetailReport(staffId, staffName) {
  var from = document.getElementById('sr-from') ? document.getElementById('sr-from').value : '';
  var to = document.getElementById('sr-to') ? document.getElementById('sr-to').value : '';
  var inRange = function (d) { return (!from || d >= from) && (!to || d <= to); };
  loadAttRules();

  var results = await Promise.all([apiGet('/attendance'), apiGet('/sales')]);
  var allAtt = results[0] || [], allSales = results[1] || [];
  var nameLower = (staffName || '').toLowerCase();

  var att = allAtt.filter(function (r) { return inRange(r.date) && (r.staff_id === staffId || (r.staff_name || '').toLowerCase() === nameLower); });
  var sales = allSales.filter(function (r) { return inRange(r.date) && (r.salesman_id === staffId || (r.salesman_name || '').toLowerCase() === nameLower); });
  att.sort(function (a, b) { return b.date.localeCompare(a.date); });

  var attHtml = att.length ? att.map(function (r) {
    var lateMin = calcLateMinutes(r.entry_time);
    var eff = (r.status === 'present' && lateMin > 0) ? 'late' : r.status;
    var col = eff === 'present' ? 'var(--ok)' : eff === 'late' ? 'var(--warn)' : eff === 'leave' ? '#6366f1' : 'var(--danger)';
    var lunchMin = calcLunchMinutes(r.lunch_out, r.lunch_in);
    return '<tr><td>' + r.date + '</td><td style="color:' + col + ';font-weight:600">' + eff.charAt(0).toUpperCase() + eff.slice(1) + '</td>' +
      '<td>' + (r.entry_time || '—') + '</td><td>' + (lateMin > 0 ? '<span style="color:var(--warn)">+' + minsToLabel(lateMin) + '</span>' : 'On time') + '</td>' +
      '<td>' + (r.exit_time || '—') + '</td><td>' + (lunchMin > 0 ? minsToLabel(lunchMin) : '—') + '</td>' +
      '<td style="font-size:12px;color:var(--text-2)">' + (r.note || '') + '</td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty-state">No attendance records.</td></tr>';

  var salesTotal = sales.reduce(function (t, r) { return t + Number(r.amount || 0); }, 0);
  var billSet = new Set(sales.filter(function (r) { return r.bill_id; }).map(function (r) { return r.bill_id; }));

  openViewEntryModal('Staff Report — ' + staffName, [
    { label: 'Period', value: (from || 'All time') + (to ? ' → ' + to : '') },
    { label: 'Total Sales', value: '<span style="color:var(--ok);font-weight:700">' + fmt(salesTotal) + '</span> (' + billSet.size + ' bills, ' + sales.length + ' items)' },
    { label: 'Days tracked', value: att.length },
    { label: 'Attendance', value: '<table style="width:100%;font-size:13px;margin-top:6px"><thead><tr><th>Date</th><th>Status</th><th>Entry</th><th>Late by</th><th>Exit</th><th>Lunch</th><th>Note</th></tr></thead><tbody>' + attHtml + '</tbody></table>' }
  ]);
}

function clearSRFilter() {
  var from = document.getElementById('sr-from'); if (from) from.value = '';
  var to = document.getElementById('sr-to'); if (to) to.value = '';
  renderStaffReportsPage();
}

// ═══════════════════════════════════════════════════════

async function renderStaffSalesPage() {
  var from = document.getElementById('ss-from') ? document.getElementById('ss-from').value : '';
  var to = document.getElementById('ss-to') ? document.getElementById('ss-to').value : '';
  var inRange = function (d) { return (!from || d >= from) && (!to || d <= to); };
  var content = document.getElementById('staffsales-content');
  content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-2)">Loading...</div>';

  var rows = await apiGet('/sales');
  var filtered = rows.filter(function (r) { return inRange(r.date); });

  // Aggregate by salesman
  var salesmanMap = {};
  filtered.forEach(function (r) {
    var name = r.salesman_name || 'Unassigned';
    if (!salesmanMap[name]) salesmanMap[name] = { name: name, count: 0, bills: new Set(), total: 0 };
    salesmanMap[name].total += Number(r.amount || 0);
    salesmanMap[name].count++;
    if (r.bill_id) salesmanMap[name].bills.add(r.bill_id);
  });

  var salesmen = Object.values(salesmanMap).sort(function (a, b) { return b.total - a.total; });

  if (!salesmen.length) {
    content.innerHTML = '<div class="empty-state" style="padding:30px">No sales data for this period. Make sure to select a salesman when creating sales.</div>';
    return;
  }

  var totalAll = salesmen.reduce(function (s, x) { return s + x.total; }, 0);
  content.innerHTML = '<div class="list-card">' +
    '<div class="list-header"><i class="ti ti-chart-bar"></i> Sales by salesman' + (from || to ? ' (' + (from || '…') + ' → ' + (to || '…') + ')' : '') + '</div>' +
    '<div class="table-scroll"><table><thead><tr><th>Salesman</th><th class="num">Bills</th><th class="num">Items sold</th><th class="num">Total sales</th><th class="num">Share</th></tr></thead><tbody>' +
    salesmen.map(function (s) {
      var share = totalAll > 0 ? ((s.total / totalAll) * 100).toFixed(1) : '0.0';
      var barWidth = totalAll > 0 ? Math.round((s.total / totalAll) * 100) : 0;
      return '<tr><td style="font-weight:700">' + esc(s.name) + '</td>' +
        '<td class="num">' + s.bills.size + '</td>' +
        '<td class="num">' + s.count + '</td>' +
        '<td class="num" style="color:var(--ok);font-weight:700">' + fmt(s.total) + '</td>' +
        '<td class="num"><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:' + barWidth + '%;height:100%;background:var(--grad-cyan);border-radius:4px"></div></div>' + share + '%</div></td></tr>';
    }).join('') +
    '</tbody><tfoot><tr style="font-weight:700;border-top:2px solid var(--border)"><td>Total</td><td class="num"></td><td class="num">' + filtered.length + '</td><td class="num">' + fmt(totalAll) + '</td><td class="num">100%</td></tr></tfoot></table></div></div>';
}

function clearSSFilter() {
  var from = document.getElementById('ss-from'); if (from) from.value = '';
  var to = document.getElementById('ss-to'); if (to) to.value = '';
  renderStaffSalesPage();
}

// ═══════════════════════════════════════════════════════
//  REPORTS — Top Products / Categories / Brands
// ═══════════════════════════════════════════════════════

function renderTopSellersTables(sales, products) {
  // Map product_id to product metadata
  var prodMap = {};
  (products || []).forEach(function (p) { prodMap[p.id] = p; });

  var byProduct = {}, byCategory = {}, byBrand = {};

  sales.forEach(function (r) {
    var pid = r.product_id;
    var pname = r.desc || r.description || 'Custom item';
    var prod = pid ? prodMap[pid] : null;
    var cat = prod ? (prod.category_name || 'Uncategorized') : 'Uncategorized';
    var brand = prod ? (prod.brand_name || 'No brand') : 'No brand';
    var amt = Number(r.amount || 0);
    var qty = Number(r.quantity || 0);

    if (!byProduct[pname]) byProduct[pname] = { name: pname, qty: 0, total: 0 };
    byProduct[pname].qty += qty; byProduct[pname].total += amt;

    if (!byCategory[cat]) byCategory[cat] = { name: cat, total: 0 };
    byCategory[cat].total += amt;

    if (!byBrand[brand]) byBrand[brand] = { name: brand, total: 0 };
    byBrand[brand].total += amt;
  });

  function topTable(title, icon, data, key) {
    var sorted = Object.values(data).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);
    var maxVal = sorted.length ? sorted[0].total : 1;
    return '<div class="detail-card" style="margin-bottom:16px">' +
      '<div class="detail-card-header"><i class="ti ' + icon + '"></i> ' + title + '</div>' +
      '<div class="table-scroll"><table><thead><tr><th>' + key + '</th>' + (title.includes('Product') ? '<th class="num">Qty</th>' : '') + '<th class="num">Revenue</th><th style="width:120px"></th></tr></thead><tbody>' +
      sorted.map(function (x, i) {
        var bar = Math.round((x.total / maxVal) * 100);
        return '<tr><td><span style="color:var(--text-3);font-size:11px;margin-right:6px">#' + (i + 1) + '</span>' + esc(x.name) + '</td>' +
          (title.includes('Product') ? '<td class="num">' + x.qty + '</td>' : '') +
          '<td class="num" style="color:var(--ok);font-weight:700">' + fmt(x.total) + '</td>' +
          '<td><div style="height:7px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:' + bar + '%;height:100%;background:var(--grad-cyan);border-radius:4px"></div></div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  return '<div class="cf-columns">' +
    topTable('Best-selling products', 'ti-package', byProduct, 'Product') +
    topTable('Top categories', 'ti-tag', byCategory, 'Category') +
    topTable('Top brands', 'ti-bookmark', byBrand, 'Brand') +
    '</div>';
}

// ═══════════════════════════════════════════════════════
//  CSV EXPORT (#7) — Manager only
// ═══════════════════════════════════════════════════════

function downloadCSV(filename, rows, headers) {
  if (!rows || !rows.length) { toast('No data to export'); return; }
  var csvRows = [headers.join(',')];
  rows.forEach(function (r) {
    csvRows.push(headers.map(function (h) {
      var val = r[h] != null ? String(r[h]) : '';
      return '"' + val.replace(/"/g, '""') + '"';
    }).join(','));
  });
  var blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast('Exported ' + rows.length + ' rows', 'ok');
}

async function exportCSV(type) {
  if (currentRole !== 'manager') { alert('Only managers can export data.'); return; }
  var data, filename, headers;
  if (type === 'sales') {
    data = await apiGet('/sales');
    headers = ['date', 'bill_no', 'customer_name', 'description', 'quantity', 'unit_price', 'amount', 'salesman_name'];
    filename = 'bizsheba-sales-' + new Date().toISOString().slice(0,10) + '.csv';
  } else if (type === 'purchases') {
    data = await apiGet('/purchases');
    headers = ['date', 'purchase_no', 'supplier_name', 'total', 'amount_paid', 'due_amount'];
    filename = 'bizsheba-purchases-' + new Date().toISOString().slice(0,10) + '.csv';
  } else if (type === 'expenses') {
    data = await apiGet('/expenses');
    data = data.map(function (r) { return { ...r, desc: r.desc || r.description }; });
    headers = ['date', 'desc', 'amount'];
    filename = 'bizsheba-expenses-' + new Date().toISOString().slice(0,10) + '.csv';
  } else if (type === 'products') {
    data = await apiGet('/products');
    headers = ['name', 'barcode', 'quantity', 'unit', 'purchase_price', 'sell_price', 'category_name', 'brand_name'];
    filename = 'bizsheba-products-' + new Date().toISOString().slice(0,10) + '.csv';
  } else if (type === 'customers') {
    data = await apiGet('/customers');
    headers = ['name', 'phone', 'address'];
    filename = 'bizsheba-customers-' + new Date().toISOString().slice(0,10) + '.csv';
  }
  downloadCSV(filename, data, headers);
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
