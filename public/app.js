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
    applyFeatureFlags();
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
  warranty: renderWarrantyPage,
  hajira: renderHajiraPage,
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
  staffdetail: renderStaffDetailPage,
};

// expose to toggleLang
window.__pageRenderers = PAGE_RENDERERS;

function navigateTo(page) {
  startLoad(); // immediate visual feedback
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
  applyLang();
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
  var showing = __showPurchasePrice;
  if (showing) {
    document.body.classList.remove('hide-purchase-price');
  } else {
    document.body.classList.add('hide-purchase-price');
  }
  // Update all toggle buttons (products page + sales page)
  ['toggle-cost-btn','toggle-cost-btn-sales'].forEach(function(bid) {
    var btn = document.getElementById(bid);
    if (btn) { showing ? btn.classList.remove('cost-hidden') : btn.classList.add('cost-hidden'); }
  });
  ['toggle-cost-icon','toggle-cost-icon-sales'].forEach(function(iid) {
    var icon = document.getElementById(iid);
    if (icon) icon.className = showing ? 'ti ti-eye' : 'ti ti-eye-off';
  });
  ['toggle-cost-label','toggle-cost-label-sales'].forEach(function(lid) {
    var label = document.getElementById(lid);
    if (label) label.textContent = showing ? 'Hide cost' : 'Show cost';
  });
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
// ── Loading indicators ──
var __reqCount = 0;
function startLoad() { __reqCount++; }
function endLoad() { __reqCount = Math.max(0, __reqCount - 1); }
// Set a button into loading or normal state
function setBtn(btnEl, loading, loadingLabel) {
  if (!btnEl) return;
  if (loading) {
    btnEl.dataset.origHtml = btnEl.innerHTML;
    btnEl.innerHTML = '<span class="btn-spinner"></span>' + (loadingLabel || 'Saving…');
    btnEl.disabled = true;
  } else {
    if (btnEl.dataset.origHtml) btnEl.innerHTML = btnEl.dataset.origHtml;
    btnEl.disabled = false;
  }
}
// Show skeleton loader inside a container
function showSkeleton(containerId, rows) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '';
  for (var i = 0; i < (rows || 4); i++) {
    html += '<div class="skeleton-card"><div class="skeleton skeleton-line wide"></div><div class="skeleton skeleton-line med"></div><div class="skeleton skeleton-line short"></div></div>';
  }
  el.innerHTML = html;
}

async function apiGet(path) {
  startLoad();
  try {
    const r = await fetch(API + path);
    if (r.status === 403) { const d = await r.json().catch(function () { return {}; }); if (d.error === 'expired') showExpiredScreen(); }
    return r.json();
  } finally { endLoad(); }
}
async function apiPost(path, body) {
  startLoad();
  try {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  } finally { endLoad(); }
}
async function apiPut(path, body) {
  startLoad();
  try {
    const r = await fetch(API + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  } finally { endLoad(); }
}
async function apiDelete(path) {
  startLoad();
  try {
    const r = await fetch(API + path, { method: 'DELETE' });
    return r.json();
  } finally { endLoad(); }
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
    amount: Number(p.sell_price) || 0, cost_price: costPrice, unit: p.unit || 'pcs',
    warranty_months: Number(p.warranty_months) || 0,
    warranty_unit: p.warranty_unit || 'months',
    _origQty: 1
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

  var cartWM = 0;
  if (productId) { var cp2 = products.find(function(x){ return String(x.id)===String(productId); }); if (cp2) cartWM = Number(cp2.warranty_months)||0; }
  var cartWU = 'months';
  if (productId) { var cp3 = products.find(function(x){ return String(x.id)===String(productId); }); if (cp3) cartWU = cp3.warranty_unit || 'months'; }
  cart.push({
    product_id: productId, desc: desc, quantity: qty, unit_price: unitPrice,
    amount: qty * unitPrice, cost_price: costPrice, warranty_months: cartWM, warranty_unit: cartWU
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

function cartUpdateQty(i, val) {
  var it = cart[i]; if (!it) return;
  var raw = parseFloat(val) || 1;
  var isInt = qtyStepForUnit(it.unit) === '1';
  var qty = isInt ? Math.round(raw) : raw;
  var prod = products.find(function(p){ return p.id === it.product_id; });
  var origQty = it._origQty != null ? it._origQty : 1;
  var stockAvail = prod ? (Number(prod.quantity) + origQty) : Infinity;
  if (qty > stockAvail) { qty = isInt ? Math.floor(stockAvail) : stockAvail; toast('Max stock: ' + stockAvail, 'warn'); }
  qty = Math.max(isInt ? 1 : 0.01, qty);
  var el = document.getElementById('cart-qty-' + i); if (el) el.value = qty;
  cart[i].quantity = qty;
  // Recalculate amount from qty × unit_price when qty changes
  cart[i].amount = Math.round((qty * cart[i].unit_price) * 100) / 100;
  var amtEl = document.getElementById('cart-amt-' + i); if (amtEl) amtEl.value = fmtPlain(cart[i].amount);
  renderCartTotals(); updatePayPreview();
}
function cartUpdateAmount(i, val) {
  var amt = parseFloat(val) || 0;
  cart[i].amount = amt;
  // back-calculate unit price so totals stay consistent
  if (cart[i].quantity > 0) cart[i].unit_price = Math.round((amt / cart[i].quantity) * 100) / 100;
  renderCartTotals(); updatePayPreview();
}
function cartUpdateWarranty(i, val, unit) {
  // If val is null, read from the number input; if unit is null, read from the select
  var numEl = document.getElementById('cart-w-' + i);
  var unitEl = document.getElementById('cart-wu-' + i);
  var v = val !== null ? val : (numEl ? +numEl.value : 0);
  var u = unit !== null ? unit : (unitEl ? unitEl.value : 'months');
  if (u === 'lifetime') { cart[i].warranty_months = 9999; cart[i].warranty_unit = 'lifetime'; }
  else { cart[i].warranty_months = parseFloat(v) || 0; cart[i].warranty_unit = u; }
}

function renderCart() {
  const tb = document.getElementById('cart-tbody');
  var showW = !!(settings && settings.feature_warranty);
  var wHeader = document.getElementById('cart-warranty-header');
  if (wHeader) wHeader.style.display = showW ? '' : 'none';
  var INP = 'padding:3px 4px;border:1px solid var(--border);border-radius:5px;background:var(--surface-2);color:var(--text);text-align:center;box-sizing:border-box;font-size:12px;';
  var cols = showW ? 6 : 5;
  if (!cart.length) {
    tb.innerHTML = '<tr><td colspan="' + cols + '" class="empty-state">Click a product card to add it to cart.</td></tr>';
  } else {
    tb.innerHTML = cart.map(function (it, i) {
      var prod = products.find(function(p){ return p.id === it.product_id; });
      var origQty = it._origQty != null ? it._origQty : 1;
      var stockAvail = prod ? (Number(prod.quantity) + origQty) : 999;
      var wVal = it.warranty_months >= 9999 ? 9999 : (it.warranty_months || 0);
      var wUnit = it.warranty_unit || 'months';
      var wCell = showW ? (
        '<td style="padding:3px 4px;white-space:nowrap">' +
        '<div style="display:flex;gap:2px;align-items:center">' +
        '<input type="number" id="cart-w-' + i + '" value="' + wVal + '" min="0" step="1" style="' + INP + 'width:42px" title="Warranty" onchange="cartUpdateWarranty(' + i + ',+this.value,null)" />' +
        '<select id="cart-wu-' + i + '" style="' + INP + 'width:42px;padding:3px 2px" onchange="cartUpdateWarranty(' + i + ',null,this.value)">' +
        '<option value="months"' + (wUnit==='months'?' selected':'') + '>mo</option>' +
        '<option value="days"' + (wUnit==='days'?' selected':'') + '>day</option>' +
        '<option value="lifetime"' + (wUnit==='lifetime'?' selected':'') + '>Life</option>' +
        '</select></div></td>'
      ) : '';
      return '<tr>' +
        '<td style="font-weight:600;font-size:12.5px;padding:5px 6px;min-width:90px">' + esc(it.desc) + '<div class="product-cost-row" style="font-size:10px;color:var(--text-3);font-weight:400">Cost: ' + fmtPlain(it.cost_price||0) + '</div></td>' +
        '<td style="padding:3px 4px;white-space:nowrap;min-width:56px"><input ' + qtyInputAttrs(it.unit, it.quantity, stockAvail) + ' id="cart-qty-' + i + '" style="' + INP + 'width:52px" onchange="cartUpdateQty(' + i + ',this.value)" title="Max stock: ' + stockAvail + '" /></td>' +
        '<td style="padding:3px 4px;text-align:right;min-width:68px"><span style="font-size:12px;color:var(--text-2);white-space:nowrap">Tk ' + fmtPlain(it.unit_price) + '</span></td>' +
        wCell +
        '<td style="padding:3px 4px;min-width:74px"><input type="number" id="cart-amt-' + i + '" value="' + fmtPlain(it.amount) + '" min="0" step="0.01" style="' + INP + 'width:68px;color:var(--ok);font-weight:700" onchange="cartUpdateAmount(' + i + ',this.value)" title="Edit total amount" /></td>' +
        '<td style="width:24px;padding:2px"><button class="cart-row-remove" onclick="removeCartItem(' + i + ')"><i class="ti ti-trash"></i></button></td>' +
      '</tr>';
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
  var checkoutBtn = document.getElementById('btn-checkout');
  setBtn(checkoutBtn, true, 'Processing…');

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
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, cost_price: it.cost_price, warranty_months: it.warranty_months || 0, warranty_unit: it.warranty_unit || 'months' };
    })
  });

  if (res.error) { setBtn(checkoutBtn, false); return alert(res.error); }

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
  setBtn(checkoutBtn, false);
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
  // Switch bill detail to inline-edit mode
  renderSaleDetailEditMode();
}

async function renderSaleDetailEditMode() {
  var billItems = window.__currentBillItems || [];
  var billData = window.__currentBillData || {};
  var content = document.getElementById('saledetail-content');
  if (!content || !billItems.length) return;

  var INP = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);width:100%;box-sizing:border-box;font-size:13px;';

  var rows = billItems.map(function(it, i) {
    return '<tr id="sale-edit-row-' + i + '">' +
      '<td>' +
        '<input type="text" id="se-desc-' + i + '" value="' + esc(it.desc||it.description||'') + '" style="' + INP + '" readonly />' +
      '</td>' +
      '<td class="num" style="min-width:70px">' +
        '<input type="number" id="se-qty-' + i + '" value="' + (it.quantity||1) + '" min="0.01" step="1" style="' + INP + 'text-align:center" onchange="saleEditRecalc(' + i + ')" />' +
      '</td>' +
      '<td class="num" style="min-width:80px">' +
        '<span style="font-size:12px;color:var(--text-3)">Tk ' + fmtPlain(it.unit_price || (it.amount/(it.quantity||1))) + '</span>' +
      '</td>' +
      '<td class="num" style="min-width:90px">' +
        '<input type="number" id="se-sp-' + i + '" value="' + fmtPlain(it.unit_price || (it.amount/(it.quantity||1))) + '" min="0" step="0.01" style="' + INP + 'text-align:center" onchange="saleEditRecalc(' + i + ')" />' +
      '</td>' +
      '<td class="num" style="font-weight:700" id="se-amt-' + i + '">Tk ' + fmtPlain(it.amount) + '</td>' +
      '<td><button class="del-btn" onclick="saleEditRemoveRow(' + i + ',' + it.id + ')" title="Remove"><i class="ti ti-trash"></i></button></td>' +
    '</tr>';
  }).join('');

  content.innerHTML =
    '<div style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<h3 style="margin:0;flex:1">✏️ Editing Bill #' + (billData.billNo || '—') + '</h3>' +
      '<button class="btn-secondary" onclick="renderSaleDetailPage()"><i class="ti ti-x"></i> Cancel</button>' +
      '<button class="btn-save" style="width:auto;padding:10px 20px" onclick="saveSaleDetailEdits()"><i class="ti ti-check"></i> Save changes</button>' +
    '</div>' +
    '<div class="list-card"><div class="table-scroll">' +
    '<table><thead><tr>' +
      '<th>Item</th><th class="num">Qty</th><th class="num">Cost price</th><th class="num">Sell price</th><th class="num">Amount</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
    '<p style="font-size:12px;color:var(--text-2);margin-top:8px"><i class="ti ti-info-circle"></i> Qty and selling price are editable. Cost price is shown for reference only and cannot be changed. Use the 🗑 button to remove an item from the bill.</p>';
}

function saleEditRecalc(i) {
  var qty = parseFloat((document.getElementById('se-qty-' + i)||{}).value) || 1;
  var sp  = parseFloat((document.getElementById('se-sp-'  + i)||{}).value) || 0;
  var amt = qty * sp;
  var amtEl = document.getElementById('se-amt-' + i);
  if (amtEl) amtEl.textContent = 'Tk ' + fmtPlain(amt);
}

async function saleEditRemoveRow(rowIndex, saleId) {
  if (!confirm('Remove this item from the bill? This cannot be undone.')) return;
  var res = await fetch('/api/dynamic', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type: 'delete', table: 'sales', id: saleId }) });
  var data = await res.json();
  if (data && data.error) return alert(data.error);
  // Remove from local array and re-render edit mode
  window.__currentBillItems.splice(rowIndex, 1);
  toast('Item removed', 'ok');
  if (!window.__currentBillItems.length) { navigateTo('saleslist'); return; }
  renderSaleDetailEditMode();
}

async function saveSaleDetailEdits() {
  var billItems = window.__currentBillItems || [];
  var errors = [];
  for (var i = 0; i < billItems.length; i++) {
    var it = billItems[i];
    var qty = parseFloat((document.getElementById('se-qty-' + i)||{}).value) || 1;
    var sp  = parseFloat((document.getElementById('se-sp-'  + i)||{}).value) || 0;
    var amt = qty * sp;
    var res = await apiPut('/sales/' + it.id, { date: it.date, desc: it.desc||it.description, quantity: qty, unit_price: sp, amount: amt });
    if (res && res.error) errors.push((it.desc||'item') + ': ' + res.error);
    else { billItems[i].quantity = qty; billItems[i].unit_price = sp; billItems[i].amount = amt; }
  }
  if (errors.length) return alert('Errors:\n' + errors.join('\n'));
  toast('Bill updated', 'ok');
  renderSaleDetailPage();
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
  var hasW = !!(settings && settings.feature_warranty);
  var hasS = !!(settings && settings.feature_serial_numbers);
  var fields = [
    { key: 'name', label: 'Product Name', type: 'text', value: p.name },
    { key: 'quantity', label: 'Quantity', type: 'number', value: p.quantity },
    { key: 'unit', label: 'Unit (pcs, kg, l, etc.)', type: 'text', value: p.unit || 'pcs' },
    { key: 'purchase_price', label: 'Purchase Price (Tk)', type: 'number', value: p.purchase_price },
    { key: 'sell_price', label: 'Sell Price (Tk)', type: 'number', value: p.sell_price }
  ];
  if (hasW) {
    fields.push({ key: 'warranty_months', label: 'Warranty — enter 9999 for Lifetime', type: 'number', value: p.warranty_months || 0 });
    fields.push({ key: 'warranty_unit', label: 'Warranty unit (months / days / lifetime)', type: 'text', value: p.warranty_unit || 'months' });
  }
  openEditModal('Edit Product', fields, async function () {
    const name = document.getElementById('edit-name').value.trim();
    const quantity = parseFloat(document.getElementById('edit-quantity').value) || 0;
    const unit = document.getElementById('edit-unit').value.trim() || 'pcs';
    const purchase_price = parseFloat(document.getElementById('edit-purchase_price').value) || 0;
    const sell_price = parseFloat(document.getElementById('edit-sell_price').value) || 0;
    if (!name) return alert('Please enter a product name.');
    var patch = { name, quantity, purchase_price, sell_price, unit };
    if (hasW) {
      var wm = parseFloat(document.getElementById('edit-warranty_months').value) || 0;
      var wu = (document.getElementById('edit-warranty_unit').value || 'months').trim().toLowerCase();
      if (wu === 'lifetime') wm = 9999;
      patch.warranty_months = wm;
      patch.warranty_unit = wu;
    }
    const res = await apiPut('/products/' + id, patch);
    if (res && res.error) { alert(res.error); return; }
    closeEditModal();
    products = await apiGet('/products') || products; // sync global cache
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

function printSingleBarcode(p) {
  var win = window.open('', '_blank', 'width=400,height=300');
  win.document.write('<!DOCTYPE html><html><head><title>Barcode — ' + p.name + '</title>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"><\/script>' +
    '<style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial,sans-serif;background:#fff}.label{text-align:center;padding:16px}.prod-name{font-size:14px;font-weight:700;margin-bottom:6px}.prod-price{font-size:16px;font-weight:700;color:#222;margin-top:4px}.prod-barcode-text{font-size:10px;color:#666;margin-top:2px}@media print{body{min-height:0}}</style>' +
    '</head><body><div class="label">' +
    '<div class="prod-name">' + p.name + '</div>' +
    '<svg id="bc"></svg>' +
    '<div class="prod-price">Tk ' + Number(p.sell_price || 0).toFixed(2) + '</div>' +
    '<div class="prod-barcode-text">' + p.barcode + '</div>' +
    '</div>' +
    '<script>JsBarcode("#bc","' + p.barcode + '",{format:"CODE128",displayValue:false,height:50,width:1.8});<\/script>' +
    '</body></html>');
  win.document.close();
  setTimeout(function () { win.print(); }, 600);
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

  // Feature toggles
  var fs = document.getElementById('feat-serial'); if (fs) fs.checked = !!(settings && settings.feature_serial_numbers);
  var fw = document.getElementById('feat-warranty'); if (fw) fw.checked = !!(settings && settings.feature_warranty);
  var fh = document.getElementById('feat-hajira'); if (fh) fh.checked = !!(settings && settings.feature_hajira);
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
    barcodeHeight: Number(document.getElementById('set-bc-height').value) || 56,
    feature_serial_numbers: !!(document.getElementById('feat-serial') && document.getElementById('feat-serial').checked),
    feature_warranty: !!(document.getElementById('feat-warranty') && document.getElementById('feat-warranty').checked),
    feature_hajira: !!(document.getElementById('feat-hajira') && document.getElementById('feat-hajira').checked)
  };
  const res = await apiPut('/settings', body);
  if (res && res.error) { alert(res.error); return; }
  settings = res;
  updateTopbarBizName();
  applyFeatureFlags();
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
  var hasW = bill.items.some(function(it){ return it.warranty_months && it.warranty_months > 0; });
  const itemsHtml = bill.items.map(function (it) {
    var sp = it.unit_price != null ? it.unit_price : (it.amount / (it.quantity || 1));
    var wLabel = it.warranty_months >= 9999 ? 'Lifetime' : (it.warranty_months ? warrantyDisplay(it.warranty_months, it.warranty_unit) : '');
    var wCell = hasW ? '<td style="padding:3px 2px;vertical-align:top;text-align:center;white-space:nowrap;font-size:9px;color:#555">' + esc(wLabel) + '</td>' : '';
    return '<tr><td style="padding:3px 2px;vertical-align:top;word-break:break-word;width:38%">' + esc(it.desc) + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:12%">' + it.quantity + '</td>' +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:20%">' + bfmt(sp) + '</td>' +
      wCell +
      '<td style="padding:3px 2px;vertical-align:top;text-align:right;white-space:nowrap;width:' + (hasW?'16':'30') + '%">' + bfmt(it.amount) + '</td></tr>';
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
    '<th style="text-align:left;padding:3px 2px;font-weight:700;width:38%">Item</th>' +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:12%">Qty</th>' +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:20%">Rate</th>' +
    (hasW ? '<th style="text-align:center;padding:3px 2px;font-weight:700;width:14%">Warranty</th>' : '') +
    '<th style="text-align:right;padding:3px 2px;font-weight:700;width:' + (hasW?'16':'30') + '%">Amount</th>' +
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
  // Show skeleton while loading
  var metricsEl = document.getElementById('dash-metrics');
  if (metricsEl) metricsEl.innerHTML = '<div class="skeleton skeleton-card" style="flex:1;height:90px"></div>'.repeat(4);
  var sumEl2 = document.getElementById('dash-summary');
  if (sumEl2) sumEl2.innerHTML = '<div class="skeleton skeleton-card" style="height:70px"></div>'.repeat(6);
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
    var showPurW = !!(settings && settings.feature_warranty);
    var purWth = document.getElementById('pur-warranty-th'); if (purWth) purWth.style.display = showPurW ? '' : 'none';
    tb.innerHTML = purchaseCart.map(function (it, i) {
      var purWLabel = (it.warranty_months >= 9999 || it.warranty_unit === 'lifetime') ? '♾ Lifetime' : (it.warranty_months ? warrantyDisplay(it.warranty_months, it.warranty_unit) : '—');
      var wCell = showPurW ? '<td class="num" style="font-size:12px;color:var(--ok)">' + purWLabel + '</td>' : '';
      var serialCell = (settings && settings.feature_serial_numbers && it.serial) ? '<td style="font-size:11px;color:var(--text-2)">' + esc(it.serial) + '</td>' : '';
      return '<tr><td>' + esc(it.desc) + (it.serial && !(settings && settings.feature_serial_numbers) ? '' : '') + '</td><td class="num">' + it.quantity + '</td><td class="num">' + fmtPlain(it.unit_cost) + '</td><td class="num" style="color:var(--ok)">' + (it.sell_price > 0 ? fmtPlain(it.sell_price) : '—') + '</td>' + wCell + '<td class="num" style="font-weight:600">' + fmtPlain(it.amount) + '</td><td><button class="cart-row-remove" onclick="removePurchaseItem(' + i + ')"><i class="ti ti-trash"></i></button></td></tr>';
    }).join('');
  }
  const total = purchaseCart.reduce(function (s, it) { return s + it.amount; }, 0);
  document.getElementById('pur-total-val').textContent = fmt(total);
  updatePurPayPreview();
}

function removePurchaseItem(i) {
  purchaseCart.splice(i, 1);
  renderPurchaseCart();
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
  var saveBtn = document.getElementById('pur-save-btn');
  setBtn(saveBtn, true, 'Saving…');
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
      return { product_id: it.product_id, desc: it.desc, quantity: it.quantity, unit_cost: it.unit_cost, sell_price: it.sell_price || 0, amount: it.amount, updatePurchasePrice: it.updatePurchasePrice, category_name: it.category_name || null, brand_name: it.brand_name || null, warranty_months: it.warranty_months || 0, warranty_unit: it.warranty_unit || 'months', serial: it.serial || null };
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
  setBtn(saveBtn, false);
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
// ── Warranty helpers (days / months / lifetime) ──
// warrantyToMonths: convert user input + unit to stored months value
// Lifetime = 9999 months sentinel
function warrantyToMonths(val, unit) {
  if (!val && unit !== 'lifetime') return 0;
  if (unit === 'lifetime') return 9999;
  if (unit === 'days') return Math.round(Number(val));   // store days directly as a decimal months-like value; we track unit separately
  return Number(val) || 0; // months default
}
function warrantyDisplay(months, unit) {
  if (!months && months !== 0) return '—';
  if (!months) return '—';
  if (months >= 9999) return '♾ Lifetime';
  if (unit === 'days') return months + ' day' + (months !== 1 ? 's' : '');
  // default: show as days (per requirement "count warranty in days")
  // if unit not specified default to showing as months with label
  if (!unit || unit === 'months') return months + ' month' + (months !== 1 ? 's' : '');
  return months + ' ' + unit;
}
// Qty step: pcs/unit = integer only; kg/l/m/etc = decimal allowed
function qtyStepForUnit(unit) {
  var u = (unit || 'pcs').toLowerCase().trim();
  var intUnits = ['pcs', 'pc', 'piece', 'pieces', 'unit', 'units', 'box', 'boxes', 'set', 'sets', 'pair', 'pairs', 'pack', 'packs', 'bag', 'bags', 'bottle', 'bottles', 'item', 'items', ''];
  return intUnits.indexOf(u) >= 0 ? '1' : '0.01';
}
function qtyInputAttrs(unit, val, max) {
  var step = qtyStepForUnit(unit);
  var maxAttr = max != null ? ' max="' + max + '"' : '';
  return 'type="number" value="' + (val||1) + '" min="0.01" step="' + step + '"' + maxAttr;
}

function getWarrantyInputs(numId, unitId) {
  var numEl = document.getElementById(numId);
  var unitEl = document.getElementById(unitId);
  var unit = unitEl ? unitEl.value : 'months';
  var val = numEl ? numEl.value : '0';
  if (unit === 'lifetime') return { months: 9999, unit: 'lifetime', display: '♾ Lifetime' };
  var num = parseFloat(val) || 0;
  return { months: num, unit: unit, display: warrantyDisplay(num, unit) };
}
// When user selects Lifetime in a warranty dropdown, clear the number field
function onWarrantyUnitChange(unitId, numId) {
  var u = document.getElementById(unitId);
  var n = document.getElementById(numId);
  if (!u || !n) return;
  if (u.value === 'lifetime') { n.value = ''; n.placeholder = 'Lifetime ♾'; n.disabled = true; }
  else { n.placeholder = '0'; n.disabled = false; if (!n.value) n.placeholder = '0'; }
}

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
  var _wProd = getWarrantyInputs('prod-warranty-months','prod-warranty-unit'); var warrantyMonths = _wProd.months; var warrantyUnit = _wProd.unit;
  var serials = document.getElementById('prod-serials') ? document.getElementById('prod-serials').value.trim() : '';
  var res = await apiPost('/products', { name: name, quantity: qty, purchase_price: purchasePrice, sell_price: sellPrice, unit: unit, barcode: barcode, category_id: catId, brand_id: brandId, category_name: catName, brand_name: brandName, warranty_months: warrantyMonths, warranty_unit: warrantyUnit, serials: serials });
  if (res && res.error) { alert(res.error); return; }
  ['prod-name', 'prod-barcode', 'prod-serials', 'prod-warranty-months'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
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
  products = await apiGet('/products') || products; // always fresh
  if (!__categories.length || !__brands.length) await loadCategoriesAndBrands();
  populateCatBrandSelects(null, null);
  const isManager = currentRole === 'manager';
  const formSection = document.getElementById('product-form-section');
  if (formSection) formSection.style.display = isManager ? 'block' : 'none';
  let prods = await apiGet('/products');
  prods.sort(function (a, b) { return a.name.localeCompare(b.name); });
  window.__allProducts = prods;
  renderProductsTable(prods, isManager);
}

function renderProductsTable(prods, isManager) {
  if (isManager === undefined) isManager = currentRole === 'manager';
  var tb = document.getElementById('products-tbody');
  if (!tb) return;
  if (!prods || !prods.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty-state" style="padding:30px">No products yet. Add one above.</td></tr>';
    return;
  }
  tb.innerHTML = prods.map(function (p) {
    var lowStock = Number(p.quantity) <= 5;
    var outOfStock = Number(p.quantity) <= 0;
    var stockColor = outOfStock ? 'var(--danger)' : lowStock ? 'var(--warn)' : 'var(--text)';
    return '<tr class="' + (lowStock ? 'low-stock-row' : '') + '">' +
      '<td style="font-weight:600">' + esc(p.name) + '</td>' +
      '<td style="color:var(--text-2)">' + (esc(p.brand_name) || '<span style="color:var(--text-3)">—</span>') + '</td>' +
      '<td style="color:var(--text-2)">' + (esc(p.category_name) || '<span style="color:var(--text-3)">—</span>') + '</td>' +
      '<td style="font-size:12px;color:var(--text-3);font-family:monospace"><i class="ti ti-barcode" style="color:var(--accent)"></i> ' + esc(p.barcode) + '</td>' +
      '<td class="num" style="color:' + stockColor + ';font-weight:600">' + p.quantity + ' <span style="font-size:11px;font-weight:400">' + esc(p.unit || 'pcs') + '</span></td>' +
      '<td class="num product-cost-row">' + fmt(p.purchase_price) + '</td>' +
      '<td class="num" style="color:var(--ok);font-weight:700">' + fmt(p.sell_price) + '</td>' +
      '<td class="num" style="font-size:12px;color:var(--info)">' + (p.warranty_months >= 9999 ? '♾ Lifetime' : (p.warranty_months ? warrantyDisplay(p.warranty_months, p.warranty_unit) : '<span style="color:var(--text-3)">—</span>')) + '</td>' +
      '<td>' +
      (isManager ? '<button class="edit-btn" onclick="editProduct(' + p.id + ')" title="Edit"><i class="ti ti-pencil"></i></button> <button class="del-btn" onclick="deleteRow(\'products\',' + p.id + ',renderProductsPage)" title="Delete"><i class="ti ti-trash"></i></button> ' : '') +
      '<button class="edit-btn" onclick="openBarcodeModal(' + p.id + ')" title="Print barcode"><i class="ti ti-barcode"></i></button>' +
      '</td></tr>';
  }).join('');
}

function filterProductsList() {
  var q = (document.getElementById('products-search') ? document.getElementById('products-search').value : '').toLowerCase();
  var all = window.__allProducts || [];
  var filtered = q ? all.filter(function (p) {
    return (p.name || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category_name || '').toLowerCase().includes(q) || (p.brand_name || '').toLowerCase().includes(q);
  }) : all;
  renderProductsTable(filtered);
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
    var pw = Number(p.warranty_months) || 0;
    var pwu = p.warranty_unit || 'months';
    var pwEl = document.getElementById('pur-warranty-months');
    var pwuEl = document.getElementById('pur-warranty-unit');
    if (pwEl) { pwEl.value = pw >= 9999 ? 9999 : pw; pwEl.disabled = pwu === 'lifetime'; }
    if (pwuEl) { pwuEl.value = pwu; }
    purchaseCart.push({ product_id: p.id, desc: p.name, quantity: 1, unit_cost: unitCost, sell_price: Number(p.sell_price) || 0, amount: unitCost, updatePurchasePrice: true, warranty_months: pw, warranty_unit: pwu, unit: p.unit || 'pcs' });
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
  var _wPur = getWarrantyInputs('pur-warranty-months','pur-warranty-unit'); var purWM = _wPur.months; var purWU = _wPur.unit;
  var purSerial = ((document.getElementById('pur-serial') || {}).value || '').trim();
  purchaseCart.push({ product_id: productId, desc: desc, quantity: qty, unit_cost: unitCost, sell_price: sellPrice, amount: qty * unitCost, category_name: catName, brand_name: brandName, warranty_months: purWM, warranty_unit: purWU, serial: purSerial, updatePurchasePrice: true });
  document.getElementById('pur-product').value = '';
  document.getElementById('pur-desc').value = '';
  document.getElementById('pur-qty').value = '1';
  document.getElementById('pur-cost').value = '';
  document.getElementById('pur-sell').value = '';
  var purWel = document.getElementById('pur-warranty-months'); if (purWel) purWel.value = '';
  var purSel = document.getElementById('pur-serial'); if (purSel) purSel.value = '';
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
  window.__staffDetailId = staffId;
  window.__staffDetailName = staffName;
  navigateTo('staffdetail');
}

async function renderStaffDetailPage() {
  var staffId = window.__staffDetailId;
  var staffName = window.__staffDetailName || 'Staff';
  var titleEl = document.getElementById('staffdetail-title');
  if (titleEl) titleEl.innerHTML = '<i class="ti ti-user"></i> ' + esc(staffName);
  var from = document.getElementById('sd-from') ? document.getElementById('sd-from').value : '';
  var to = document.getElementById('sd-to') ? document.getElementById('sd-to').value : '';
  var inRange = function (d) { return (!from || d >= from) && (!to || d <= to); };
  var content = document.getElementById('staffdetail-content');
  if (content) content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-2)"><span class="btn-spinner btn-spinner-dark"></span> Loading...</div>';
  loadAttRules();
  if (!staffId && !staffName) { if (content) content.innerHTML = '<div class="empty-state" style="padding:30px">No staff selected. Go back to Staff Reports.</div>'; return; }
  var results = await Promise.all([apiGet('/attendance'), apiGet('/sales')]);
  var allAtt = results[0] || [], allSales = results[1] || [];
  var nameLower = (staffName || '').toLowerCase();
  var att = allAtt.filter(function (r) { return inRange(r.date) && (r.staff_id === staffId || (r.staff_name || '').toLowerCase() === nameLower); });
  var sales = allSales.filter(function (r) { return inRange(r.date) && (r.salesman_id === staffId || (r.salesman_name || '').toLowerCase() === nameLower); });
  att.sort(function (a, b) { return b.date.localeCompare(a.date); });
  var totalSales = sales.reduce(function (t, r) { return t + Number(r.amount || 0); }, 0);
  var billSet = new Set(sales.filter(function (r) { return r.bill_id; }).map(function (r) { return r.bill_id; }));
  var attCounts = { present: 0, late: 0, absent: 0, leave: 0 };
  var totalLateMin = 0;
  att.forEach(function (r) {
    var lateMin = calcLateMinutes(r.entry_time);
    var eff = (r.status === 'present' && lateMin > 0) ? 'late' : (r.status || 'present');
    if (eff === 'late') totalLateMin += lateMin;
    if (attCounts[eff] !== undefined) attCounts[eff]++; else attCounts.present++;
  });
  var attRows = att.length ? att.map(function (r) {
    var lateMin = calcLateMinutes(r.entry_time);
    var eff = (r.status === 'present' && lateMin > 0) ? 'late' : (r.status || 'present');
    var col = eff === 'present' ? 'var(--ok)' : eff === 'late' ? 'var(--warn)' : eff === 'leave' ? '#6366f1' : 'var(--danger)';
    var lunchMin = calcLunchMinutes(r.lunch_out, r.lunch_in);
    var lunchOver = lunchMin - (__attRules.lunchMaxMinutes || 60);
    return '<tr><td>' + r.date + '</td><td style="color:' + col + ';font-weight:600">' + eff.charAt(0).toUpperCase() + eff.slice(1) + '</td>' +
      '<td>' + (r.entry_time || '\u2014') + '</td><td>' + (lateMin > 0 ? '<span style="color:var(--warn)">+' + minsToLabel(lateMin) + '</span>' : '<span style="color:var(--ok)">On time</span>') + '</td>' +
      '<td>' + (r.exit_time || '\u2014') + '</td><td>' + (lunchMin > 0 ? minsToLabel(lunchMin) + (lunchOver > 0 ? ' <span style="color:var(--danger)">(+' + minsToLabel(lunchOver) + ')</span>' : '') : '\u2014') + '</td>' +
      '<td style="font-size:12px;color:var(--text-2)">' + (esc(r.note) || '') + '</td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty-state">No attendance records for this period.</td></tr>';
  if (content) content.innerHTML =
    '<div class="dash-summary-row" style="margin-bottom:20px">' +
    summaryCard2('ti-coin', '#3b82f6', 'Total Sales', fmt(totalSales)) +
    summaryCard2('ti-calendar-check', '#10b981', 'Present', attCounts.present + ' days') +
    summaryCard2('ti-clock', '#f59e0b', 'Late', attCounts.late + ' days (' + minsToLabel(totalLateMin) + ')') +
    summaryCard2('ti-user-x', '#ef4444', 'Absent', attCounts.absent + ' days') +
    summaryCard2('ti-beach', '#6366f1', 'Leave', attCounts.leave + ' days') +
    '</div>' +
    '<div class="list-card" style="margin-bottom:16px"><div class="list-header"><i class="ti ti-calendar-check"></i> Attendance (' + att.length + ' days)</div>' +
    '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Entry</th><th>Late by</th><th>Exit</th><th>Lunch</th><th>Note</th></tr></thead><tbody>' + attRows + '</tbody></table></div></div>' +
    (sales.length ? '<div class="list-card"><div class="list-header"><i class="ti ti-receipt"></i> Sales (' + sales.length + ' items · ' + billSet.size + ' bills)</div>' +
    '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Bill #</th><th>Customer</th><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>' +
    sales.sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (r) {
      return '<tr><td>' + r.date + '</td><td>' + (r.bill_no ? '#' + r.bill_no : '\u2014') + '</td><td>' + (esc(r.customer_name) || 'Walk-in') + '</td><td>' + esc(r.desc || r.description || '') + '</td><td class="num">' + (r.quantity || '\u2014') + '</td><td class="num" style="color:var(--ok)">' + fmt(r.amount) + '</td></tr>';
    }).join('') +
    '</tbody><tfoot><tr style="font-weight:700;border-top:2px solid var(--border)"><td colspan="5">Total</td><td class="num">' + fmt(totalSales) + '</td></tr></tfoot></table></div></div>' : '<div class="empty-state" style="padding:20px">No sales recorded for this staff member in this period.</div>');
}

function summaryCard2(icon, color, label, val) {
  return '<div class="dash-summary-card"><div class="dash-summary-icon" style="background:' + color + '"><i class="ti ' + icon + '"></i></div><div><div class="dash-summary-label">' + label + '</div><div class="dash-summary-val">' + val + '</div></div></div>';
}

function clearSDFilter() {
  var f = document.getElementById('sd-from'); if (f) f.value = '';
  var t = document.getElementById('sd-to'); if (t) t.value = '';
  renderStaffDetailPage();
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

// ═══════════════════════════════════════════════════════════
// FEATURE FLAGS
// ═══════════════════════════════════════════════════════════
function applyFeatureFlags() {
  var hasSerial = !!(settings && settings.feature_serial_numbers);
  var hasWarranty = !!(settings && settings.feature_warranty);
  var hasHajira = !!(settings && settings.feature_hajira);

  // Warranty nav button
  var navW = document.getElementById('nav-warranty');
  if (navW) navW.style.display = (hasSerial || hasWarranty) ? '' : 'none';

  // Hajira nav button
  var navH = document.getElementById('nav-hajira');
  if (navH) navH.style.display = hasHajira ? '' : 'none';

  // Serial fields on product form
  var sr = document.getElementById('prod-serial-row');
  if (sr) sr.style.display = hasSerial ? '' : 'none';

  // Warranty field on product form
  var wr = document.getElementById('prod-warranty-row');
  if (wr) wr.style.display = hasWarranty ? '' : 'none';

  // Warranty & serial fields on purchase form
  var purW = document.getElementById('pur-warranty-row');
  if (purW) purW.style.display = hasWarranty ? '' : 'none';
  var purSr = document.getElementById('pur-serial-row');
  if (purSr) purSr.style.display = hasSerial ? '' : 'none';

  // Warranty column header in sales cart
  var cartWh = document.getElementById('cart-warranty-header');
  if (cartWh) cartWh.style.display = hasWarranty ? '' : 'none';

  // Serial tab on warranty page (show even if only serial is on)
  var stab = document.getElementById('wtab-serials');
  if (stab) stab.style.display = hasSerial ? '' : 'none';

  // Warranty tabs (show only if warranty is on)
  var ct = document.getElementById('wtab-claims');
  var et = document.getElementById('wtab-wexchanges');
  if (ct) ct.style.display = hasWarranty ? '' : 'none';
  if (et) et.style.display = hasWarranty ? '' : 'none';
}

function onFeatureToggle() {
  // Preview the nav change instantly without saving
  var hasSerial = !!(document.getElementById('feat-serial') && document.getElementById('feat-serial').checked);
  var hasWarranty = !!(document.getElementById('feat-warranty') && document.getElementById('feat-warranty').checked);
  var hasHajira = !!(document.getElementById('feat-hajira') && document.getElementById('feat-hajira').checked);
  var navW = document.getElementById('nav-warranty');
  if (navW) navW.style.display = (hasSerial || hasWarranty) ? '' : 'none';
  var navH = document.getElementById('nav-hajira');
  if (navH) navH.style.display = hasHajira ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
// WARRANTY PAGE
// ═══════════════════════════════════════════════════════════
async function renderWarrantyPage() {
  // Set today's date defaults
  var today = new Date().toISOString().slice(0, 10);
  var cd = document.getElementById('wc-claim-date'); if (cd && !cd.value) cd.value = today;
  var wd = document.getElementById('we-date'); if (wd && !wd.value) wd.value = today;

  // Populate product dropdown for serial tab
  var snProd = document.getElementById('sn-product');
  if (snProd && snProd.options.length <= 1) {
    var prods = await apiGet('/products');
    (prods || []).forEach(function (p) {
      var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; snProd.appendChild(o);
    });
  }

  switchWarrantyTab('claims');
  renderWarrantyClaims();
  renderWarrantyExchanges();
  renderSerialList();
}

function switchWarrantyTab(tab) {
  ['claims', 'exchanges', 'serials'].forEach(function (t) {
    var el = document.getElementById('warranty-tab-' + t);
    var btn = document.getElementById('wtab-' + (t === 'exchanges' ? 'wexchanges' : t));
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

// ── Warranty Claims — Bill-search driven ──

async function searchWarrantyBill() {
  var query = (document.getElementById('wc-bill-search').value || '').toLowerCase().trim();
  var resultsEl = document.getElementById('wc-bill-results');
  if (!resultsEl) return;
  if (query.length < 1) { resultsEl.innerHTML = ''; return; }
  var rows = await apiGet('/sales');
  var bills = groupSalesIntoBills(rows);
  var matches = bills.filter(function (b) {
    return (b.bill_no ? String(b.bill_no) : '').includes(query) ||
      (b.customer_name || '').toLowerCase().includes(query) ||
      (b.customer_phone || '').toLowerCase().includes(query);
  }).slice(0, 8);
  if (!matches.length) { resultsEl.innerHTML = '<div class="empty-state" style="padding:12px">No bills found.</div>'; return; }
  resultsEl.innerHTML = matches.map(function (b) {
    var safeBill = JSON.stringify({ billId: b.bill_id, billNo: b.bill_no, customerId: b.customer_id, customerName: b.customer_name, customerPhone: b.customer_phone, date: b.date }).replace(/"/g, '&quot;');
    var safeItems = JSON.stringify(b.items).replace(/"/g, '&quot;');
    return '<div class="exc-bill-result-item" onclick="loadBillIntoWarrantyPage(' + safeBill + ',' + safeItems + ')">' +
      '<strong>Bill #' + (b.bill_no || '—') + '</strong> · ' + b.date +
      (b.customer_name ? ' · ' + esc(b.customer_name) : ' · Walk-in') +
      (b.customer_phone ? ' · ' + esc(b.customer_phone) : '') +
      ' · ' + fmt(b.total) + ' (' + b.items.length + ' item' + (b.items.length > 1 ? 's' : '') + ')' +
      '</div>';
  }).join('');
}

function loadBillIntoWarrantyPage(billData, items) {
  window.__wcBillData = billData;
  window.__wcBillItems = items;
  // Hide claim form, reset search, show bill panel
  var panel = document.getElementById('wc-bill-panel');
  var claimForm = document.getElementById('wc-claim-form');
  if (panel) panel.style.display = 'block';
  if (claimForm) claimForm.style.display = 'none';
  var header = document.getElementById('wc-bill-header');
  if (header) header.innerHTML = '<i class="ti ti-receipt"></i> Bill #' + (billData.billNo || '—') + (billData.customerName ? ' · ' + esc(billData.customerName) : '') + (billData.customerPhone ? ' · ' + esc(billData.customerPhone) : '');
  var resultsEl = document.getElementById('wc-bill-results');
  if (resultsEl) resultsEl.innerHTML = '';
  var searchEl = document.getElementById('wc-bill-search');
  if (searchEl) searchEl.value = 'Bill #' + (billData.billNo || '—') + (billData.customerName ? ' · ' + billData.customerName : '');
  renderWarrantyBillItems(items, billData);
}

function warrantyExpiryDate(saleDate, warrantyMonths) {
  if (!saleDate || !warrantyMonths) return null;
  var d = new Date(saleDate);
  d.setMonth(d.getMonth() + Number(warrantyMonths));
  return d.toISOString().slice(0, 10);
}

function warrantyStatus(saleDate, warrantyMonths) {
  if (!warrantyMonths) return null; // no warranty
  var expiry = warrantyExpiryDate(saleDate, warrantyMonths);
  if (!expiry) return null;
  var today = new Date().toISOString().slice(0, 10);
  return expiry >= today ? { valid: true, expiry: expiry } : { valid: false, expiry: expiry };
}

function renderWarrantyBillItems(items, billData) {
  var tb = document.getElementById('wc-bill-items');
  if (!tb) return;
  tb.innerHTML = (items || []).map(function (it, idx) {
    var wMonths = Number(it.warranty_months) || 0;
    var saleDate = billData.date || it.date || '';
    var ws = warrantyStatus(saleDate, wMonths);
    var warrantyCell, claimBtn;
    if (!ws) {
      warrantyCell = '<span style="color:var(--text-3)">—</span>';
      claimBtn = '<span style="color:var(--text-3);font-size:12px">No warranty</span>';
    } else if (ws.valid) {
      warrantyCell = '<span style="color:var(--ok);font-weight:600">' + wMonths + ' mo</span>';
      claimBtn = '<button class="btn-secondary" style="font-size:12px;padding:5px 10px;color:var(--accent);border-color:var(--accent)" onclick="openWarrantyClaimForm(' + idx + ')"><i class="ti ti-shield-check"></i> Claim warranty</button>';
    } else {
      warrantyCell = '<span style="color:var(--danger);font-weight:600">' + wMonths + ' mo</span>';
      claimBtn = '<span style="color:var(--danger);font-size:12px">Expired ' + ws.expiry + '</span>';
    }
    var serial = it.serial_number || '—';
    return '<tr>' +
      '<td style="font-weight:600">' + esc(it.desc || it.description || '') + '</td>' +
      '<td style="font-size:12px;color:var(--text-2)">' + esc(serial) + '</td>' +
      '<td class="num">' + warrantyCell + '</td>' +
      '<td class="num">' + esc(saleDate) + '</td>' +
      '<td class="num" style="font-size:12px">' + (ws ? ws.expiry : '—') + '</td>' +
      '<td>' + claimBtn + '</td>' +
      '</tr>';
  }).join('');
}

function openWarrantyClaimForm(itemIdx) {
  var item = (window.__wcBillItems || [])[itemIdx];
  var bill = window.__wcBillData || {};
  if (!item) return;
  var wMonths = Number(item.warranty_months) || 0;
  var saleDate = bill.date || item.date || '';
  // Fill form
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('wc-product',         item.desc || item.description || '');
  setVal('wc-serial',          item.serial_number || '');
  setVal('wc-customer',        bill.customerName || item.customer_name || '');
  setVal('wc-phone',           bill.customerPhone || item.customer_phone || '');
  setVal('wc-sale-date',       saleDate);
  setVal('wc-warranty-months', wMonths);
  setVal('wc-claim-date',      new Date().toISOString().slice(0, 10));
  setVal('wc-issue',           '');
  setVal('wc-sale-id',         item.id || '');
  setVal('wc-serial-id',       item.serial_id || '');
  // Show form
  var cf = document.getElementById('wc-claim-form');
  if (cf) { cf.style.display = 'block'; cf.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function cancelWarrantyClaim() {
  var cf = document.getElementById('wc-claim-form');
  if (cf) cf.style.display = 'none';
}

async function submitWarrantyClaim() {
  var claimDate = (document.getElementById('wc-claim-date') ? document.getElementById('wc-claim-date').value : '');
  var issue = (document.getElementById('wc-issue') ? document.getElementById('wc-issue').value.trim() : '');
  if (!claimDate) return alert('Please enter the claim date.');
  if (!issue) return alert('Please describe the issue.');
  var body = {
    serial_number: document.getElementById('wc-serial').value.trim() || '—',
    product_name:  document.getElementById('wc-product').value.trim(),
    customer_name: document.getElementById('wc-customer').value.trim(),
    customer_phone: document.getElementById('wc-phone').value.trim(),
    sale_date:     document.getElementById('wc-sale-date').value,
    warranty_months: parseFloat(document.getElementById('wc-warranty-months').value) || 0,
    claim_date:    claimDate,
    issue:         issue,
    serial_id:     document.getElementById('wc-serial-id').value || null,
    sale_id:       document.getElementById('wc-sale-id').value || null
  };
  var res = await apiPost('/warranty-claims', body);
  if (res && res.error) return alert(res.error);
  // Reset
  ['wc-serial','wc-issue','wc-serial-id','wc-sale-id'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('wc-claim-form').style.display = 'none';
  toast('Warranty claim logged', 'ok');
  renderWarrantyClaims();
}

async function renderWarrantyClaims() {
  var search = (document.getElementById('wclist-search') ? document.getElementById('wclist-search').value : '').toLowerCase();
  var statusF = document.getElementById('wclist-status') ? document.getElementById('wclist-status').value : '';
  var rows = await apiGet('/warranty-claims');
  if (!rows || rows.error) rows = [];
  if (search) rows = rows.filter(function (r) { return (r.serial_number||'').toLowerCase().includes(search) || (r.customer_name||'').toLowerCase().includes(search) || (r.product_name||'').toLowerCase().includes(search); });
  if (statusF) rows = rows.filter(function (r) { return r.status === statusF; });
  var tb = document.getElementById('wc-tbody');
  if (!tb) return;
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty-state">No claims yet.</td></tr>'; return; }
  var isManager = currentRole === 'manager';
  tb.innerHTML = rows.map(function (r) {
    var statusColor = r.status === 'open' ? 'var(--danger)' : r.status === 'exchanged' ? 'var(--ok)' : 'var(--text-2)';
    var actionBtn = '';
    if (isManager && r.status === 'open') {
      actionBtn =
        '<button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="resolveWarrantyClaim(' + r.id + ')">Mark resolved</button>' +
        '<button class="btn-secondary" style="font-size:11px;padding:4px 8px;margin-left:4px" onclick="startWarrantyExchangeFromClaim(' + JSON.stringify(r).replace(/"/g,'&quot;') + ')">Exchange</button>';
    }
    return '<tr>' +
      '<td>' + esc(r.claim_date) + '</td>' +
      '<td style="font-weight:600">' + esc(r.serial_number||'—') + '</td>' +
      '<td>' + esc(r.product_name||'—') + '</td>' +
      '<td>' + esc(r.customer_name||'—') + '</td>' +
      '<td>' + esc(r.issue||'—') + '</td>' +
      '<td style="color:' + statusColor + ';font-weight:600">' + r.status + '</td>' +
      '<td style="white-space:nowrap">' + actionBtn + '</td>' +
      '</tr>';
  }).join('');
}

async function resolveWarrantyClaim(id) {
  if (!confirm('Mark this claim as resolved?')) return;
  await apiCall('PATCH', '/warranty-claims', { id: id, status: 'resolved' });
  toast('Claim marked resolved', 'ok');
  renderWarrantyClaims();
}

function startWarrantyExchangeFromClaim(r) {
  switchWarrantyTab('exchanges');
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('we-old-serial', r.serial_number);
  setVal('we-product',    r.product_name);
  setVal('we-customer',   r.customer_name);
  setVal('we-claim-id',   r.id);
  setVal('we-serial-id',  r.serial_id);
}

// ── Warranty Exchanges ──
async function lookupOldSerial() {
  var serial = (document.getElementById('we-old-serial') ? document.getElementById('we-old-serial').value.trim() : '');
  if (!serial) return;
  var snRows = await apiGet('/serial-numbers');
  var found = (snRows || []).find(function (s) { return s.serial === serial; });
  if (found) {
    var wp = document.getElementById('we-product'); if (wp && !wp.value) wp.value = found.product_name || '';
    var si = document.getElementById('we-serial-id'); if (si) si.value = found.id;
    var pi = document.getElementById('we-product-id'); if (pi) pi.value = found.product_id || '';
  }
}

async function saveWarrantyExchange() {
  var oldSerial = (document.getElementById('we-old-serial').value || '').trim();
  var newSerial = (document.getElementById('we-new-serial').value || '').trim();
  var date = document.getElementById('we-date').value;
  if (!newSerial) return alert('Please enter the new serial number.');
  if (!date) return alert('Please enter the exchange date.');
  var body = {
    old_serial: oldSerial,
    new_serial: newSerial,
    old_product_name: document.getElementById('we-product').value.trim(),
    new_product_name: document.getElementById('we-product').value.trim(),
    customer_name: document.getElementById('we-customer').value.trim(),
    exchange_date: date,
    note: document.getElementById('we-note').value.trim(),
    serial_id: document.getElementById('we-serial-id').value || null,
    claim_id: document.getElementById('we-claim-id').value || null,
    product_id: document.getElementById('we-product-id').value || null
  };
  var res = await apiPost('/warranty-exchanges', body);
  if (res && res.error) return alert(res.error);
  ['we-old-serial','we-new-serial','we-product','we-customer','we-note','we-serial-id','we-claim-id','we-product-id'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  toast('Warranty exchange saved', 'ok');
  renderWarrantyExchanges();
  renderWarrantyClaims();
  renderSerialList();
}

async function renderWarrantyExchanges() {
  var rows = await apiGet('/warranty-exchanges');
  var tb = document.getElementById('we-tbody');
  if (!tb) return;
  if (!rows || rows.error || !rows.length) { tb.innerHTML = '<tr><td colspan="6" class="empty-state">No warranty exchanges yet.</td></tr>'; return; }
  tb.innerHTML = rows.map(function (r) {
    return '<tr><td>' + esc(r.exchange_date) + '</td><td style="font-weight:600;color:var(--danger)">' + esc(r.old_serial||'—') + '</td><td style="font-weight:600;color:var(--ok)">' + esc(r.new_serial) + '</td><td>' + esc(r.old_product_name||'—') + '</td><td>' + esc(r.customer_name||'—') + '</td><td>' + esc(r.note||'') + '</td></tr>';
  }).join('');
}

// ── Serial Numbers ──
async function addSerialNumber() {
  var serial = (document.getElementById('sn-serial').value || '').trim();
  var prodEl = document.getElementById('sn-product');
  var productId = prodEl ? prodEl.value : '';
  var productName = prodEl && prodEl.value ? prodEl.options[prodEl.selectedIndex].text : '';
  if (!serial) return alert('Please enter a serial number.');
  var res = await apiPost('/serial-numbers', { serial: serial, product_id: productId || null, product_name: productName || null });
  if (res && res.error) return alert(res.error);
  var sn = document.getElementById('sn-serial'); if (sn) sn.value = '';
  toast('Serial registered', 'ok');
  renderSerialList();
}

async function renderSerialList() {
  var search = (document.getElementById('snlist-search') ? document.getElementById('snlist-search').value : '').toLowerCase();
  var statusF = document.getElementById('snlist-status') ? document.getElementById('snlist-status').value : '';
  var rows = await apiGet('/serial-numbers');
  if (!rows || rows.error) rows = [];
  if (search) rows = rows.filter(function (r) { return (r.serial||'').toLowerCase().includes(search) || (r.product_name||'').toLowerCase().includes(search); });
  if (statusF) rows = rows.filter(function (r) { return r.status === statusF; });
  var tb = document.getElementById('sn-tbody');
  if (!tb) return;
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-state">No serial numbers registered yet.</td></tr>'; return; }
  var statusColors = { in_stock: 'var(--ok)', sold: 'var(--info)', exchanged: 'var(--accent)', returned: 'var(--warning)' };
  tb.innerHTML = rows.map(function (r) {
    return '<tr><td style="font-weight:600">' + esc(r.serial) + '</td><td>' + esc(r.product_name||'—') + '</td><td style="color:' + (statusColors[r.status]||'var(--text-2)') + ';font-weight:600">' + (r.status||'—') + '</td><td>' + esc(r.sold_to||'—') + '</td><td>' + esc(r.sale_date||'—') + '</td></tr>';
  }).join('');
}

// Helper for PATCH calls
async function apiCall(method, path, body) {
  var res = await fetch('/api' + path, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════
// HAJIRA — Daily Wage Attendance System
// ═══════════════════════════════════════════════════════════════════════

// ── cached data ──
var __hajiraWorkers = [];
var __hajiraAttRows = {};   // { "workerId_date": row }
var __hajiraDetailId = null;

// ── page entry ──
async function renderHajiraPage() {
  var today = new Date().toISOString().slice(0, 10);
  var d = document.getElementById('hatt-date');
  if (d && !d.value) d.value = today;
  var pd = document.getElementById('hpay-date');
  if (pd && !pd.value) pd.value = today;
  switchHajiraTab('attendance');
  __hajiraWorkers = await apiGet('/hajira-workers') || [];
  loadHajiraAttendance();
  renderHajiraWorkerList();
}

function switchHajiraTab(tab) {
  ['attendance','workers','ledger'].forEach(function(t) {
    var el = document.getElementById('hajira-tab-' + t);
    var btn = document.getElementById('htab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'ledger') renderHajiraLedgerGrid();
}

// ── helpers ──
function hajiraEarned(worker, att) {
  // base pay per attendance row
  if (!att || att.status === 'absent') return 0;
  var base = att.status === 'half' ? Number(worker.daily_rate) / 2 : Number(worker.daily_rate);
  // OT pay is entered directly as a Tk amount (ot_pay field)
  var ot = Number(att.ot_pay || att.ot_hours || 0); // ot_pay = new field; ot_hours = legacy fallback
  var allowance = Number(att.allowance || 0);
  return base + ot + allowance;
}

function hajiraStatusLabel(s) {
  return s === 'present' ? 'Present' : s === 'half' ? 'Half day' : 'Absent';
}
function hajiraStatusColor(s) {
  return s === 'present' ? 'var(--ok)' : s === 'half' ? 'var(--warn,#f59e0b)' : 'var(--danger)';
}

// ── ATTENDANCE TAB ──
function hattPrevDay() {
  var d = document.getElementById('hatt-date');
  if (!d || !d.value) return;
  var dt = new Date(d.value); dt.setDate(dt.getDate() - 1);
  d.value = dt.toISOString().slice(0, 10);
  loadHajiraAttendance();
}
function hattNextDay() {
  var d = document.getElementById('hatt-date');
  if (!d || !d.value) return;
  var dt = new Date(d.value); dt.setDate(dt.getDate() + 1);
  d.value = dt.toISOString().slice(0, 10);
  loadHajiraAttendance();
}

async function loadHajiraAttendance() {
  var date = document.getElementById('hatt-date') ? document.getElementById('hatt-date').value : new Date().toISOString().slice(0,10);
  var header = document.getElementById('hatt-header');
  if (header) header.innerHTML = '<i class="ti ti-list"></i> Attendance — ' + date;

  if (!__hajiraWorkers.length) __hajiraWorkers = await apiGet('/hajira-workers') || [];
  var active = __hajiraWorkers.filter(function(w){ return w.active !== false; });

  // Load existing records for this date
  var existing = await apiGet('/hajira-attendance?date=' + date) || [];
  __hajiraAttRows = {};
  existing.forEach(function(r){ __hajiraAttRows[r.worker_id] = r; });

  var tb = document.getElementById('hatt-tbody');
  if (!tb) return;
  if (!active.length) {
    tb.innerHTML = '<tr><td colspan="7" class="empty-state">No workers yet. Add workers in the Workers tab.</td></tr>';
    return;
  }

  var INP = 'padding:5px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);text-align:center;box-sizing:border-box;width:100%';
  tb.innerHTML = active.map(function(w) {
    var ex = __hajiraAttRows[w.id] || {};
    var status = ex.status || 'present';
    var otPay = ex.ot_pay != null ? ex.ot_pay : (ex.ot_hours || '');
    var allowance = ex.allowance || '';
    var allowNote = ex.allowance_note || '';
    var note = ex.note || '';
    var sid  = 'hatt-status-' + w.id;
    var otPid = 'hatt-otp-' + w.id;
    var alid  = 'hatt-al-'  + w.id;
    var alnid = 'hatt-aln-' + w.id;
    var nid   = 'hatt-note-'+ w.id;
    return '<tr>' +
      '<td style="font-weight:600">' + esc(w.name) + '<br><span style="font-size:11px;color:var(--text-2)">' + esc(w.phone || '') + '</span></td>' +
      '<td class="num" style="white-space:nowrap">Tk ' + fmt(w.daily_rate) + '</td>' +
      '<td><select id="' + sid + '" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);font-size:13px;width:100%">' +
        '<option value="present"'  + (status==='present' ?' selected':'') + '>✅ Present</option>' +
        '<option value="half"'     + (status==='half'    ?' selected':'') + '>🌓 Half day</option>' +
        '<option value="absent"'   + (status==='absent'  ?' selected':'') + '>❌ Absent</option>' +
      '</select></td>' +
      '<td class="num" style="min-width:90px"><input type="number" id="' + otPid + '" value="' + otPay + '" placeholder="Tk 0" min="0" style="' + INP + '" title="Overtime payment (Tk)" /></td>' +
      '<td class="num" style="min-width:90px"><input type="number" id="' + alid + '" value="' + allowance + '" placeholder="Tk 0" min="0" style="' + INP + '" title="Allowance (Tk)" /></td>' +
      '<td style="min-width:90px"><input type="text" id="' + alnid + '" value="' + esc(allowNote) + '" placeholder="e.g. Transport" style="padding:5px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);font-size:12px;box-sizing:border-box;width:100%" /></td>' +
      '<td style="min-width:100px"><input type="text" id="' + nid + '" value="' + esc(note) + '" placeholder="Note" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);font-size:12px;box-sizing:border-box;width:100%" /></td>' +
      '</tr>';
  }).join('');

  updateHattSummary(active, date);
}

function hattStatusChange(sel, workerId) {
  // Visual feedback only — actual save on Save button
}

function updateHattSummary(active, date) {
  var sumEl = document.getElementById('hatt-summary');
  if (!sumEl) return;
  var present=0, half=0, absent=0, totalEarned=0;
  active.forEach(function(w){
    var ex = __hajiraAttRows[w.id];
    var st = ex ? ex.status : 'present'; // default present until saved
    if (st === 'present') present++;
    else if (st === 'half') half++;
    else absent++;
    if (ex) totalEarned += hajiraEarned(w, ex);
  });
  sumEl.innerHTML = '✅ Present: <strong>' + present + '</strong> &nbsp;|&nbsp; 🌓 Half: <strong>' + half + '</strong> &nbsp;|&nbsp; ❌ Absent: <strong>' + absent + '</strong> &nbsp;|&nbsp; 💰 Total earned today: <strong>Tk ' + fmt(totalEarned) + '</strong>';
}

async function saveHajiraAttendance() {
  var date = document.getElementById('hatt-date') ? document.getElementById('hatt-date').value : '';
  if (!date) return alert('Please select a date.');
  var active = __hajiraWorkers.filter(function(w){ return w.active !== false; });
  if (!active.length) return alert('No workers to save.');

  var errors = [];
  for (var i = 0; i < active.length; i++) {
    var w = active[i];
    var status = (document.getElementById('hatt-status-' + w.id) || {}).value || 'present';
    var otPay = parseFloat((document.getElementById('hatt-otp-' + w.id) || {}).value) || 0;
    var allowance = parseFloat((document.getElementById('hatt-al-' + w.id) || {}).value) || 0;
    var allowanceNote = ((document.getElementById('hatt-aln-' + w.id) || {}).value || '').trim();
    var note = ((document.getElementById('hatt-note-' + w.id) || {}).value || '').trim();
    var res = await apiPost('/hajira-attendance', { worker_id: w.id, date: date, status: status, ot_pay: otPay, ot_hours: otPay, allowance: allowance, allowance_note: allowanceNote, note: note });
    if (res && res.error) errors.push(w.name + ': ' + res.error);
  }

  if (errors.length) return alert('Some entries failed:\n' + errors.join('\n'));
  toast('Attendance saved for ' + date, 'ok');
  // Reload to reflect saved state
  var existing = await apiGet('/hajira-attendance?date=' + date) || [];
  __hajiraAttRows = {};
  existing.forEach(function(r){ __hajiraAttRows[r.worker_id] = r; });
  updateHattSummary(active, date);
}

// ── WORKERS TAB ──
async function addHajiraWorker() {
  var name = (document.getElementById('hw-name').value || '').trim();
  var phone = (document.getElementById('hw-phone').value || '').trim();
  var rate = parseFloat(document.getElementById('hw-rate').value) || 0;
  var note = (document.getElementById('hw-note').value || '').trim();
  if (!name) return alert('Please enter worker name.');
  if (!rate) return alert('Please enter daily rate.');
  var res = await apiPost('/hajira-workers', { name: name, phone: phone, daily_rate: rate, note: note });
  if (res && res.error) return alert(res.error);
  ['hw-name','hw-phone','hw-rate','hw-note'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  __hajiraWorkers = await apiGet('/hajira-workers') || [];
  renderHajiraWorkerList();
  toast(name + ' added', 'ok');
}

function renderHajiraWorkerList() {
  var tb = document.getElementById('hw-tbody');
  if (!tb) return;
  var active = __hajiraWorkers.filter(function(w){ return w.active !== false; });
  if (!active.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-state">No workers yet.</td></tr>'; return; }
  tb.innerHTML = active.map(function(w) {
    return '<tr>' +
      '<td style="font-weight:600">' + esc(w.name) + '</td>' +
      '<td>' + esc(w.phone || '—') + '</td>' +
      '<td class="num">Tk ' + fmt(w.daily_rate) + '</td>' +
      '<td style="font-size:12px;color:var(--text-2)">' + esc(w.note || '') + '</td>' +
      '<td><button class="del-btn" onclick="removeHajiraWorker(' + w.id + ',\'' + esc(w.name) + '\')" title="Remove"><i class="ti ti-trash"></i></button></td>' +
      '</tr>';
  }).join('');
}

async function removeHajiraWorker(id, name) {
  if (!confirm('Remove ' + name + '? Their attendance history will be kept.')) return;
  var res = await apiCall('DELETE', '/hajira-workers', { id: id });
  if (res && res.error) return alert(res.error);
  __hajiraWorkers = await apiGet('/hajira-workers') || [];
  renderHajiraWorkerList();
  toast(name + ' removed', 'ok');
}

// ── LEDGER TAB ──
async function renderHajiraLedgerGrid() {
  var grid = document.getElementById('hledger-grid');
  var detail = document.getElementById('hledger-detail');
  if (!grid) return;
  if (detail) detail.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = '<div style="padding:20px;color:var(--text-2)">Loading...</div>';

  if (!__hajiraWorkers.length) __hajiraWorkers = await apiGet('/hajira-workers') || [];
  var active = __hajiraWorkers.filter(function(w){ return w.active !== false; });
  if (!active.length) { grid.innerHTML = '<div class="empty-state" style="padding:30px">No workers yet.</div>'; return; }

  var allAtt = await apiGet('/hajira-attendance') || [];
  var allPay = await apiGet('/hajira-payments') || [];

  grid.innerHTML = active.map(function(w) {
    var wAtt = allAtt.filter(function(r){ return r.worker_id === w.id; });
    var wPay = allPay.filter(function(r){ return r.worker_id === w.id; });
    var present = wAtt.filter(function(r){ return r.status === 'present'; }).length;
    var half    = wAtt.filter(function(r){ return r.status === 'half'; }).length;
    var absent  = wAtt.filter(function(r){ return r.status === 'absent'; }).length;
    var totalEarned = wAtt.reduce(function(t,r){ return t + hajiraEarned(w,r); }, 0);
    var totalPaid   = wPay.reduce(function(t,r){ return t + Number(r.amount); }, 0);
    var due = totalEarned - totalPaid;
    var dueColor = due > 0 ? 'var(--danger)' : due < 0 ? 'var(--ok)' : 'var(--text-2)';
    var dueLabel = due > 0 ? 'Due' : due < 0 ? 'Advance' : 'Clear';
    return '<div class="detail-card" style="cursor:pointer" onclick="openHajiraLedgerDetail(' + w.id + ')">' +
      '<div class="detail-card-header"><i class="ti ti-user"></i> ' + esc(w.name) +
        (w.phone ? '<span style="font-size:11px;font-weight:400;color:var(--text-2);margin-left:8px">' + esc(w.phone) + '</span>' : '') +
        '<span style="font-size:11px;font-weight:400;color:var(--text-2);margin-left:8px">Tk ' + fmt(w.daily_rate) + '/day</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">' +
        '<div style="padding:10px 14px;border-right:1px solid var(--border)">' +
          '<div style="font-size:11px;color:var(--text-2)">Attendance</div>' +
          '<div style="font-weight:700;font-size:15px">' + wAtt.length + ' days</div>' +
          '<div style="font-size:11px;color:var(--text-2)">✅' + present + ' 🌓' + half + ' ❌' + absent + '</div>' +
        '</div>' +
        '<div style="padding:10px 14px;border-right:1px solid var(--border)">' +
          '<div style="font-size:11px;color:var(--text-2)">Total earned</div>' +
          '<div style="font-weight:700;font-size:15px;color:var(--ok)">Tk ' + fmt(totalEarned) + '</div>' +
          '<div style="font-size:11px;color:var(--text-2)">Paid: Tk ' + fmt(totalPaid) + '</div>' +
        '</div>' +
        '<div style="padding:10px 14px">' +
          '<div style="font-size:11px;color:var(--text-2)">' + dueLabel + '</div>' +
          '<div style="font-weight:700;font-size:18px;color:' + dueColor + '">Tk ' + fmt(Math.abs(due)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="padding:8px 14px;border-top:1px solid var(--border);font-size:12px;color:var(--accent)"><i class="ti ti-arrow-right"></i> View ledger</div>' +
    '</div>';
  }).join('');
}

async function openHajiraLedgerDetail(workerId) {
  __hajiraDetailId = workerId;
  var grid = document.getElementById('hledger-grid');
  var detail = document.getElementById('hledger-detail');
  if (grid) grid.style.display = 'none';
  if (detail) detail.style.display = 'block';
  var today = new Date().toISOString().slice(0, 10);
  var pd = document.getElementById('hpay-date'); if (pd && !pd.value) pd.value = today;
  renderHajiraLedgerDetail();
}

function closeHajiraLedgerDetail() {
  __hajiraDetailId = null;
  var grid = document.getElementById('hledger-grid');
  var detail = document.getElementById('hledger-detail');
  if (grid) grid.style.display = 'grid';
  if (detail) detail.style.display = 'none';
  renderHajiraLedgerGrid();
}

async function renderHajiraLedgerDetail() {
  var workerId = __hajiraDetailId;
  if (!workerId) return;
  var worker = __hajiraWorkers.find(function(w){ return w.id === workerId; });
  if (!worker) return;

  var titleEl = document.getElementById('hledger-detail-title');
  if (titleEl) titleEl.innerHTML = '<i class="ti ti-user"></i> ' + esc(worker.name) +
    '<span style="font-size:13px;font-weight:400;color:var(--text-2);margin-left:10px">Tk ' + fmt(worker.daily_rate) + '/day</span>' +
    (worker.phone ? '<span style="font-size:12px;font-weight:400;color:var(--text-2);margin-left:8px">· ' + esc(worker.phone) + '</span>' : '');

  var from = document.getElementById('hld-from') ? document.getElementById('hld-from').value : '';
  var to   = document.getElementById('hld-to')   ? document.getElementById('hld-to').value   : '';
  var inRange = function(d){ return (!from || d >= from) && (!to || d <= to); };

  var allAtt = await apiGet('/hajira-attendance?worker_id=' + workerId) || [];
  var allPay = await apiGet('/hajira-payments?worker_id=' + workerId) || [];

  var att = allAtt.filter(function(r){ return inRange(r.date); });
  var pay = allPay.filter(function(r){ return inRange(r.date); });

  att.sort(function(a,b){ return b.date.localeCompare(a.date); });
  pay.sort(function(a,b){ return b.date.localeCompare(a.date); });

  var present = att.filter(function(r){ return r.status==='present'; }).length;
  var half    = att.filter(function(r){ return r.status==='half'; }).length;
  var absent  = att.filter(function(r){ return r.status==='absent'; }).length;
  var totalOtPay    = att.reduce(function(t,r){ return t + Number(r.ot_pay||r.ot_hours||0); }, 0);
  var totalAllowance = att.reduce(function(t,r){ return t + Number(r.allowance||0); }, 0);
  var totalEarned   = att.reduce(function(t,r){ return t + hajiraEarned(worker,r); }, 0);
  var totalPaid     = pay.reduce(function(t,r){ return t + Number(r.amount); }, 0);
  var due = totalEarned - totalPaid;

  // Summary cards
  var sumEl = document.getElementById('hledger-detail-summary');
  if (sumEl) sumEl.innerHTML =
    summaryCard2('ti-calendar-check', '#10b981', 'Present', present + ' days') +
    summaryCard2('ti-clock-half', '#f59e0b', 'Half day', half + ' days') +
    summaryCard2('ti-user-x', '#ef4444', 'Absent', absent + ' days') +
    summaryCard2('ti-clock', '#6366f1', 'OT Pay', 'Tk ' + fmt(att.reduce(function(t,r){ return t+Number(r.ot_pay||r.ot_hours||0); },0))) +
    summaryCard2('ti-gift', '#0ea5e9', 'Allowance', 'Tk ' + fmt(totalAllowance)) +
    summaryCard2('ti-coin', '#10b981', 'Total earned', 'Tk ' + fmt(totalEarned)) +
    summaryCard2('ti-check', '#3b82f6', 'Paid', 'Tk ' + fmt(totalPaid)) +
    summaryCard2('ti-alert-circle', due > 0 ? '#ef4444' : '#10b981', due > 0 ? 'Due' : 'Advance', 'Tk ' + fmt(Math.abs(due)));

  // Attendance rows
  var attTb = document.getElementById('hld-att-tbody');
  if (attTb) {
    if (!att.length) {
      attTb.innerHTML = '<tr><td colspan="7" class="empty-state">No attendance records.</td></tr>';
    } else {
      attTb.innerHTML = att.map(function(r) {
        var base = r.status === 'absent' ? 0 : (r.status === 'half' ? Number(worker.daily_rate)/2 : Number(worker.daily_rate));
        var otAmt = Number(r.ot_pay || r.ot_hours || 0);
        var alAmt = Number(r.allowance||0);
        var total = base + otAmt + alAmt;
        var notes = [r.note, r.allowance_note ? r.allowance_note + ' allowance' : ''].filter(Boolean).join(', ');
        return '<tr>' +
          '<td>' + r.date + '</td>' +
          '<td style="color:' + hajiraStatusColor(r.status) + ';font-weight:600">' + hajiraStatusLabel(r.status) + '</td>' +
          '<td class="num">' + (base ? 'Tk ' + fmt(base) : '—') + '</td>' +
          '<td class="num">' + (otAmt ? 'Tk ' + fmt(otAmt) : '—') + '</td>' +
          '<td class="num">' + (alAmt ? 'Tk ' + fmt(alAmt) : '—') + '</td>' +
          '<td class="num" style="font-weight:700;color:var(--ok)">' + (total ? 'Tk ' + fmt(total) : '—') + '</td>' +
          '<td style="font-size:12px;color:var(--text-2)">' + esc(notes) + '</td>' +
        '</tr>';
      }).join('') +
      '<tr style="font-weight:700;border-top:2px solid var(--border);background:var(--surface-2)">' +
        '<td colspan="2">Total</td>' +
        '<td class="num">Tk ' + fmt(att.reduce(function(t,r){ var b=r.status==='absent'?0:(r.status==='half'?Number(worker.daily_rate)/2:Number(worker.daily_rate)); return t+b; },0)) + '</td>' +
        '<td class="num">Tk ' + fmt(att.reduce(function(t,r){ return t+Number(r.ot_pay||r.ot_hours||0); },0)) + '</td>' +
        '<td class="num">Tk ' + fmt(totalAllowance) + '</td>' +
        '<td class="num">Tk ' + fmt(totalEarned) + '</td>' +
        '<td></td>' +
      '</tr>';
    }
  }

  // Payment rows
  var payTb = document.getElementById('hld-pay-tbody');
  if (payTb) {
    if (!pay.length) {
      payTb.innerHTML = '<tr><td colspan="4" class="empty-state">No payments recorded.</td></tr>';
    } else {
      payTb.innerHTML = pay.map(function(r) {
        return '<tr>' +
          '<td>' + r.date + '</td>' +
          '<td class="num" style="color:var(--ok);font-weight:600">Tk ' + fmt(r.amount) + '</td>' +
          '<td style="font-size:12px;color:var(--text-2)">' + esc(r.note||'') + '</td>' +
          '<td><button class="del-btn" onclick="deleteHajiraPayment(' + r.id + ')" title="Delete"><i class="ti ti-trash"></i></button></td>' +
        '</tr>';
      }).join('') +
      '<tr style="font-weight:700;border-top:2px solid var(--border)"><td colspan="1">Total</td><td class="num">Tk ' + fmt(totalPaid) + '</td><td colspan="2"></td></tr>';
    }
  }
}

async function recordHajiraPayment() {
  var workerId = __hajiraDetailId;
  if (!workerId) return alert('No worker selected.');
  var amount = parseFloat(document.getElementById('hpay-amount').value) || 0;
  var date   = document.getElementById('hpay-date').value;
  var note   = (document.getElementById('hpay-note').value || '').trim();
  if (!amount || amount <= 0) return alert('Please enter a valid amount.');
  if (!date) return alert('Please enter payment date.');
  var res = await apiPost('/hajira-payments', { worker_id: workerId, amount: amount, date: date, note: note });
  if (res && res.error) return alert(res.error);
  var worker = __hajiraWorkers.find(function(w){ return w.id === workerId; });
  document.getElementById('hpay-amount').value = '';
  document.getElementById('hpay-note').value = '';
  toast('Payment of Tk ' + fmt(amount) + ' recorded for ' + (worker ? worker.name : ''), 'ok');
  renderHajiraLedgerDetail();
}

async function deleteHajiraPayment(id) {
  if (!confirm('Delete this payment record?')) return;
  var res = await apiCall('DELETE', '/hajira-payments', { id: id });
  if (res && res.error) return alert(res.error);
  toast('Payment deleted', 'ok');
  renderHajiraLedgerDetail();
}

// ═══════════════════════════════════════════════════════════════════════
// LANGUAGE / TRANSLATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════
var __currentLang = localStorage.getItem('bizsheba_lang') || 'en';

var LANG = {
  en: {
    // ── Topbar / brand ──
    'brand': 'BizSheba',
    'lang_btn': 'বাং',
    // ── Nav groups ──
    'nav_dashboard': 'Dashboard',
    'nav_sales': 'Sales',
    'nav_new_sale': 'New Sale',
    'nav_sales_list': 'Sales List',
    'nav_sales_returns': 'Sales Returns',
    'nav_exchanges': 'Exchanges',
    'nav_warranty': 'Warranty',
    'nav_purchases': 'Purchases',
    'nav_new_purchase': 'New Purchase',
    'nav_purchase_list': 'Purchase List',
    'nav_purchase_returns': 'Purchase Returns',
    'nav_suppliers': 'Suppliers',
    'nav_expenses': 'Expenses',
    'nav_cashflow': 'Cash Flow',
    'nav_dues': 'Dues',
    'nav_due_payment': 'Due Payment',
    'nav_customers': 'Customers',
    'nav_inventory': 'Inventory',
    'nav_products': 'Products',
    'nav_categories': 'Categories',
    'nav_brands': 'Brands',
    'nav_reports': 'Reports',
    'nav_staff': 'Staff',
    'nav_manage_staff': 'Manage Staff',
    'nav_attendance': 'Attendance',
    'nav_hajira': 'Hajira',
    'nav_staff_sales': 'Staff Sales',
    'nav_staff_reports': 'Staff Reports',
    'nav_settings': 'Settings',
    'nav_admin': 'Admin Panel',
    // ── Dashboard ──
    'page_dashboard': 'Dashboard',
    'dash_today_sales': "Today's Sales",
    'dash_today_purchase': "Today's Purchase",
    'dash_today_expense': "Today's Expense",
    'dash_net_profit': 'Net Profit',
    'dash_due': 'Due',
    'dash_total_sales': 'Total Sales',
    'dash_total_purchase': 'Total Purchase',
    'dash_total_expense': 'Total Expense',
    'dash_gross_profit': 'Gross Profit',
    'dash_low_stock': 'Low Stock',
    'dash_out_of_stock': 'Out of Stock',
    'dash_filter_today': 'Today',
    'dash_filter_week': 'This Week',
    'dash_filter_month': 'This Month',
    'dash_filter_year': 'This Year',
    'dash_filter_custom': 'Custom',
    // ── Sales ──
    'page_sales': 'Sales',
    'sales_customer': 'Customer',
    'sales_search_customer': 'Search / add customer',
    'sales_search_product': 'Search product or scan barcode...',
    'sales_qty': 'Qty',
    'sales_price': 'Price',
    'sales_discount': 'Discount',
    'sales_subtotal': 'Subtotal',
    'sales_total': 'Total',
    'sales_paid': 'Paid',
    'sales_due': 'Due',
    'sales_date': 'Date',
    'sales_note': 'Note',
    'sales_salesman': 'Salesman',
    'btn_add_to_cart': 'Add to cart',
    'btn_save_sale': 'Save & Print Bill',
    'btn_clear_cart': 'Clear Cart',
    'sales_prev_balance': 'Previous balance',
    'sales_cash': 'Cash',
    'sales_card': 'Card',
    'sales_mobile': 'Mobile Banking',
    // ── Sales List ──
    'page_sales_list': 'Sales List',
    'total_sales': 'Total (all sales)',
    // ── Sales Returns ──
    'page_sales_returns': 'Sales Returns',
    'btn_save_return': 'Save return',
    'total_returned': 'Total returned',
    // ── Exchanges ──
    'page_exchanges': 'Exchanges',
    'exc_find_bill': 'Find bill to exchange from',
    'exc_search': 'Search by bill number or customer name',
    'exc_bill_items': 'Items on this bill',
    'exc_pending': 'Pending exchanges',
    'exc_net_diff': 'Net difference',
    'btn_save_exchanges': 'Save exchanges & generate bill',
    // ── Purchases ──
    'page_purchases': 'New Purchase',
    'pur_supplier': 'Supplier',
    'pur_search_supplier': 'Search / add supplier',
    'pur_search_product': 'Search product...',
    'btn_add_item': 'Add Item',
    'btn_save_purchase': 'Save Purchase',
    'pur_total': 'Total',
    'pur_paid': 'Paid',
    'pur_due': 'Goes to supplier due',
    // ── Purchase List ──
    'page_purchase_list': 'Purchase List',
    'total_purchased': 'Total purchased',
    // ── Purchase Returns ──
    'page_purchase_returns': 'Purchase Returns',
    'total_returned_pur': 'Total returned',
    // ── Suppliers ──
    'page_suppliers': 'Suppliers',
    'sup_name': 'Supplier name',
    'sup_phone': 'Phone',
    'sup_address': 'Address',
    'btn_add_supplier': 'Add Supplier',
    // ── Expenses ──
    'page_expenses': 'Expenses',
    'exp_category': 'Category',
    'exp_amount': 'Amount',
    'exp_note': 'Note',
    'exp_date': 'Date',
    'btn_save_expense': 'Save expense',
    'total_expenses': 'Total',
    // ── Cash Flow ──
    'page_cashflow': 'Cash Flow',
    // ── Dues ──
    'page_dues': 'Due Payment',
    'due_customer': 'Customer',
    'due_amount': 'Amount',
    'due_date': 'Date',
    'total_outstanding': 'Total outstanding',
    'total_paid': 'Total paid',
    // ── Customers ──
    'page_customers': 'Customers',
    'cus_name': 'Customer name',
    'cus_phone': 'Phone',
    'cus_address': 'Address',
    'btn_add_customer': 'Add Customer',
    // ── Products ──
    'page_products': 'Products',
    'pro_name': 'Product name',
    'pro_qty': 'Quantity',
    'pro_purchase_price': 'Purchase price',
    'pro_sell_price': 'Sell price',
    'pro_unit': 'Unit',
    'pro_barcode': 'Barcode',
    'pro_category': 'Category',
    'pro_brand': 'Brand',
    'pro_serials': 'Serial numbers',
    'pro_warranty': 'Warranty (months)',
    'btn_save_product': 'Save product & generate barcode',
    'all_products': 'All products',
    // ── Categories & Brands ──
    'page_categories': 'Categories',
    'page_brands': 'Brands',
    // ── Reports ──
    'page_reports': 'Reports',
    // ── Settings ──
    'page_settings': 'Settings',
    'set_profile': 'Profile & account',
    'set_change_password': 'Change password',
    'set_business_details': 'Business details (shown on printed bills)',
    'set_business_name': 'Business name',
    'set_address': 'Address',
    'set_phone': 'Phone number',
    'set_gst': 'GST / tax number',
    'set_footer_note': 'Footer note',
    'set_pos_custom': 'POS bill customization',
    'set_features': 'Optional features',
    'set_features_desc': 'Turn on only the features your business needs. Saved with the button below.',
    'feat_serial_title': 'Serial number tracking',
    'feat_serial_desc': 'Attach serial / barcode numbers to products when adding stock. Best for electronics or any uniquely numbered item.',
    'feat_warranty_title': 'Warranty management',
    'feat_warranty_desc': 'Set warranty duration on products, log warranty claims, and process warranty exchanges with serial number replacement.',
    'feat_hajira_title': 'হাজিরা (Hajira) — Daily wage attendance',
    'feat_hajira_desc': 'Track daily-wage workers separately from regular staff. Record present/absent/half-day, auto-calculate payable amount, log payments, and view per-worker ledger.',
    'btn_save_settings': 'Save settings',
    // ── Staff ──
    'page_staff': 'Staff & Roles',
    'staff_name': 'Name',
    'staff_phone': 'Phone',
    'staff_role': 'Role',
    'staff_password': 'Password',
    'btn_add_staff': 'Add Staff',
    // ── Attendance ──
    'page_attendance': 'Attendance',
    'att_date': 'Date',
    'att_staff': 'Staff member',
    'att_status': 'Status',
    'att_entry': 'Entry time',
    'att_exit': 'Exit time',
    'att_note': 'Note',
    'att_present': 'Present',
    'att_absent': 'Absent',
    'att_leave': 'Leave',
    'btn_save_attendance': 'Save attendance',
    // ── Hajira ──
    'page_hajira': 'হাজিরা',
    'hajira_subtitle': 'Daily Wage Attendance',
    'htab_attendance': 'Attendance',
    'htab_workers': 'Workers',
    'htab_ledger': 'Ledger',
    'hw_name': 'Name',
    'hw_phone': 'Phone',
    'hw_rate': 'Salary / day (Tk)',
    'hw_note': 'Note',
    'btn_add_worker': 'Add worker',
    'all_workers': 'All workers',
    'hatt_status_present': '✅ Present',
    'hatt_status_half': '🌓 Half day',
    'hatt_status_absent': '❌ Absent',
    'hatt_ot_hrs': 'OT hrs',
    'hatt_ot_rate': 'OT rate/hr',
    'hatt_allowance': 'Allowance',
    'btn_save_attendance2': 'Save',
    'hled_record_payment': 'Record payment',
    'hled_amount': 'Amount (Tk)',
    'hled_date': 'Date',
    'hled_note': 'Note',
    'btn_paid': 'Paid',
    'hled_att_history': 'Attendance history',
    'hled_pay_history': 'Payment history',
    // ── Warranty ──
    'page_warranty': 'Warranty',
    'wc_find_bill': 'Find bill to claim warranty from',
    'wc_search': 'Search by bill number, customer name or phone',
    'wc_claim_form': 'Log warranty claim',
    'wc_product': 'Product',
    'wc_serial': 'Serial number',
    'wc_customer': 'Customer name',
    'wc_phone': 'Customer phone',
    'wc_sale_date': 'Original sale date',
    'wc_warranty_months': 'Warranty (months)',
    'wc_claim_date': 'Claim date',
    'wc_issue': 'Issue description',
    'btn_submit_claim': 'Submit claim',
    'we_exchange': 'Process warranty exchange',
    'we_old_serial': 'Old serial number',
    'we_new_serial': 'New serial number',
    'btn_save_we': 'Save warranty exchange',
    // ── Common ──
    'search': 'Search',
    'filter': 'Filter',
    'clear': 'Clear',
    'save': 'Save',
    'cancel': 'Cancel',
    'delete': 'Delete',
    'edit': 'Edit',
    'add': 'Add',
    'loading': 'Loading...',
    'no_data': 'No data found.',
    'from': 'From',
    'to': 'To',
    'date': 'Date',
    'amount': 'Amount',
    'note': 'Note',
    'status': 'Status',
    'action': 'Action',
    'name': 'Name',
    'phone': 'Phone',
    'total': 'Total',
    'due': 'Due',
    'paid': 'Paid',
    'present': 'Present',
    'absent': 'Absent',
    'back': 'Back',
    'print': 'Print',
    'logout': 'Log out',
    'settings': 'Settings',
  },

  bn: {
    // ── Topbar / brand ──
    'brand': 'BizSheba',
    'lang_btn': 'EN',
    // ── Nav groups ──
    'nav_dashboard': 'ড্যাশবোর্ড',
    'nav_sales': 'বিক্রয়',
    'nav_new_sale': 'নতুন বিক্রয়',
    'nav_sales_list': 'বিক্রয় তালিকা',
    'nav_sales_returns': 'বিক্রয় ফেরত',
    'nav_exchanges': 'বিনিময়',
    'nav_warranty': 'ওয়ারেন্টি',
    'nav_purchases': 'ক্রয়',
    'nav_new_purchase': 'নতুন ক্রয়',
    'nav_purchase_list': 'ক্রয় তালিকা',
    'nav_purchase_returns': 'ক্রয় ফেরত',
    'nav_suppliers': 'সরবরাহকারী',
    'nav_expenses': 'খরচ',
    'nav_cashflow': 'নগদ প্রবাহ',
    'nav_dues': 'বাকি',
    'nav_due_payment': 'বাকি পরিশোধ',
    'nav_customers': 'গ্রাহক',
    'nav_inventory': 'মজুদ',
    'nav_products': 'পণ্য',
    'nav_categories': 'বিভাগ',
    'nav_brands': 'ব্র্যান্ড',
    'nav_reports': 'রিপোর্ট',
    'nav_staff': 'কর্মী',
    'nav_manage_staff': 'কর্মী ব্যবস্থাপনা',
    'nav_attendance': 'উপস্থিতি',
    'nav_hajira': 'হাজিরা',
    'nav_staff_sales': 'কর্মীর বিক্রয়',
    'nav_staff_reports': 'কর্মী রিপোর্ট',
    'nav_settings': 'সেটিংস',
    'nav_admin': 'অ্যাডমিন প্যানেল',
    // ── Dashboard ──
    'page_dashboard': 'ড্যাশবোর্ড',
    'dash_today_sales': 'আজকের বিক্রয়',
    'dash_today_purchase': 'আজকের ক্রয়',
    'dash_today_expense': 'আজকের খরচ',
    'dash_net_profit': 'নিট মুনাফা',
    'dash_due': 'বাকি',
    'dash_total_sales': 'মোট বিক্রয়',
    'dash_total_purchase': 'মোট ক্রয়',
    'dash_total_expense': 'মোট খরচ',
    'dash_gross_profit': 'মোট মুনাফা',
    'dash_low_stock': 'কম মজুদ',
    'dash_out_of_stock': 'স্টক নেই',
    'dash_filter_today': 'আজ',
    'dash_filter_week': 'এই সপ্তাহ',
    'dash_filter_month': 'এই মাস',
    'dash_filter_year': 'এই বছর',
    'dash_filter_custom': 'নির্বাচিত',
    // ── Sales ──
    'page_sales': 'বিক্রয়',
    'sales_customer': 'গ্রাহক',
    'sales_search_customer': 'গ্রাহক খুঁজুন / যোগ করুন',
    'sales_search_product': 'পণ্য খুঁজুন বা বারকোড স্ক্যান করুন...',
    'sales_qty': 'পরিমাণ',
    'sales_price': 'মূল্য',
    'sales_discount': 'ছাড়',
    'sales_subtotal': 'উপমোট',
    'sales_total': 'মোট',
    'sales_paid': 'পরিশোধিত',
    'sales_due': 'বাকি',
    'sales_date': 'তারিখ',
    'sales_note': 'নোট',
    'sales_salesman': 'বিক্রয়কর্মী',
    'btn_add_to_cart': 'কার্টে যোগ করুন',
    'btn_save_sale': 'সেভ ও বিল প্রিন্ট করুন',
    'btn_clear_cart': 'কার্ট মুছুন',
    'sales_prev_balance': 'পূর্বের বাকি',
    'sales_cash': 'নগদ',
    'sales_card': 'কার্ড',
    'sales_mobile': 'মোবাইল ব্যাংকিং',
    // ── Sales List ──
    'page_sales_list': 'বিক্রয় তালিকা',
    'total_sales': 'মোট (সকল বিক্রয়)',
    // ── Sales Returns ──
    'page_sales_returns': 'বিক্রয় ফেরত',
    'btn_save_return': 'ফেরত সেভ করুন',
    'total_returned': 'মোট ফেরত',
    // ── Exchanges ──
    'page_exchanges': 'বিনিময়',
    'exc_find_bill': 'বিনিময়ের জন্য বিল খুঁজুন',
    'exc_search': 'বিল নম্বর বা গ্রাহকের নাম দিয়ে খুঁজুন',
    'exc_bill_items': 'এই বিলের পণ্যসমূহ',
    'exc_pending': 'অপেক্ষমান বিনিময়',
    'exc_net_diff': 'নিট পার্থক্য',
    'btn_save_exchanges': 'বিনিময় সেভ করুন ও বিল তৈরি করুন',
    // ── Purchases ──
    'page_purchases': 'নতুন ক্রয়',
    'pur_supplier': 'সরবরাহকারী',
    'pur_search_supplier': 'সরবরাহকারী খুঁজুন / যোগ করুন',
    'pur_search_product': 'পণ্য খুঁজুন...',
    'btn_add_item': 'আইটেম যোগ করুন',
    'btn_save_purchase': 'ক্রয় সেভ করুন',
    'pur_total': 'মোট',
    'pur_paid': 'পরিশোধিত',
    'pur_due': 'সরবরাহকারীর বাকিতে যাবে',
    // ── Purchase List ──
    'page_purchase_list': 'ক্রয় তালিকা',
    'total_purchased': 'মোট ক্রয়',
    // ── Purchase Returns ──
    'page_purchase_returns': 'ক্রয় ফেরত',
    'total_returned_pur': 'মোট ফেরত',
    // ── Suppliers ──
    'page_suppliers': 'সরবরাহকারী',
    'sup_name': 'সরবরাহকারীর নাম',
    'sup_phone': 'ফোন',
    'sup_address': 'ঠিকানা',
    'btn_add_supplier': 'সরবরাহকারী যোগ করুন',
    // ── Expenses ──
    'page_expenses': 'খরচ',
    'exp_category': 'বিভাগ',
    'exp_amount': 'পরিমাণ',
    'exp_note': 'নোট',
    'exp_date': 'তারিখ',
    'btn_save_expense': 'খরচ সেভ করুন',
    'total_expenses': 'মোট',
    // ── Cash Flow ──
    'page_cashflow': 'নগদ প্রবাহ',
    // ── Dues ──
    'page_dues': 'বাকি পরিশোধ',
    'due_customer': 'গ্রাহক',
    'due_amount': 'পরিমাণ',
    'due_date': 'তারিখ',
    'total_outstanding': 'মোট বকেয়া',
    'total_paid': 'মোট পরিশোধিত',
    // ── Customers ──
    'page_customers': 'গ্রাহক',
    'cus_name': 'গ্রাহকের নাম',
    'cus_phone': 'ফোন',
    'cus_address': 'ঠিকানা',
    'btn_add_customer': 'গ্রাহক যোগ করুন',
    // ── Products ──
    'page_products': 'পণ্য',
    'pro_name': 'পণ্যের নাম',
    'pro_qty': 'পরিমাণ',
    'pro_purchase_price': 'ক্রয়মূল্য',
    'pro_sell_price': 'বিক্রয়মূল্য',
    'pro_unit': 'একক',
    'pro_barcode': 'বারকোড',
    'pro_category': 'বিভাগ',
    'pro_brand': 'ব্র্যান্ড',
    'pro_serials': 'সিরিয়াল নম্বর',
    'pro_warranty': 'ওয়ারেন্টি (মাস)',
    'btn_save_product': 'পণ্য সেভ ও বারকোড তৈরি করুন',
    'all_products': 'সকল পণ্য',
    // ── Categories & Brands ──
    'page_categories': 'বিভাগ',
    'page_brands': 'ব্র্যান্ড',
    // ── Reports ──
    'page_reports': 'রিপোর্ট',
    // ── Settings ──
    'page_settings': 'সেটিংস',
    'set_profile': 'প্রোফাইল ও অ্যাকাউন্ট',
    'set_change_password': 'পাসওয়ার্ড পরিবর্তন',
    'set_business_details': 'ব্যবসার তথ্য (প্রিন্ট করা বিলে দেখা যাবে)',
    'set_business_name': 'ব্যবসার নাম',
    'set_address': 'ঠিকানা',
    'set_phone': 'ফোন নম্বর',
    'set_gst': 'ভ্যাট / ট্যাক্স নম্বর',
    'set_footer_note': 'ফুটার নোট',
    'set_pos_custom': 'পিওএস বিল কাস্টমাইজেশন',
    'set_features': 'ঐচ্ছিক ফিচারসমূহ',
    'set_features_desc': 'আপনার ব্যবসার প্রয়োজনীয় ফিচারগুলো চালু করুন। নিচের বোতাম দিয়ে সেভ হবে।',
    'feat_serial_title': 'সিরিয়াল নম্বর ট্র্যাকিং',
    'feat_serial_desc': 'পণ্য যোগ করার সময় সিরিয়াল/বারকোড নম্বর সংযুক্ত করুন। ইলেকট্রনিক্স বা অনন্য নম্বরযুক্ত পণ্যের জন্য সেরা।',
    'feat_warranty_title': 'ওয়ারেন্টি ব্যবস্থাপনা',
    'feat_warranty_desc': 'পণ্যে ওয়ারেন্টির মেয়াদ নির্ধারণ করুন, দাবি লগ করুন এবং সিরিয়াল নম্বর পরিবর্তনসহ ওয়ারেন্টি বিনিময় প্রক্রিয়া করুন।',
    'feat_hajira_title': 'হাজিরা — দৈনিক মজুরি উপস্থিতি',
    'feat_hajira_desc': 'নিয়মিত কর্মীদের থেকে আলাদাভাবে দৈনিক মজুরি শ্রমিকদের ট্র্যাক করুন। উপস্থিত/অনুপস্থিত/অর্ধদিন রেকর্ড করুন, প্রদেয় পরিমাণ স্বয়ংক্রিয়ভাবে হিসাব হবে।',
    'btn_save_settings': 'সেটিংস সেভ করুন',
    // ── Staff ──
    'page_staff': 'কর্মী ও ভূমিকা',
    'staff_name': 'নাম',
    'staff_phone': 'ফোন',
    'staff_role': 'ভূমিকা',
    'staff_password': 'পাসওয়ার্ড',
    'btn_add_staff': 'কর্মী যোগ করুন',
    // ── Attendance ──
    'page_attendance': 'উপস্থিতি',
    'att_date': 'তারিখ',
    'att_staff': 'কর্মী',
    'att_status': 'অবস্থা',
    'att_entry': 'প্রবেশের সময়',
    'att_exit': 'প্রস্থানের সময়',
    'att_note': 'নোট',
    'att_present': 'উপস্থিত',
    'att_absent': 'অনুপস্থিত',
    'att_leave': 'ছুটি',
    'btn_save_attendance': 'উপস্থিতি সেভ করুন',
    // ── Hajira ──
    'page_hajira': 'হাজিরা',
    'hajira_subtitle': 'দৈনিক মজুরি উপস্থিতি',
    'htab_attendance': 'উপস্থিতি',
    'htab_workers': 'শ্রমিক',
    'htab_ledger': 'হিসাব',
    'hw_name': 'নাম',
    'hw_phone': 'ফোন',
    'hw_rate': 'বেতন / দিন (টাকা)',
    'hw_note': 'নোট',
    'btn_add_worker': 'শ্রমিক যোগ করুন',
    'all_workers': 'সকল শ্রমিক',
    'hatt_status_present': '✅ উপস্থিত',
    'hatt_status_half': '🌓 অর্ধদিন',
    'hatt_status_absent': '❌ অনুপস্থিত',
    'hatt_ot_hrs': 'ওভারটাইম ঘণ্টা',
    'hatt_ot_rate': 'ওটি রেট/ঘণ্টা',
    'hatt_allowance': 'ভাতা',
    'btn_save_attendance2': 'সেভ',
    'hled_record_payment': 'পেমেন্ট রেকর্ড করুন',
    'hled_amount': 'পরিমাণ (টাকা)',
    'hled_date': 'তারিখ',
    'hled_note': 'নোট',
    'btn_paid': 'পরিশোধ',
    'hled_att_history': 'উপস্থিতির ইতিহাস',
    'hled_pay_history': 'পেমেন্টের ইতিহাস',
    // ── Warranty ──
    'page_warranty': 'ওয়ারেন্টি',
    'wc_find_bill': 'ওয়ারেন্টি দাবির জন্য বিল খুঁজুন',
    'wc_search': 'বিল নম্বর, গ্রাহকের নাম বা ফোন দিয়ে খুঁজুন',
    'wc_claim_form': 'ওয়ারেন্টি দাবি লগ করুন',
    'wc_product': 'পণ্য',
    'wc_serial': 'সিরিয়াল নম্বর',
    'wc_customer': 'গ্রাহকের নাম',
    'wc_phone': 'গ্রাহকের ফোন',
    'wc_sale_date': 'মূল বিক্রয়ের তারিখ',
    'wc_warranty_months': 'ওয়ারেন্টি (মাস)',
    'wc_claim_date': 'দাবির তারিখ',
    'wc_issue': 'সমস্যার বিবরণ',
    'btn_submit_claim': 'দাবি জমা দিন',
    'we_exchange': 'ওয়ারেন্টি বিনিময় প্রক্রিয়া করুন',
    'we_old_serial': 'পুরানো সিরিয়াল নম্বর',
    'we_new_serial': 'নতুন সিরিয়াল নম্বর',
    'btn_save_we': 'ওয়ারেন্টি বিনিময় সেভ করুন',
    // ── Common ──
    'search': 'খুঁজুন',
    'filter': 'ফিল্টার',
    'clear': 'মুছুন',
    'save': 'সেভ',
    'cancel': 'বাতিল',
    'delete': 'মুছুন',
    'edit': 'সম্পাদনা',
    'add': 'যোগ করুন',
    'loading': 'লোড হচ্ছে...',
    'no_data': 'কোনো ডেটা পাওয়া যায়নি।',
    'from': 'থেকে',
    'to': 'পর্যন্ত',
    'date': 'তারিখ',
    'amount': 'পরিমাণ',
    'note': 'নোট',
    'status': 'অবস্থা',
    'action': 'কার্যক্রম',
    'name': 'নাম',
    'phone': 'ফোন',
    'total': 'মোট',
    'due': 'বাকি',
    'paid': 'পরিশোধিত',
    'present': 'উপস্থিত',
    'absent': 'অনুপস্থিত',
    'back': 'ফিরে যান',
    'print': 'প্রিন্ট',
    'logout': 'লগ আউট',
    'settings': 'সেটিংস',
  }
};

// ── translation engine ──
function t(key) {
  var d = LANG[__currentLang];
  return (d && d[key]) || (LANG['en'] && LANG['en'][key]) || key;
}

function applyLang() {
  var L = LANG[__currentLang] || LANG['en'];

  // toggle button label
  var btn = document.getElementById('lang-toggle');
  if (btn) btn.textContent = L['lang_btn'] || (__currentLang === 'en' ? 'বাং' : 'EN');

  // nav sidebar
  var navMap = {
    'dashboard':      'nav_dashboard',
    'sales':          'nav_sales',
    'new-sale':       'nav_new_sale',
    'saleslist':      'nav_sales_list',
    'salesreturns':   'nav_sales_returns',
    'exchanges':      'nav_exchanges',
    'warranty':       'nav_warranty',
    'purchases':      'nav_purchases',
    'new-purchase':   'nav_new_purchase',
    'purchaselist':   'nav_purchase_list',
    'purchasereturns':'nav_purchase_returns',
    'suppliers':      'nav_suppliers',
    'expenses':       'nav_expenses',
    'cashflow':       'nav_cashflow',
    'dues':           'nav_dues',
    'due-payment':    'nav_due_payment',
    'customers':      'nav_customers',
    'inventory':      'nav_inventory',
    'products':       'nav_products',
    'categories':     'nav_categories',
    'brands':         'nav_brands',
    'reports':        'nav_reports',
    'staff':          'nav_staff',
    'manage-staff':   'nav_manage_staff',
    'attendance':     'nav_attendance',
    'hajira':         'nav_hajira',  // 'Hajira'
    'staffsales':     'nav_staff_sales',
    'staffreports':   'nav_staff_reports',
    'settings':       'nav_settings',
    'admin':          'nav_admin',
  };

  // Translate nav buttons by data-page and text content
  document.querySelectorAll('[data-page]').forEach(function(el) {
    var page = el.getAttribute('data-page');
    var key = navMap[page];
    if (!key) return;
    // preserve icon (first child <i>) and translate only text node
    var icon = el.querySelector('i');
    var caret = el.querySelector('.nav-caret');
    var span = el.querySelector('span:not(.nav-caret)');
    if (span) {
      span.textContent = L[key] || span.textContent;
    } else {
      // plain button with icon + text node
      var text = L[key];
      if (text) {
        var childNodes = Array.from(el.childNodes);
        childNodes.forEach(function(n) {
          if (n.nodeType === 3 && n.textContent.trim()) n.textContent = text;
        });
      }
    }
  });

  // Translate all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var val = L[key];
    if (!val) return;
    var ph = el.getAttribute('data-i18n-attr');
    if (ph === 'placeholder') el.placeholder = val;
    else el.textContent = val;
  });

  // Document title
  document.title = 'BizSheba';
}

function toggleLang() {
  __currentLang = (__currentLang === 'en') ? 'bn' : 'en';
  localStorage.setItem('bizsheba_lang', __currentLang);
  applyLang();
  // Re-render current page so dynamically generated content also translates
  var activePage = document.querySelector('.page[style*="block"], .page:not([style])');
  // find active nav button
  var activeBtn = document.querySelector('.sidebar button.active[data-page]');
  if (activeBtn) {
    var page = activeBtn.getAttribute('data-page');
    if (window.__pageRenderers && window.__pageRenderers[page]) {
      window.__pageRenderers[page]();
    }
  }
}

// Call applyLang on startup after DOM is ready
(function() {
  var _orig = window.onload;
  window.onload = function() {
    if (_orig) _orig();
    applyLang();
  };
})();
