// ===== 行列作成：自分で動かすサーバー =====
// ゲームのファイル配信とランキングAPIを、Node.js の標準機能だけで動かします（npm install 不要）。
//
//   起動:  node server.js        （または start.bat をダブルクリック）
//   開く:  http://localhost:3000
//
// ランキングは data/rankings.json に保存されます。
// ポート番号は環境変数 PORT で変えられます（例: set PORT=8080 && node server.js）。

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rankings.json');

const MODES = ['easy', 'normal', 'hard'].flatMap(d => ['30', '60', 'endless'].map(t => `${d}-${t}`));
const NAME_MAX = 12;
const KEEP_PER_MODE = 1000;      // モードごとに保存しておく件数
const TOP_MAX = 50;              // 一度に返す最大件数
const BODY_MAX = 2048;           // 受け付けるリクエストの大きさ（バイト）
const POST_INTERVAL_MS = 5000;   // 同じ人の連続登録の間隔
const POST_PER_HOUR = 60;        // 同じ人が1時間に登録できる回数

// ---------- 配信するファイル ----------
// 公開フォルダ内の、この拡張子のファイルだけを配信する（server.js・data・隠しファイルは配信しない）
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const DENY = new Set(['server.js']);

function serveStatic(req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return send(res, 400, 'Bad Request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const relFromRoot = path.relative(ROOT, file);
  const parts = relFromRoot.split(path.sep);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)
      || parts.some(p => p.startsWith('.')) || parts[0] === 'data' || parts[0] === 'node_modules'
      || DENY.has(relFromRoot)) {
    return send(res, 404, 'Not Found');
  }
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'Not Found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not Found');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// ---------- ランキングの保存 ----------
let db = {};
function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // 壊れていたら退避して新しく始める
      const bak = `${DATA_FILE}.broken-${Date.now()}`;
      try { fs.renameSync(DATA_FILE, bak); } catch { /* ignore */ }
      console.warn(`rankings.json を読めなかったので ${path.basename(bak)} に退避しました`);
    }
    db = {};
  }
}
function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);   // 書き込み途中で止まっても壊れないように、書き終えてから置き換える
}
const byScore = (a, b) => b.score - a.score || a.createdAt - b.createdAt;

function cleanName(v) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, NAME_MAX);
}
function intIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

// ---------- 連続投稿の制限 ----------
const posts = new Map();   // ip -> 投稿時刻の配列
function clientIp(req) {
  const remote = req.socket.remoteAddress || '';
  // Cloudflare Tunnel など、同じPCの中継から来た場合は元のIPを使う
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
    // X-Forwarded-For は送る側で書き換えられるので使わない（Cloudflare が付ける CF-Connecting-IP だけ信用する）
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf;
  }
  return remote;
}
function rateLimited(ip) {
  const now = Date.now();
  const list = (posts.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length && now - list[list.length - 1] < POST_INTERVAL_MS) return true;
  if (list.length >= POST_PER_HOUR) return true;
  list.push(now);
  posts.set(ip, list);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of posts) if (!list.some(t => now - t < 3600e3)) posts.delete(ip);
}, 600e3).unref();

// ---------- API ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_MAX) { reject(Object.assign(new Error('too large'), { status: 413 })); req.removeAllListeners('data'); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') return send(res, 200, { ok: true });

  const m = url.pathname.match(/^\/api\/rankings\/([a-z0-9-]+)$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const mode = m[1];
  if (!MODES.includes(mode)) return send(res, 400, { error: 'unknown mode' });

  if (req.method === 'GET') {
    const n = Math.min(TOP_MAX, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
    const rows = (db[mode] || []).slice(0, n)
      .map(({ id, name, score, ok, people, maxCombo, createdAt }) => ({ id, name, score, ok, people, maxCombo, createdAt }));
    return send(res, 200, rows);
  }

  if (req.method === 'POST') {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return send(res, 415, { error: 'json only' });
    }
    let data;
    try { data = JSON.parse(await readBody(req)); } catch (e) {
      return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'bad body' }, e.status === 413 ? { Connection: 'close' } : {});
    }
    const name = cleanName(data && data.name);
    if (!name) return send(res, 400, { error: 'name required' });
    if (!intIn(data.score, 1, 10000000) || !intIn(data.ok, 0, 10000)
        || !intIn(data.people, 0, 1000000) || !intIn(data.maxCombo, 0, 10000)) {
      return send(res, 400, { error: 'bad numbers' });
    }
    if (rateLimited(clientIp(req))) return send(res, 429, { error: 'too many requests' });
    const row = {
      id: crypto.randomUUID(), name, score: data.score,
      ok: data.ok, people: data.people, maxCombo: data.maxCombo, createdAt: Date.now(),
    };
    const rows = db[mode] || (db[mode] = []);
    const rank = rows.filter(r => r.score > row.score).length + 1;
    rows.push(row);
    rows.sort(byScore);
    if (rows.length > KEEP_PER_MODE) rows.length = KEEP_PER_MODE;
    try { saveDb(); } catch (e) {
      console.error('保存に失敗しました', e);
      return send(res, 500, { error: 'save failed' });
    }
    console.log(`[登録] ${mode} ${rank}位 ${name} ${row.score}点`);
    return send(res, 201, { id: row.id, rank });
  }

  return send(res, 405, { error: 'method not allowed' }, { Allow: 'GET, POST' });
}

// ---------- 起動 ----------
loadDb();
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad Request'); }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(e => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  serveStatic(req, res, url.pathname);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`ポート ${PORT} は使用中です。別のポートで起動してください（例: set PORT=3001）`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  const os = require('os');
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
  console.log('行列作成サーバーを起動しました（止めるときは Ctrl + C）');
  console.log(`  このPCから:        http://localhost:${PORT}`);
  for (const u of lan) console.log(`  同じネットワークから: ${u}`);
});
