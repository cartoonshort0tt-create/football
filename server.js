'use strict';

// Messi vs Ronaldo — local network game server.
// No dependencies: run with `node server.js`.
//   Game screen (PC / TikTok Live Studio):  http://localhost:3000
//   Phone control panel (same Wi-Fi):        http://<pc-ip>:3000/control

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'scores.json');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || config.port || 3000;

const TEAMS = ['messi', 'ronaldo'];
const MAX_COUNT = 100000;
const HISTORY_LIMIT = 200;
const RECENT = 8;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- State (persisted so a restart keeps the score) ----------

const state = { scores: { messi: 0, ronaldo: 0 }, history: [], nextId: 1 };

function load() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch {
    return; // first run
  }
  for (const t of TEAMS) state.scores[t] = Number(saved.scores && saved.scores[t]) || 0;
  if (Array.isArray(saved.history)) state.history = saved.history.slice(-HISTORY_LIMIT);
  const maxId = state.history.reduce((m, e) => Math.max(m, e.id || 0), 0);
  state.nextId = Math.max(Number(saved.nextId) || 1, maxId + 1);
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SAVE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save scores:', err.message);
  }
}

function snapshot() {
  return { scores: { ...state.scores }, recent: state.history.slice(-RECENT).reverse() };
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

// ---------- Live updates (Server-Sent Events) ----------

const clients = new Set();

function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
}

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 20000);

function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'state', ...snapshot() })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// ---------- Actions ----------

function spawn(body) {
  const team = body.team;
  if (!TEAMS.includes(team)) throw new HttpError(400, 'team must be "messi" or "ronaldo"');
  const count = Math.floor(Number(body.count));
  if (!Number.isFinite(count) || count < 1 || count > MAX_COUNT) {
    throw new HttpError(400, `count must be between 1 and ${MAX_COUNT}`);
  }
  const entry = {
    id: state.nextId++,
    team,
    count,
    gift: clean(body.gift, 40),
    sender: clean(body.sender, 30),
    time: Date.now(),
  };
  state.scores[team] += count;
  state.history.push(entry);
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  save();
  broadcast({ type: 'spawn', ...entry, ...snapshot() });
  return { ok: true, entry, ...snapshot() };
}

function undo() {
  const entry = state.history.pop();
  if (!entry) throw new HttpError(409, 'Nothing to undo');
  state.scores[entry.team] = Math.max(0, state.scores[entry.team] - entry.count);
  save();
  broadcast({ type: 'undo', id: entry.id, team: entry.team, count: entry.count, ...snapshot() });
  return { ok: true, undone: entry, ...snapshot() };
}

function reset() {
  state.scores = { messi: 0, ronaldo: 0 };
  state.history = [];
  save();
  broadcast({ type: 'reset', ...snapshot() });
  return { ok: true, ...snapshot() };
}

function publicConfig() {
  return {
    teams: config.teams,
    gifts: config.gifts,
    megaBallThreshold: config.megaBallThreshold,
    tip: config.tip,
  };
}

// ---------- HTTP ----------

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        reject(new HttpError(413, 'Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  const alias = { '/': '/index.html', '/control': '/control.html' };
  let rel;
  try {
    rel = decodeURIComponent(alias[pathname] || pathname);
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${pathname}`;
    if (route === 'GET /events') return openStream(req, res);
    if (route === 'GET /api/config') return json(res, 200, publicConfig());
    if (route === 'GET /api/state') return json(res, 200, snapshot());
    if (route === 'POST /api/spawn') return json(res, 200, spawn(await readJson(req)));
    if (route === 'POST /api/undo') return json(res, 200, undo());
    if (route === 'POST /api/reset') return json(res, 200, reset());
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(pathname, res);
    json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    json(res, status, { error: err.message });
  }
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other copy or change "port" in config.json.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

load();
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ⚽  Messi vs Ronaldo is running!');
  console.log('');
  console.log(`  Game screen (open on this PC):  http://localhost:${PORT}`);
  const ips = lanAddresses();
  if (ips.length) {
    console.log('  Phone control (same Wi-Fi):');
    for (const ip of ips) console.log(`      http://${ip}:${PORT}/control`);
  } else {
    console.log(`  Phone control: http://<this-pc-ip>:${PORT}/control`);
  }
  console.log('');
  console.log(`  Current score: ${config.teams.messi.name} ${state.scores.messi} - ${state.scores.ronaldo} ${config.teams.ronaldo.name}`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
