// ===== ランキング =====
// server.js で動かしているときは、そのサーバーに保存する「みんなのランキング」になります。
// サーバー無しで開いたとき（ファイルを直接開いた・GitHub Pages など）は、
// この端末（ブラウザ）の中だけに保存するランキングとして動きます。
// どちらになるかは自動で判定します（/api/health に返事があればサーバー）。
// game.js からは window.Ranking を通して使います。
(() => {
  'use strict';

  const MODES = ['easy', 'normal', 'hard'].flatMap(d => ['30', '60', 'endless'].map(t => `${d}-${t}`));
  const NAME_MAX = 12;
  const TOP_N = 10;
  const TIMEOUT_MS = 8000;
  const API = 'api';           // ページと同じ場所の /api を使う（相対パス）

  function cleanName(name) {
    return String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
  }
  function checkMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  }
  const int = v => Math.max(0, Math.floor(Number(v) || 0));

  async function request(url, opts = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeout || TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
      return body;
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- サーバーがあるかどうか（最初の1回だけ確かめる） ----------
  let detected = null;
  function detect() {
    if (!detected) {
      detected = /^https?:$/.test(location.protocol)
        ? request(`${API}/health`, { timeout: 3000 }).then(b => !!(b && b.ok), () => false)
        : Promise.resolve(false);
    }
    return detected;
  }

  // ---------- この端末だけのランキング ----------
  const LOCAL_KEY = 'gyoretsu-ranking-local';
  const LOCAL_KEEP = 100;
  const byScore = (a, b) => b.score - a.score || a.createdAt - b.createdAt;
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* 保存できない環境では無視 */ }
  }
  const local = {
    top(mode, n) {
      return (loadLocal()[mode] || []).slice().sort(byScore).slice(0, n);
    },
    submit(mode, row) {
      const data = loadLocal();
      const rows = (data[mode] || []).slice();
      const rank = rows.filter(r => r.score > row.score).length + 1;
      const saved = { ...row, id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
      rows.push(saved);
      data[mode] = rows.sort(byScore).slice(0, LOCAL_KEEP);
      saveLocal(data);
      return { id: saved.id, rank };
    },
  };

  // ---------- サーバーのランキング ----------
  const remote = {
    top(mode, n) {
      return request(`${API}/rankings/${mode}?limit=${n}`);
    },
    submit(mode, row) {
      return request(`${API}/rankings/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
    },
  };

  // ---------- game.js から使う窓口 ----------
  const Ranking = {
    enabled: true,
    online: false,      // サーバーが見つかったら true（判定が終わるまでは false）
    topN: TOP_N,
    NAME_MAX,
    cleanName,
    async top(mode, n = TOP_N) {
      checkMode(mode);
      Ranking.online = await detect();
      return Ranking.online ? remote.top(mode, n) : local.top(mode, n);
    },
    async submit(mode, entry) {
      checkMode(mode);
      const name = cleanName(entry.name);
      if (!name) throw new Error('empty name');
      const row = { name, score: int(entry.score), ok: int(entry.ok), people: int(entry.people), maxCombo: int(entry.maxCombo) };
      Ranking.online = await detect();
      return Ranking.online ? remote.submit(mode, row) : local.submit(mode, row);
    },
  };

  window.Ranking = Ranking;
  window.dispatchEvent(new Event('ranking-ready'));
})();
