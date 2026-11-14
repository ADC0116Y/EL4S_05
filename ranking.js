// ===== ランキング =====
// ranking_config.js に Firebase の設定があれば、全員で共有するオンラインランキング（Cloud Firestore）。
// 設定が空なら、この端末（ブラウザ）の中だけに保存するランキングとして動きます。
// オンラインのデータの置き場所: rankings/{モード}/scores/{自動ID}
//   モード = 難易度-時間（例: normal-60）。難易度×時間の組み合わせごとに別のランキングになります。
// game.js からは window.Ranking を通して使います。
// ※ ファイルを直接開いた場合（file://）でも動くように、普通の script として読み込みます。
(() => {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
  const MODES = ['easy', 'normal', 'hard'].flatMap(d => ['30', '60', 'endless'].map(t => `${d}-${t}`));
  const NAME_MAX = 12;
  const TIMEOUT_MS = 8000;

  const cfg = window.RANKING_CONFIG || {};
  const fb = cfg.firebase || {};
  const online = !!(fb.apiKey && fb.projectId);
  const topN = Number.isInteger(cfg.topN) && cfg.topN > 0 ? Math.min(cfg.topN, 50) : 10;

  let ready = null;
  function connect() {
    if (!ready) {
      ready = (async () => {
        const [{ initializeApp }, fs] = await Promise.all([
          import(`${SDK}/firebase-app.js`),
          import(`${SDK}/firebase-firestore.js`),
        ]);
        return { fs, db: fs.getFirestore(initializeApp(fb)) };
      })();
      ready.catch(() => { ready = null; });   // 失敗したら次回やり直す
    }
    return ready;
  }

  function withTimeout(p) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);
  }

  function checkMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  }

  function cleanName(name) {
    return String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
  }

  // ---------- この端末だけのランキング（Firebase 未設定のとき） ----------
  const LOCAL_KEY = 'gyoretsu-ranking-local';
  const LOCAL_KEEP = 100;
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* 保存できない環境では無視 */ }
  }
  const byScore = (a, b) => b.score - a.score || a.createdAt - b.createdAt;

  // 上位 n 件を取得
  async function top(mode, n = topN) {
    checkMode(mode);
    if (!online) return (loadLocal()[mode] || []).slice().sort(byScore).slice(0, n);
    return withTimeout((async () => {
      const { fs, db } = await connect();
      const q = fs.query(fs.collection(db, 'rankings', mode, 'scores'), fs.orderBy('score', 'desc'), fs.limit(n));
      const snap = await fs.getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    })());
  }

  // スコアを登録して、ID と順位（自分より高い人数 + 1）を返す
  async function submit(mode, entry) {
    checkMode(mode);
    const name = cleanName(entry.name);
    if (!name) throw new Error('empty name');
    const int = v => Math.max(0, Math.floor(Number(v) || 0));
    if (!online) {
      const data = loadLocal();
      const rows = (data[mode] || []).slice();
      const score = int(entry.score);
      const row = {
        id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name, score, ok: int(entry.ok), people: int(entry.people), maxCombo: int(entry.maxCombo),
        createdAt: Date.now(),
      };
      const rank = rows.filter(r => r.score > score).length + 1;
      rows.push(row);
      data[mode] = rows.sort(byScore).slice(0, LOCAL_KEEP);
      saveLocal(data);
      return { id: row.id, rank };
    }
    return withTimeout((async () => {
      const { fs, db } = await connect();
      const col = fs.collection(db, 'rankings', mode, 'scores');
      const score = int(entry.score);
      const ref = await fs.addDoc(col, {
        name, score,
        ok: int(entry.ok), people: int(entry.people), maxCombo: int(entry.maxCombo),
        createdAt: fs.serverTimestamp(),
      });
      let rank = null;
      try {
        const agg = await fs.getCountFromServer(fs.query(col, fs.where('score', '>', score)));
        rank = agg.data().count + 1;
      } catch { /* 順位が取れなくても登録は成功 */ }
      return { id: ref.id, rank };
    })());
  }

  window.Ranking = { enabled: true, online, topN, top, submit, cleanName, NAME_MAX };
  window.dispatchEvent(new Event('ranking-ready'));
})();
