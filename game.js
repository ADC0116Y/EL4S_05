(() => {
'use strict';

// ============================================================
//  基本設定
// ============================================================
const W = 420, HUD = 48, SH = 760, H = HUD + SH;   // 論理サイズ（HUD + シーン）
// 難易度: 要求人数の範囲 / 送り出し速度（rateMin → rateMax 人/s を ramp 秒で） / 得点倍率 / リールの回る速さ
const DIFFS = {
  easy:   { label: 'やさしい',   nMin: 2, nMax: 12, rateMin: 2, rateMax: 6,  ramp: 4, mult: 0.8, reel: 16 },
  normal: { label: 'ふつう',     nMin: 3, nMax: 30, rateMin: 2, rateMax: 10, ramp: 3, mult: 1.0, reel: 16 },
  hard:   { label: 'むずかしい', nMin: 5, nMax: 40, rateMin: 3, rateMax: 14, ramp: 2, mult: 1.5, reel: 7 },
};
// 時間: time=Infinity はエンドレス（ライフ制）。rampTime 秒かけて要求人数が最大まで増える
const TIMES = {
  '30':    { label: '30秒',       time: 30,       rampTime: 30 },
  '60':    { label: '60秒',       time: 60,       rampTime: 60 },
  endless: { label: 'エンドレス', time: Infinity, rampTime: 90 },
};
const LIVES = 3;
const WALK = 230;                                    // 案内中の歩く速さ px/s
const SEAT_WALK = 150;                               // 店内で席へ歩く速さ px/s
const QUEUE_SPEED = 420;                             // 行列が詰める速さ px/s
const MAX_INSIDE = 40;                               // 店内に表示しておく人数
const STAY_MIN = 4, STAY_MAX = 9;                     // 席に座ってから帰るまでの秒数
const EXIT_WALK = 120;                                // 帰る人の歩く速さ px/s
const FONT = '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic UI","Meiryo",sans-serif';
const HI_KEY = 'gyoretsu-hiscores', SETTINGS_KEY = 'gyoretsu-settings';

const cv = document.getElementById('cv');
const c = cv.getContext('2d');
const gameEl = document.getElementById('game');
const btn = document.getElementById('gateBtn');
const $ = id => document.getElementById(id);

let S = 1, DPR = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  S = Math.min(vw / W, vh / H);
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  gameEl.style.setProperty('--s', S);
  cv.width = Math.round(W * S * DPR);
  cv.height = Math.round(H * S * DPR);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ============================================================
//  マップ配置（シーン座標: 0..W × 0..SH）
//  上: 店（右に吹き出し） → 通路 → 下: 行列（上辺の中央に出口ゲート） → 最下部: ボタン
// ============================================================
const STORE = { x: 30, y: 26, w: 240, h: 174, name: 'カフェ' };
const DOOR_X = STORE.x + STORE.w / 2;          // 店の入口の中心
const DOOR_Y = STORE.y + STORE.h;              // 店の下辺
const DOOR_HALF = 30;
const CORR_HALF = 24;                          // 通路の半幅
const QBOX = { x: 18, y: 430, w: 384, h: 210 };
const QBOX_B = QBOX.y + QBOX.h, QBOX_R = QBOX.x + QBOX.w;
const GATE_Y = QBOX.y, GATE_HALF = 28;
const BUBBLE = { x: 346, y: 104, w: 140, h: 86 };
const EXIT_Y = STORE.y + 89;                    // 店の左の壁にある出口の高さ（席の2段目と3段目の間）
const EXIT_HALF = 12;
const PLAYER = { x: 90, y: 384 };
const ORANGE = { x: 84, y: 296, w: 110, h: 58 };

// 行列のジグザグ経路（先頭 → 最後尾）。最後尾は画面右の外から入ってくる
const SP = 30;
const QL = 40, QR = 382;
const ROW_Y = [458, 498, 538, 578, 618];
const qpts = [[DOOR_X, GATE_Y + 14], [DOOR_X, ROW_Y[0]], [QR, ROW_Y[0]]];
for (let r = 1; r < ROW_Y.length; r++) {
  const y = ROW_Y[r];
  if (r % 2) qpts.push([QR, y], [QL, y]); else qpts.push([QL, y], [QR, y]);
}
qpts.push([W + 80, ROW_Y[ROW_Y.length - 1]]);
const qsegs = [];
let QLEN = 0;
for (let i = 0; i < qpts.length - 1; i++) {
  const [x0, y0] = qpts[i], [x1, y1] = qpts[i + 1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  qsegs.push({ x0, y0, x1, y1, len, start: QLEN });
  QLEN += len;
}
const SLOTS = Math.floor(QLEN / SP) + 2;
function posAt(d) {
  if (d <= 0) return { x: qpts[0][0], y: qpts[0][1] };
  for (const s of qsegs) {
    if (d <= s.start + s.len) {
      const t = (d - s.start) / s.len;
      return { x: s.x0 + (s.x1 - s.x0) * t, y: s.y0 + (s.y1 - s.y0) * t };
    }
  }
  const last = qpts[qpts.length - 1];
  return { x: last[0] + (d - QLEN), y: last[1] };
}
// 仕切り（行の間の線）
const DIVS = [];
for (let r = 0; r < ROW_Y.length - 1; r++) {
  const y = ROW_Y[r] + 20;
  if (r % 2 === 0) DIVS.push({ x0: QBOX.x, x1: QR - 24, y });
  else DIVS.push({ x0: QL + 24, x1: QBOX_R, y });
}
// 店内の席
const SEATS = [];
for (let r = 0; r < 4; r++) {
  for (let col = 0; col < 7; col++) {
    SEATS.push({
      x: STORE.x + 30 + col * ((STORE.w - 60) / 6),
      y: STORE.y + 44 + r * ((STORE.h - 84) / 3),
    });
  }
}

// ============================================================
//  描画ヘルパー
// ============================================================
function rr(x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function line(x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function circle(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function ell(x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function text(str, x, y, font, color, align = 'center') {
  c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y);
}
function glow(color, blur) { c.shadowColor = color; c.shadowBlur = blur; }
function noGlow() { c.shadowBlur = 0; c.shadowColor = 'transparent'; }
// 店の壁（入口の部分を空けた外周）
function storeWallPath(inset = 0) {
  const x0 = STORE.x + inset, y0 = STORE.y + inset, x1 = STORE.x + STORE.w - inset, y1 = DOOR_Y - inset;
  c.beginPath();
  c.moveTo(DOOR_X - DOOR_HALF, y1);
  c.lineTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1);
  c.lineTo(DOOR_X + DOOR_HALF, y1);
}
// 行列エリアの外枠（出口ゲートと、最後尾の入口を空ける）
function queueWallPath() {
  c.beginPath();
  c.moveTo(DOOR_X - GATE_HALF, QBOX.y); c.lineTo(QBOX.x, QBOX.y);
  c.lineTo(QBOX.x, QBOX_B); c.lineTo(QBOX_R, QBOX_B); c.lineTo(QBOX_R, ROW_Y[ROW_Y.length - 1] + 16);
  c.moveTo(QBOX_R, ROW_Y[ROW_Y.length - 1] - 16); c.lineTo(QBOX_R, QBOX.y);
  c.lineTo(DOOR_X + GATE_HALF, QBOX.y);
}
// 自動ドアの戸の位置（k=0 閉, 1 開）
function doorPanels(k) {
  const e = k * k * (3 - 2 * k);
  const slide = DOOR_HALF * e;
  return [DOOR_X - DOOR_HALF - slide, DOOR_X + slide];
}

// ============================================================
//  見た目テーマ（ポップで固定）
// ============================================================
const SKIN = ['#ffdcb8', '#f3c49b', '#e0ad84', '#ffe6cc'];
const THEMES = {
  // ---------------- ポップ：明るい色のお店 ----------------
  pop: {
    page: '#ffd9a8',
    hud: { bg: '#ff7a2f', text: '#fff', sub: 'rgba(255,255,255,.85)', accent: '#fff36b', barBg: 'rgba(0,0,0,.18)', bar: '#fff36b', line: null },
    bubbleShape: 'round',
    req: { fill: '#fff', stroke: '#2d2d2d', lw: 2.5, text: '#2d2d2d', sub: '#8a7a66', shadow: 'rgba(0,0,0,.18)' },
    org: { fill: '#fff8ee', stroke: '#ff7a1a', lw: 2.5, text: '#ff7a1a', sub: '#ff7a1a', shadow: 'rgba(0,0,0,.15)' },
    ok: '#12b886', ng: '#f03e3e', outline: '#fff', count: '#ff7a1a',
    cols: ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595'],
    hair: ['#3b2a20', '#1e1e1e', '#7a4b2a', '#c98b3c', '#5c5c5c'],
    bg() {
      c.fillStyle = '#f6e7cc'; c.fillRect(0, 0, W, SH);
      c.strokeStyle = '#ead6b1'; c.lineWidth = 1;
      for (let x = 0; x <= W; x += 30) line(x + .5, 0, x + .5, SH);
      for (let y = 0; y <= SH; y += 30) line(0, y + .5, W, y + .5);
    },
    corridor() {
      c.fillStyle = '#e4d2ae';
      c.fillRect(DOOR_X - CORR_HALF, DOOR_Y, CORR_HALF * 2, GATE_Y - DOOR_Y);
      c.strokeStyle = '#d3bc8f'; c.lineWidth = 2;
      line(DOOR_X - CORR_HALF, DOOR_Y, DOOR_X - CORR_HALF, GATE_Y);
      line(DOOR_X + CORR_HALF, DOOR_Y, DOOR_X + CORR_HALF, GATE_Y);
      // 足あとガイド
      c.fillStyle = 'rgba(255,255,255,.55)';
      for (let y = GATE_Y - 30; y > DOOR_Y + 40; y -= 34) {
        c.beginPath(); c.moveTo(DOOR_X, y - 8); c.lineTo(DOOR_X + 7, y); c.lineTo(DOOR_X - 7, y); c.closePath(); c.fill();
      }
      // 玄関マット
      c.fillStyle = '#c0392b'; rr(DOOR_X - 36, DOOR_Y + 6, 72, 18, 4); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1;
      for (let y = DOOR_Y + 10; y < DOOR_Y + 22; y += 4) line(DOOR_X - 31, y, DOOR_X + 31, y);
    },
    store() {
      c.fillStyle = 'rgba(0,0,0,.15)'; rr(STORE.x + 4, STORE.y + 6, STORE.w, STORE.h, 12); c.fill();
      c.fillStyle = '#e35d5d'; rr(STORE.x, STORE.y, STORE.w, STORE.h, 12); c.fill();
      // 床
      c.fillStyle = '#f3d9a8'; rr(STORE.x + 9, STORE.y + 30, STORE.w - 18, STORE.h - 39, 6); c.fill();
      c.strokeStyle = '#e8c890'; c.lineWidth = 1;
      for (let y = STORE.y + 44; y < DOOR_Y - 9; y += 14) line(STORE.x + 9, y, STORE.x + STORE.w - 9, y);
      // 入口の切れ目
      c.fillStyle = '#f3d9a8'; c.fillRect(DOOR_X - DOOR_HALF, DOOR_Y - 10, DOOR_HALF * 2, 10);
      // テーブル
      for (const s of SEATS) {
        c.fillStyle = 'rgba(0,0,0,.08)'; ell(s.x, s.y + 9, 10, 4); c.fill();
        c.fillStyle = '#fffaf0'; circle(s.x, s.y + 6, 8); c.fill();
      }
      // 看板
      c.font = `800 14px ${FONT}`;
      const tw = c.measureText(STORE.name).width + 26;
      c.fillStyle = '#fff'; rr(DOOR_X - tw / 2, STORE.y + 4, tw, 22, 11); c.fill();
      text(STORE.name, DOOR_X, STORE.y + 15.5, `800 14px ${FONT}`, '#e35d5d');
    },
    door(k) {
      const [lx, rx] = doorPanels(k);
      for (const x of [lx, rx]) {
        c.fillStyle = 'rgba(178,222,240,.92)'; c.fillRect(x, DOOR_Y - 9, DOOR_HALF, 8);
        c.strokeStyle = '#7d8a92'; c.lineWidth = 1.5; c.strokeRect(x + .75, DOOR_Y - 8.25, DOOR_HALF - 1.5, 6.5);
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x + 5, DOOR_Y - 7, DOOR_HALF * 0.35, 1.5);
      }
    },
    queueArea() {
      c.fillStyle = 'rgba(255,255,255,.4)';
      c.fillRect(QBOX.x, QBOX.y, QBOX.w, QBOX.h);
      const belt = (x0, y0, x1, y1) => {
        c.lineCap = 'round';
        c.strokeStyle = '#d63a3a'; c.lineWidth = 5; line(x0, y0, x1, y1);
        c.strokeStyle = '#ff8a8a'; c.lineWidth = 1.5; line(x0, y0 - 1, x1, y1 - 1);
      };
      const post = (x, y) => {
        c.fillStyle = 'rgba(0,0,0,.15)'; ell(x + 1, y + 3, 6, 3); c.fill();
        c.fillStyle = '#868e96'; circle(x, y, 5.5); c.fill();
        c.fillStyle = '#e9ecef'; circle(x - 1, y - 1, 2.5); c.fill();
      };
      const lastY = ROW_Y[ROW_Y.length - 1];
      belt(QBOX.x, QBOX.y, DOOR_X - GATE_HALF, QBOX.y);
      belt(DOOR_X + GATE_HALF, QBOX.y, QBOX_R, QBOX.y);
      belt(QBOX.x, QBOX.y, QBOX.x, QBOX_B);
      belt(QBOX.x, QBOX_B, QBOX_R, QBOX_B);
      belt(QBOX_R, QBOX.y, QBOX_R, lastY - 16);
      belt(QBOX_R, lastY + 16, QBOX_R, QBOX_B);
      for (const d of DIVS) belt(d.x0, d.y, d.x1, d.y);
      post(QBOX.x, QBOX.y); post(QBOX_R, QBOX.y); post(QBOX.x, QBOX_B); post(QBOX_R, QBOX_B);
      post(QBOX_R, lastY - 16); post(QBOX_R, lastY + 16);
      for (const d of DIVS) { if (d.x0 > QBOX.x) post(d.x0, d.y); else post(d.x1, d.y); }
    },
    person(p, x, y, walk, t) {
      const T = THEMES.pop;
      const bob = walk ? -Math.abs(Math.sin(t * 12 + p.seed)) * 3 : Math.sin(t * 2 + p.seed) * 0.6;
      c.fillStyle = 'rgba(0,0,0,.18)'; ell(x, y + 10, 10, 3.5); c.fill();
      c.fillStyle = T.cols[p.c % T.cols.length]; rr(x - 9, y - 3 + bob, 18, 14, 7); c.fill();
      c.fillStyle = SKIN[p.h % SKIN.length]; circle(x, y - 9 + bob, 8); c.fill();
      c.fillStyle = T.hair[p.h % T.hair.length];
      c.beginPath(); c.arc(x, y - 10 + bob, 8.4, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
      c.fillStyle = '#222';
      circle(x - 3, y - 7 + bob, 1.2); c.fill(); circle(x + 3, y - 7 + bob, 1.2); c.fill();
    },
    player(x, y, a) {
      c.fillStyle = 'rgba(0,0,0,.2)'; ell(x, y + 18, 16, 5); c.fill();
      c.strokeStyle = '#ff7a1a'; c.lineWidth = 6; c.lineCap = 'round';
      line(x + 10, y - 6, x + 26, y - 6 - a * 16);
      c.fillStyle = SKIN[0]; circle(x + 26, y - 6 - a * 16, 3.6); c.fill();
      c.fillStyle = '#ff7a1a'; rr(x - 13, y - 14, 26, 32, 11); c.fill();
      c.fillStyle = '#fff36b'; c.fillRect(x - 13, y + 2, 26, 4);
      c.fillStyle = SKIN[0]; circle(x, y - 26, 12); c.fill();
      c.fillStyle = '#ff7a1a';
      c.beginPath(); c.arc(x, y - 28, 12.5, Math.PI, 0); c.closePath(); c.fill();
      c.fillRect(x - 2, y - 30, 18, 4);
      c.fillStyle = '#222'; circle(x - 4, y - 23, 1.5); c.fill(); circle(x + 4, y - 23, 1.5); c.fill();
      c.fillStyle = '#fff'; rr(x - 20, y + 22, 40, 16, 8); c.fill();
      text('あなた', x, y + 30.5, `800 10px ${FONT}`, '#ff7a1a');
    },
    gate(k) {
      const x0 = DOOR_X - GATE_HALF;
      const len = GATE_HALF * 2 * (1 - k);
      if (len > 1) {
        c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x0, GATE_Y + 1, len, 8);
        c.save(); c.beginPath(); c.rect(x0, GATE_Y - 4, len, 8); c.clip();
        c.fillStyle = '#fff'; c.fillRect(x0, GATE_Y - 4, len, 8);
        c.fillStyle = '#2f6bff';
        for (let i = 0; i < 6; i++) c.fillRect(x0 + 4 + i * 10, GATE_Y - 4, 5, 8);
        c.restore();
      }
      for (const px of [x0, DOOR_X + GATE_HALF]) {
        c.fillStyle = '#1c46b8'; circle(px, GATE_Y, 6.5); c.fill();
        c.fillStyle = '#74a1ff'; circle(px - 1.5, GATE_Y - 1.5, 2.5); c.fill();
      }
      // ランプ
      const lx = DOOR_X + GATE_HALF + 18, ly = GATE_Y - 14;
      c.fillStyle = k > 0.5 ? '#2fbf71' : '#e0533d'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      circle(lx, ly, 6.5); c.fill(); c.stroke();
    },
  },
};

// ============================================================
//  ゲーム状態
// ============================================================
// 選択中のモード（前回の選択を記憶）
const settings = { diff: 'normal', time: '60', theme: 'pop', sound: 'all' };
try { Object.assign(settings, JSON.parse(store.get(SETTINGS_KEY, '{}'))); } catch { /* ignore */ }
if (!['all', 'se', 'off'].includes(settings.sound)) settings.sound = 'all';
// サウンド（sound.js が無くても動くようにする）。デモ中は鳴らさない
const Snd = window.Sound || { unlock() {}, setMode() {}, pause() {}, se: new Proxy({}, { get: () => () => {} }), bgm: { start() {}, stop() {}, hurry() {} } };
const SE = (name, ...args) => { if (g && !g.demo) Snd.se[name](...args); };
Snd.setMode(settings.sound);
if (!DIFFS[settings.diff]) settings.diff = 'normal';
if (!TIMES[settings.time]) settings.time = '60';
settings.theme = 'pop';   // 見た目はポップで固定
let T = THEMES[settings.theme];
let state = 'title';          // title（デモ） | count | play | pause | over
let g = null;
let hiScores = {};
try { hiScores = JSON.parse(store.get(HI_KEY, '{}')) || {}; } catch { hiScores = {}; }
const modeKey = () => `${settings.diff}-${settings.time}`;
const getHi = () => hiScores[modeKey()] || 0;
let clock = 0;                // 経過時間（アニメ用）
let doorK = 0;                // 自動ドアの開き具合
const reel = [0, 0, 0];       // リール表示（各桁の累積値）

function newPerson() {
  return { c: randi(0, 99), h: randi(0, 99), seed: rand(0, 10) };
}
function shuffledSeats() {
  const a = SEATS.map((s, i) => i);
  for (let i = a.length - 1; i > 0; i--) { const j = randi(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function newGame(demo) {
  const D = DIFFS[settings.diff], TM = TIMES[settings.time];
  g = {
    demo: !!demo, D, TM, endless: TM.time === Infinity,
    time: TM.time, elapsed: 0, lives: LIVES,
    score: 0, combo: 0, maxCombo: 0, ok: 0, people: 0, miss: 0,
    req: null, nextReq: 0.9,
    open: false, gateK: 0, openT: 0, acc: 0, pAnim: 0,
    queue: [], walkers: [], inside: [], seatOrder: shuffledSeats(), seatIdx: 0,
    floats: [], countdown: 3.4,
  };
  for (let i = 0; i < SLOTS; i++) { const p = newPerson(); p.d = i * SP; g.queue.push(p); }
  updateBtn();
}

function newRequest() {
  const D = g.D;
  const k = clamp(g.elapsed / g.TM.rampTime, 0, 1);
  const start = Math.min(D.nMin + 5, D.nMax);
  const lo = D.nMin + Math.floor(k * 4);
  const hi = Math.round(start + (D.nMax - start) * k);
  const n = randi(lo, hi);
  g.req = { n, sent: 0, arrived: 0, locked: false, t: 0 };
  SE('request');
  if (g.demo) {
    // デモ: たまにわざと少しずらして、ミスの様子も見せる
    g.req.demoWait = rand(0.3, 0.9);
    g.req.demoTarget = Math.random() < 0.2 ? Math.max(1, n + (Math.random() < 0.5 ? -1 : 1) * randi(1, 2)) : n;
  }
}

function releaseOne() {
  const p = g.queue.shift();
  const pos = posAt(p.d);
  const j = rand(-9, 9);
  g.walkers.push({
    ...p, x: pos.x, y: pos.y, wi: 0,
    wp: [
      [DOOR_X + j * 0.3, GATE_Y - 8],
      [DOOR_X + j, DOOR_Y + 34],
      [DOOR_X + j * 0.4, DOOR_Y - 6],
    ],
  });
  g.req.sent++;
  SE('release', g.req.sent);
}

// 店に入った人は空いている席へ歩いていく（見た目だけ）
function enterStore(w) {
  const seat = SEATS[g.seatOrder[g.seatIdx++ % SEATS.length]];
  g.inside.push({ ...w, sx: seat.x + rand(-3, 3), sy: seat.y + rand(-2, 2), stay: rand(STAY_MIN, STAY_MAX), leaving: 0 });
  if (g.inside.length > MAX_INSIDE) g.inside.shift();
}

function judge() {
  const r = g.req;
  const fx = BUBBLE.x - 4, fy = BUBBLE.y + BUBBLE.h / 2 + 22;
  const diff = r.sent - r.n;
  if (diff === 0) {
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    const mult = 1 + 0.2 * Math.min(g.combo - 1, 10);
    const pts = Math.round((r.n * 10 + 100) * mult * g.D.mult);
    g.score += pts; g.ok++; g.people += r.n;
    addFloat('ぴったり！', fx, fy, T.ok, 20);
    addFloat(`+${pts}` + (g.combo >= 2 ? `  ${g.combo}コンボ` : ''), fx, fy + 24, T.ok, 14);
    SE('success', g.combo);
  } else {
    g.combo = 0; g.miss++;
    addFloat(diff > 0 ? `${diff}人多い…` : `${-diff}人足りない…`, fx, fy, T.ng, 18);
    SE('miss');
    if (g.endless) { g.lives--; g.lifeFlash = 1; SE('lifeLost'); }
  }
  g.req = null;
  g.nextReq = rand(0.5, 2);
  if (g.endless && g.lives <= 0) {
    if (g.demo) g.restartIn = 2;
    else endGame();
  }
}
function checkJudge() {
  const r = g.req;
  if (r && r.locked && r.arrived === r.sent) judge();
}
function addFloat(str, x, y, color, size) {
  g.floats.push({ str, x: clamp(x, 80, W - 80), y, color, size, t: 0 });
}

function toggleGate() {
  if (state !== 'play') return;
  setGate(!g.open);
}
function setGate(open) {
  if (g.open === open) return;
  g.open = open;
  g.pAnim = 1;
  SE(open ? 'gateOpen' : 'gateClose');
  if (g.open) {
    g.openT = 0; g.acc = 1;           // 開けた瞬間に1人目が出る
  } else if (g.req && g.req.sent > 0 && !g.req.locked) {
    g.req.locked = true;              // 閉めた時点で集団の人数が確定
    checkJudge();
  }
  updateBtn();
}
function updateBtn() {
  const open = g && g.open;
  btn.classList.toggle('open', !!open);
  btn.querySelector('.l1').textContent = open ? '閉める' : '開ける';
  btn.disabled = state !== 'play';
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  clock += dt;
  if (state === 'pause') return;
  if (state === 'count') {
    g.countdown -= dt;
    // カウントダウンの音（3・2・1 → スタート）
    const n = Math.max(0, Math.ceil(g.countdown - 0.4));
    if (n !== g.lastCount) {
      g.lastCount = n;
      if (n > 0) SE('count'); else { SE('go'); Snd.bgm.start(); }
    }
    if (g.countdown <= 0) { state = 'play'; updateBtn(); }
  }
  // デモが終わったら作り直してループ
  if (state === 'title' && g.restartIn !== undefined) {
    g.restartIn -= dt;
    if (g.restartIn <= 0) { newGame(true); resetVisuals(); }
  }
  const running = (state === 'play' || state === 'title') && g.restartIn === undefined;
  if (running) {
    g.elapsed += dt;
    if (!g.endless) {
      g.time -= dt;
      // 残り10秒: 毎秒チクタク＋BGMを速く
      if (g.time <= 10 && !g.demo) {
        const sec = Math.ceil(g.time);
        if (sec !== g.lastSec) { g.lastSec = sec; if (sec > 0) SE('tick'); Snd.bgm.hurry(true); }
      }
      if (g.time <= 0) {
        g.time = 0;
        if (g.demo) g.restartIn = 1.5; else endGame();
      }
    }
  }
  g.lifeFlash = Math.max(0, (g.lifeFlash || 0) - dt * 2);
  if (running && g.restartIn === undefined) {
    if (!g.req) { g.nextReq -= dt; if (g.nextReq <= 0) newRequest(); }
    if (g.req) g.req.t += dt;
    // デモの自動操作
    if (g.demo) {
      const r = g.req;
      if (r && !r.locked) {
        if (!g.open && r.sent === 0 && r.t > r.demoWait) setGate(true);
        if (g.open && r.sent >= r.demoTarget) setGate(false);
      } else if (g.open) setGate(false);
    }
    // 送り出し（開けている間に加速）
    if (g.open && g.req && !g.req.locked) {
      g.openT += dt;
      const D = g.D;
      const k = Math.min(1, g.openT / D.ramp);
      const rate = D.rateMin + (D.rateMax - D.rateMin) * k * k;
      g.acc += rate * dt;
      while (g.acc >= 1) { g.acc -= 1; releaseOne(); }
    }
  }
  g.gateK += ((g.open ? 1 : 0) - g.gateK) * Math.min(1, dt * 18);
  g.pAnim = Math.max(0, g.pAnim - dt * 3);

  // 行列を詰める・補充（最後尾は画面の外から入ってくる）
  const q = g.queue;
  for (let i = 0; i < q.length; i++) q[i].d = Math.max(i * SP, q[i].d - QUEUE_SPEED * dt);
  while (q.length < SLOTS) {
    const p = newPerson();
    p.d = Math.max(QLEN + SP, (q.length ? q[q.length - 1].d : 0) + SP);
    q.push(p);
  }

  // 案内中の人（通路 → 店の入口）
  let nearDoor = false;
  for (let i = g.walkers.length - 1; i >= 0; i--) {
    const w = g.walkers[i];
    let move = WALK * dt;
    while (move > 0 && w.wi < w.wp.length) {
      const [tx, ty] = w.wp[w.wi];
      const dx = tx - w.x, dy = ty - w.y, dist = Math.hypot(dx, dy);
      if (dist <= move) { w.x = tx; w.y = ty; move -= dist; w.wi++; }
      else { w.x += dx / dist * move; w.y += dy / dist * move; move = 0; }
    }
    if (w.y < DOOR_Y + 70) nearDoor = true;
    if (w.wi >= w.wp.length) {
      g.walkers.splice(i, 1);
      enterStore(w);
      if (g.req) { g.req.arrived++; checkJudge(); }
    }
  }
  // 店内の人（席へ歩く → しばらく座る → 左の出口から帰る）
  for (let i = g.inside.length - 1; i >= 0; i--) {
    const p = g.inside[i];
    if (p.leaving) {
      // 1: 出口の手前へ → 2: 出口を抜けて画面の外へ
      const tx = p.leaving === 1 ? STORE.x + 22 : -24, ty = EXIT_Y;
      const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
      const m = Math.min(dist, EXIT_WALK * dt);
      if (dist > 0.5) { p.x += dx / dist * m; p.y += dy / dist * m; }
      p.walking = true;
      if (dist <= 0.5) {
        if (p.leaving === 1) p.leaving = 2;
        else g.inside.splice(i, 1);
      }
      continue;
    }
    const dx = p.sx - p.x, dy = p.sy - p.y, dist = Math.hypot(dx, dy);
    p.walking = dist > 1;
    if (p.walking) { const m = Math.min(dist, SEAT_WALK * dt); p.x += dx / dist * m; p.y += dy / dist * m; }
    else if ((p.stay -= dt) <= 0) p.leaving = 1;
    if (p.y > DOOR_Y - 26) nearDoor = true;
  }

  // 自動ドア：人が近づくと開く
  doorK += ((nearDoor ? 1 : 0) - doorK) * Math.min(1, dt * 12);

  // リール
  const shown = g.req ? g.req.sent : 0;
  for (let p = 0; p < reel.length; p++) {
    const tgt = Math.floor(shown / 10 ** p);
    reel[p] += (tgt - reel[p]) * Math.min(1, dt * g.D.reel);
    if (Math.abs(tgt - reel[p]) < 0.002) reel[p] = tgt;
  }

  for (let i = g.floats.length - 1; i >= 0; i--) {
    const f = g.floats[i];
    f.t += dt; f.y -= 22 * dt;
    if (f.t > 1.3) g.floats.splice(i, 1);
  }
}

// ============================================================
//  描画
// ============================================================
function bubblePath(shape, x, y, w, h) {
  if (shape === 'ellipse') ell(x, y, w / 2, h / 2);
  else rr(x - w / 2, y - h / 2, w, h, Math.min(16, h / 2));
}
function tailPath(x, y, w, h, tx, ty) {
  const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  const bx = x + dx / L * Math.min(w, h) * 0.2, by = y + dy / L * Math.min(w, h) * 0.2;
  c.beginPath();
  c.moveTo(bx + px * 9, by + py * 9); c.lineTo(tx, ty); c.lineTo(bx - px * 9, by - py * 9); c.closePath();
}
function drawBubble(st, x, y, w, h, tx, ty) {
  const shape = T.bubbleShape;
  c.save();
  c.lineJoin = 'round';
  if (st.shadow) {
    c.fillStyle = st.shadow;
    tailPath(x, y + 4, w, h, tx, ty + 4); c.fill();
    bubblePath(shape, x, y + 4, w, h); c.fill();
  }
  if (st.glow) glow(st.glow, 14);
  c.strokeStyle = st.stroke; c.lineWidth = st.lw * 2;
  tailPath(x, y, w, h, tx, ty); c.stroke();
  bubblePath(shape, x, y, w, h); c.stroke();
  noGlow();
  c.fillStyle = st.fill;
  tailPath(x, y, w, h, tx, ty); c.fill();
  bubblePath(shape, x, y, w, h); c.fill();
  c.restore();
}

function drawRequest() {
  const r = g.req;
  if (!r) return;
  const { x: bx, y: by, w, h } = BUBBLE;
  const t = Math.min(1, r.t * 5);
  const s = 1 + 0.25 * Math.sin(t * Math.PI) * (1 - t) + (t < 1 ? (t - 1) * 0.6 : 0);
  c.save();
  c.translate(bx, by); c.scale(s, s);
  drawBubble(T.req, 0, 0, w, h, (STORE.x + STORE.w - 12) - bx, (STORE.y + STORE.h * 0.62) - by);
  c.font = `800 32px ${FONT}`;
  const nw = c.measureText(String(r.n)).width;
  c.font = `800 17px ${FONT}`;
  const uw = c.measureText('人').width;
  const x0 = -(nw + uw + 3) / 2;
  text(String(r.n), x0, -9, `800 32px ${FONT}`, T.req.text, 'left');
  text('人', x0 + nw + 3, -5, `800 17px ${FONT}`, T.req.text, 'left');
  text(r.locked ? 'まってま〜す' : 'くださ〜い', 0, 20, `500 12px ${FONT}`, T.req.sub);
  c.restore();
}

function drawOrange() {
  const { x, y, w, h } = ORANGE;
  drawBubble(T.org, x, y, w, h, PLAYER.x + 6, PLAYER.y - 50);
  // 表示する桁数
  let digits = 1;
  for (let p = reel.length - 1; p > 0; p--) if (reel[p] > 0.01) { digits = p + 1; break; }
  const DW = 17, DH = 30;
  const totalW = digits * DW + 4 + 16;
  const x0 = x - totalW / 2;
  c.save();
  c.beginPath(); c.rect(x0 - 2, y - DH / 2 - 2, digits * DW + 4, DH + 2); c.clip();
  for (let i = 0; i < digits; i++) {
    const p = digits - 1 - i;
    const v = reel[p];
    const base = Math.floor(v), frac = v - base;
    const cx = x0 + i * DW + DW / 2;
    const f = `800 27px ${FONT}`;
    text(String(((base % 10) + 10) % 10), cx, y - frac * DH, f, T.org.text);
    if (frac > 0.001) text(String((((base + 1) % 10) + 10) % 10), cx, y + (1 - frac) * DH, f, T.org.text);
  }
  c.restore();
  text('人', x0 + digits * DW + 4, y + 4, `800 14px ${FONT}`, T.org.sub, 'left');
}

function drawHUD() {
  const hd = T.hud;
  c.fillStyle = hd.bg; c.fillRect(0, 0, W, HUD);
  if (hd.line) { c.fillStyle = hd.line; c.fillRect(0, HUD - 1, W, 1); }
  if (g.endless) {
    // エンドレス: ライフ表示
    text('ライフ', 14, 13, `500 10px ${FONT}`, hd.sub, 'left');
    for (let i = 0; i < LIVES; i++) {
      const alive = i < g.lives;
      const pop = !alive && i === g.lives && g.lifeFlash > 0 ? 1 + g.lifeFlash * 0.6 : 1;
      heart(24 + i * 24, 31, 9 * pop, alive ? hd.accent : hd.sub, alive ? 1 : 0.3);
    }
  } else {
    const t = Math.max(0, g.time);
    text('のこり', 14, 13, `500 10px ${FONT}`, hd.sub, 'left');
    text(t.toFixed(1), 14, 31, `800 22px ${FONT}`, t <= 10 ? hd.accent : hd.text, 'left');
    c.fillStyle = hd.barBg; c.fillRect(0, HUD - 4, W, 4);
    c.fillStyle = t <= 10 ? hd.accent : hd.bar; c.fillRect(0, HUD - 4, W * t / g.TM.time, 4);
  }
  text('スコア', W / 2, 13, `500 10px ${FONT}`, hd.sub);
  text(String(g.score), W / 2, 31, `800 22px ${FONT}`, hd.text);
  const rx = W - 52;   // 右端は一時停止ボタン
  if (g.combo >= 2) {
    text('コンボ', rx, 13, `500 10px ${FONT}`, hd.sub, 'right');
    text(`×${g.combo}`, rx, 31, `800 22px ${FONT}`, hd.accent, 'right');
  } else {
    text('ハイスコア', rx, 13, `500 10px ${FONT}`, hd.sub, 'right');
    text(String(getHi()), rx, 31, `800 18px ${FONT}`, hd.text, 'right');
  }
}
function heart(x, y, r, color, alpha) {
  c.save();
  c.globalAlpha = alpha; c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.8, y - r * 1.3, x, y - r * 0.45);
  c.bezierCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.6, y - r * 0.1, x, y + r * 0.9);
  c.fill();
  c.restore();
}

function outlinedText(str, x, y, size, color, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = size * 0.28; c.strokeStyle = T.outline;
  c.strokeText(str, x, y);
  c.fillStyle = color; c.fillText(str, x, y);
  c.restore();
}

// 店の左の壁の出口（帰る人がここから出ていく）
function drawExit() {
  c.fillStyle = '#f3d9a8';
  c.fillRect(STORE.x - 1, EXIT_Y - EXIT_HALF, 11, EXIT_HALF * 2);
  c.fillStyle = 'rgba(0,0,0,.12)';
  c.fillRect(STORE.x - 1, EXIT_Y - EXIT_HALF, 11, 2);
  // 「出口」の縦看板（壁の外側）
  const sx = STORE.x - 22, sy = EXIT_Y - 44;
  c.fillStyle = 'rgba(0,0,0,.15)'; rr(sx + 1, sy + 2, 16, 30, 4); c.fill();
  c.fillStyle = '#2fb36b'; rr(sx, sy, 16, 30, 4); c.fill();
  text('出', sx + 8, sy + 8.5, `800 10px ${FONT}`, '#fff');
  text('口', sx + 8, sy + 21.5, `800 10px ${FONT}`, '#fff');
}
function draw() {
  c.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  c.save();
  c.translate(0, HUD);
  c.beginPath(); c.rect(0, 0, W, SH); c.clip();

  T.bg();
  T.corridor();
  T.store();
  drawExit();
  // 店内の人
  const ins = g.inside.slice().sort((a, b) => a.y - b.y);
  for (const p of ins) T.person(p, p.x, p.y, p.walking, clock);
  T.door(doorK);
  T.queueArea();

  // 行列と案内中の人（y順に描いて重なりを自然に）
  const list = [];
  for (const p of g.queue) {
    const pos = posAt(p.d);
    if (pos.x < W + 16) list.push([p, pos.x, pos.y, false]);
  }
  for (const w of g.walkers) list.push([w, w.x, w.y, true]);
  list.sort((a, b) => a[2] - b[2]);
  for (const [p, x, y, walk] of list) T.person(p, x, y, walk, clock);

  T.player(PLAYER.x, PLAYER.y, g.open ? 1 - g.pAnim * 0.3 : g.pAnim * 0.5);
  T.gate(g.gateK);

  drawRequest();
  drawOrange();

  for (const f of g.floats) outlinedText(f.str, f.x, f.y, f.size, f.color, f.t > 0.9 ? Math.max(0, 1 - (f.t - 0.9) / 0.4) : 1);

  if (state === 'count') {
    const n = Math.ceil(g.countdown - 0.4);
    const str = n > 0 ? String(n) : 'スタート！';
    const k = (g.countdown - 0.4) % 1;
    outlinedText(str, W / 2 + 60, 320, n > 0 ? 70 + k * 20 : 44, T.count);
  }
  c.restore();
  drawHUD();
}

// ============================================================
//  画面遷移
// ============================================================
function setState(s) {
  state = s;
  gameEl.classList.toggle('in-title', s === 'title' || s === 'over');
  updateBtn();
}
function resetVisuals() {
  doorK = 0;
  reel.fill(0);
}
function modeLabel() {
  return `${DIFFS[settings.diff].label}・${TIMES[settings.time].label}`;
}
function refreshMenu() {
  for (const opt of document.querySelectorAll('.opt')) {
    const key = opt.dataset.key;
    for (const b of opt.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === settings[key]);
  }
  $('hiTitle').textContent = getHi();
}
function setOption(key, v) {
  if (settings[key] === v) return;
  settings[key] = v;
  store.set(SETTINGS_KEY, JSON.stringify(settings));
  if (key === 'sound') Snd.setMode(v);
  else if (state === 'title') { newGame(true); resetVisuals(); }   // 難易度・時間はデモを作り直して反映
  refreshMenu();
  Snd.se.ui();
}
function applyTheme(key) {
  T = THEMES[key];
  gameEl.dataset.theme = key;
  document.documentElement.style.background = T.page;
  document.body.style.background = T.page;
}
function startGame() {
  Snd.bgm.stop();
  Snd.pause(false);
  newGame(false);
  resetVisuals();
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('help').classList.add('hidden');
  setState('count');
}
function endGame() {
  g.open = false;
  setState('over');
  Snd.bgm.stop();
  if (!g.endless) Snd.se.timeUp();
  const key = modeKey();
  const isNew = g.score > (hiScores[key] || 0);
  if (isNew) { hiScores[key] = g.score; store.set(HI_KEY, JSON.stringify(hiScores)); }
  $('rMode').textContent = modeLabel();
  $('rScore').textContent = g.score;
  $('rOk').textContent = `${g.ok}回`;
  $('rPeople').textContent = `${g.people}人`;
  $('rMiss').textContent = `${g.miss}回`;
  $('rCombo').textContent = g.maxCombo;
  $('rNew').classList.toggle('hidden', !isNew);
  lastResult = { mode: key, score: g.score, ok: g.ok, people: g.people, maxCombo: g.maxCombo };
  showRankBox();
  setTimeout(() => {
    if (state !== 'over') return;
    $('result').classList.remove('hidden');
    Snd.se.result(isNew);
  }, 900);
}
function toTitle() {
  Snd.bgm.stop();
  Snd.pause(false);
  newGame(true);
  resetVisuals();
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('title').classList.remove('hidden');
  setState('title');
  refreshMenu();
}
function pauseGame() {
  if (state !== 'play' && state !== 'count') return;
  g.pausedFrom = state;
  setState('pause');
  Snd.pause(true);
  $('pause').classList.remove('hidden');
}
function resumeGame() {
  if (state !== 'pause') return;
  $('pause').classList.add('hidden');
  Snd.pause(false);
  setState(g.pausedFrom);
}

// ============================================================
//  オンラインランキング（ranking.js / ranking_config.js）
// ============================================================
const NAME_KEY = 'gyoretsu-name';
const RANK_NOT_SET = 'ランキングを読み込めませんでした';
const LOCAL_NOTE = 'この端末だけのランキングです';
let lastResult = null;        // 直前のゲーム結果（ランキング登録用）
let submitted = false;
const rankSel = { diff: settings.diff, time: settings.time };

// ranking.js は game.js より先に読み込まれる。念のため、まだ無ければ少し待つ
function getRanking() {
  if (window.Ranking) return Promise.resolve(window.Ranking);
  return new Promise(res => {
    const t = setTimeout(() => res(window.Ranking || null), 4000);
    window.addEventListener('ranking-ready', () => { clearTimeout(t); res(window.Ranking); }, { once: true });
  });
}
function renderRankList(ol, rows, meId) {
  ol.textContent = '';
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    if (meId && r.id === meId) li.classList.add('me');
    const no = document.createElement('span'); no.className = 'no'; no.textContent = i + 1;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.score;
    li.append(no, nm, sc);
    ol.append(li);
  });
}
async function loadRankList(ol, msgEl, mode, meId) {
  const req = String((Number(ol.dataset.req) || 0) + 1);
  ol.dataset.req = req;        // 古い読み込み結果で上書きしないための番号
  msgEl.textContent = '読み込み中…';
  const R = await getRanking();
  if (ol.dataset.req !== req) return;
  if (!R || !R.enabled) { ol.textContent = ''; msgEl.textContent = RANK_NOT_SET; return; }
  try {
    const rows = await R.top(mode);
    if (ol.dataset.req !== req) return;
    renderRankList(ol, rows, meId);
    msgEl.textContent = !rows.length ? 'まだ記録がありません。一番乗りを目指そう！' : R.online ? '' : LOCAL_NOTE;
  } catch (err) {
    console.warn('ranking load failed', err);
    if (ol.dataset.req === req) msgEl.textContent = 'ランキングを読み込めませんでした';
  }
}
function refreshRankTabs() {
  for (const opt of document.querySelectorAll('.opt-r')) {
    const key = opt.dataset.rkey;
    for (const b of opt.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === rankSel[key]);
  }
}
function loadRankView() {
  refreshRankTabs();
  loadRankList($('rankList'), $('rankState'), `${rankSel.diff}-${rankSel.time}`);
}
function openRanking() {
  rankSel.diff = settings.diff;
  rankSel.time = settings.time;
  $('ranking').classList.remove('hidden');
  loadRankView();
}
async function showRankBox() {
  submitted = false;
  const box = $('rankBox');
  box.classList.add('hidden');
  const R = await getRanking();
  if (!R || !R.enabled || !lastResult) return;
  box.classList.remove('hidden');
  const canSend = lastResult.score > 0;     // 0点は登録できない
  $('rankForm').classList.remove('hidden');
  $('rankName').value = canSend ? store.get(NAME_KEY, '') : '';
  $('rankName').placeholder = canSend ? 'なまえ（12文字まで）' : '0点は登録できません';
  $('rankName').disabled = !canSend;
  $('rankSend').disabled = !canSend;
  loadRankList($('rankListResult'), $('rankMsg'), lastResult.mode);
}
async function submitRank(e) {
  e.preventDefault();
  if (submitted || !lastResult) return;
  const R = await getRanking();
  if (!R || !R.enabled) return;
  const msg = $('rankMsg');
  const name = R.cleanName($('rankName').value);
  if (!name) { msg.textContent = 'なまえを入れてください'; $('rankName').focus(); return; }
  store.set(NAME_KEY, name);
  $('rankSend').disabled = true;
  msg.textContent = '登録中…';
  try {
    const res = await R.submit(lastResult.mode, { ...lastResult, name });
    submitted = true;
    $('rankForm').classList.add('hidden');
    await loadRankList($('rankListResult'), msg, lastResult.mode, res.id);
    msg.textContent = (res.rank ? `${res.rank}位で登録しました！` : '登録しました！') + (R.online ? '' : `（${LOCAL_NOTE}）`);
  } catch (err) {
    console.warn('ranking submit failed', err);
    $('rankSend').disabled = false;
    msg.textContent = err.status === 429
      ? '登録が続いています。少し待ってから、もう一度押してください'
      : '登録できませんでした。通信状態を確認して、もう一度押してください';
  }
}

// 入力
// 音はユーザー操作の中でしか鳴らし始められないので、最初の操作で準備する
document.addEventListener('pointerdown', () => Snd.unlock(), true);
document.addEventListener('keydown', () => Snd.unlock(), true);
btn.addEventListener('pointerdown', e => { e.preventDefault(); toggleGate(); });
btn.addEventListener('click', e => { if (e.detail === 0) toggleGate(); }); // キーボードでボタン操作した場合
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (e.repeat) return;
    if (state === 'play') { e.preventDefault(); toggleGate(); }
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'pause') resumeGame(); else pauseGame();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
document.addEventListener('contextmenu', e => e.preventDefault());
for (const opt of document.querySelectorAll('.opt')) {
  for (const b of opt.querySelectorAll('button')) b.addEventListener('click', () => setOption(opt.dataset.key, b.dataset.v));
}
$('startBtn').addEventListener('click', startGame);
$('retryBtn').addEventListener('click', startGame);
$('toTitleBtn').addEventListener('click', toTitle);
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', toTitle);
$('helpBtn').addEventListener('click', () => $('help').classList.remove('hidden'));
$('helpClose').addEventListener('click', () => $('help').classList.add('hidden'));
$('rankBtn').addEventListener('click', openRanking);
$('rankClose').addEventListener('click', () => $('ranking').classList.add('hidden'));
$('rankForm').addEventListener('submit', submitRank);
for (const opt of document.querySelectorAll('.opt-r')) {
  for (const b of opt.querySelectorAll('button')) b.addEventListener('click', () => { rankSel[opt.dataset.rkey] = b.dataset.v; loadRankView(); });
}

applyTheme('pop');
toTitle();

// テスト用フック（?debug のときだけ）
if (new URLSearchParams(location.search).has('debug')) {
  window.__q = { update, draw, toggleGate, startGame, toTitle, pauseGame, resumeGame, setOption, get g() { return g; }, get state() { return state; } };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
})();
