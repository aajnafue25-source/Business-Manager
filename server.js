/* Business Manager v3 — Multi-tenant + Admin approval
   Run with: node server.js
*/

const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eivuhxvrnckgvkwcidpj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'PASTE_YOUR_ANON_KEY_HERE';
const ADMIN_USERNAME = 'nafue';
const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

async function getNextBarcode(name) {
  const prefix = (name || 'PRD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const rows = await sb('GET', 'meta', { query: 'key=eq.barcodeSeq' });
  const current = parseInt(rows[0].value);
  await sb('PATCH', 'meta', { query: 'key=eq.barcodeSeq', body: { value: String(current + 1) } });
  return `${prefix}-${current + 1}`;
}

// ---------- Sessions ----------
const sessions = new Map();
function createSession(userId, username, isAdmin) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, username, isAdmin, created: Date.now() });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.created > 7 * 24 * 60 * 60 * 1000) { sessions.delete(token); return null; }
  return s;
}
function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}
function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + 'bizmgr-salt-2024').digest('hex');
}

// ---------- Helpers ----------
function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extraHeaders });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { resolve({}); } });
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

// ---------- Auth ----------
async function handleAuth(method, pathname, req, res) {
  if (method === 'POST' && pathname === '/api/auth/signup') {
    const b = await readBody(req);
    if (!b.username || !b.password) return send(res, 400, { error: 'Username and password required' });
    if (b.password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' });
    const existing = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (existing && existing.length > 0) return send(res, 400, { error: 'Username already taken' });
    const id = await getNextId();
    const isAdmin = b.username === ADMIN_USERNAME;
    const status = isAdmin ? 'approved' : 'pending';
    await sb('POST', 'users', { body: { id, username: b.username, password_hash: hashPassword(b.password), status, is_admin: isAdmin } });
    if (isAdmin) {
      const token = createSession(id, b.username, true);
      return send(res, 200, { ok: true, username: b.username, status: 'approved', isAdmin: true }, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; Max-Age=604800` });
    }
    return send(res, 200, { ok: true, status: 'pending' });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const b = await readBody(req);
    if (!b.username || !b.password) return send(res, 400, { error: 'Username and password required' });
    const users = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (!users || !users.length) return send(res, 401, { error: 'Invalid username or password' });
    const user = users[0];
    if (user.password_hash !== hashPassword(b.password)) return send(res, 401, { error: 'Invalid username or password' });
    if (user.status === 'pending') return send(res, 403, { error: 'pending', message: 'Your account is waiting for admin approval.' });
    if (user.status === 'rejected') return send(res, 403, { error: 'rejected', message: 'Your account was not approved. Contact the admin.' });
    const token = createSession(user.id, user.username, user.is_admin);
    return send(res, 200, { ok: true, username: user.username, isAdmin: user.is_admin }, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; Max-Age=604800` });
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = getToken(req);
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const token = getToken(req);
    const session = getSession(token);
    if (!session) return send(res, 401, { error: 'Not logged in' });
    return send(res, 200, { username: session.username, isAdmin: session.isAdmin, userId: session.userId });
  }
  return null;
}

// ---------- Admin routes ----------
async function handleAdmin(method, pathname, req, res, session) {
  if (!session.isAdmin) return send(res, 403, { error: 'Admin only' });

  if (method === 'GET' && pathname === '/api/admin/users') {
    const users = await sb('GET', 'users', { query: 'order=id.asc' });
    return send(res, 200, (users || []).map(u => ({ id: u.id, username: u.username, status: u.status, is_admin: u.is_admin })));
  }

  if (method === 'POST' && pathname === '/api/admin/approve') {
    const b = await readBody(req);
    await sb('PATCH', 'users', { query: `id=eq.${b.userId}`, body: { status: 'approved' } });
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/admin/reject') {
    const b = await readBody(req);
    await sb('PATCH', 'users', { query: `id=eq.${b.userId}`, body: { status: 'rejected' } });
    return send(res, 200, { ok: true });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/admin/users/')) {
    const userId = pathname.split('/').pop();
    await sb('DELETE', 'users', { query: `id=eq.${userId}` });
    return send(res, 200, { ok: true });
  }

  return null;
}

// ---------- Data routes (multi-tenant) ----------
function userQuery(session, extra = '') {
  return `user_id=eq.${session.userId}${extra ? '&' + extra : ''}`;
}

const routes = {
  'GET /api/sales': async (req, res, session) => {
    const rows = await sb('GET', 'sales', { query: userQuery(session, 'order=id.desc') });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/sales': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    const row = { id, user_id: session.userId, date: b.date, description: b.desc, amount: Number(b.amount), product_id: b.product_id || null, quantity: b.quantity || null, unit_price: b.unit_price != null ? Number(b.unit_price) : null, cost_price: b.cost_price != null ? Number(b.cost_price) : null, bill_id: b.bill_id || null, bill_no: b.bill_no || null, customer_id: b.customer_id || null };
    await sb('POST', 'sales', { body: row });
    if (b.product_id && b.quantity) {
      const prods = await sb('GET', 'products', { query: `id=eq.${b.product_id}&user_id=eq.${session.userId}` });
      if (prods && prods[0]) await sb('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - Number(b.quantity)) } });
    }
    send(res, 200, { id });
  },

  'POST /api/checkout': async (req, res, session) => {
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.date || !items.length) return send(res, 400, { error: 'date and items required' });
    const billId = await getNextId();
    const billNo = await getNextBillNo();
    let total = 0;
    const saleRows = [];
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const amount = Number(it.amount != null ? it.amount : unitPrice * qty);
      if (!it.desc || amount <= 0 || qty <= 0) continue;
      let costPrice = it.cost_price != null ? Number(it.cost_price) : null;
      if (it.product_id) {
        const prods = await sb('GET', 'products', { query: `id=eq.${it.product_id}&user_id=eq.${session.userId}` });
        if (prods && prods[0]) {
          if (costPrice == null) costPrice = Number(prods[0].purchase_price) || 0;
          await sb('PATCH', 'products', { query: `id=eq.${it.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - qty) } });
        }
      }
      const rowId = await getNextId();
      const row = { id: rowId, user_id: session.userId, date: b.date, description: it.desc, amount, product_id: it.product_id || null, quantity: qty, unit_price: unitPrice, cost_price: costPrice, bill_id: billId, bill_no: billNo, customer_id: b.customer_id || null };
      await sb('POST', 'sales', { body: row });
      saleRows.push({ ...row, desc: row.description });
      total += amount;
    }
    if (!saleRows.length) return send(res, 400, { error: 'no valid items' });
    const amountPaid = Math.min(Number(b.amountPaid) || 0, total);
    const dueAmount = Math.max(0, total - amountPaid);
    let customer = null;
    if (b.customer_id) {
      const custs = await sb('GET', 'customers', { query: `id=eq.${b.customer_id}&user_id=eq.${session.userId}` });
      if (custs && custs[0]) customer = custs[0];
    }
    if (dueAmount > 0) {
      const dueId = await getNextId();
      await sb('POST', 'dues', { body: { id: dueId, user_id: session.userId, date: b.date, party: customer ? customer.name : (b.customerName || 'Walk-in'), amount: dueAmount, note: `Bill #${billNo}`, customer_id: b.customer_id || null, bill_id: billId, bill_no: billNo } });
    }
    send(res, 200, { billId, billNo, total, amountPaid, dueAmount, items: saleRows, date: b.date, customer: customer || (b.customerName ? { name: b.customerName } : null) });
  },

  'GET /api/expenses': async (req, res, session) => {
    const rows = await sb('GET', 'expenses', { query: userQuery(session, 'order=id.desc') });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/expenses': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'expenses', { body: { id, user_id: session.userId, date: b.date, description: b.desc, amount: Number(b.amount) } });
    send(res, 200, { id });
  },

  'GET /api/dues': async (req, res, session) => {
    send(res, 200, await sb('GET', 'dues', { query: userQuery(session, 'order=id.desc') }) || []);
  },
  'POST /api/dues': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'dues', { body: { id, user_id: session.userId, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    send(res, 200, { id });
  },

  'GET /api/due-paid': async (req, res, session) => {
    send(res, 200, await sb('GET', 'due_paid', { query: userQuery(session, 'order=id.desc') }) || []);
  },
  'POST /api/due-paid': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'required' });
    const id = await getNextId();
    await sb('POST', 'due_paid', { body: { id, user_id: session.userId, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    send(res, 200, { id });
  },

  'GET /api/products': async (req, res, session) => {
    send(res, 200, await sb('GET', 'products', { query: userQuery(session, 'order=id.desc') }) || []);
  },
  'POST /api/products': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    const barcode = await getNextBarcode(b.name);
    await sb('POST', 'products', { body: { id, user_id: session.userId, name: b.name, barcode, quantity: Number(b.quantity) || 0, purchase_price: Number(b.purchase_price) || 0, sell_price: Number(b.sell_price) || 0 } });
    send(res, 200, { id, barcode });
  },

  'GET /api/customers': async (req, res, session) => {
    send(res, 200, await sb('GET', 'customers', { query: userQuery(session, 'order=id.desc') }) || []);
  },
  'POST /api/customers': async (req, res, session) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'customers', { body: { id, user_id: session.userId, name: b.name, phone: b.phone || '', address: b.address || '' } });
    send(res, 200, { id });
  },

  'GET /api/customers-summary': async (req, res, session) => {
    const [customers, sales, dues] = await Promise.all([
      sb('GET', 'customers', { query: userQuery(session) }),
      sb('GET', 'sales', { query: userQuery(session) }),
      sb('GET', 'dues', { query: userQuery(session) })
    ]);
    const list = (customers || []).map(c => {
      const theirSales = (sales || []).filter(s => String(s.customer_id) === String(c.id));
      const theirDues = (dues || []).filter(d => String(d.customer_id) === String(c.id));
      return { ...c, totalPurchased: theirSales.reduce((s, r) => s + Number(r.amount), 0), totalDue: theirDues.reduce((s, r) => s + Number(r.amount), 0), billCount: new Set(theirSales.map(s => s.bill_id)).size };
    });
    send(res, 200, list);
  },

  'GET /api/settings': async (req, res, session) => {
    const rows = await sb('GET', 'settings', { query: `user_id=eq.${session.userId}` });
    send(res, 200, rows && rows[0] ? rows[0] : {});
  },
  'PUT /api/settings': async (req, res, session) => {
    const b = await readBody(req);
    const existing = await sb('GET', 'settings', { query: `user_id=eq.${session.userId}` });
    if (existing && existing.length) await sb('PATCH', 'settings', { query: `user_id=eq.${session.userId}`, body: b });
    else await sb('POST', 'settings', { body: { id: await getNextId(), user_id: session.userId, ...b } });
    send(res, 200, b);
  },

  'GET /api/summary': async (req, res, session) => {
    const [sales, expenses, dues, duePaid, products] = await Promise.all([
      sb('GET', 'sales', { query: userQuery(session) }), sb('GET', 'expenses', { query: userQuery(session) }),
      sb('GET', 'dues', { query: userQuery(session) }), sb('GET', 'due_paid', { query: userQuery(session) }),
      sb('GET', 'products', { query: userQuery(session) })
    ]);
    const sum = (arr) => (arr || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalSales = sum(sales);
    const totalExpenses = sum(expenses);
    const cogs = (sales || []).reduce((s, r) => {
      if (r.cost_price != null && r.quantity) return s + Number(r.cost_price) * Number(r.quantity);
      if (r.product_id) { const p = (products || []).find(x => String(x.id) === String(r.product_id)); if (p && r.quantity) return s + Number(p.purchase_price || 0) * Number(r.quantity); }
      return s;
    }, 0);
    send(res, 200, { totalSales, totalExpenses, totalCOGS: cogs, grossProfit: totalSales - cogs, netProfit: totalSales - cogs - totalExpenses, totalDues: sum(dues), totalDuePaid: sum(duePaid), productCount: (products || []).length, lowStockCount: (products || []).filter(p => p.quantity <= 5).length });
  }
};

function matchDynamic(method, pathname, session) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 3 && segs[0] === 'api') {
    const [, resource, id] = segs;
    const tableMap = { sales: 'sales', expenses: 'expenses', dues: 'dues', 'due-paid': 'due_paid', products: 'products', customers: 'customers' };
    const table = tableMap[resource];
    if (table && method === 'DELETE') return { type: 'delete', table, id };
    if ((table === 'products' || table === 'customers') && method === 'PUT') return { type: 'put', table, id };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
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
      const session = getSession(token);
      if (!session) return send(res, 401, { error: 'Not logged in' });

      if (pathname.startsWith('/api/admin/')) {
        const handled = await handleAdmin(req.method, pathname, req, res, session);
        if (handled !== null) return;
      }

      const key = `${req.method} ${pathname}`;
      if (routes[key]) return await routes[key](req, res, session);

      const dyn = matchDynamic(req.method, pathname, session);
      if (dyn) {
        if (dyn.type === 'put' && dyn.table === 'products') {
          const b = await readBody(req);
          await sb('PATCH', 'products', { query: `id=eq.${dyn.id}&user_id=eq.${session.userId}`, body: { name: b.name, quantity: Number(b.quantity), purchase_price: Number(b.purchase_price), sell_price: Number(b.sell_price) } });
          return send(res, 200, { ok: true });
        }
        if (dyn.type === 'put' && dyn.table === 'customers') {
          const b = await readBody(req);
          await sb('PATCH', 'customers', { query: `id=eq.${dyn.id}&user_id=eq.${session.userId}`, body: { name: b.name, phone: b.phone, address: b.address } });
          return send(res, 200, { ok: true });
        }
        if (dyn.type === 'delete') {
          await sb('DELETE', dyn.table, { query: `id=eq.${dyn.id}&user_id=eq.${session.userId}` });
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'route not found' });
    } catch (err) {
      console.error(err);
      return send(res, 500, { error: err.message });
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
  console.log('\n✅ Business Manager v3 (Multi-tenant) is running!\n');
  console.log(`   Local:   http://localhost:${PORT}`);
  localIPs().forEach(ip => console.log(`   Network: http://${ip}:${PORT}`));
  console.log('\n👑 Admin:', ADMIN_USERNAME, '\n');
});
