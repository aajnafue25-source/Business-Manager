/* Business Manager v2 — Cloud version with Supabase + Login
   Run with: node server.js
*/

const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

// ============================================================
// PASTE YOUR SUPABASE DETAILS HERE
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eivuhxvrnckgvkwcidpj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnVoeHZybmNrZ3Zrd2NpZHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTE1MjcsImV4cCI6MjA5NzI2NzUyN30.EX4AD5xcM7_I7MEZl5xUzdbM1Lk4p2VTs-3Aus3Tr0M';
// ============================================================

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

// ---------- Session store (in-memory) ----------
const sessions = new Map();
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, created: Date.now() });
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
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      try { resolve(chunks ? JSON.parse(chunks) : {}); }
      catch (e) { resolve({}); }
    });
  });
}

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- Auth routes ----------
async function handleAuth(method, pathname, req, res) {
  if (method === 'POST' && pathname === '/api/auth/signup') {
    const b = await readBody(req);
    if (!b.username || !b.password) return send(res, 400, { error: 'Username and password required' });
    if (b.password.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' });
    const existing = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (existing && existing.length > 0) return send(res, 400, { error: 'Username already taken' });
    const id = await getNextId();
    await sb('POST', 'users', { body: { id, username: b.username, password_hash: hashPassword(b.password) } });
    const token = createSession(id);
    return send(res, 200, { ok: true, username: b.username }, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; Max-Age=604800` });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const b = await readBody(req);
    if (!b.username || !b.password) return send(res, 400, { error: 'Username and password required' });
    const users = await sb('GET', 'users', { query: `username=eq.${encodeURIComponent(b.username)}` });
    if (!users || !users.length) return send(res, 401, { error: 'Invalid username or password' });
    const user = users[0];
    if (user.password_hash !== hashPassword(b.password)) return send(res, 401, { error: 'Invalid username or password' });
    const token = createSession(user.id);
    return send(res, 200, { ok: true, username: user.username }, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; Max-Age=604800` });
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
    const users = await sb('GET', 'users', { query: `id=eq.${session.userId}` });
    if (!users || !users.length) return send(res, 401, { error: 'User not found' });
    return send(res, 200, { username: users[0].username });
  }

  return null;
}

// ---------- API routes ----------
const routes = {
  'GET /api/sales': async (req, res) => {
    const rows = await sb('GET', 'sales', { query: 'order=id.desc' });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/sales': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    const row = {
      id, date: b.date, description: b.desc, amount: Number(b.amount),
      product_id: b.product_id || null, quantity: b.quantity || null,
      unit_price: b.unit_price != null ? Number(b.unit_price) : null,
      cost_price: b.cost_price != null ? Number(b.cost_price) : null,
      bill_id: b.bill_id || null, bill_no: b.bill_no || null, customer_id: b.customer_id || null
    };
    await sb('POST', 'sales', { body: row });
    if (b.product_id && b.quantity) {
      const prods = await sb('GET', 'products', { query: `id=eq.${b.product_id}` });
      if (prods && prods[0]) {
        const newQty = Math.max(0, (prods[0].quantity || 0) - Number(b.quantity));
        await sb('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: newQty } });
      }
    }
    send(res, 200, { id });
  },

  'POST /api/checkout': async (req, res) => {
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.date || !items.length) return send(res, 400, { error: 'date and at least one item required' });
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
        const prods = await sb('GET', 'products', { query: `id=eq.${it.product_id}` });
        if (prods && prods[0]) {
          if (costPrice == null) costPrice = Number(prods[0].purchase_price) || 0;
          await sb('PATCH', 'products', { query: `id=eq.${it.product_id}`, body: { quantity: Math.max(0, (prods[0].quantity || 0) - qty) } });
        }
      }
      const rowId = await getNextId();
      const row = { id: rowId, date: b.date, description: it.desc, amount, product_id: it.product_id || null, quantity: qty, unit_price: unitPrice, cost_price: costPrice, bill_id: billId, bill_no: billNo, customer_id: b.customer_id || null };
      await sb('POST', 'sales', { body: row });
      saleRows.push({ ...row, desc: row.description });
      total += amount;
    }
    if (!saleRows.length) return send(res, 400, { error: 'no valid items' });
    const amountPaid = Math.min(Number(b.amountPaid) || 0, total);
    const dueAmount = Math.max(0, total - amountPaid);
    let customer = null;
    if (b.customer_id) {
      const custs = await sb('GET', 'customers', { query: `id=eq.${b.customer_id}` });
      if (custs && custs[0]) customer = custs[0];
    }
    if (dueAmount > 0) {
      const dueId = await getNextId();
      await sb('POST', 'dues', { body: { id: dueId, date: b.date, party: customer ? customer.name : (b.customerName || 'Walk-in customer'), amount: dueAmount, note: `Bill #${billNo}`, customer_id: b.customer_id || null, bill_id: billId, bill_no: billNo } });
    }
    send(res, 200, { billId, billNo, total, amountPaid, dueAmount, items: saleRows, date: b.date, customer: customer || (b.customerName ? { name: b.customerName } : null) });
  },

  'GET /api/expenses': async (req, res) => {
    const rows = await sb('GET', 'expenses', { query: 'order=id.desc' });
    send(res, 200, (rows || []).map(r => ({ ...r, desc: r.description })));
  },
  'POST /api/expenses': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    await sb('POST', 'expenses', { body: { id, date: b.date, description: b.desc, amount: Number(b.amount) } });
    send(res, 200, { id });
  },

  'GET /api/dues': async (req, res) => {
    const rows = await sb('GET', 'dues', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/dues': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'date, party, amount required' });
    const id = await getNextId();
    await sb('POST', 'dues', { body: { id, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    send(res, 200, { id });
  },

  'GET /api/due-paid': async (req, res) => {
    const rows = await sb('GET', 'due_paid', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/due-paid': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'date, party, amount required' });
    const id = await getNextId();
    await sb('POST', 'due_paid', { body: { id, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '', customer_id: b.customer_id || null } });
    // Reduce dues
    const paidAmount = Number(b.amount);
    const dues = await sb('GET', 'dues', { query: b.customer_id ? `customer_id=eq.${b.customer_id}&order=id.asc` : `party=eq.${encodeURIComponent(b.party)}&order=id.asc` });
    let remaining = paidAmount;
    for (const d of (dues || [])) {
      if (remaining <= 0) break;
      if (d.amount <= remaining) { remaining -= d.amount; await sb('DELETE', 'dues', { query: `id=eq.${d.id}` }); }
      else { await sb('PATCH', 'dues', { query: `id=eq.${d.id}`, body: { amount: d.amount - remaining } }); remaining = 0; }
    }
    send(res, 200, { id });
  },

  'GET /api/products': async (req, res) => {
    const rows = await sb('GET', 'products', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/products': async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    const barcode = await getNextBarcode(b.name);
    await sb('POST', 'products', { body: { id, name: b.name, barcode, quantity: Number(b.quantity) || 0, purchase_price: Number(b.purchase_price) || 0, sell_price: Number(b.sell_price) || 0 } });
    send(res, 200, { id, barcode });
  },

  'GET /api/customers': async (req, res) => {
    const rows = await sb('GET', 'customers', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/customers': async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    await sb('POST', 'customers', { body: { id, name: b.name, phone: b.phone || '', address: b.address || '' } });
    send(res, 200, { id });
  },

  'GET /api/customers-summary': async (req, res) => {
    const [customers, sales, dues] = await Promise.all([
      sb('GET', 'customers', { query: 'order=id.desc' }),
      sb('GET', 'sales'),
      sb('GET', 'dues')
    ]);
    const list = (customers || []).map(c => {
      const theirSales = (sales || []).filter(s => String(s.customer_id) === String(c.id));
      const totalPurchased = theirSales.reduce((s, r) => s + Number(r.amount), 0);
      const theirDues = (dues || []).filter(d => String(d.customer_id) === String(c.id));
      const totalDue = theirDues.reduce((s, r) => s + Number(r.amount), 0);
      return { ...c, totalPurchased, totalDue, billCount: new Set(theirSales.map(s => s.bill_id)).size };
    });
    send(res, 200, list);
  },

  'GET /api/settings': async (req, res) => {
    const rows = await sb('GET', 'settings', { query: 'id=eq.1' });
    send(res, 200, rows && rows[0] ? rows[0] : {});
  },
  'PUT /api/settings': async (req, res) => {
    const b = await readBody(req);
    const existing = await sb('GET', 'settings', { query: 'id=eq.1' });
    if (existing && existing.length) await sb('PATCH', 'settings', { query: 'id=eq.1', body: b });
    else await sb('POST', 'settings', { body: { id: 1, ...b } });
    send(res, 200, b);
  },

  'GET /api/summary': async (req, res) => {
    const [sales, expenses, dues, duePaid, products] = await Promise.all([
      sb('GET', 'sales'), sb('GET', 'expenses'), sb('GET', 'dues'), sb('GET', 'due_paid'), sb('GET', 'products')
    ]);
    const sum = (arr) => (arr || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalSales = sum(sales);
    const totalExpenses = sum(expenses);
    const cogs = (sales || []).reduce((s, r) => {
      if (r.cost_price != null && r.quantity) return s + Number(r.cost_price) * Number(r.quantity);
      if (r.product_id) {
        const p = (products || []).find(x => String(x.id) === String(r.product_id));
        if (p && r.quantity) return s + Number(p.purchase_price || 0) * Number(r.quantity);
      }
      return s;
    }, 0);
    send(res, 200, {
      totalSales, totalExpenses, totalCOGS: cogs,
      grossProfit: totalSales - cogs, netProfit: totalSales - cogs - totalExpenses,
      totalDues: sum(dues), totalDuePaid: sum(duePaid),
      productCount: (products || []).length,
      lowStockCount: (products || []).filter(p => p.quantity <= 5).length
    });
  }
};

function matchDynamic(method, pathname) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 3 && segs[0] === 'api') {
    const [, resource, id] = segs;
    const tableMap = { sales: 'sales', expenses: 'expenses', dues: 'dues', 'due-paid': 'due_paid', products: 'products', customers: 'customers' };
    const table = tableMap[resource];
    if (table && method === 'DELETE') return { type: 'delete', table, id };
    if ((table === 'products' || table === 'customers') && method === 'PUT') return { type: 'put', table, id };
  }
  if (segs.length === 4 && segs[0] === 'api' && segs[1] === 'customers' && segs[3] === 'bills' && method === 'GET') {
    return { type: 'customer-bills', id: segs[2] };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      // Auth routes don't need session check
      if (pathname.startsWith('/api/auth/')) {
        const handled = await handleAuth(req.method, pathname, req, res);
        if (handled !== null) return;
      }

      // All other API routes require login
      const token = getToken(req);
      const session = getSession(token);
      if (!session) return send(res, 401, { error: 'Not logged in' });

      const key = `${req.method} ${pathname}`;
      if (routes[key]) return await routes[key](req, res);

      const dyn = matchDynamic(req.method, pathname);
      if (dyn) {
        if (dyn.type === 'put' && dyn.table === 'products') {
          const b = await readBody(req);
          await sb('PATCH', 'products', { query: `id=eq.${dyn.id}`, body: { name: b.name, quantity: Number(b.quantity), purchase_price: Number(b.purchase_price), sell_price: Number(b.sell_price) } });
          return send(res, 200, { ok: true });
        }
        if (dyn.type === 'put' && dyn.table === 'customers') {
          const b = await readBody(req);
          await sb('PATCH', 'customers', { query: `id=eq.${dyn.id}`, body: { name: b.name, phone: b.phone, address: b.address } });
          return send(res, 200, { ok: true });
        }
        if (dyn.type === 'customer-bills') {
          const sales = await sb('GET', 'sales', { query: `customer_id=eq.${dyn.id}&order=id.desc` });
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
        if (dyn.type === 'delete') {
          await sb('DELETE', dyn.table, { query: `id=eq.${dyn.id}` });
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
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n✅ Business Manager (Cloud) is running!\n');
  console.log(`   Local:   http://localhost:${PORT}`);
  localIPs().forEach(ip => console.log(`   Network: http://${ip}:${PORT}`));
  console.log('\n📡 Data stored in Supabase cloud\n');
});
