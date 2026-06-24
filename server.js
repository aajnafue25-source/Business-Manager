/* Business Manager v5 — Full ERP: Purchases, Suppliers, Returns, Search APIs
   Run with: node server.js
*/

const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eivuhxvrnckgvkwcidpj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'PASTE_YOUR_ANON_KEY_HERE';
const ADMIN_USERNAME = 'nafue';
const TRIAL_DAYS = 30;
const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Content Security Policy — matched to the resources the front end actually loads:
// cdnjs (JsBarcode, Chart.js, Font Awesome), Google Fonts CSS + gstatic font files,
// and inline scripts/handlers ('unsafe-inline' required by the 140 inline onclick handlers).
// NOTE: if you later display profile pictures served from Supabase storage, add that
// origin to img-src (e.g. add the Supabase project URL).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

// ---------- Supabase REST helper ----------
async function sb(method, table, opts = {}) {
  const { query = '', body } = opts;
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': body && method !== 'DELETE' ? 'return=representation' : 'return=minimal'
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getNextId() {
  const rows = await sb('GET', 'meta', { query: 'key=eq.nextId' });
  const current = parseInt(rows[0].value);
  await sb('PATCH', 'meta', { query: 'key=eq.nextId', body: { value: String(current + 1) } });
  return current;
}
async function getNextBillNo() {
  const rows = await sb('GET', 'meta', { query: 'key=eq.nextBillNo' });
  if (!rows || !rows.length) return 1;
  const current = parseInt(rows[0].value);
  await sb('PATCH', 'meta', { query: 'key=eq.nextBillNo', body: { value: String(current + 1) } });
  return current;
}
async function getNextPurchaseNo() {
  const rows = await sb('GET', 'meta', { query: 'key=eq.nextPurchaseNo' });
  if (!rows || !rows.length) return 1;
  const current = parseInt(rows[0].value);
  await sb('PATCH', 'meta', { query: 'key=eq.nextPurchaseNo', body: { value: String(current + 1) } });
  return current;
}
async function getNextBarcode(name) {
  const prefix = (name || 'PRD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const rows = await sb('GET', 'meta', { query: 'key=eq.barcodeSeq' });
  const current = parseInt(rows[0].value);
  await sb('PATCH', 'meta', { query: 'key=eq.barcodeSeq', body: { value: String(current + 1) } });
  return `${prefix}-${current + 1}`;
}

// ---------- Sessions ----------
// ---------- Sessions (Supabase-backed — survives server restarts) ----------
async function createSession(data) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await sb('POST', 'sessions', { body: { token, data: JSON.stringify(data), expires_at: expiresAt } });
  return token;
}
async function getSession(token) {
  if (!token) return null;
  try {
    const rows = await sb('GET', 'sessions', { query: `token=eq.${encodeURIComponent(token)}&expires_at=gt.${new Date().toISOString()}` });
    if (!rows || !rows.length) return null;
    return JSON.parse(rows[0].data);
  } catch (e) { return null; }
}
async function deleteSession(token) {
  if (!token) return;
  try { await sb('DELETE', 'sessions', { query: `token=eq.${encodeURIComponent(token)}` }); } catch (e) {}
}
function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}
// Passwords: bcrypt (slow + salted). Legacy SHA-256 hashes are still accepted and
// auto-upgraded to bcrypt on the user's next successful login or password change.
function hashPassword(pass) {
  return bcrypt.hashSync(pass, 10);
}
function verifyPassword(pass, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2')) return bcrypt.compareSync(pass, stored);
  return stored === crypto.createHash('sha256').update(pass + 'bizmgr-salt-2024').digest('hex');
}
function isLegacyHash(stored) { return !!stored && !stored.startsWith('$2'); }

// Session cookie builder. Secure flag is added only over HTTPS so localhost dev still works.
function buildSessionCookie(token, req, maxAge = 604800) {
  let c = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (req.headers['x-forwarded-proto'] === 'https') c += '; Secure';
  return c;
}

// ---------- Login rate limiting (in-memory, per IP + account) ----------
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? xff.split(',')[0].trim() : (req.socket && req.socket.remoteAddress)) || 'unknown';
}
function loginLockedSeconds(key) {
  const r = loginAttempts.get(key);
  if (r && r.lockedUntil && r.lockedUntil > Date.now()) return Math.ceil((r.lockedUntil - Date.now()) / 1000);
  return 0;
}
function recordLoginFail(key) {
  const now = Date.now();
  let r = loginAttempts.get(key);
  if (!r || now - r.firstAt > LOGIN_WINDOW_MS) r = { count: 0, firstAt: now, lockedUntil: 0 };
  r.count++;
  if (r.count >= MAX_LOGIN_ATTEMPTS) r.lockedUntil = now + LOGIN_LOCKOUT_MS;
  loginAttempts.set(key, r);
}
function recordLoginSuccess(key) { loginAttempts.delete(key); }

// ---------- Helpers ----------
function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extraHeaders });
  res.end(JSON.stringify(body));
}
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB cap — blocks memory-exhaustion payloads
function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      chunks += c;
      if (chunks.length > MAX_BODY_SIZE) { aborted = true; resolve({}); req.destroy(); }
    });
    req.on('end', () => { if (!aborted) { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { resolve({}); } } });
    req.on('error', () => { if (!aborted) { aborted = true; resolve({}); } });
  });
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, urlPath) {
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- Audit log ----------
// Writes a record of every important action. Never throws — logging failure must never break a real request.
async function audit(session, action, table, recordId, detail = '') {
  try {
    await sb('POST', 'audit_log', { body: {
      user_id:    session ? session.businessId : null,
      username:   session ? session.username   : 'system',
      role:       session ? session.role       : 'system',
      action,           // 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT'
      table_name: table,
      record_id:  recordId ? String(recordId) : null,
      detail:     detail ? String(detail).slice(0, 500) : null,
      created_at: new Date().toISOString()
    }});
  } catch (e) { console.error('[audit]', e.message); }
}

function isExpired(user) {
  if (!user.expires_at) return false;
  return new Date(user.expires_at).getTime() < Date.now();
}

// ---------- Auth ----------
async function handleAuth(method, pathname, req, res) {
  if (method === 'POST' && pathname === '/api/auth/signup') {
    const b = await readBody(req);
    if (!b.username || !b.password || !b.phone) return send(res, 400, { error: 'Username, phone and password required' });
    if (b.password.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' });
    const existing = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (existing && existing.length > 0) return send(res, 400, { error: 'Username already taken' });
    const id = await getNextId();
    const isAdmin = b.username === ADMIN_USERNAME;
    const status = isAdmin ? 'approved' : 'pending';
    const approvedAt = isAdmin ? new Date().toISOString() : null;
    await sb('POST', 'users', { body: { id, username: b.username, phone: b.phone, password_hash: hashPassword(b.password), status, is_admin: isAdmin, approved_at: approvedAt, expires_at: null } });
    if (isAdmin) {
      const token = await createSession({ businessId: id, role: 'manager', username: b.username, isAdmin: true });
      return send(res, 200, { ok: true, username: b.username, status: 'approved', isAdmin: true }, { 'Set-Cookie': buildSessionCookie(token, req) });
    }
    return send(res, 200, { ok: true, status: 'pending' });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const b = await readBody(req);
    if (!b.username || !b.password) return send(res, 400, { error: 'Username and password required' });
    const lockKey = clientIp(req) + ':u:' + String(b.username).toLowerCase();
    const lockedFor = loginLockedSeconds(lockKey);
    if (lockedFor) return send(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).` });
    const users = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (!users || !users.length) { recordLoginFail(lockKey); return send(res, 401, { error: 'Invalid username or password' }); }
    const user = users[0];
    if (!verifyPassword(b.password, user.password_hash)) { recordLoginFail(lockKey); return send(res, 401, { error: 'Invalid username or password' }); }
    if (user.status === 'pending') return send(res, 403, { error: 'pending', message: 'Your account is waiting for admin approval.' });
    if (user.status === 'rejected') return send(res, 403, { error: 'rejected', message: 'Your account was not approved. Contact the admin.' });
    if (user.blocked || isExpired(user)) return send(res, 403, { error: 'expired' });
    recordLoginSuccess(lockKey);
    if (isLegacyHash(user.password_hash)) await sb('PATCH', 'users', { query: `id=eq.${user.id}`, body: { password_hash: hashPassword(b.password) } });
    const token = await createSession({ businessId: user.id, role: 'manager', username: user.username, isAdmin: user.is_admin });
    await audit({ businessId: user.id, username: user.username, role: 'manager' }, 'LOGIN', 'users', user.id, 'manager login');
    return send(res, 200, { ok: true, username: user.username, isAdmin: user.is_admin, role: 'manager' }, { 'Set-Cookie': buildSessionCookie(token, req) });
  }

  if (method === 'POST' && pathname === '/api/auth/staff-login') {
    const b = await readBody(req);
    if (!b.phone || !b.password) return send(res, 400, { error: 'Phone and password required' });
    const lockKey = clientIp(req) + ':s:' + String(b.phone).toLowerCase();
    const lockedFor = loginLockedSeconds(lockKey);
    if (lockedFor) return send(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).` });
    const staffRows = await sb('GET', 'staff', { query: `phone=eq.${encodeURIComponent(b.phone)}` });
    if (!staffRows || !staffRows.length) { recordLoginFail(lockKey); return send(res, 401, { error: 'Invalid phone or password' }); }
    const staffUser = staffRows[0];
    if (!verifyPassword(b.password, staffUser.password_hash)) { recordLoginFail(lockKey); return send(res, 401, { error: 'Invalid phone or password' }); }
    const bizRows = await sb('GET', 'users', { query: `id=eq.${staffUser.business_user_id}` });
    const biz = bizRows && bizRows[0];
    if (!biz) return send(res, 401, { error: 'Business not found' });
    if (biz.blocked || isExpired(biz)) return send(res, 403, { error: 'expired' });
    recordLoginSuccess(lockKey);
    if (isLegacyHash(staffUser.password_hash)) await sb('PATCH', 'staff', { query: `id=eq.${staffUser.id}`, body: { password_hash: hashPassword(b.password) } });
    const token = await createSession({ businessId: biz.id, role: staffUser.role, staffId: staffUser.id, username: staffUser.name, isAdmin: false });
    await audit({ businessId: biz.id, username: staffUser.name, role: staffUser.role }, 'LOGIN', 'staff', staffUser.id, 'staff login');
    return send(res, 200, { ok: true, username: staffUser.name, role: staffUser.role, isAdmin: false }, { 'Set-Cookie': buildSessionCookie(token, req) });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = getToken(req);
    if (token) {
      const s = await getSession(token);
      if (s) await audit(s, 'LOGOUT', 'sessions', null, 'user logout');
      await deleteSession(token);
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': buildSessionCookie('', req, 0) });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const token = getToken(req);
    const session = await getSession(token);
    if (!session) return send(res, 401, { error: 'Not logged in' });
    const bizRows = await sb('GET', 'users', { query: `id=eq.${session.businessId}` });
    const biz = bizRows && bizRows[0];
    if (!biz) return send(res, 401, { error: 'Not logged in' });
    if (biz.blocked || isExpired(biz)) { await deleteSession(token); return send(res, 403, { error: 'expired' }); }
    return send(res, 200, { username: session.username, isAdmin: session.isAdmin, role: session.role, businessId: session.businessId, daysLeft: biz.expires_at ? Math.max(0, Math.ceil((new Date(biz.expires_at).getTime() - Date.now()) / 86400000)) : null });
  }

  if (method === 'POST' && pathname === '/api/auth/change-password') {
    const token = getToken(req);
    const session = await getSession(token);
    if (!session) return send(res, 401, { error: 'Not logged in' });
    const b = await readBody(req);
    if (!b.currentPassword || !b.newPassword) return send(res, 400, { error: 'Current and new password required' });
    if (b.newPassword.length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' });

    if (session.role === 'manager') {
      const users = await sb('GET', 'users', { query: `id=eq.${session.businessId}` });
      const user = users && users[0];
      if (!user || !verifyPassword(b.currentPassword, user.password_hash)) return send(res, 401, { error: 'Current password incorrect' });
      await sb('PATCH', 'users', { query: `id=eq.${session.businessId}`, body: { password_hash: hashPassword(b.newPassword) } });
      return send(res, 200, { ok: true });
    } else {
      const staffRows = await sb('GET', 'staff', { query: `id=eq.${session.staffId}` });
      const staffUser = staffRows && staffRows[0];
      if (!staffUser || !verifyPassword(b.currentPassword, staffUser.password_hash)) return send(res, 401, { error: 'Current password incorrect' });
      await sb('PATCH', 'staff', { query: `id=eq.${session.staffId}`, body: { password_hash: hashPassword(b.newPassword) } });
      return send(res, 200, { ok: true });
    }
  }

  return null;
}

// ---------- Admin routes ----------
async function handleAdmin(method, pathname, req, res, session) {
  if (!session.isAdmin) return send(res, 403, { error: 'Admin only' });

  if (method === 'GET' && pathname === '/api/admin/users') {
    const users = await sb('GET', 'users', { query: 'order=id.asc' });
    const now = Date.now();
    return send(res, 200, (users || []).map(u => ({
      id: u.id, username: u.username, phone: u.phone, status: u.status, is_admin: u.is_admin,
      blocked: u.blocked, expires_at: u.expires_at,
      daysLeft: u.expires_at ? Math.max(0, Math.ceil((new Date(u.expires_at).getTime() - now) / 86400000)) : null,
      isExpired: u.expires_at ? new Date(u.expires_at).getTime() < now : false
    })));
  }

  if (method === 'POST' && pathname === '/api/admin/approve') {
    const b = await readBody(req);
    const expiresAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
    await sb('PATCH', 'users', { query: `id=eq.${b.userId}`, body: { status: 'approved', approved_at: new Date().toISOString(), expires_at: expiresAt, blocked: false } });
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/admin/reject') {
    const b = await readBody(req);
    await sb('PATCH', 'users', { query: `id=eq.${b.userId}`, body: { status: 'rejected' } });
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/admin/renew') {
    const b = await readBody(req);
    const days = Number(b.days) || TRIAL_DAYS;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    await sb('PATCH', 'users', { query: `id=eq.${b.userId}`, body: { expires_at: expiresAt, blocked: false } });
    return send(res, 200, { ok: true, expires_at: expiresAt });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/admin/users/')) {
    const userId = pathname.split('/').pop();
    const bizTables = ['sales', 'expenses', 'dues', 'due_paid', 'products', 'customers', 'settings', 'suppliers', 'purchases', 'purchase_items', 'purchase_returns', 'sales_returns', 'supplier_dues', 'supplier_due_paid', 'serial_numbers', 'warranty_claims', 'warranty_exchanges', 'hajira_workers', 'hajira_attendance', 'hajira_payments'];
    for (const table of bizTables) {
      try { await sb('DELETE', table, { query: `user_id=eq.${userId}` }); } catch (e) {}
    }
    try { await sb('DELETE', 'staff', { query: `business_user_id=eq.${userId}` }); } catch (e) {}
    await sb('DELETE', 'users', { query: `id=eq.${userId}` });
    return send(res, 200, { ok: true });
  }

  return null;
}

// ---------- Staff management (manager only) ----------
async function handleStaff(method, pathname, req, res, session) {
  // Sales role can read staff list (for salesman dropdown)
  if (method === 'GET' && pathname === '/api/staff') {
    const rows = await sb('GET', 'staff', { query: `business_user_id=eq.${session.businessId}&order=name.asc` });
    return send(res, 200, (rows || []).map(s => ({ id: s.id, name: s.name, phone: s.phone, role: s.role })));
  }

  // Everything else requires manager
  if (session.role !== 'manager') return send(res, 403, { error: 'Manager only' });

  if (method === 'POST' && pathname === '/api/staff') {
    const b = await readBody(req);
    if (!b.name || !b.phone || !b.password) return send(res, 400, { error: 'Name, phone and password required' });
    if (b.password.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' });
    const existing = await sb('GET', 'staff', { query: `phone=eq.${encodeURIComponent(b.phone)}` });
    if (existing && existing.length) return send(res, 400, { error: 'Phone number already used' });
    const id = await getNextId();
    await sb('POST', 'staff', { body: { id, business_user_id: session.businessId, name: b.name, phone: b.phone, password_hash: hashPassword(b.password), role: b.role === 'manager' ? 'manager' : 'sales' } });
    return send(res, 200, { id });
  }

  if (method === 'PUT' && pathname.startsWith('/api/staff/')) {
    const id = pathname.split('/').pop();
    const b = await readBody(req);
    const patch = { name: b.name, role: b.role === 'manager' ? 'manager' : 'sales' };
    if (b.password) patch.password_hash = hashPassword(b.password);
    await sb('PATCH', 'staff', { query: `id=eq.${id}&business_user_id=eq.${session.businessId}`, body: patch });
    return send(res, 200, { ok: true });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/staff/')) {
    const id = pathname.split('/').pop();
    await audit(session, 'DELETE', 'staff', id);
    await sb('DELETE', 'staff', { query: `id=eq.${id}&business_user_id=eq.${session.businessId}` });
    return send(res, 200, { ok: true });
  }

  // ── Attendance ──
  if (method === 'GET' && pathname === '/api/attendance') {
    const rows = await sb('GET', 'attendance', { query: bizQuery(session, 'order=id.desc') });
    return send(res, 200, rows || []);
  }
  if (method === 'POST' && pathname === '/api/attendance') {
    const b = await readBody(req);
    if (!b.staff_name || !b.date) return send(res, 400, { error: 'staff_name and date required' });
    const id = await getNextId();
    await sb('POST', 'attendance', { body: { id, user_id: session.businessId, staff_id: b.staff_id || null, staff_name: b.staff_name, date: b.date, entry_time: b.entry_time || null, exit_time: b.exit_time || null, lunch_out: b.lunch_out || null, lunch_in: b.lunch_in || null, status: b.status || 'present', note: b.note || '' } });
    return send(res, 200, { id });
  }
  if (method === 'PATCH' && pathname.startsWith('/api/attendance/')) {
    const id = pathname.split('/').pop();
    const b = await readBody(req);
    await sb('PATCH', 'attendance', { query: `id=eq.${id}&user_id=eq.${session.businessId}`, body: { entry_time: b.entry_time || null, exit_time: b.exit_time || null, lunch_out: b.lunch_out || null, lunch_in: b.lunch_in || null, status: b.status || 'present', note: b.note || '' } });
    return send(res, 200, { ok: true });
  }
  if (method === 'DELETE' && pathname.startsWith('/api/attendance/')) {
    const id = pathname.split('/').pop();
    await audit(session, 'DELETE', 'attendance', id);
    await sb('DELETE', 'attendance', { query: `id=eq.${id}&user_id=eq.${session.businessId}` });
    return send(res, 200, { ok: true });
  }

  return null;
}

function canEdit(session) {
  return session.role === 'manager';
}

function bizQuery(session, extra = '') {
  return `user_id=eq.${session.businessId}${extra ? '&' + extra : ''}`;
}

// ---------- Data routes ----------
const routes = {
  // ----- Sales -----
  'GET /api/sales': async (req, res, session) => {
    const rows = await sb('GET', 'sales', { query: bizQuery(session, 'order=id.desc') });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/sales': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    let customerName = b.customerName || null;
    if (b.customer_id && !customerName) {
      const custs = await sb('GET', 'customers', { query: `id=eq.${b.customer_id}&user_id=eq.${session.businessId}` });
      if (custs && custs[0]) customerName = custs[0].name;
    }
    const row = { id, user_id: session.businessId, date: b.date, description: b.desc, amount: Number(b.amount), product_id: b.product_id || null, quantity: b.quantity || null, unit_price: b.unit_price != null ? Number(b.unit_price) : null, cost_price: b.cost_price != null ? Number(b.cost_price) : null, bill_id: b.bill_id || null, bill_no: b.bill_no || null, customer_id: b.customer_id || null, customer_name: customerName };
    await sb('POST', 'sales', { body: row });
    if (b.product_id && b.quantity) {
      const prods = await sb('GET', 'products', { query: `id=eq.${b.product_id}&user_id=eq.${session.businessId}` });
      if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - Number(b.quantity)) } });
    }
    send(res, 200, { id });
  },
  'PUT /api/sales/:id': null, // handled in dynamic matcher

  'POST /api/checkout': async (req, res, session) => {
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.date || !items.length) return send(res, 400, { error: 'date and items required' });
    const billId = await getNextId();
    const billNo = await getNextBillNo();
    const discountPct = Number(b.discountPct) || 0;
    const discountAmt = Number(b.discountAmt) || 0;
    const vatPct = Number(b.vatPct) || 0;
    let subtotal = 0;
    const saleRows = [];
    let customerPhone = null;
    let customerName = b.customerName || null;
    let customer = null;
    if (b.customer_id) {
      const custs = await sb('GET', 'customers', { query: `id=eq.${b.customer_id}&user_id=eq.${session.businessId}` });
      if (custs && custs[0]) { customer = custs[0]; customerPhone = custs[0].phone; customerName = custs[0].name; }
    }
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const amount = Number(it.amount != null ? it.amount : unitPrice * qty);
      if (!it.desc || amount <= 0 || qty <= 0) continue;
      let costPrice = it.cost_price != null ? Number(it.cost_price) : null;
      if (it.product_id) {
        const prods = await sb('GET', 'products', { query: `id=eq.${it.product_id}&user_id=eq.${session.businessId}` });
        if (prods && prods[0]) {
          if (costPrice == null) costPrice = Number(prods[0].purchase_price) || 0;
          await sb('PATCH', 'products', { query: `id=eq.${it.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - qty) } });
        }
      }
      const rowId = await getNextId();
      const wMonths = Number(it.warranty_months) || 0;
      const wExpires = wMonths > 0 ? (() => { const d = new Date(b.date); d.setMonth(d.getMonth() + wMonths); return d.toISOString().slice(0,10); })() : null;
      const row = { id: rowId, user_id: session.businessId, date: b.date, description: it.desc, amount, product_id: it.product_id || null, quantity: qty, unit_price: unitPrice, cost_price: costPrice, bill_id: billId, bill_no: billNo, customer_id: b.customer_id || null, customer_phone: customerPhone, customer_name: customerName, discount_pct: discountPct, discount_amount: discountAmt, vat_pct: vatPct, vat_amount: 0, salesman_id: b.salesman_id || null, salesman_name: b.salesman_name || null, warranty_months: wMonths, warranty_expires: wExpires };
      await sb('POST', 'sales', { body: row });
      saleRows.push({ ...row, desc: row.description });
      subtotal += amount;
    }
    if (!saleRows.length) return send(res, 400, { error: 'no valid items' });
    // Apply discount + VAT to get final total
    const discountApplied = discountAmt > 0 ? discountAmt : (subtotal * discountPct / 100);
    const afterDiscount = Math.max(0, subtotal - discountApplied);
    const vatApplied = afterDiscount * vatPct / 100;
    const itemsTotal = afterDiscount + vatApplied;
    const previousBalance = Math.max(0, Number(b.previousBalance) || 0);
    const grandTotal = itemsTotal + previousBalance;
    const amountPaid = Math.min(Number(b.amountPaid) || 0, grandTotal);

    // Apply payment to previous balance first, then new items
    const paidToOldBalance = Math.min(amountPaid, previousBalance);
    const remainingForItems = Math.max(0, amountPaid - paidToOldBalance);
    const newItemsDue = Math.max(0, itemsTotal - remainingForItems);

    // If previous balance was paid (even partially), create a due_paid entry
    if (paidToOldBalance > 0 && b.customer_id) {
      const dpId = await getNextId();
      const partyName = customer ? customer.name : (b.customerName || 'Walk-in');
      await sb('POST', 'due_paid', { body: { id: dpId, user_id: session.businessId, date: b.date, party: partyName, amount: paidToOldBalance, note: `Paid via Bill #${billNo}`, customer_id: b.customer_id } });
    }

    // Create new due entry only for the new items' unpaid portion
    if (newItemsDue > 0) {
      const dueId = await getNextId();
      await sb('POST', 'dues', { body: { id: dueId, user_id: session.businessId, date: b.date, party: customer ? customer.name : (b.customerName || 'Walk-in'), amount: newItemsDue, note: `Bill #${billNo}`, customer_id: b.customer_id || null, bill_id: billId, bill_no: billNo } });
    }

    const dueAmount = Math.max(0, grandTotal - amountPaid);
    send(res, 200, { billId, billNo, subtotal, itemsTotal, previousBalance, discountApplied, vatApplied, total: grandTotal, amountPaid, dueAmount, items: saleRows, date: b.date, customer: customer || (b.customerName ? { name: b.customerName } : null), discountPct, discountAmt, vatPct });
  },

  // ----- Sales returns -----
  'GET /api/sales-returns': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'sales_returns', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/sales-returns': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.quantity || !b.amount) return send(res, 400, { error: 'date, desc, quantity, amount required' });
    const id = await getNextId();
    const row = { id, user_id: session.businessId, sale_id: b.sale_id || null, bill_id: b.bill_id || null, bill_no: b.bill_no || null, product_id: b.product_id || null, customer_id: b.customer_id || null, description: b.desc, date: b.date, quantity: Number(b.quantity), unit_price: b.unit_price != null ? Number(b.unit_price) : null, amount: Number(b.amount), note: b.note || '' };
    await sb('POST', 'sales_returns', { body: row });
    if (b.product_id) {
      const prods = await sb('GET', 'products', { query: `id=eq.${b.product_id}&user_id=eq.${session.businessId}` });
      if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: (prods[0].quantity || 0) + Number(b.quantity) } });
    }
    send(res, 200, { id });
  },

  // ----- Exchanges -----
  'GET /api/exchanges': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'exchanges', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/exchanges': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    if (!b.date || !b.original_desc || !b.new_desc) return send(res, 400, { error: 'date, original_desc, new_desc required' });
    const id = await getNextId();
    const exchangeBillNo = await getNextBillNo();
    const originalQty = Number(b.original_qty) || 1;
    const newQty = Number(b.new_qty) || 1;
    const originalPrice = Number(b.original_price) || 0;
    const newPrice = Number(b.new_price) || 0;
    const priceDiff = (newPrice * newQty) - (originalPrice * originalQty);

    // Return original item to stock
    if (b.original_product_id) {
      const op = await sb('GET', 'products', { query: `id=eq.${b.original_product_id}&user_id=eq.${session.businessId}` });
      if (op && op[0]) await sb('PATCH', 'products', { query: `id=eq.${b.original_product_id}`, body: { quantity: (op[0].quantity || 0) + originalQty } });
    }
    // Deduct new item from stock
    if (b.new_product_id) {
      const np = await sb('GET', 'products', { query: `id=eq.${b.new_product_id}&user_id=eq.${session.businessId}` });
      if (np && np[0]) await sb('PATCH', 'products', { query: `id=eq.${b.new_product_id}`, body: { quantity: Math.max(0, (np[0].quantity || 0) - newQty) } });
    }

    const row = {
      id, user_id: session.businessId, date: b.date,
      original_bill_id: b.original_bill_id || null, original_bill_no: b.original_bill_no || null,
      customer_name: b.customer_name || null, customer_id: b.customer_id || null,
      original_product_id: b.original_product_id || null, original_desc: b.original_desc,
      original_qty: originalQty, original_price: originalPrice,
      new_product_id: b.new_product_id || null, new_desc: b.new_desc,
      new_qty: newQty, new_price: newPrice, price_diff: priceDiff,
      exchange_bill_no: exchangeBillNo, note: b.note || ''
    };
    await sb('POST', 'exchanges', { body: row });
    send(res, 200, { id, exchangeBillNo, priceDiff });
  },

  // ----- Expenses -----
  'GET /api/expenses': async (req, res, session) => {
    const rows = await sb('GET', 'expenses', { query: bizQuery(session, 'order=id.desc') });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/expenses': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'expenses', { body: { id, user_id: session.businessId, date: b.date, description: b.desc, amount: Number(b.amount) } });
    send(res, 200, { id });
  },

  // ----- Dues (customer) -----
  'GET /api/dues': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'dues', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/dues': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'dues', { body: { id, user_id: session.businessId, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    send(res, 200, { id });
  },

  'GET /api/due-paid': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'due_paid', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/due-paid': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'due_paid', { body: { id, user_id: session.businessId, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    send(res, 200, { id });
  },

  // ----- Products -----
  'GET /api/products': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'products', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'GET /api/products/search': async (req, res, session, query) => {
    const q = (query.get('q') || '').toLowerCase();
    const all = (await sb('GET', 'products', { query: bizQuery(session, 'order=id.desc') })) || [];
    const filtered = q ? all.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q)) : all;
    send(res, 200, filtered.slice(0, 20));
  },
  'POST /api/products': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    let barcode = (b.barcode || '').trim();
    if (barcode) {
      const existing = await sb('GET', 'products', { query: `barcode=eq.${encodeURIComponent(barcode)}&user_id=eq.${session.businessId}` });
      if (existing && existing.length) return send(res, 400, { error: 'A product with this barcode already exists' });
    } else {
      barcode = await getNextBarcode(b.name);
    }
    await sb('POST', 'products', { body: { id, user_id: session.businessId, name: b.name, barcode, quantity: Number(b.quantity) || 0, purchase_price: Number(b.purchase_price) || 0, sell_price: Number(b.sell_price) || 0, unit: b.unit || 'pcs', category_id: b.category_id || null, brand_id: b.brand_id || null, category_name: b.category_name || null, brand_name: b.brand_name || null, warranty_months: Number(b.warranty_months) || 0, warranty_unit: b.warranty_unit || 'months' } });
    // If serial numbers provided (comma-separated), register each one
    if (b.serials) {
      const serials = String(b.serials).split(',').map(s => s.trim()).filter(Boolean);
      for (const serial of serials) {
        const sid = await getNextId();
        await sb('POST', 'serial_numbers', { body: { id: sid, user_id: session.businessId, product_id: id, product_name: b.name, serial, status: 'in_stock' } });
      }
    }
    send(res, 200, { id, barcode });
  },

  // ----- Serial Numbers -----
  'GET /api/serial-numbers': async (req, res, session, query) => {
    const productId = query && query.get('product_id');
    const q = productId ? bizQuery(session, `product_id=eq.${productId}&order=id.desc`) : bizQuery(session, 'order=id.desc');
    send(res, 200, (await sb('GET', 'serial_numbers', { query: q })) || []);
  },
  'POST /api/serial-numbers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.serial) return send(res, 400, { error: 'serial required' });
    const id = await getNextId();
    await sb('POST', 'serial_numbers', { body: { id, user_id: session.businessId, product_id: b.product_id || null, product_name: b.product_name || null, serial: b.serial, status: 'in_stock' } });
    send(res, 200, { id });
  },

  // ----- Warranty Claims -----
  'GET /api/warranty-claims': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'warranty_claims', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/warranty-claims': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.claim_date || !b.serial_number) return send(res, 400, { error: 'claim_date and serial_number required' });
    const id = await getNextId();
    await sb('POST', 'warranty_claims', { body: { id, user_id: session.businessId, serial_id: b.serial_id || null, serial_number: b.serial_number, product_name: b.product_name || null, customer_name: b.customer_name || null, customer_phone: b.customer_phone || null, sale_date: b.sale_date || null, warranty_months: Number(b.warranty_months) || 0, claim_date: b.claim_date, issue: b.issue || null, status: 'open', note: b.note || null } });
    await audit(session, 'CREATE', 'warranty_claims', id, `Serial: ${b.serial_number}`);
    send(res, 200, { id });
  },
  'PATCH /api/warranty-claims': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.id) return send(res, 400, { error: 'id required' });
    await sb('PATCH', 'warranty_claims', { query: `id=eq.${b.id}&user_id=eq.${session.businessId}`, body: { status: b.status, note: b.note || null } });
    send(res, 200, { ok: true });
  },

  // ----- Warranty Exchanges -----
  'GET /api/warranty-exchanges': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'warranty_exchanges', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/warranty-exchanges': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.exchange_date || !b.new_serial) return send(res, 400, { error: 'exchange_date and new_serial required' });
    const id = await getNextId();
    await sb('POST', 'warranty_exchanges', { body: { id, user_id: session.businessId, claim_id: b.claim_id || null, serial_id: b.serial_id || null, old_serial: b.old_serial || null, old_product_name: b.old_product_name || null, new_serial: b.new_serial, new_product_name: b.new_product_name || null, customer_name: b.customer_name || null, exchange_date: b.exchange_date, note: b.note || null } });
    if (b.serial_id) await sb('PATCH', 'serial_numbers', { query: `id=eq.${b.serial_id}&user_id=eq.${session.businessId}`, body: { status: 'exchanged' } });
    if (b.new_serial && b.product_id) {
      const nsid = await getNextId();
      await sb('POST', 'serial_numbers', { body: { id: nsid, user_id: session.businessId, product_id: b.product_id, product_name: b.new_product_name || b.old_product_name, serial: b.new_serial, status: 'sold', sold_to: b.customer_name || null } });
    }
    if (b.claim_id) await sb('PATCH', 'warranty_claims', { query: `id=eq.${b.claim_id}&user_id=eq.${session.businessId}`, body: { status: 'exchanged' } });
    await audit(session, 'CREATE', 'warranty_exchanges', id, `Old: ${b.old_serial} → New: ${b.new_serial}`);
    send(res, 200, { id });
  },

  // ----- Hajira Workers -----
  'GET /api/hajira-workers': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'hajira_workers', { query: bizQuery(session, 'order=name.asc') })) || []);
  },
  'POST /api/hajira-workers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    if (!b.daily_rate && b.daily_rate !== 0) return send(res, 400, { error: 'daily_rate required' });
    const id = await getNextId();
    await sb('POST', 'hajira_workers', { body: { id, user_id: session.businessId, name: b.name, phone: b.phone || null, daily_rate: Number(b.daily_rate) || 0, note: b.note || null, active: true } });
    send(res, 200, { id });
  },
  'PUT /api/hajira-workers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.id) return send(res, 400, { error: 'id required' });
    await sb('PATCH', 'hajira_workers', { query: `id=eq.${b.id}&user_id=eq.${session.businessId}`, body: { name: b.name, phone: b.phone || null, daily_rate: Number(b.daily_rate) || 0, note: b.note || null, active: b.active !== false } });
    send(res, 200, { ok: true });
  },
  'DELETE /api/hajira-workers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.id) return send(res, 400, { error: 'id required' });
    // Soft delete — mark inactive so history is preserved
    await sb('PATCH', 'hajira_workers', { query: `id=eq.${b.id}&user_id=eq.${session.businessId}`, body: { active: false } });
    send(res, 200, { ok: true });
  },

  // ----- Hajira Attendance -----
  'GET /api/hajira-attendance': async (req, res, session, query) => {
    const workerId = query && query.get('worker_id');
    const date = query && query.get('date');
    let q = bizQuery(session, 'order=date.desc');
    if (workerId) q = bizQuery(session, `worker_id=eq.${workerId}&order=date.desc`);
    if (date) q = bizQuery(session, `date=eq.${date}&order=id.asc`);
    if (workerId && date) q = bizQuery(session, `worker_id=eq.${workerId}&date=eq.${date}`);
    send(res, 200, (await sb('GET', 'hajira_attendance', { query: q })) || []);
  },
  'POST /api/hajira-attendance': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.worker_id || !b.date) return send(res, 400, { error: 'worker_id and date required' });
    // Upsert — if record exists for this worker+date, update it
    const existing = await sb('GET', 'hajira_attendance', { query: `worker_id=eq.${b.worker_id}&date=eq.${b.date}&user_id=eq.${session.businessId}` });
    if (existing && existing.length) {
      await sb('PATCH', 'hajira_attendance', { query: `id=eq.${existing[0].id}&user_id=eq.${session.businessId}`, body: { status: b.status || 'present', note: b.note || '', ot_hours: Number(b.ot_hours) || 0, ot_rate: Number(b.ot_rate) || 0, allowance: Number(b.allowance) || 0, allowance_note: b.allowance_note || '' } });
      return send(res, 200, { id: existing[0].id, updated: true });
    }
    const id = await getNextId();
    await sb('POST', 'hajira_attendance', { body: { id, user_id: session.businessId, worker_id: Number(b.worker_id), date: b.date, status: b.status || 'present', note: b.note || '', ot_hours: Number(b.ot_hours) || 0, ot_rate: Number(b.ot_rate) || 0, allowance: Number(b.allowance) || 0, allowance_note: b.allowance_note || '' } });
    send(res, 200, { id });
  },

  // ----- Hajira Payments -----
  'GET /api/hajira-payments': async (req, res, session, query) => {
    const workerId = query && query.get('worker_id');
    const q = workerId ? bizQuery(session, `worker_id=eq.${workerId}&order=date.desc`) : bizQuery(session, 'order=date.desc');
    send(res, 200, (await sb('GET', 'hajira_payments', { query: q })) || []);
  },
  'POST /api/hajira-payments': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.worker_id || !b.amount || !b.date) return send(res, 400, { error: 'worker_id, amount, date required' });
    const id = await getNextId();
    await sb('POST', 'hajira_payments', { body: { id, user_id: session.businessId, worker_id: Number(b.worker_id), amount: Number(b.amount), date: b.date, note: b.note || '' } });
    await audit(session, 'CREATE', 'hajira_payments', id, `Worker ${b.worker_id} paid ${b.amount}`);
    send(res, 200, { id });
  },
  'DELETE /api/hajira-payments': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.id) return send(res, 400, { error: 'id required' });
    await sb('DELETE', 'hajira_payments', { query: `id=eq.${b.id}&user_id=eq.${session.businessId}` });
    send(res, 200, { ok: true });
  },


  'GET /api/categories': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'categories', { query: bizQuery(session, 'order=name.asc') })) || []);
  },
  'POST /api/categories': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'categories', { body: { id, user_id: session.businessId, name: b.name } });
    send(res, 200, { id });
  },

  // ----- Brands -----
  'GET /api/brands': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'brands', { query: bizQuery(session, 'order=name.asc') })) || []);
  },
  'POST /api/brands': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'brands', { body: { id, user_id: session.businessId, name: b.name } });
    send(res, 200, { id });
  },

  // ----- Customers -----
  'GET /api/customers': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'customers', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'GET /api/customers/search': async (req, res, session, query) => {
    const q = (query.get('q') || '').toLowerCase();
    const all = (await sb('GET', 'customers', { query: bizQuery(session, 'order=id.desc') })) || [];
    const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)) : all;
    send(res, 200, filtered.slice(0, 20));
  },
  'POST /api/customers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'customers', { body: { id, user_id: session.businessId, name: b.name, phone: b.phone || '', address: b.address || '' } });
    send(res, 200, { id });
  },

  'GET /api/customers-summary': async (req, res, session) => {
    const [customers, sales, dues, duePaid] = await Promise.all([
      sb('GET', 'customers', { query: bizQuery(session) }),
      sb('GET', 'sales', { query: bizQuery(session) }),
      sb('GET', 'dues', { query: bizQuery(session) }),
      sb('GET', 'due_paid', { query: bizQuery(session) })
    ]);
    const list = (customers || []).map(c => {
      const theirSales = (sales || []).filter(s => String(s.customer_id) === String(c.id));
      const theirDues = (dues || []).filter(d => String(d.customer_id) === String(c.id));
      // Match payments by customer_id first, fall back to party name match
      const theirPaid = (duePaid || []).filter(p =>
        (p.customer_id && String(p.customer_id) === String(c.id)) ||
        (!p.customer_id && (p.party || '').toLowerCase() === (c.name || '').toLowerCase())
      );
      const grossDue = theirDues.reduce((s, r) => s + Number(r.amount), 0);
      const totalPaid = theirPaid.reduce((s, r) => s + Number(r.amount), 0);
      const totalDue = Math.max(0, grossDue - totalPaid);
      return { ...c, totalPurchased: theirSales.reduce((s, r) => s + Number(r.amount), 0), totalDue, billCount: new Set(theirSales.map(s => s.bill_id)).size };
    });
    send(res, 200, list);
  },

  // ----- Suppliers -----
  'GET /api/suppliers': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'suppliers', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'GET /api/suppliers/search': async (req, res, session, query) => {
    const q = (query.get('q') || '').toLowerCase();
    const all = (await sb('GET', 'suppliers', { query: bizQuery(session, 'order=id.desc') })) || [];
    const filtered = q ? all.filter(s => s.name.toLowerCase().includes(q) || (s.phone || '').toLowerCase().includes(q)) : all;
    send(res, 200, filtered.slice(0, 20));
  },
  'POST /api/suppliers': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'suppliers', { body: { id, user_id: session.businessId, name: b.name, phone: b.phone || '', address: b.address || '' } });
    send(res, 200, { id });
  },
  'GET /api/suppliers-summary': async (req, res, session) => {
    const [suppliers, purchases, sDues] = await Promise.all([
      sb('GET', 'suppliers', { query: bizQuery(session) }),
      sb('GET', 'purchases', { query: bizQuery(session) }),
      sb('GET', 'supplier_dues', { query: bizQuery(session) })
    ]);
    const list = (suppliers || []).map(s => {
      const theirPurchases = (purchases || []).filter(p => String(p.supplier_id) === String(s.id));
      const theirDues = (sDues || []).filter(d => String(d.supplier_id) === String(s.id));
      return { ...s, totalPurchased: theirPurchases.reduce((sum, r) => sum + Number(r.total), 0), totalDue: theirDues.reduce((sum, r) => sum + Number(r.amount), 0), purchaseCount: theirPurchases.length };
    });
    send(res, 200, list);
  },

  // ----- Purchases -----
  'GET /api/purchases': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'purchases', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/purchases': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.date || !items.length) return send(res, 400, { error: 'date and items required' });
    const purchaseId = await getNextId();
    const purchaseNo = await getNextPurchaseNo();
    let total = 0;
    const itemRows = [];
    let supplierName = b.supplierName || '';
    if (b.supplier_id) {
      const sup = await sb('GET', 'suppliers', { query: `id=eq.${b.supplier_id}&user_id=eq.${session.businessId}` });
      if (sup && sup[0]) supplierName = sup[0].name;
    }
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const unitCost = Number(it.unit_cost) || 0;
      const amount = Number(it.amount != null ? it.amount : unitCost * qty);
      if (!it.desc || qty <= 0) continue;
      let productId = it.product_id || null;

      // Auto-create product in inventory if this is a custom item (no product selected)
      if (!productId && it.desc) {
        const barcode = await getNextBarcode(it.desc);
        const newProdId = await getNextId();
        await sb('POST', 'products', { body: {
          id: newProdId, user_id: session.businessId, name: it.desc, barcode,
          quantity: qty, purchase_price: unitCost, sell_price: Number(it.sell_price) || 0,
          unit: it.unit || 'pcs', category_name: it.category_name || null, brand_name: it.brand_name || null
        }});
        productId = newProdId;
      } else if (productId) {
        const prods = await sb('GET', 'products', { query: `id=eq.${productId}&user_id=eq.${session.businessId}` });
        if (prods && prods[0]) {
          const patch = { quantity: (prods[0].quantity || 0) + qty };
          if (it.updatePurchasePrice) patch.purchase_price = unitCost;
          if (it.sell_price != null && Number(it.sell_price) > 0) patch.sell_price = Number(it.sell_price);
          if (it.warranty_months != null && Number(it.warranty_months) > 0) patch.warranty_months = Number(it.warranty_months);
          await sb('PATCH', 'products', { query: `id=eq.${productId}`, body: patch });
        }
      }

      const itemId = await getNextId();
      const row = { id: itemId, user_id: session.businessId, purchase_id: purchaseId, product_id: productId, description: it.desc, quantity: qty, unit_cost: unitCost, amount };
      await sb('POST', 'purchase_items', { body: row });
      itemRows.push(row);
      total += amount;
    }
    if (!itemRows.length) return send(res, 400, { error: 'no valid items' });
    const amountPaid = Math.min(Number(b.amountPaid) || 0, total);
    const dueAmount = Math.max(0, total - amountPaid);
    await sb('POST', 'purchases', { body: { id: purchaseId, user_id: session.businessId, supplier_id: b.supplier_id || null, supplier_name: supplierName, date: b.date, purchase_no: purchaseNo, total, amount_paid: amountPaid, due_amount: dueAmount, note: b.note || '' } });
    if (dueAmount > 0) {
      const dueId = await getNextId();
      await sb('POST', 'supplier_dues', { body: { id: dueId, user_id: session.businessId, supplier_id: b.supplier_id || null, party: supplierName || 'Supplier', date: b.date, amount: dueAmount, note: `Purchase #${purchaseNo}` } });
    }
    send(res, 200, { purchaseId, purchaseNo, total, amountPaid, dueAmount, items: itemRows, date: b.date, supplierName });
  },
  'GET /api/purchases/:id/items': null,

  // ----- Purchase returns -----
  'GET /api/purchase-returns': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'purchase_returns', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/purchase-returns': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.quantity || !b.amount) return send(res, 400, { error: 'date, desc, quantity, amount required' });
    const id = await getNextId();
    const row = { id, user_id: session.businessId, purchase_id: b.purchase_id || null, supplier_id: b.supplier_id || null, supplier_name: b.supplierName || '', product_id: b.product_id || null, description: b.desc, date: b.date, quantity: Number(b.quantity), unit_cost: b.unit_cost != null ? Number(b.unit_cost) : null, amount: Number(b.amount), note: b.note || '' };
    await sb('POST', 'purchase_returns', { body: row });
    if (b.product_id) {
      const prods = await sb('GET', 'products', { query: `id=eq.${b.product_id}&user_id=eq.${session.businessId}` });
      if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - Number(b.quantity)) } });
    }
    // Reduce what we owe the supplier
    if (b.supplier_id) {
      let remaining = Number(b.amount);
      const sDues = await sb('GET', 'supplier_dues', { query: `supplier_id=eq.${b.supplier_id}&user_id=eq.${session.businessId}&order=id.asc` });
      for (const d of (sDues || [])) {
        if (remaining <= 0) break;
        if (d.amount <= remaining) { remaining -= d.amount; await sb('DELETE', 'supplier_dues', { query: `id=eq.${d.id}` }); }
        else { await sb('PATCH', 'supplier_dues', { query: `id=eq.${d.id}`, body: { amount: d.amount - remaining } }); remaining = 0; }
      }
    }
    send(res, 200, { id });
  },

  // ----- Supplier dues -----
  'GET /api/supplier-dues': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'supplier_dues', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'GET /api/supplier-due-paid': async (req, res, session) => {
    send(res, 200, (await sb('GET', 'supplier_due_paid', { query: bizQuery(session, 'order=id.desc') })) || []);
  },
  'POST /api/supplier-due-paid': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'supplier_due_paid', { body: { id, user_id: session.businessId, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', supplier_id: b.supplier_id || null } });
    let remaining = Number(b.amount);
    const query = b.supplier_id ? `supplier_id=eq.${b.supplier_id}&user_id=eq.${session.businessId}&order=id.asc` : `party=eq.${encodeURIComponent(b.party)}&user_id=eq.${session.businessId}&order=id.asc`;
    const sDues = await sb('GET', 'supplier_dues', { query });
    for (const d of (sDues || [])) {
      if (remaining <= 0) break;
      if (d.amount <= remaining) { remaining -= d.amount; await sb('DELETE', 'supplier_dues', { query: `id=eq.${d.id}` }); }
      else { await sb('PATCH', 'supplier_dues', { query: `id=eq.${d.id}`, body: { amount: d.amount - remaining } }); remaining = 0; }
    }
    send(res, 200, { id });
  },

  // ----- Settings -----
  'GET /api/settings': async (req, res, session) => {
    const rows = await sb('GET', 'settings', { query: `user_id=eq.${session.businessId}` });
    send(res, 200, rows && rows[0] ? rows[0] : {});
  },
  'PUT /api/settings': async (req, res, session) => {
    if (!canEdit(session)) return send(res, 403, { error: 'Manager only' });
    const b = await readBody(req);
    const existing = await sb('GET', 'settings', { query: `user_id=eq.${session.businessId}` });
    if (existing && existing.length) await sb('PATCH', 'settings', { query: `user_id=eq.${session.businessId}`, body: b });
    else await sb('POST', 'settings', { body: { id: await getNextId(), user_id: session.businessId, ...b } });
    send(res, 200, b);
  },

  // ----- Summary -----
  'GET /api/summary': async (req, res, session) => {
    const [sales, expenses, dues, duePaid, products, salesReturns, exchanges] = await Promise.all([
      sb('GET', 'sales', { query: bizQuery(session) }), sb('GET', 'expenses', { query: bizQuery(session) }),
      sb('GET', 'dues', { query: bizQuery(session) }), sb('GET', 'due_paid', { query: bizQuery(session) }),
      sb('GET', 'products', { query: bizQuery(session) }), sb('GET', 'sales_returns', { query: bizQuery(session) }),
      sb('GET', 'exchanges', { query: bizQuery(session) })
    ]);
    const sum = (arr) => (arr || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalSales = sum(sales);
    const totalReturns = sum(salesReturns);
    const totalExchangeDiff = (exchanges || []).reduce((s, r) => s + Number(r.price_diff || 0), 0);
    const totalExpenses = sum(expenses);
    const cogs = (sales || []).reduce((s, r) => {
      if (r.cost_price != null && r.quantity) return s + Number(r.cost_price) * Number(r.quantity);
      if (r.product_id) { const p = (products || []).find(x => String(x.id) === String(r.product_id)); if (p && r.quantity) return s + Number(p.purchase_price || 0) * Number(r.quantity); }
      return s;
    }, 0);
    const netSales = totalSales - totalReturns + totalExchangeDiff;
    const grossDues = sum(dues);
    const totalDuePaidSum = sum(duePaid);
    const netOutstandingDues = Math.max(0, grossDues - totalDuePaidSum);
    send(res, 200, { totalSales: netSales, totalExpenses, totalCOGS: cogs, totalReturns, totalExchangeDiff, grossProfit: netSales - cogs, netProfit: netSales - cogs - totalExpenses, totalDues: netOutstandingDues, grossDues, totalDuePaid: totalDuePaidSum, productCount: (products || []).length, lowStockCount: (products || []).filter(p => p.quantity <= 5).length });
  }
};

function parseDynamic(method, pathname) {
  const segs = pathname.split('/').filter(Boolean);
  // /api/customers/:id/bills
  if (segs.length === 4 && segs[0] === 'api' && segs[1] === 'customers' && segs[3] === 'bills' && method === 'GET') {
    return { type: 'customer-bills', id: segs[2] };
  }
  // /api/purchases/:id/items
  if (segs.length === 4 && segs[0] === 'api' && segs[1] === 'purchases' && segs[3] === 'items' && method === 'GET') {
    return { type: 'purchase-items', id: segs[2] };
  }
  // /api/sales/bill/:billId  (all line items for one bill, any customer)
  if (segs.length === 4 && segs[0] === 'api' && segs[1] === 'sales' && segs[2] === 'bill' && method === 'GET') {
    return { type: 'sale-bill', id: segs[3] };
  }
  // /api/<resource>/:id  (PUT or DELETE) — "search" is reserved for GET search endpoints, never an id
  if (segs.length === 3 && segs[0] === 'api' && segs[2] !== 'search') {
    const resource = segs[1];
    const id = segs[2];
    const tableMap = { sales: 'sales', expenses: 'expenses', dues: 'dues', 'due-paid': 'due_paid', products: 'products', customers: 'customers', suppliers: 'suppliers', 'supplier-due-paid': 'supplier_due_paid', 'supplier-dues': 'supplier_dues', 'sales-returns': 'sales_returns', 'purchase-returns': 'purchase_returns', purchases: 'purchases', categories: 'categories', brands: 'brands', exchanges: 'exchanges', 'warranty-claims': 'warranty_claims', 'warranty-exchanges': 'warranty_exchanges', 'serial-numbers': 'serial_numbers' };
    const table = tableMap[resource];
    if (table && method === 'DELETE') return { type: 'delete', table, id };
    if (table && method === 'PUT') return { type: 'put', table, id };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  // Force HTTPS in production. Render sets x-forwarded-proto; no header means local dev → skip.
  const xfProto = req.headers['x-forwarded-proto'];
  if (xfProto && xfProto !== 'https') {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    return res.end();
  }
  // Security headers applied to every response (setHeader persists through writeHead).
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (xfProto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (req.method === 'OPTIONS') return send(res, 200, {});
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      if (pathname.startsWith('/api/auth/')) {
        const handled = await handleAuth(req.method, pathname, req, res);
        if (handled !== null) return;
      }

      const token = getToken(req);
      const session = await getSession(token);
      if (!session) return send(res, 401, { error: 'Not logged in' });

      if (pathname.startsWith('/api/admin/')) {
        const handled = await handleAdmin(req.method, pathname, req, res, session);
        if (handled !== null) return;
      }

      if (pathname.startsWith('/api/staff') || pathname.startsWith('/api/attendance')) {
        const handled = await handleStaff(req.method, pathname, req, res, session);
        if (handled !== null) return;
      }

      // Permission gate for non-managers (sales role)
      const isWrite = ['POST', 'PUT', 'DELETE'].includes(req.method);
      if (isWrite && !canEdit(session)) {
        const isDelete = req.method === 'DELETE';
        const isPut = req.method === 'PUT';
        const managerOnlyCreatePaths = ['/api/products', '/api/suppliers', '/api/purchases', '/api/purchase-returns', '/api/sales-returns', '/api/supplier-due-paid'];
        if (isDelete || isPut || managerOnlyCreatePaths.includes(pathname)) {
          return send(res, 403, { error: 'Only the manager can do this.' });
        }
      }

      const routeKey = `${req.method} ${pathname}`;
      if (routes[routeKey]) return await routes[routeKey](req, res, session, urlObj.searchParams);

      const dyn = parseDynamic(req.method, pathname);

      if (dyn) {
        if (dyn.type === 'customer-bills') {
          const sales = await sb('GET', 'sales', { query: `customer_id=eq.${dyn.id}&user_id=eq.${session.businessId}&order=id.desc` });
          const billsMap = new Map();
          for (const s of (sales || [])) {
            const k = s.bill_id || ('single-' + s.id);
            if (!billsMap.has(k)) billsMap.set(k, { bill_id: s.bill_id, bill_no: s.bill_no, date: s.date, items: [], total: 0 });
            const bill = billsMap.get(k);
            bill.items.push({ ...s, desc: s.description });
            bill.total += Number(s.amount);
          }
          return send(res, 200, Array.from(billsMap.values()));
        }
        if (dyn.type === 'purchase-items') {
          const items = await sb('GET', 'purchase_items', { query: `purchase_id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
          return send(res, 200, (items || []).map(i => ({ ...i, desc: i.description })));
        }
        if (dyn.type === 'sale-bill') {
          const sales = await sb('GET', 'sales', { query: `bill_id=eq.${dyn.id}&user_id=eq.${session.businessId}&order=id.asc` });
          if (!sales || !sales.length) return send(res, 404, { error: 'Bill not found' });
          const items = sales.map(s => ({ ...s, desc: s.description }));
          const total = items.reduce((s, r) => s + Number(r.amount), 0);
          const first = sales[0];
          let dueForBill = 0;
          const dues = await sb('GET', 'dues', { query: `bill_id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
          if (dues && dues.length) dueForBill = dues.reduce((s, d) => s + Number(d.amount), 0);
          return send(res, 200, {
            billNo: first.bill_no, date: first.date, total,
            amountPaid: total - dueForBill, dueAmount: dueForBill,
            items, customer: first.customer_name ? { name: first.customer_name, phone: first.customer_phone } : null
          });
        }
        if (dyn.type === 'put') {
          const b = await readBody(req);
          if (dyn.table === 'products') {
            await sb('PATCH', 'products', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { name: b.name, quantity: Number(b.quantity), purchase_price: Number(b.purchase_price), sell_price: Number(b.sell_price), unit: b.unit || 'pcs' } });
            return send(res, 200, { ok: true });
          }
          if (dyn.table === 'customers') {
            await sb('PATCH', 'customers', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { name: b.name, phone: b.phone, address: b.address } });
            return send(res, 200, { ok: true });
          }
          if (dyn.table === 'suppliers') {
            await sb('PATCH', 'suppliers', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { name: b.name, phone: b.phone, address: b.address } });
            return send(res, 200, { ok: true });
          }
          if (dyn.table === 'sales') {
            await sb('PATCH', 'sales', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { date: b.date, description: b.desc, amount: Number(b.amount), quantity: b.quantity != null ? Number(b.quantity) : null, unit_price: b.unit_price != null ? Number(b.unit_price) : null } });
            return send(res, 200, { ok: true });
          }
          if (dyn.table === 'expenses') {
            await sb('PATCH', 'expenses', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { date: b.date, description: b.desc, amount: Number(b.amount) } });
            return send(res, 200, { ok: true });
          }
          if (dyn.table === 'dues' || dyn.table === 'due_paid' || dyn.table === 'supplier_dues' || dyn.table === 'supplier_due_paid') {
            await sb('PATCH', dyn.table, { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}`, body: { date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '' } });
            return send(res, 200, { ok: true });
          }
          return send(res, 400, { error: 'Cannot edit this record type' });
        }
        if (dyn.type === 'delete') {
          await audit(session, 'DELETE', dyn.table, dyn.id);
          // ── SALES (bill cascade) ──
          if (dyn.table === 'sales') {
            const saleRow = await sb('GET', 'sales', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            const billId = saleRow && saleRow[0] ? saleRow[0].bill_id : null;
            if (billId) {
              const billRows = await sb('GET', 'sales', { query: `bill_id=eq.${billId}&user_id=eq.${session.businessId}` });
              for (const row of (billRows || [])) {
                if (row.product_id && row.quantity) {
                  const prods = await sb('GET', 'products', { query: `id=eq.${row.product_id}&user_id=eq.${session.businessId}` });
                  if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${row.product_id}`, body: { quantity: (prods[0].quantity || 0) + Number(row.quantity) } });
                }
              }
              await sb('DELETE', 'sales', { query: `bill_id=eq.${billId}&user_id=eq.${session.businessId}` });
              await sb('DELETE', 'dues', { query: `bill_id=eq.${billId}&user_id=eq.${session.businessId}` });
            } else {
              if (saleRow && saleRow[0] && saleRow[0].product_id) {
                const prods = await sb('GET', 'products', { query: `id=eq.${saleRow[0].product_id}&user_id=eq.${session.businessId}` });
                if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${saleRow[0].product_id}`, body: { quantity: (prods[0].quantity || 0) + Number(saleRow[0].quantity || 0) } });
              }
              await sb('DELETE', 'sales', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            }
            return send(res, 200, { ok: true });
          }

          // ── SALES RETURNS (undo the restock) ──
          if (dyn.table === 'sales_returns') {
            const ret = await sb('GET', 'sales_returns', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            if (ret && ret[0] && ret[0].product_id && ret[0].quantity) {
              const prod = await sb('GET', 'products', { query: `id=eq.${ret[0].product_id}&user_id=eq.${session.businessId}` });
              if (prod && prod[0]) await sb('PATCH', 'products', { query: `id=eq.${ret[0].product_id}`, body: { quantity: Math.max(0, (prod[0].quantity || 0) - Number(ret[0].quantity)) } });
            }
            await sb('DELETE', 'sales_returns', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            return send(res, 200, { ok: true });
          }

          // ── EXCHANGES (reverse the swap) ──
          if (dyn.table === 'exchanges') {
            const exc = await sb('GET', 'exchanges', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            if (exc && exc[0]) {
              const e = exc[0];
              // Reverse: new item comes back to stock, original item goes back out
              if (e.new_product_id && e.new_qty) {
                const np = await sb('GET', 'products', { query: `id=eq.${e.new_product_id}&user_id=eq.${session.businessId}` });
                if (np && np[0]) await sb('PATCH', 'products', { query: `id=eq.${e.new_product_id}`, body: { quantity: (np[0].quantity || 0) + Number(e.new_qty) } });
              }
              if (e.original_product_id && e.original_qty) {
                const op = await sb('GET', 'products', { query: `id=eq.${e.original_product_id}&user_id=eq.${session.businessId}` });
                if (op && op[0]) await sb('PATCH', 'products', { query: `id=eq.${e.original_product_id}`, body: { quantity: Math.max(0, (op[0].quantity || 0) - Number(e.original_qty)) } });
              }
            }
            await sb('DELETE', 'exchanges', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            return send(res, 200, { ok: true });
          }

          // ── PURCHASES (reduce stock, remove items) ──
          if (dyn.table === 'purchases') {
            const items = await sb('GET', 'purchase_items', { query: `purchase_id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            for (const it of (items || [])) {
              if (it.product_id && it.quantity) {
                const prod = await sb('GET', 'products', { query: `id=eq.${it.product_id}&user_id=eq.${session.businessId}` });
                if (prod && prod[0]) await sb('PATCH', 'products', { query: `id=eq.${it.product_id}`, body: { quantity: Math.max(0, (prod[0].quantity || 0) - Number(it.quantity)) } });
              }
            }
            await sb('DELETE', 'purchase_items', { query: `purchase_id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            await sb('DELETE', 'supplier_dues', { query: `purchase_id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            await sb('DELETE', 'purchases', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            return send(res, 200, { ok: true });
          }

          // ── PURCHASE RETURNS (restore stock) ──
          if (dyn.table === 'purchase_returns') {
            const pr = await sb('GET', 'purchase_returns', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            if (pr && pr[0] && pr[0].product_id && pr[0].quantity) {
              const prod = await sb('GET', 'products', { query: `id=eq.${pr[0].product_id}&user_id=eq.${session.businessId}` });
              if (prod && prod[0]) await sb('PATCH', 'products', { query: `id=eq.${pr[0].product_id}`, body: { quantity: Math.max(0, (prod[0].quantity || 0) - Number(pr[0].quantity)) } });
            }
            await sb('DELETE', 'purchase_returns', { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
            return send(res, 200, { ok: true });
          }

          // ── DEFAULT: simple delete ──
          await sb('DELETE', dyn.table, { query: `id=eq.${dyn.id}&user_id=eq.${session.businessId}` });
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'route not found' });
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  }
  serveStatic(req, res, pathname);
});

function localIPs() {
  const nets = os.networkInterfaces(); const out = [];
  for (const name of Object.keys(nets)) for (const net of nets[name]) if (net.family === 'IPv4' && !net.internal) out.push(net.address);
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n✅ Business Manager v5 (Full ERP) is running!\n');
  console.log(`   Local:   http://localhost:${PORT}`);
  localIPs().forEach(ip => console.log(`   Network: http://${ip}:${PORT}`));
  console.log('\n👑 Admin:', ADMIN_USERNAME, '\n');
});
