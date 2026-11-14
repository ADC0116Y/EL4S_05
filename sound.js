// ============================================================
//  サウンド（Web Audio API でその場で合成。音声ファイルは使わない）
//  素材に差し替える場合は、各関数の中身を AudioBuffer の再生に置き換えればよい。
// ============================================================
window.Sound = (() => {
  'use strict';
  let ac = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
  let mode = 'all';                 // all（BGM+効果音） | se（効果音のみ） | off
  const BGM_VOL = 0.32;

  // ブラウザの制限で、音はユーザー操作（クリック等）の中で初めて鳴らせる
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      bgmBus = ac.createGain(); bgmBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyMode();
    }
    if (ac.state === 'suspended' && !paused) ac.resume();
  }
  function setMode(m) { mode = m; applyMode(); }
  function applyMode() {
    if (!ac) return;
    const t = ac.currentTime;
    sfxBus.gain.setTargetAtTime(mode === 'off' ? 0 : 1, t, 0.02);
    bgmBus.gain.setTargetAtTime(mode === 'all' ? BGM_VOL : 0, t, 0.05);
  }
  const ready = () => ac && ac.state === 'running';

  // ---- 音の部品 ----
  function tone(freq, dur, o = {}) {
    if (!ac) return;
    const t = o.at ?? ac.currentTime;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    const v = o.vol ?? 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function noise(dur, o = {}) {
    if (!ac) return;
    const t = o.at ?? ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = o.filter || 'highpass'; f.frequency.value = o.freq || 2000;
    const g = ac.createGain();
    const v = o.vol ?? 0.15;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const semi = (base, n) => base * Math.pow(2, n / 12);

  // ---- 効果音 ----
  const se = {
    ui() { if (!ready()) return; tone(880, 0.05, { type: 'triangle', vol: 0.12 }); },
    gateOpen() {
      if (!ready()) return;
      noise(0.05, { freq: 3000, vol: 0.12 });
      tone(520, 0.09, { type: 'triangle', slide: 820, vol: 0.16 });
    },
    gateClose() {
      if (!ready()) return;
      tone(360, 0.08, { type: 'square', slide: 170, vol: 0.1 });
      noise(0.06, { filter: 'lowpass', freq: 900, vol: 0.25 });
    },
    // 1人送り出すごとの「ポッ」。人数が増えるほど少しずつ高くなる
    release(n) {
      if (!ready()) return;
      tone(semi(560, Math.min(n - 1, 30) * 0.6), 0.05, { type: 'sine', vol: 0.09 });
    },
    request() {
      if (!ready()) return;
      const t = ac.currentTime;
      tone(1046.5, 0.22, { type: 'triangle', vol: 0.14, at: t });
      tone(784, 0.35, { type: 'triangle', vol: 0.14, at: t + 0.13 });
    },
    success(combo) {
      if (!ready()) return;
      const t = ac.currentTime, up = Math.min(combo - 1, 7);
      [0, 4, 7, 12].forEach((n, i) => tone(semi(523.25, n + up), i === 3 ? 0.28 : 0.1, { type: 'square', vol: 0.1, at: t + i * 0.065 }));
      tone(semi(2093, up), 0.25, { type: 'sine', vol: 0.06, at: t + 0.26 });
    },
    miss() {
      if (!ready()) return;
      const t = ac.currentTime;
      tone(196, 0.13, { type: 'sawtooth', vol: 0.1, at: t });
      tone(147, 0.28, { type: 'sawtooth', vol: 0.1, at: t + 0.15 });
    },
    lifeLost() { if (!ready()) return; tone(330, 0.45, { type: 'sine', slide: 70, vol: 0.2 }); },
    count() { if (!ready()) return; tone(660, 0.12, { type: 'square', vol: 0.1 }); },
    go() { if (!ready()) return; tone(1320, 0.35, { type: 'square', vol: 0.1 }); },
    tick() { if (!ready()) return; tone(1500, 0.04, { type: 'sine', vol: 0.08 }); },
    timeUp() {
      if (!ready()) return;
      const t = ac.currentTime;
      tone(1568, 0.12, { type: 'square', vol: 0.1, at: t });
      tone(1568, 0.55, { type: 'square', vol: 0.1, at: t + 0.16 });
    },
    result(isNew) {
      if (!ready()) return;
      const t = ac.currentTime;
      const notes = isNew ? [0, 4, 7, 12, 7, 12, 16] : [0, 4, 7, 12];
      notes.forEach((n, i) => tone(semi(523.25, n), i === notes.length - 1 ? 0.5 : 0.12, { type: 'triangle', vol: 0.14, at: t + i * 0.1 }));
    },
  };

  // ---- BGM（明るいチップチューン。C - Am - F - G の4小節ループ） ----
  const _ = null;
  const MELODY = [
    0, _, 4, _, 7, _, 4, _, 9, _, 7, _, 4, _, 2, _,
    0, _, _, 4, _, _, 2, _, 0, _, -3, _, 0, _, _, _,
    5, _, 4, _, 5, _, 9, _, 7, _, 5, _, 4, _, 2, _,
    2, _, _, _, 7, _, 5, _, 4, _, 2, _, -1, _, _, _,
  ];
  const CHORDS = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
  let bgmOn = false, step = 0, nextTime = 0, timer = null, tempo = 132, paused = false;

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % 4, pos = s % 16;
    const ch = CHORDS[bar];
    const B = { bus: bgmBus };
    const len = 60 / tempo / 4;
    // ドラム
    if (pos % 8 === 0) tone(150, 0.12, { ...B, type: 'sine', slide: 45, vol: 0.5, at: t });
    if (pos % 8 === 4) noise(0.1, { ...B, freq: 1500, vol: 0.18, at: t });
    if (pos % 2 === 0) noise(0.03, { ...B, freq: 7000, vol: 0.06, at: t });
    // ベース（8分）
    if (pos % 2 === 0) tone(semi(130.81, ch[0] - 12 + (pos % 4 === 2 ? 12 : 0)), len * 1.8, { ...B, type: 'triangle', vol: 0.35, at: t });
    // 和音（裏拍）
    if (pos % 4 === 2) ch.forEach(n => tone(semi(261.63, n), len * 1.2, { ...B, type: 'square', vol: 0.03, at: t }));
    // メロディ
    const m = MELODY[s % 64];
    if (m !== null) tone(semi(523.25, m), len * 1.9, { ...B, type: 'square', vol: 0.07, at: t });
  }
  function pump() {
    if (!ac || !bgmOn) return;
    while (nextTime < ac.currentTime + 0.15) {
      scheduleStep(step, nextTime);
      nextTime += 60 / tempo / 4;
      step++;
    }
  }
  const bgm = {
    start() {
      if (!ac || bgmOn) return;
      bgmOn = true; step = 0; tempo = 132;
      nextTime = ac.currentTime + 0.06;
      timer = setInterval(pump, 25);
      pump();
    },
    stop() { bgmOn = false; clearInterval(timer); timer = null; },
    hurry(on) { tempo = on ? 156 : 132; },
  };

  // 一時停止中は音をまるごと止める
  function pause(on) {
    paused = on;
    if (!ac) return;
    if (on) ac.suspend(); else ac.resume();
  }

  return { unlock, setMode, pause, se, bgm };
})();
