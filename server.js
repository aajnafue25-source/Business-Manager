/* Business Manager — Cloud version using Supabase
   Run with: node server.js
   Requires: npm install @supabase/supabase-js node-fetch
*/

const http = require('http');
const path = require('path');
const os = require('os');

// ============================================================
// PASTE YOUR SUPABASE DETAILS HERE (from Project Settings > API)
// ============================================================
const SUPABASE_URL = 'https://eivuhxvrnckgvkwcidpj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnVoeHZybmNrZ3Zrd2NpZHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTE1MjcsImV4cCI6MjA5NzI2NzUyN30.EX4AD5xcM7_I7MEZl5xUzdbM1Lk4p2VTs-3Aus3Tr0M';
// ============================================================

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const fs = require('fs');

// ---------- Supabase REST helper (no SDK needed) ----------
async function sbFetch(method, table, opts = {}) {
  const { query = '', body, returning } = opts;
  let url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': returning ? 'return=representation' : 'return=minimal'
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getNextId() {
  const rows = await sbFetch('GET', 'meta', { query: 'key=eq.nextId' });
  const current = parseInt(rows[0].value);
  await sbFetch('PATCH', 'meta', { query: 'key=eq.nextId', body: { value: String(current + 1) } });
  return current;
}

async function getNextBarcode(name) {
  const prefix = (name || 'PRD').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const rows = await sbFetch('GET', 'meta', { query: 'key=eq.barcodeSeq' });
  const current = parseInt(rows[0].value);
  const next = current + 1;
  await sbFetch('PATCH', 'meta', { query: 'key=eq.barcodeSeq', body: { value: String(next) } });
  return `${prefix}-${next}`;
}

// ---------- Helpers ----------
function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
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

// ---------- Route handlers ----------
const routes = {
  'GET /api/sales': async (req, res) => {
    const rows = await sbFetch('GET', 'sales', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/sales': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    const row = {
      id, date: b.date, desc: b.desc, amount: Number(b.amount),
      product_id: b.product_id || null, quantity: b.quantity || null,
      unit_price: b.unit_price != null ? Number(b.unit_price) : null,
      cost_price: b.cost_price != null ? Number(b.cost_price) : null
    };
    await sbFetch('POST', 'sales', { body: row });
    if (b.product_id && b.quantity) {
      const prods = await sbFetch('GET', 'products', { query: `id=eq.${b.product_id}` });
      if (prods && prods[0]) {
        const newQty = Math.max(0, (prods[0].quantity || 0) - Number(b.quantity));
        await sbFetch('PATCH', 'products', { query: `id=eq.${b.product_id}`, body: { quantity: newQty } });
      }
    }
    send(res, 200, { id });
  },

  'GET /api/expenses': async (req, res) => {
    const rows = await sbFetch('GET', 'expenses', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/expenses': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.desc || !b.amount) return send(res, 400, { error: 'date, desc, amount required' });
    const id = await getNextId();
    await sbFetch('POST', 'expenses', { body: { id, date: b.date, desc: b.desc, amount: Number(b.amount) } });
    send(res, 200, { id });
  },

  'GET /api/dues': async (req, res) => {
    const rows = await sbFetch('GET', 'dues', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/dues': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'date, party, amount required' });
    const id = await getNextId();
    await sbFetch('POST', 'dues', { body: { id, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '' } });
    send(res, 200, { id });
  },

  'GET /api/due-paid': async (req, res) => {
    const rows = await sbFetch('GET', 'due_paid', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/due-paid': async (req, res) => {
    const b = await readBody(req);
    if (!b.date || !b.party || !b.amount) return send(res, 400, { error: 'date, party, amount required' });
    const id = await getNextId();
    await sbFetch('POST', 'due_paid', { body: { id, date: b.date, party: b.party, amount: Number(b.amount), note: b.note || '' } });
    send(res, 200, { id });
  },

  'GET /api/products': async (req, res) => {
    const rows = await sbFetch('GET', 'products', { query: 'order=id.desc' });
    send(res, 200, rows || []);
  },
  'POST /api/products': async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return send(res, 400, { error: 'name required' });
    const id = await getNextId();
    const barcode = await getNextBarcode(b.name);
    await sbFetch('POST', 'products', { body: { id, name: b.name, barcode, quantity: Number(b.quantity) || 0, purchase_price: Number(b.purchase_price) || 0, sell_price: Number(b.sell_price) || 0 } });
    send(res, 200, { id, barcode });
  },

  'GET /api/summary': async (req, res) => {
    const [sales, expenses, dues, duePaid, products] = await Promise.all([
      sbFetch('GET', 'sales'),
      sbFetch('GET', 'expenses'),
      sbFetch('GET', 'dues'),
      sbFetch('GET', 'due_paid'),
      sbFetch('GET', 'products')
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
    const grossProfit = totalSales - cogs;
    const netProfit = grossProfit - totalExpenses;
    send(res, 200, {
      totalSales, totalExpenses, totalCOGS: cogs, grossProfit, netProfit,
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
    const table = { sales: 'sales', expenses: 'expenses', dues: 'dues', 'due-paid': 'due_paid', products: 'products' }[resource];
    if (table && method === 'DELETE') return { table, id };
    if (table === 'products' && method === 'PUT') return { table, id, isPut: true };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const key = `${req.method} ${pathname}`;

  if (pathname.startsWith('/api/')) {
    try {
      if (routes[key]) return await routes[key](req, res);
      const dyn = matchDynamic(req.method, pathname);
      if (dyn) {
        if (dyn.isPut) {
          const b = await readBody(req);
          await sbFetch('PATCH', dyn.table, {
            query: `id=eq.${dyn.id}`,
            body: {
              name: b.name, quantity: Number(b.quantity),
              purchase_price: Number(b.purchase_price), sell_price: Number(b.sell_price)
            }
          });
          return send(res, 200, { ok: true });
        }
        await sbFetch('DELETE', dyn.table, { query: `id=eq.${dyn.id}` });
        return send(res, 200, { ok: true, deleted: true });
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
  console.log(`   Local:              http://localhost:${PORT}`);
  localIPs().forEach(ip => console.log(`   Network:            http://${ip}:${PORT}`));
  console.log('\n📡 Data is now stored in Supabase cloud — accessible from anywhere!\n');
});
