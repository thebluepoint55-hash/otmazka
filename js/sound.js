/* Синтезированные звуки через Web Audio: никаких файлов, всё работает с file://. */
window.Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true;
  try { if (localStorage.getItem('otmazka-sound') === 'off') enabled = false; } catch (e) {}

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  const ready = () => enabled && ctx && ctx.state === 'running';
  const r = (a, b) => a + Math.random() * (b - a);

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function noise(t, { type = 'bandpass', freq = 2000, q = 1, gain = 0.4, attack = 0.002, decay = 0.05, freqEnd } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = ctx.createGain();
    env(g, t, gain, attack, decay);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }
  function tone(t, freq, { type = 'sine', gain = 0.3, attack = 0.002, decay = 0.2, freqEnd } = {}) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = ctx.createGain();
    env(g, t, gain, attack, decay);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }

  const S = {
    unlock,
    get enabled() { return enabled; },
    set(on) {
      enabled = on;
      try { localStorage.setItem('otmazka-sound', on ? 'on' : 'off'); } catch (e) {}
      if (on) unlock();
    },

    /* Удар литеры по бумаге */
    key() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: r(2600, 3800), q: 1.4, gain: r(0.22, 0.34), decay: r(0.025, 0.04) });
      tone(t, r(150, 210), { type: 'triangle', gain: 0.16, decay: 0.035, freqEnd: 90 });
      noise(t + 0.012, { type: 'highpass', freq: 5000, gain: 0.06, decay: 0.015 });
    },
    space() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 1400, q: 1, gain: 0.18, decay: 0.04 });
      tone(t, 120, { type: 'triangle', gain: 0.14, decay: 0.05, freqEnd: 70 });
    },
    /* Звонок и возврат каретки */
    ret() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 2093, { gain: 0.16, decay: 1.1 });
      tone(t, 2093 * 2.76, { gain: 0.05, decay: 0.6 });
      tone(t, 3520, { gain: 0.03, decay: 0.4 });
      for (let i = 0; i < 7; i++) noise(t + 0.08 + i * 0.026, { freq: 1800 + i * 120, q: 3, gain: 0.08, decay: 0.012 });
      noise(t + 0.3, { freq: 900, q: 1, gain: 0.22, decay: 0.05 });
    },
    /* Удар печати */
    thump() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 120, { gain: 0.9, decay: 0.22, freqEnd: 42 });
      noise(t, { type: 'lowpass', freq: 600, gain: 0.7, decay: 0.09 });
      noise(t, { freq: 1500, q: 0.8, gain: 0.25, decay: 0.03 });
      noise(t + 0.03, { type: 'lowpass', freq: 300, gain: 0.3, decay: 0.12 });
    },
    /* Шелест листа */
    paper(dur = 0.5) {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 900, freqEnd: 3200, q: 0.7, gain: 0.16, attack: dur * 0.35, decay: dur * 0.65 });
      noise(t + 0.02, { type: 'highpass', freq: 4000, gain: 0.05, attack: dur * 0.3, decay: dur * 0.5 });
    },
    /* Ручка по бумаге */
    scribble(dur = 0.8) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const n = Math.max(3, Math.round(dur / 0.11));
      for (let i = 0; i < n; i++) {
        noise(t + i * (dur / n) + r(0, 0.02), { freq: r(3000, 5200), q: 2.2, gain: r(0.05, 0.1), attack: 0.02, decay: dur / n * 0.8 });
      }
    },
    /* Кассовый принтер */
    printer(dur = 1.2) {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (let x = 0; x < dur; x += 0.016) {
        if (Math.random() < 0.15) continue;
        noise(t + x, { freq: r(2200, 3000), q: 4, gain: 0.07, decay: 0.008 });
      }
      tone(t, 110, { type: 'sawtooth', gain: 0.025, attack: 0.05, decay: dur });
    },
    /* Касса */
    cash() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [1318, 1975, 2637].forEach((f, i) => tone(t + i * 0.05, f, { type: 'triangle', gain: 0.12, decay: 0.7 }));
      for (let i = 0; i < 6; i++) noise(t + 0.15 + i * 0.03, { type: 'highpass', freq: 6000, gain: 0.05, decay: 0.05 });
    },
    click() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 2200, q: 2, gain: 0.25, decay: 0.02 });
      tone(t, 300, { type: 'triangle', gain: 0.12, decay: 0.03 });
    },
    tap() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: r(3500, 4500), q: 3, gain: 0.07, decay: 0.012 });
    },
    send() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 800, freqEnd: 4000, q: 1.2, gain: 0.12, attack: 0.06, decay: 0.18 });
      tone(t + 0.05, 880, { gain: 0.08, decay: 0.12, freqEnd: 1320 });
    },
    receive() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 1046, { gain: 0.18, decay: 0.28 });
      tone(t + 0.13, 1568, { gain: 0.16, decay: 0.45 });
    },
    pop() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 520, { gain: 0.14, decay: 0.08, freqEnd: 900 });
    },
    /* Прокатило: короткая фанфара */
    win() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => {
        tone(t + i * 0.09, f, { type: 'triangle', gain: 0.16, decay: i === 3 ? 0.7 : 0.18 });
        tone(t + i * 0.09, f * 2, { gain: 0.04, decay: 0.15 });
      });
    },
    /* Не прокатило: грустный тромбон «вау-вау-ваааа» */
    sad() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const notes = [[311, 0.32], [293, 0.32], [277, 0.32], [262, 1.1]];
      let at = t;
      notes.forEach(([f, d], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 1.03, at);
        o.frequency.exponentialRampToValueAtTime(f, at + 0.08);
        if (i === notes.length - 1) {
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.frequency.value = 6; lg.gain.value = 7;
          lfo.connect(lg).connect(o.frequency);
          lfo.start(at + 0.15); lfo.stop(at + d);
        }
        lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 2;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.12, at + 0.05);
        g.gain.setValueAtTime(0.12, at + d * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(lp).connect(g).connect(master);
        o.start(at); o.stop(at + d + 0.05);
        at += d + 0.04;
      });
    },
    /* Чек отрывается */
    rip() {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 9; i++) noise(t + i * 0.012 + r(0, 0.006), { freq: r(2500, 6500), q: 1.5, gain: r(0.12, 0.22), decay: 0.02 });
      noise(t, { type: 'highpass', freq: 3000, gain: 0.12, attack: 0.01, decay: 0.12 });
    },
    /* Промах: штамп по сукну */
    thud() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 90, { gain: 0.5, decay: 0.14, freqEnd: 45 });
      noise(t, { type: 'lowpass', freq: 350, gain: 0.35, decay: 0.08 });
    },
    slide() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { type: 'lowpass', freq: 500, freqEnd: 1600, gain: 0.25, attack: 0.15, decay: 0.45 });
      tone(t + 0.55, 90, { gain: 0.35, decay: 0.12, freqEnd: 50 });
    }
  };
  return S;
})();
