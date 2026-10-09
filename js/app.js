(() => {
  'use strict';

  const D = window.OTMAZKA_DATA;
  const S = window.Sound;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = $('#stage'), world = $('#world'), fx = $('#fx');
  const scenes = [$('#scene-home'), $('#scene-pay'), $('#scene-gen')];
  const papers = [$('.paper--home'), $('.paper--pay'), $('.paper--gen')];
  const phoneWrap = $('.phone-wrap'), tagBtn = $('.tag-btn');

  /* ---------- Масштаб сцены под окно ----------
     Компьютер: сцена 1600×900. Телефон (узкий или вертикальный экран):
     сцена ~440 единиц в ширину и вертикальная раскладка (body.m в CSS). */
  let K = 1, DW = 1600, DH = 900, MOBILE = false, onLayout = null;
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const T = (desk, touch) => (TOUCH ? touch : desk);
  function fit() {
    const m = innerWidth < 760 || innerWidth / innerHeight < .8;
    const changed = m !== MOBILE;
    MOBILE = m;
    document.body.classList.toggle('m', m);
    if (m) { K = Math.min(innerWidth / 440, innerHeight / 780, 1.6); DW = innerWidth / K; DH = innerHeight / K; }
    else { K = Math.min(innerHeight / 900, innerWidth / 1440); DW = 1600; DH = 900; }
    stage.style.width = `${DW}px`;
    stage.style.height = `${DH}px`;
    stage.style.setProperty('--phone-h', `${Math.round(Math.min(820, DH - 120))}px`);
    stage.style.transform = `translate(-50%, -50%) scale(${K})`;
    if (onLayout) onLayout(changed);
  }
  /* Видимая часть сцены (на широком мониторе края сцены обрезаны окном) */
  function viewBox() {
    const vw = innerWidth / K, vh = innerHeight / K;
    const x0 = Math.max(0, (DW - vw) / 2), y0 = Math.max(0, (DH - vh) / 2);
    return { x0, y0, x1: DW - x0, y1: DH - y0 };
  }
  addEventListener('resize', fit);
  fit();

  /* ---------- Даты ---------- */
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const DATE = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const MONTHS = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];
  const WDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  $$('[data-date]').forEach(el => { el.textContent = DATE; });
  $('[data-cal="month"]').textContent = MONTHS[now.getMonth()];
  $('[data-cal="day"]').textContent = now.getDate();
  $('[data-cal="wd"]').textContent = WDAYS[now.getDay()];
  $('[data-r="dt"]').textContent = `${DATE} ${clock(now)}`;

  /* Штрихкод на чеке */
  (() => {
    let x = 0;
    const stops = [];
    while (x < 100) {
      const w = rand(.4, 2.2), gap = rand(.5, 1.8);
      stops.push(`#222 ${x.toFixed(2)}% ${(x + w).toFixed(2)}%`, `transparent ${(x + w).toFixed(2)}% ${(x + w + gap).toFixed(2)}%`);
      x += w + gap;
    }
    $('[data-r="bar"]').style.background = `linear-gradient(90deg, ${stops.join(',')})`;
  })();

  /* ---------- Управление запусками: всё отменяемое ---------- */
  let RUN = 0;
  const timers = new Set(), anims = new Set();
  const k = ms => (RM ? ms * .25 : ms);
  function sleep(ms) {
    return new Promise(res => {
      const id = setTimeout(() => { timers.delete(id); res(); }, k(ms));
      timers.add(id);
    });
  }
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, k(ms));
    timers.add(id);
  }
  /* Временная анимация: отменяется при сбросе */
  function play(el, frames, opts) {
    const a = el.animate(frames, typeof opts === 'number' ? { duration: k(opts) } : { ...opts, duration: k(opts.duration), delay: k(opts.delay || 0) });
    anims.add(a);
    a.finished.then(() => anims.delete(a), () => anims.delete(a));
    return a;
  }
  const done = a => a.finished.catch(() => new Promise(() => {}));
  const ease = {
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  };
  /* Покадровая анимация для того, что двигается вместе (штамп и его тень) */
  function tween(ms, step, fn = ease.out) {
    const tok = RUN, d = Math.max(1, k(ms));
    return new Promise(res => {
      const t0 = performance.now();
      const f = t => {
        if (tok !== RUN) return;
        const q = Math.min(1, (t - t0) / d);
        step(fn(q));
        if (q < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
  }

  /* ---------- Геометрия: экран → сцена → локальные координаты элемента ---------- */
  function stageXY(cx, cy) {
    const r = stage.getBoundingClientRect();
    return { x: (cx - r.left) / K, y: (cy - r.top) / K };
  }
  function stageRect(el) {
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: (r.left - s.left) / K, y: (r.top - s.top) / K, w: r.width / K, h: r.height / K };
  }
  /* Точка курсора в координатах повёрнутого элемента (угол поворота известен) */
  function toLocal(el, cx, cy, angle) {
    const r = el.getBoundingClientRect();
    const dx = (cx - (r.left + r.width / 2)) / K, dy = (cy - (r.top + r.height / 2)) / K;
    const a = -angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    const w = el.offsetWidth, h = el.offsetHeight;
    return { x: w / 2 + lx, y: h / 2 + ly, inside: Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2 };
  }

  /* ---------- Тряска стола и отдача листа ---------- */
  function shake(power = 1) {
    if (RM) return;
    const p = power;
    play(world, [
      { transform: 'none' },
      { transform: `translate(${-6 * p}px, ${4 * p}px) rotate(${-.18 * p}deg)` },
      { transform: `translate(${5 * p}px, ${-3 * p}px) rotate(${.14 * p}deg)` },
      { transform: `translate(${-3 * p}px, ${2 * p}px)` },
      { transform: `translate(${1.5 * p}px, ${-1 * p}px)` },
      { transform: 'none' }
    ], { duration: 360, easing: 'cubic-bezier(.2,.6,.3,1)' });
  }
  function recoil(el, power = 1) {
    if (!el || RM) return;
    play(el, [
      { translate: '0 0', scale: '1' },
      { translate: `0 ${3 * power}px`, scale: '.994' },
      { translate: '0 -1px', scale: '1.002' },
      { translate: '0 0', scale: '1' }
    ], { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }

  /* ---------- Оттиски печатей ---------- */
  /* Места печатей по умолчанию; на телефоне лист уже — круглую печать сдвигаем */
  const STAMP_M = { hr: ['196px', '236px'] };
  $$('.stamp').forEach(s => { s.dataset.dl = s.style.left; s.dataset.dt = s.style.top; });
  function stampDefaults() {
    $$('.stamp').forEach(s => {
      const m = MOBILE && STAMP_M[s.dataset.stamp];
      s.dataset.l = m ? m[0] : s.dataset.dl;
      s.dataset.t = m ? m[1] : s.dataset.dt;
      if (!s.classList.contains('inked')) { s.style.left = s.dataset.l; s.style.top = s.dataset.t; }
    });
  }
  stampDefaults();
  function inkVars(stamp, rot) {
    stamp.style.setProperty('--rr', `${rot}deg`);
    stamp.style.setProperty('--mx', `${rand(0, 170).toFixed(0)}px`);
    stamp.style.setProperty('--my', `${rand(0, 170).toFixed(0)}px`);
    stamp.style.setProperty('--ma', `${rand(0, 360).toFixed(0)}deg`);
  }
  function impress(stamp, x, y, rot, power = 1) {
    const w = stamp.offsetWidth, h = stamp.offsetHeight;
    stamp.style.left = `${(x - w / 2).toFixed(1)}px`;
    stamp.style.top = `${(y - h / 2).toFixed(1)}px`;
    inkVars(stamp, rot);
    stamp.classList.add('inked');
    play(stamp, [
      { opacity: 0, transform: `rotate(${rot}deg) scale(1.025)` },
      { opacity: 1, transform: `rotate(${rot}deg) scale(1)`, offset: .25 },
      { opacity: .9, transform: `rotate(${rot}deg) scale(1)` }
    ], { duration: 900, easing: 'ease-out' });
    S.thump();
    shake(power);
    recoil(stamp.closest('.paper, .phone-wrap'), power);
  }
  function stampReset(stamp) {
    stamp.style.left = stamp.dataset.l;
    stamp.style.top = stamp.dataset.t;
    stamp.classList.remove('inked');
  }
  function stampInstant(stamp) {
    inkVars(stamp, parseFloat(stamp.style.getPropertyValue('--r')) || -8);
    stamp.classList.add('inked');
  }
  /* Рамка «М. П.» там, где печать стоит по умолчанию */
  function placeMp(mp, stamp) {
    mp.style.left = stamp.style.left;
    mp.style.top = stamp.style.top;
    mp.style.width = `${stamp.offsetWidth}px`;
    mp.style.height = `${stamp.offsetHeight}px`;
    mp.style.rotate = stamp.style.getPropertyValue('--r');
  }

  /* ---------- Лист снимают со стопки (клон улетает, под ним новый) ---------- */
  function peel(paper, dir = -1) {
    const g = paper.cloneNode(true);
    g.classList.add('ghost');
    $$('[id]', g).forEach(el => el.removeAttribute('id'));
    $$('.caret', g).forEach(el => el.remove());
    $$('.hl, .on, .pullable, .typing-on', g).forEach(el => el.classList.remove('hl', 'on', 'pullable', 'typing-on'));
    fx.appendChild(g);
    S.paper(.55);
    if (RM) {
      play(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      later(() => g.remove(), 450);
      return;
    }
    const x = dir * 1250, rz = dir * 15, ry = dir * 13;
    const T = 980;
    play(g, [
      { transform: 'perspective(1800px) translate3d(0,0,0) rotate(0deg) rotateX(0deg) rotateY(0deg) scale(1)', easing: 'cubic-bezier(.3,0,.6,1)' },
      { offset: .16, transform: `perspective(1800px) translate3d(${dir * 10}px,-16px,0) rotate(${dir * 1.2}deg) rotateX(7deg) rotateY(${ry * .35}deg) scale(1.025)`, easing: 'cubic-bezier(.45,0,.85,.5)' },
      { offset: .55, transform: `perspective(1800px) translate3d(${x * .38}px,-70px,0) rotate(${rz * .5}deg) rotateX(4deg) rotateY(${ry}deg) scale(1.045)`, easing: 'cubic-bezier(.3,.2,.7,1)' },
      { transform: `perspective(1800px) translate3d(${x}px,-150px,0) rotate(${rz}deg) rotateX(2deg) rotateY(${ry * .5}deg) scale(1.06)` }
    ], { duration: T, fill: 'forwards' });
    play($('.lift', g), [{ opacity: 0 }, { opacity: 1, offset: .18 }, { opacity: 1 }], { duration: T, fill: 'forwards' });
    play($('.bend', g), [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: .8 }], { duration: T, fill: 'forwards' });
    play($('.bend i', g), [{ transform: `translateX(${dir > 0 ? -30 : 30}%)` }, { transform: `translateX(${dir > 0 ? 25 : -25}%)` }], { duration: T, fill: 'forwards', easing: 'ease-in-out' });
    later(() => g.remove(), T + 40);
  }
  /* Нижний лист «выдыхает», когда верхний ушёл */
  function settle(paper, delay = 120) {
    play($('.shade', paper), [{ opacity: 1 }, { opacity: 1, offset: .15 }, { opacity: 0 }], { duration: 800, delay, easing: 'ease-out', fill: 'backwards' });
    play(paper, [{ translate: '0 3px', scale: '.996' }, { translate: '0 0', scale: '1' }], { duration: 700, delay: delay + 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }
  /* Первый лист кладут на стол */
  function place(paper) {
    S.paper(.6);
    play(paper, [
      { transform: 'translate(40px,-60px) rotate(3deg) scale(1.06)', opacity: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
      { opacity: 1, offset: .25 },
      { transform: 'none', opacity: 1 }
    ], { duration: 750 });
    play($('.lift', paper), [{ opacity: 1 }, { opacity: 0 }], { duration: 750, easing: 'ease-out' });
  }

  /* ---------- Буквы машинки: неровная плотность и посадка ---------- */
  function buildChars(el, text) {
    el.replaceChildren();
    const frag = document.createDocumentFragment(), spans = [];
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      if (ch !== ' ') {
        s.style.setProperty('--o', rand(.8, 1).toFixed(2));
        s.style.setProperty('--y', `${rand(-.7, .7).toFixed(2)}px`);
        if (Math.random() < .07) s.classList.add('hv');
      }
      frag.appendChild(s);
      spans.push(s);
    }
    el.appendChild(frag);
    return spans;
  }

  /* Ручка: надпись проявляется слева направо */
  async function handwrite(val, text) {
    val.replaceChildren();
    const w = document.createElement('span');
    w.className = 'w';
    w.textContent = text;
    val.appendChild(w);
    const dur = Math.max(450, text.length * 38);
    S.scribble(dur / 1000);
    const a = play(w, [{ clipPath: 'inset(-14px 100% -14px -6px)' }, { clipPath: 'inset(-14px -8px -14px -6px)' }], { duration: dur, easing: 'cubic-bezier(.4,.1,.6,.95)', fill: 'forwards' });
    await done(a);
    w.classList.add('done');
    anims.delete(a);
    a.cancel();
  }
  async function strike(val) {
    const w = $('.w', val);
    if (!w) return;
    const width = w.offsetWidth + 10;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'strike');
    svg.setAttribute('width', width);
    svg.setAttribute('viewBox', `0 0 ${width} 22`);
    svg.innerHTML = `<path pathLength="1" d="M2 ${rand(12, 15).toFixed(1)} C ${width * .3} ${rand(8, 12).toFixed(1)}, ${width * .6} ${rand(14, 18).toFixed(1)}, ${width - 2} ${rand(9, 13).toFixed(1)}"/>`;
    val.appendChild(svg);
    S.scribble(.35);
    await done(play($('path', svg), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 380, easing: 'ease-in-out', fill: 'forwards' }));
    await sleep(380);
    const fade = play(val, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    await done(fade);
    val.replaceChildren();
    fade.cancel();
  }

  /* ======================= Подсказки ======================= */
  const Hint = (() => {
    const el = $('[data-hint]'), stepEl = $('[data-hint-step]'), textEl = $('[data-hint-text]'), subEl = $('[data-hint-sub]');
    let cur = null, hlEl = null, flashT = 0, enabled = true;
    try { enabled = localStorage.getItem('otmazka-hints') !== 'off'; } catch (e) {}
    document.body.classList.toggle('no-hints', !enabled);

    function anchor(c) {
      let x, y, w = 0, h = 0;
      if (c.point) ({ x, y } = c.point);
      else ({ x, y, w, h } = stageRect(c.target));
      const g = c.gap == null ? 8 : c.gap;
      if (c.side === 'left') return { x: x - g, y: y + h / 2 };
      if (c.side === 'right') return { x: x + w + g, y: y + h / 2 };
      if (c.side === 'top') return { x: x + w / 2, y: y - g };
      return { x: x + w / 2, y: y + h + g };
    }
    /* Ставим ярлычок с нужной стороны; если вылезает за экран — пробуем другие и подвигаем */
    function place(c) {
      const v = viewBox(), m = 6;
      const sides = [...new Set([c.side || 'left', 'bottom', 'top', 'left', 'right'])];
      const put = (side, dx = 0, dy = 0) => {
        el.dataset.side = side;
        const a = anchor({ ...c, side });
        el.style.left = `${a.x + (c.dx || 0) + dx}px`;
        el.style.top = `${a.y + (c.dy || 0) + dy}px`;
        const r = stageRect(el);
        return { r, over: Math.max(0, v.x0 + m - r.x) + Math.max(0, r.x + r.w - (v.x1 - m)) + Math.max(0, v.y0 + m - r.y) + Math.max(0, r.y + r.h - (v.y1 - m)) };
      };
      let best = null;
      for (const side of sides) {
        const t = put(side);
        if (t.over === 0) return;
        if (!best || t.over < best.over) best = { side, ...t };
      }
      const r = put(best.side).r;
      let dx = 0, dy = 0;
      if (r.x < v.x0 + m) dx = v.x0 + m - r.x; else if (r.x + r.w > v.x1 - m) dx = v.x1 - m - r.x - r.w;
      if (r.y < v.y0 + m) dy = v.y0 + m - r.y; else if (r.y + r.h > v.y1 - m) dy = v.y1 - m - r.y - r.h;
      put(best.side, dx, dy);
    }
    function show(c) {
      cur = c;
      if (hlEl) hlEl.classList.remove('hl');
      hlEl = c.hl === false ? null : (c.target || null);
      if (hlEl) hlEl.classList.add('hl');
      stepEl.textContent = c.step ? `ШАГ ${c.step}` : '';
      textEl.textContent = c.text;
      subEl.textContent = c.sub || '';
      place(c);
      el.classList.remove('in', 'flash');
      void el.offsetWidth;
      el.classList.add('in');
    }
    function hide() {
      cur = null;
      if (hlEl) hlEl.classList.remove('hl');
      hlEl = null;
      el.classList.remove('in', 'flash');
    }
    function flash(text, ms = 1600) {
      if (!cur) return;
      const keep = cur;
      textEl.textContent = text;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      clearTimeout(flashT);
      flashT = setTimeout(() => { if (cur === keep) { textEl.textContent = keep.text; el.classList.remove('flash'); } }, ms);
    }
    function toggle() {
      enabled = !enabled;
      document.body.classList.toggle('no-hints', !enabled);
      try { localStorage.setItem('otmazka-hints', enabled ? 'on' : 'off'); } catch (e) {}
    }
    return { show, hide, flash, toggle };
  })();

  /* ======================= Штамп в руке ======================= */
  const Tool = (() => {
    const el = $('[data-tool]'), sh = $('[data-tool-shadow]'), label = $('.label', el), pad = $('.inkpad');
    const REST_R = -8, HELD_S = 1.24;
    let state = 'rest', target = null, w = 186, h = 186;
    const restS = () => (MOBILE ? .7 : .76);
    const rest = () => (MOBILE ? { x: DW - 76, y: DH - 50 } : { x: 1325, y: 772 });
    /* На телефоне штамп без дела прячется за нижний край вместе с подушкой */
    const home = () => (MOBILE && !target ? { x: DW - 76, y: DH + 180 } : rest());
    let pos = home(), s = restS(), r = REST_R, cursor = { ...pos }, moved = 0, loop = 0, pickedAt = 0;

    function setShape(stamp, txt) {
      const round = stamp.classList.contains('stamp--round');
      w = stamp.offsetWidth; h = stamp.offsetHeight;
      [el, sh].forEach(x => {
        x.classList.toggle('round', round);
        x.style.width = `${w}px`;
        x.style.height = `${h}px`;
      });
      label.textContent = txt || '';
      label.style.display = round ? 'none' : '';
      render();
    }
    function render() {
      el.style.transform = `translate(${pos.x - w / 2}px, ${pos.y - h / 2}px) rotate(${r}deg) scale(${s})`;
      const lift = clamp((s - 1) / .3, 0, 1);
      const resting = state === 'rest';
      const ox = resting ? 6 : 6 + lift * 70, oy = resting ? 9 : 8 + lift * 90;
      const ss = resting ? s * 1.02 : s * (1 + lift * .22);
      sh.style.transform = `translate(${pos.x - w / 2 + ox}px, ${pos.y - h / 2 + oy}px) rotate(${r}deg) scale(${ss})`;
      sh.style.opacity = resting ? '.7' : (.9 - lift * .45).toFixed(2);
    }
    function slideTo(to, ms = 420) {
      const a = { ...pos };
      return tween(ms, q => { pos.x = a.x + (to.x - a.x) * q; pos.y = a.y + (to.y - a.y) * q; render(); }, ease.out);
    }
    async function arm(t) {
      target = t;
      setShape(t.stamp, t.label);
      if (t.mp) { placeMp(t.mp, t.stamp); t.mp.classList.add('on'); }
      if (MOBILE && state === 'rest') {
        pad.classList.add('in');
        s = restS();
        await slideTo(rest());
      }
      if (target === t && state === 'rest') el.classList.add('armed');
    }
    function disarm() {
      cancelAnimationFrame(loop); loop = 0;
      if (target && target.mp) target.mp.classList.remove('on');
      target = null; state = 'rest';
      pos = home(); s = restS(); r = REST_R;
      el.classList.remove('armed');
      document.body.classList.remove('holding');
      pad.classList.remove('in');
      render();
    }
    function relayout() {
      if (state !== 'rest') return;
      pos = home(); s = restS();
      pad.classList.toggle('in', MOBILE && !!target);
      render();
    }
    function follow() {
      let lastX = pos.x;
      const f = () => {
        if (state !== 'held') { loop = 0; return; }
        pos.x += (cursor.x - pos.x) * .34;
        pos.y += (cursor.y - pos.y) * .34;
        s += (HELD_S - s) * .2;
        const vx = pos.x - lastX;
        lastX = pos.x;
        r += (-9 + clamp(vx * .5, -12, 12) - r) * .18;
        render();
        loop = requestAnimationFrame(f);
      };
      cancelAnimationFrame(loop);
      loop = requestAnimationFrame(f);
    }
    function pickUp(e) {
      state = 'held'; moved = 0; pickedAt = performance.now();
      cursor = stageXY(e.clientX, e.clientY);
      el.classList.remove('armed');
      document.body.classList.add('holding');
      S.tap();
      follow();
      if (target.onPick) target.onPick();
    }
    async function attempt(e) {
      if (state !== 'held') return;
      state = 'busy';
      cancelAnimationFrame(loop);
      const t = target, p = stageXY(e.clientX, e.clientY);
      const L = toLocal(t.container, e.clientX, e.clientY, t.angle);
      const s0 = s, x0 = pos.x, y0 = pos.y;
      /* Опускаем штамп: тень сжимается под ним */
      await tween(150, q => { s = s0 + (1 - s0) * q; pos.x = x0 + (p.x - x0) * q; pos.y = y0 + (p.y - y0) * q; render(); }, ease.in);
      if (L.inside) {
        let { x, y } = L;
        if (t.mp) {
          /* Лёгкий магнит к «М. П.», чтобы оттиск ложился аккуратнее */
          const mx = t.mp.offsetLeft + t.mp.offsetWidth / 2, my = t.mp.offsetTop + t.mp.offsetHeight / 2;
          if (Math.hypot(x - mx, y - my) < 70) { x += (mx - x) * .55; y += (my - y) * .55; }
          t.mp.classList.remove('on');
        }
        impress(t.stamp, x, y, r - t.angle + rand(-1.5, 1.5), t.power || 1);
        await tween(100, q => { s = 1 - .035 * Math.sin(q * Math.PI); render(); });
        /* Поднимаем и возвращаем на подушку */
        const x1 = pos.x, y1 = pos.y, r1 = r, to = rest(), rs = restS();
        await tween(600, q => {
          pos.x = x1 + (to.x - x1) * q;
          pos.y = y1 + (to.y - y1) * q - Math.sin(q * Math.PI) * 50;
          s = 1 + (rs - 1) * q + Math.sin(q * Math.PI) * .34;
          r = r1 + (REST_R - r1) * q;
          render();
        }, ease.inOut);
        state = 'rest'; target = null;
        document.body.classList.remove('holding');
        render();
        S.tap();
        if (MOBILE) {
          pad.classList.remove('in');
          later(() => { if (state === 'rest' && !target) slideTo(home(), 380); }, 250);
        }
        if (t.onDone) t.onDone();
      } else {
        S.thud();
        shake(.3);
        Hint.flash(t.missText || 'Мимо! Ставьте на документ');
        await tween(90, q => { s = 1 - .03 * Math.sin(q * Math.PI); render(); });
        state = 'held';
        follow();
      }
    }
    async function drop() {
      if (state !== 'held') return;
      state = 'busy';
      cancelAnimationFrame(loop);
      const x1 = pos.x, y1 = pos.y, s1 = s, r1 = r, to = rest(), rs = restS();
      await tween(420, q => { pos.x = x1 + (to.x - x1) * q; pos.y = y1 + (to.y - y1) * q; s = s1 + (rs - s1) * q; r = r1 + (REST_R - r1) * q; render(); }, ease.inOut);
      state = 'rest';
      el.classList.add('armed');
      document.body.classList.remove('holding');
      render();
    }

    el.addEventListener('pointerdown', e => {
      if (state === 'rest' && target) { e.preventDefault(); e.stopPropagation(); pickUp(e); }
    });
    addEventListener('pointermove', e => {
      if (state !== 'held') return;
      const p = stageXY(e.clientX, e.clientY);
      moved += Math.hypot(p.x - cursor.x, p.y - cursor.y);
      cursor = p;
    });
    /* Перетащил и отпустил — удар; просто кликнул — штамп остаётся в руке до следующего клика */
    addEventListener('pointerup', e => {
      if (state === 'held' && moved > 40 && performance.now() - pickedAt > 120) attempt(e);
    });
    addEventListener('pointerdown', e => {
      if (state === 'held' && !e.target.closest('.chrome')) { e.preventDefault(); attempt(e); }
    }, true);

    setShape($('[data-stamp="hr"]'));
    return {
      arm, disarm, drop, relayout,
      get held() { return state === 'held'; },
      top: () => { const p = rest(); return { x: p.x, y: p.y - h * restS() / 2 - 18 }; }
    };
  })();

  /* ======================= Машинка от любых клавиш ======================= */
  const Typer = (() => {
    let job = null, grace = 0, holdT = 0;

    function start(fields, o = {}) {
      stop();
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      job = { fields, fi: -1, perKey: o.perKey || 3, paper: o.paper || null, onDone: o.onDone, hold: o.holdEl || null, holding: false };
      if (job.hold) job.hold.classList.add('typing-on');
      load(0);
    }
    function load(fi) {
      job.fi = fi;
      const f = job.fields[fi];
      job.spans = buildChars(f.el, f.text);
      job.i = 0;
      const car = document.createElement('i');
      car.className = 'caret';
      f.el.appendChild(car);
      job.car = car;
      const s0 = job.spans[0];
      car.style.left = `${s0.offsetLeft}px`;
      car.style.top = `${s0.offsetTop + 5}px`;
      job.lastTop = s0.offsetTop;
    }
    function advance(n) {
      if (!job) return;
      let typed = 0, ch = '';
      while (typed < n && job.i < job.spans.length) {
        const s = job.spans[job.i];
        if (s.offsetTop > job.lastTop + 4) {
          /* Конец строки: звонок и возврат каретки */
          job.lastTop = s.offsetTop;
          S.ret();
          if (job.paper && !RM) play(job.paper, [{ translate: '4px 0' }, { translate: '-1px 0' }, { translate: '0 0' }], { duration: 260, easing: 'ease-out' });
          if (typed > 0) break;
        }
        s.classList.add('on');
        ch = s.textContent;
        job.i++;
        typed++;
        job.car.style.left = `${s.offsetLeft + s.offsetWidth + 1}px`;
        job.car.style.top = `${s.offsetTop + 5}px`;
      }
      if (typed) { if (ch === ' ') S.space(); else S.key(); }
      if (job.i >= job.spans.length) next();
    }
    function next() {
      job.car.remove();
      if (job.fi + 1 < job.fields.length) { load(job.fi + 1); return; }
      const cb = job.onDone;
      finish();
      grace = performance.now() + 1200;
      if (cb) cb();
    }
    function finish() {
      if (!job) return;
      if (job.car) job.car.remove();
      if (job.hold) job.hold.classList.remove('typing-on');
      clearTimeout(holdT);
      job = null;
    }
    function key() { if (job) advance(job.perKey + (Math.random() < .3 ? 1 : 0)); }
    /* Зажатая мышь печатает сама, в неровном ритме */
    function holdLoop() {
      if (!job || !job.holding) return;
      advance(1);
      if (!job) return;
      const ch = job.spans[job.i - 1] ? job.spans[job.i - 1].textContent : '';
      let d = 30 + rand(-10, 14);
      if (ch === ' ') d += rand(8, 30);
      if (',.!?:;—«»'.includes(ch)) d += rand(90, 180);
      holdT = setTimeout(holdLoop, k(d));
    }
    addEventListener('pointerdown', e => {
      if (!job || !job.hold || !job.hold.contains(e.target) || e.target.closest('button')) return;
      job.holding = true;
      advance(job.perKey);
      clearTimeout(holdT);
      holdT = setTimeout(holdLoop, k(240));
    });
    const end = () => { if (job) job.holding = false; clearTimeout(holdT); };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);

    function fillAll() {
      if (!job) return;
      job.spans.forEach(s => s.classList.add('on'));
      job.fields.slice(job.fi + 1).forEach(f => buildChars(f.el, f.text).forEach(s => s.classList.add('on')));
      finish();
    }
    function stop() { finish(); }
    return {
      start, key, fillAll, stop,
      get active() { return !!job; },
      get grace() { return performance.now() < grace; }
    };
  })();

  /* ======================= Подпись от руки ======================= */
  const Sign = (() => {
    const padEl = $('[data-sign-pad]'), path = $('.sign-user path'), defSvg = $('.sign-def'), def = $$('path', defSvg);
    let job = null, drawing = false, strokes = [], len = 0, lastSnd = 0, doneT = 0;

    const local = e => {
      const r = padEl.getBoundingClientRect();
      return { x: (e.clientX - r.left) / K, y: (e.clientY - r.top) / K };
    };
    function redraw() {
      let d = '';
      strokes.forEach(st => {
        if (!st.length) return;
        d += `M${st[0].x.toFixed(1)} ${st[0].y.toFixed(1)}`;
        for (let i = 1; i < st.length - 1; i++) {
          const mx = (st[i].x + st[i + 1].x) / 2, my = (st[i].y + st[i + 1].y) / 2;
          d += ` Q${st[i].x.toFixed(1)} ${st[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
        }
        const l = st[st.length - 1];
        d += ` L${l.x.toFixed(1)} ${l.y.toFixed(1)} `;
      });
      path.setAttribute('d', d);
    }
    function start(onDone) {
      clear();
      job = { onDone };
      padEl.classList.add('on');
    }
    async function autoDraw() {
      defSvg.classList.add('show');
      S.scribble(1.0);
      await done(play(def[0], [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' }));
      await done(play(def[1], [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }));
      def.forEach(p => { p.style.strokeDashoffset = 0; });
    }
    function finish() {
      if (!job) return;
      const cb = job.onDone;
      job = null;
      padEl.classList.remove('on');
      if (cb) cb();
    }
    padEl.addEventListener('pointerdown', e => {
      if (!job) return;
      e.preventDefault();
      clearTimeout(doneT);
      drawing = true;
      padEl.setPointerCapture(e.pointerId);
      strokes.push([local(e)]);
    });
    padEl.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = local(e), st = strokes[strokes.length - 1], q = st[st.length - 1];
      const dl = Math.hypot(p.x - q.x, p.y - q.y);
      if (dl < 1.5) return;
      len += dl;
      st.push(p);
      redraw();
      const t = performance.now();
      if (t - lastSnd > 90) { S.scribble(.12); lastSnd = t; }
    });
    const up = async () => {
      if (!drawing) return;
      drawing = false;
      if (len > 90) {
        /* Даём дописать ещё штрих, потом принимаем подпись */
        doneT = setTimeout(finish, 700);
      } else if (len < 12 && strokes.length === 1) {
        /* Просто клик — распишемся за пользователя */
        strokes = []; redraw();
        const j = job;
        await autoDraw();
        if (job === j) finish();
      }
    };
    padEl.addEventListener('pointerup', up);
    padEl.addEventListener('pointercancel', up);

    function clear() {
      clearTimeout(doneT);
      strokes = []; len = 0; drawing = false;
      redraw();
      defSvg.classList.remove('show');
      def.forEach(p => { p.getAnimations().forEach(a => a.cancel()); p.style.strokeDashoffset = ''; });
    }
    function instant() { clear(); defSvg.classList.add('show'); def.forEach(p => { p.style.strokeDashoffset = 0; }); }
    function stop() { job = null; drawing = false; clearTimeout(doneT); padEl.classList.remove('on'); }
    return { start, clear, instant, stop };
  })();

  /* ======================= Чек: вытянуть и оторвать ======================= */
  /* На компьютере чек выезжает вбок из-под листа, на телефоне — сверху, как из принтера */
  const RC = () => (MOBILE
    ? { axis: 'y', out: 200, tear: 330, mid: [10, 640], fin: [0, 790], rot: 3 }
    : { axis: 'x', out: 190, tear: 300, mid: [170, -34], fin: [-30, 40], rot: 5 });
  const rcT = v => (RC().axis === 'x'
    ? `translate(${v.toFixed(1)}px,0) rotate(${(v * .0045).toFixed(2)}deg)`
    : `translate(0,${v.toFixed(1)}px) rotate(${(-v * .002).toFixed(2)}deg)`);
  const Pull = (() => {
    const rc = $('[data-receipt]');
    let job = null, drag = null;

    function set(v) {
      job.v = v;
      rc.style.transform = rcT(v);
    }
    function start(onDone) {
      const c = RC();
      job = { v: c.out, onDone, tick: c.out };
      rc.classList.add('pullable');
    }
    function tear() {
      if (!job) return;
      const j = job;
      job = null; drag = null;
      rc.classList.remove('pullable', 'grabbing');
      S.rip();
      j.onDone(j.v);
    }
    rc.addEventListener('pointerdown', e => {
      if (!job) return;
      e.preventDefault();
      rc.setPointerCapture(e.pointerId);
      drag = { x0: e.clientX, y0: e.clientY, base: job.v, moved: 0 };
      rc.classList.add('grabbing');
    });
    rc.addEventListener('pointermove', e => {
      if (!job || !drag) return;
      const c = RC();
      const d = (c.axis === 'x' ? e.clientX - drag.x0 : e.clientY - drag.y0) / K;
      drag.moved = Math.max(drag.moved, Math.abs(d));
      const v = clamp(drag.base + (d > 0 ? d * .9 : d * .3), c.out - 12, c.tear + 20);
      if (Math.abs(v - job.tick) > 14) { S.tap(); job.tick = v; }
      set(v);
      if (v >= c.tear) tear();
    });
    rc.addEventListener('pointerup', async () => {
      if (!job || !drag) return;
      const d = drag, c = RC();
      drag = null;
      rc.classList.remove('grabbing');
      const v0 = job.v;
      if (d.moved < 6) {
        S.printer(.35);
        await tween(380, q => set(v0 + (c.tear - v0) * q), ease.inOut);
        tear();
      } else if (v0 < c.tear) {
        await tween(300, q => { if (job) set(v0 + (c.out - v0) * q); }, ease.out);
      }
    });
    function stop() { job = null; drag = null; rc.classList.remove('pullable', 'grabbing'); }
    return { start, stop };
  })();

  /* ---------- Сброс всего, что идёт сейчас ---------- */
  function cancelAll() {
    RUN++;
    timers.forEach(clearTimeout); timers.clear();
    anims.forEach(a => { try { a.cancel(); } catch (e) {} }); anims.clear();
    fx.replaceChildren();
    Typer.stop();
    Sign.stop();
    Pull.stop();
    Tool.disarm();
    Hint.hide();
    $$('.mp.on').forEach(m => m.classList.remove('on'));
  }

  /* ---------- Состояние ---------- */
  let screen = -1;
  const state = { sit: 0, lvl: 3, tally: 0, current: null, sends: 0 };
  const used = {};
  function setScreenAttr(n) { document.body.dataset.screen = n; }

  /* ======================= 1. ГЛАВНАЯ ======================= */
  const home = {
    sheet: $('.paper--home .sheet'),
    vals: $$('.paper--home .val'),
    stamp: $('[data-stamp="hr"]'),
    mp: $('[data-mp="hr"]'),
    btn: $('[data-act="start"]'),
    reset() {
      this.vals.forEach(v => { v.replaceChildren(); v.style.opacity = ''; });
      stampReset(this.stamp);
      this.btn.classList.remove('pressed', 'nudge');
    },
    armStamp() {
      Tool.arm({
        stamp: this.stamp, container: this.sheet, angle: -.5, mp: this.mp, power: .9,
        onPick: () => Hint.show({ target: this.mp, side: 'right', hl: false, step: '1 ИЗ 2', text: 'Шлёпните на «М. П.»', sub: T('клик — удар печатью', 'тап — удар печатью') }),
        onDone: () => {
          Hint.show({ target: this.btn, side: 'left', step: '2 ИЗ 2', text: 'Проверено! Жмите кнопку' });
          this.btn.classList.add('nudge');
        }
      });
      Hint.show({ point: Tool.top(), side: 'top', hl: false, step: '1 ИЗ 2', text: 'Возьмите печать', sub: T('кликните по штампу', 'нажмите на штамп') });
    },
    async enter(intro) {
      const tok = RUN;
      const [name, reason, delay] = this.vals;
      if (intro) { place(papers[0]); await sleep(900); } else await sleep(650);
      await handwrite(name, 'Смирнов А. А.');
      await sleep(140);
      await handwrite(reason, D.HOME_REASONS[0][0]);
      await sleep(140);
      await handwrite(delay, D.HOME_REASONS[0][1]);
      await sleep(260);
      this.armStamp();
      /* Причины меняются по кругу: зачеркнуть и вписать новую */
      let i = 0;
      while (tok === RUN) {
        await sleep(4200);
        i = (i + 1) % D.HOME_REASONS.length;
        await Promise.all([strike(reason), sleep(150).then(() => strike(delay))]);
        await handwrite(reason, D.HOME_REASONS[i][0]);
        await sleep(100);
        await handwrite(delay, D.HOME_REASONS[i][1]);
      }
    }
  };

  /* ======================= 2. ОПЛАТА ======================= */
  const pay = {
    sheet: $('.paper--pay .sheet'),
    fieldsBox: $('.pfields'),
    fields: $$('.paper--pay .pv'),
    btn: $('[data-act="pay"]'),
    receipt: $('[data-receipt]'),
    stamp: $('[data-stamp="paid"]'),
    mp: $('[data-mp="paid"]'),
    busy: false,
    reset() {
      this.busy = false;
      this.fields.forEach(f => f.replaceChildren());
      this.btn.textContent = 'Оплатить 149 ₽';
      this.btn.classList.remove('pressed', 'nudge');
      this.btn.disabled = false;
      this.receipt.style.cssText = '';
      stampReset(this.stamp);
    },
    async enter() {
      await sleep(600);
      if (this.busy) return;
      Typer.start(this.fields.map(f => ({ el: f, text: f.dataset.p })), {
        perKey: 2, holdEl: this.sheet,
        onDone: () => this.hintPay()
      });
      Hint.show({ target: this.fieldsBox, side: 'right', step: '1 ИЗ 4', text: 'Заполните квитанцию', sub: T('стучите по любым клавишам\nили зажмите мышь на листе.\nКарта тестовая, вводить ничего не нужно', 'стучите пальцем по листу\nили зажмите его.\nКарта тестовая, вводить ничего не нужно') });
    },
    hintPay() {
      if (this.busy) return;
      Hint.show({ target: this.btn, side: 'left', step: '2 ИЗ 4', text: 'Оплатите', sub: 'деньги не спишутся' });
      this.btn.classList.add('nudge');
    },
    async pay() {
      if (this.busy) return;
      this.busy = true;
      Typer.fillAll();
      this.fields.forEach(f => { if (!f.querySelector('.ch')) buildChars(f, f.dataset.p).forEach(c => c.classList.add('on')); });
      Hint.hide();
      const b = this.btn, rc = this.receipt;
      b.classList.remove('nudge');
      b.classList.add('pressed');
      S.click();
      await sleep(140);
      b.classList.remove('pressed');
      b.disabled = true;
      b.textContent = 'Печатаем чек…';

      /* Принтер выдвигает чек рывками, наполовину */
      S.printer(.9);
      const c = RC(), steps = 6, frames = [{ transform: rcT(0) }];
      for (let s = 1; s <= steps; s++) {
        const v = c.out * s / steps;
        frames.push({ offset: (s - .45) / steps, transform: rcT(v - 4), easing: 'ease-out' });
        frames.push({ offset: s / steps, transform: rcT(v) });
      }
      const a = play(rc, frames, { duration: 900, fill: 'forwards' });
      await done(a);
      rc.style.transform = rcT(c.out);
      anims.delete(a); a.cancel();
      b.textContent = 'Чек готов';
      Pull.start(x => this.placeReceipt(x));
      Hint.show({ target: rc, side: MOBILE ? 'bottom' : 'right', step: '3 ИЗ 4', text: 'Оторвите чек', sub: MOBILE ? 'потяните его вниз' : 'потяните его вправо' });
    },
    async placeReceipt(x) {
      const rc = this.receipt, c = RC();
      Hint.hide();
      rc.style.zIndex = 3;
      S.paper(.4);
      const toSheet = play(rc, [
        { transform: `${rcT(x)} scale(1)`, easing: 'cubic-bezier(.3,0,.3,1)' },
        { offset: .45, transform: `translate(${c.mid[0]}px,${c.mid[1]}px) rotate(${c.rot - 2}deg) scale(1.07)`, easing: 'cubic-bezier(.5,0,.4,1)' },
        { transform: `translate(${c.fin[0]}px,${c.fin[1]}px) rotate(${c.rot}deg) scale(1)` }
      ], { duration: 820, fill: 'forwards' });
      play($('.r-shadow', rc), [{ transform: 'none', opacity: 1 }, { offset: .45, transform: 'translate(14px,22px) scale(1.04)', opacity: .7 }, { transform: 'none', opacity: 1 }], { duration: 820 });
      await done(toSheet);
      rc.style.transform = `translate(${c.fin[0]}px,${c.fin[1]}px) rotate(${c.rot}deg)`;
      anims.delete(toSheet); toSheet.cancel();
      S.cash();
      await sleep(250);
      Tool.arm({
        stamp: this.stamp, container: rc, angle: c.rot - .5, mp: this.mp, power: .8, label: 'ОПЛАЧЕНО',
        missText: 'Мимо! Ставьте на чек',
        onPick: () => Hint.show({ target: this.mp, side: 'right', hl: false, step: '4 ИЗ 4', text: 'Погасите чек', sub: 'шлёпните на «М. П.»' }),
        onDone: async () => {
          Hint.hide();
          this.btn.textContent = 'Оплачено ✓';
          await sleep(1400);
          go(2);
        }
      });
      Hint.show({ point: Tool.top(), side: 'top', hl: false, step: '4 ИЗ 4', text: 'Возьмите печать', sub: 'и поставьте «ОПЛАЧЕНО» на чек' });
    }
  };

  /* ======================= 3. ГЕНЕРАТОР ======================= */
  const gen = {
    sheet: $('[data-gen-sheet]'),
    title: $('[data-g="title"]'),
    body: $('[data-g="body"]'),
    inNo: $('[data-g="in"]'),
    stampText: $('[data-g="stamp"]'),
    signRow: $('.sign'),
    signPad: $('[data-sign-pad]'),
    stamp: $('[data-stamp="gen"]'),
    mp: $('[data-mp="gen"]'),
    actions: $('[data-actions]'),
    sendBtn: $('[data-act="send"]'),
    opts: $('[data-opts]'),
    dots: $('[data-dots]'),
    levelLabel: $('[data-level-label]'),
    tallyEl: $('[data-tally]'),
    no: 43,
    busy: false,

    build() {
      this.opts.innerHTML = D.SITUATIONS.map((s, i) => `<button class="opt" type="button" data-sit="${i}">${s.label}<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path pathLength="1" d=""/></svg></button>`).join('');
      this.dots.innerHTML = D.LEVELS.map((l, i) => `<button class="dot" type="button" data-lvl="${i + 1}" aria-label="${l}"></button>`).join('');
      this.opts.addEventListener('click', e => {
        const b = e.target.closest('.opt'); if (!b) return;
        state.sit = +b.dataset.sit; this.renderSit(true); S.scribble(.3);
        if (screen === 2) this.regen();
      });
      this.dots.addEventListener('click', e => {
        const b = e.target.closest('.dot'); if (!b) return;
        state.lvl = +b.dataset.lvl; this.renderLvl(true); S.tap();
        if (screen === 2) this.regen();
      });
    },
    renderSit(animate) {
      $$('.opt', this.opts).forEach((b, i) => {
        const on = i === state.sit;
        b.classList.toggle('sel', on);
        const p = $('path', b);
        if (on) {
          const j = () => +rand(-2, 2).toFixed(1);
          p.setAttribute('d', `M${12 + j()},${7 + j()} C30,${-1 + j()} 86,${j()} 96,${13 + j()} C104,${27 + j()} 58,${35 + j()} 26,${31 + j()} C2,${28 + j()} -3,${14 + j()} 14,${6 + j()} C24,${2 + j()} 40,${3 + j()} 54,${4 + j()}`);
          if (animate && !RM) p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
          else p.style.strokeDashoffset = 0;
        } else {
          p.getAnimations().forEach(a => a.cancel());
          p.style.strokeDashoffset = '';
        }
      });
    },
    renderLvl(animate) {
      $$('.dot', this.dots).forEach((d, i) => {
        const on = i < state.lvl;
        if (animate && on) { d.classList.remove('on'); void d.offsetWidth; d.style.setProperty('--dd', `${i * .05}s`); }
        else d.style.setProperty('--dd', '0s');
        d.classList.toggle('on', on);
      });
      this.levelLabel.textContent = D.LEVELS[state.lvl - 1];
    },
    renderTally() {
      const n = state.tally, groups = [];
      for (let g = 0; g < Math.ceil(n / 5); g++) {
        const c = Math.min(5, n - g * 5);
        let h = '';
        for (let s = 0; s < Math.min(4, c); s++) h += `<i style="--tr:${rand(-6, 6).toFixed(1)}deg"></i>`;
        if (c === 5) h += '<b></b>';
        groups.push(`<span class="tgrp">${h}</span>`);
      }
      this.tallyEl.innerHTML = groups.join('');
      /* Анимируем только новую палочку */
      $$('i, b', this.tallyEl).forEach((el, i, all) => { if (i < all.length - 1) el.style.animation = 'none'; });
    },
    clearSheet() {
      this.body.replaceChildren();
      Sign.clear();
      stampReset(this.stamp);
      this.mp.classList.remove('on');
      this.actions.classList.remove('in');
    },
    pickExcuse() {
      const key = D.SITUATIONS[state.sit].key, list = D.EXCUSES[key];
      let pool = list.filter(e => e[0] === state.lvl);
      if (pool.length < 2) pool = list.filter(e => Math.abs(e[0] - state.lvl) <= 1);
      const u = used[key] || (used[key] = []);
      let fresh = pool.filter(e => !u.includes(e[1]));
      if (!fresh.length) { u.length = 0; fresh = pool.filter(e => e[1] !== (state.current && state.current.text)); }
      const e = pick(fresh.length ? fresh : pool);
      u.push(e[1]);
      return e[1];
    },
    setHeader() {
      const s = D.SITUATIONS[state.sit];
      this.title.textContent = s.title;
      this.stampText.textContent = s.stamp;
      this.inNo.textContent = `ВХ. № ${String(this.no).padStart(4, '0')} · ${DATE}`;
    },
    /* Печать по умолчанию — над строкой подписи */
    stampHome() {
      this.stamp.style.left = MOBILE ? '40px' : '150px';
      this.stamp.style.top = `${this.signRow.offsetTop - 34}px`;
    },
    reset() {
      this.busy = false;
      this.clearSheet();
      this.setHeader();
    },
    async generate(withPeel) {
      this.busy = true;
      state.current = null;
      const p = papers[2];
      if (withPeel) { peel(p, 1); settle(p); this.no++; }
      this.clearSheet();
      this.setHeader();
      const text = this.pickExcuse();
      await sleep(withPeel ? 650 : 250);
      Typer.start([{ el: this.body, text }], { perKey: 3, paper: p, holdEl: this.sheet, onDone: () => this.toSign(text) });
      Hint.show({ target: this.body, side: 'right', step: '1 ИЗ 4', text: 'Печатайте объяснительную', sub: T('стучите по любым клавишам\nили зажмите мышь на листе', 'стучите пальцем по листу\nили зажмите его') });
    },
    toSign(text) {
      Hint.show({ target: this.signPad, side: 'bottom', hl: false, step: '2 ИЗ 4', text: 'Распишитесь', sub: T('зажмите мышь и ведите.\nПросто клик — распишемся за вас', 'проведите пальцем по полю.\nПросто тап — распишемся за вас') });
      Sign.start(() => this.toStamp(text));
    },
    toStamp(text) {
      this.stampHome();
      const sit = D.SITUATIONS[state.sit];
      Tool.arm({
        stamp: this.stamp, container: this.sheet, angle: -.5, mp: this.mp, power: 1.1, label: sit.stamp,
        onPick: () => Hint.show({ target: this.mp, side: 'bottom', hl: false, step: '3 ИЗ 4', text: 'Шлёпните на «М. П.»' }),
        onDone: () => this.finish(text)
      });
      Hint.show({ point: Tool.top(), side: 'top', hl: false, step: '3 ИЗ 4', text: 'Поставьте печать', sub: `возьмите штамп «${sit.stamp}»` });
    },
    async finish(text) {
      state.current = { sit: state.sit, text };
      state.tally++;
      this.renderTally();
      await sleep(250);
      this.actions.classList.add('in');
      this.busy = false;
      await sleep(450);
      Hint.show({ target: this.sendBtn, side: 'bottom', step: '4 ИЗ 4', text: 'Отправьте начальнику', sub: MOBILE ? '' : 'или «Составить ещё» — новый лист' });
    },
    /* Мгновенно заполненный лист — для горячей клавиши 4 */
    fillInstant() {
      this.clearSheet();
      this.setHeader();
      const text = this.pickExcuse();
      buildChars(this.body, text).forEach(s => s.classList.add('on'));
      Sign.instant();
      this.stampHome();
      stampInstant(this.stamp);
      this.actions.classList.add('in');
      state.current = { sit: state.sit, text };
      this.busy = false;
    },
    regen() {
      cancelAll();
      if (phoneWrap.classList.contains('on')) closePhone();
      this.generate(true);
    },
    async enter() {
      await sleep(650);
      await this.generate(false);
    }
  };
  gen.build();

  /* ======================= 4. МЕССЕНДЖЕР ======================= */
  const chat = {
    msgs: $('[data-msgs]'),
    input: $('[data-input]'),
    sendB: $('[data-sendb]'),
    presence: $('[data-presence]'),
    stamp: $('[data-stamp="ok"]'),
    mp: $('[data-mp="ok"]'),
    waitSend: null,
    reset() {
      this.waitSend = null;
      this.msgs.replaceChildren();
      this.input.innerHTML = '<span class="ph">Сообщение</span>';
      this.input.classList.remove('over');
      this.sendB.classList.remove('ready', 'press', 'armed');
      this.presence.textContent = 'был(а) недавно';
      this.presence.classList.remove('live');
      stampReset(this.stamp);
      this.setOutcome('ok');
      $('[data-clock]').textContent = clock(new Date());
    },
    /* Текст финального штампа и кнопки под исход */
    setOutcome(kind) {
      const o = D.OUTCOME[kind];
      $('[data-ok="stamp"]', this.stamp).textContent = o.stamp;
      $('[data-ok="sub"]', this.stamp).textContent = o.sub;
      this.stamp.classList.toggle('stamp--fail', kind === 'no');
      tagBtn.textContent = o.back;
      return o;
    },
    /* Шеф печатает и отправляет сообщение */
    async say(text, first) {
      this.presence.textContent = 'печатает…';
      const typing = this.bubble('them', '<div class="typing-b"><i></i><i></i><i></i></div>');
      typing.style.padding = '0';
      await sleep((first ? 1500 : 700) + Math.min(1800, text.length * 28));
      typing.remove();
      this.presence.textContent = 'в сети';
      this.bubble('them', `${text}<span class="tm">${clock(new Date())}</span>`);
      S.receive();
    },
    bubble(cls, html) {
      const b = document.createElement('div');
      b.className = `bub ${cls}`;
      b.innerHTML = html;
      this.msgs.appendChild(b);
      play(b, [
        { opacity: 0, transform: 'translateY(16px) scale(.85)' },
        { opacity: 1, transform: 'translateY(-2px) scale(1.01)', offset: .6 },
        { opacity: 1, transform: 'none' }
      ], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      return b;
    },
    async run() {
      const sit = D.SITUATIONS[state.current ? state.current.sit : state.sit];
      const key = sit.key, title = sit.title;
      await sleep(950);
      /* Подпись к фото набирается сама */
      this.input.innerHTML = '<span></span>';
      const span = $('span', this.input);
      for (const ch of sit.greet) {
        span.textContent += ch;
        if (span.offsetWidth > this.input.clientWidth - 30) this.input.classList.add('over');
        S.tap();
        this.sendB.classList.add('ready');
        await sleep(rand(16, 36));
      }
      /* Отправляет пользователь */
      this.sendB.classList.add('armed');
      Hint.show({ target: this.sendB, side: 'right', hl: false, step: '1 ИЗ 2', text: 'Отправьте шефу', sub: 'нажмите синюю кнопку' });
      await new Promise(res => { this.waitSend = res; });
      Hint.hide();
      this.sendB.classList.remove('armed');
      this.sendB.classList.add('press');
      S.send();
      await sleep(110);
      this.sendB.classList.remove('press', 'ready');
      this.input.innerHTML = '<span class="ph">Сообщение</span>';
      this.input.classList.remove('over');
      const me = this.bubble('me', `
        <div class="bub-photo"><div class="mini"><div class="mt">${title}</div>${'<div class="ml"></div>'.repeat(9)}<div class="ms">${sit.stamp}</div><div class="mg"></div></div><div class="glare"></div>
        <div class="up"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="22" pathLength="1"/></svg></div></div>
        ${sit.greet}<span class="tm">${clock(new Date())} <i class="ticks wait"></i></span>`);
      const up = $('.up', me), ticks = $('.ticks', me);
      await done(play($('circle', up), [{ strokeDashoffset: .92 }, { strokeDashoffset: 0 }], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
      up.style.opacity = 0;
      ticks.classList.remove('wait');
      await sleep(700);
      ticks.classList.add('two');
      this.presence.textContent = 'в сети';
      this.presence.classList.add('live');
      await sleep(700);
      ticks.classList.add('read');
      /* Первая отправка всегда прокатывает, вторая — никогда, дальше 50 на 50 */
      state.sends++;
      const kind = state.sends === 1 ? 'ok' : state.sends === 2 ? 'no' : (Math.random() < .5 ? 'ok' : 'no');
      const o = this.setOutcome(kind);
      const reply = pick(D.REPLIES[key][kind]);
      await sleep(600);
      for (let i = 0; i < reply.length; i++) {
        await this.say(reply[i], i === 0);
        await sleep(450);
      }
      await sleep(250);
      const react = document.createElement('span');
      react.className = 'react';
      react.innerHTML = `${pick(o.reacts)}<small>1</small>`;
      me.appendChild(react);
      me.classList.add('has-react');
      play(react, [{ transform: 'scale(0)' }, { transform: 'scale(1.3)', offset: .6 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
      S.pop();
      if (kind === 'no') {
        await sleep(900);
        this.presence.textContent = 'был(а) только что';
        this.presence.classList.remove('live');
      }
      await sleep(700);
      /* Финальный штамп ставит пользователь; по центру телефона */
      this.stamp.style.left = `${((phoneWrap.offsetWidth - this.stamp.offsetWidth) / 2).toFixed(0)}px`;
      Tool.arm({
        stamp: this.stamp, container: phoneWrap, angle: -3, mp: this.mp, power: 1.3, label: o.stamp,
        missText: 'Мимо! Ставьте на телефон',
        onPick: () => Hint.show({ target: this.mp, side: 'right', hl: false, step: '2 ИЗ 2', text: 'Шлёпните!' }),
        onDone: async () => {
          Hint.hide();
          await sleep(350);
          if (kind === 'ok') S.win(); else S.sad();
          await sleep(500);
          tagBtn.classList.add('in');
        }
      });
      Hint.show({ point: Tool.top(), side: 'top', hl: false, step: '2 ИЗ 2', text: kind === 'ok' ? 'Прокатило!' : 'Не прокатило…', sub: `поставьте финальную печать\n«${o.stamp}»` });
    }
  };
  chat.sendB.addEventListener('click', () => {
    if (!chat.waitSend) return;
    const f = chat.waitSend;
    chat.waitSend = null;
    f();
  });

  async function openPhone() {
    screen = 3; setScreenAttr(3);
    scenes[2].classList.add('phone-mode');
    chat.reset();
    tagBtn.classList.remove('in');
    phoneWrap.classList.add('on');
    S.slide();
    play(phoneWrap, [
      { transform: 'translate(60px, 980px) rotate(-10deg)', easing: 'cubic-bezier(.2,.85,.25,1)' },
      { transform: 'translate(0,-8px) rotate(.6deg)', offset: .78, easing: 'ease-in-out' },
      { transform: 'none' }
    ], { duration: 900 });
    play($('.phone-shadow', phoneWrap), [{ opacity: .3, transform: 'translate(30px,40px) scale(1.08)' }, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'ease-out' });
    await chat.run();
  }
  function closePhone() {
    scenes[2].classList.remove('phone-mode');
    tagBtn.classList.remove('in');
    if (!phoneWrap.classList.contains('on')) return;
    const g = phoneWrap.cloneNode(true);
    g.classList.add('ghost');
    $$('.mp', g).forEach(m => m.classList.remove('on'));
    fx.appendChild(g);
    phoneWrap.classList.remove('on');
    S.slide();
    play(g, [{ transform: 'none' }, { transform: 'translate(-40px, 1000px) rotate(8deg)' }], { duration: 650, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    later(() => g.remove(), 700);
  }

  /* ======================= Переходы между экранами ======================= */
  const SCENE = [home, pay, gen];

  function go(n, { intro = false } = {}) {
    const prev = screen;
    cancelAll();

    if (n === 3) {
      if (prev !== 2 && prev !== 3) {
        if (prev >= 0) { peel(papers[prev], -1); leave(prev); }
        show(2);
        gen.reset();
        gen.fillInstant();
        if (prev >= 0) settle(papers[2]);
        later(openPhone, 900);
      } else if (prev === 2) {
        if (!state.current) gen.fillInstant();
        openPhone();
      } else {
        phoneWrap.classList.remove('on');
        openPhone();
      }
      return;
    }

    const fromPhone = prev === 3;
    if (fromPhone) closePhone(); else phoneWrap.classList.remove('on');

    if (fromPhone && n === 2) {
      screen = 2; setScreenAttr(2);
      scenes[2].classList.remove('phone-mode');
      gen.generate(true);
      return;
    }

    const prevScene = fromPhone ? 2 : prev;
    if (prevScene >= 0 && !intro) {
      peel(papers[prevScene], prevScene === n ? 1 : -1);
      if (prevScene !== n) leave(prevScene);
    }
    scenes[2].classList.remove('phone-mode');
    show(n);
    SCENE[n].reset();
    if (prevScene >= 0 && !intro) settle(papers[n]);
    if (n === 0) home.enter(intro);
    else if (n === 1) pay.enter();
    else gen.enter();
  }
  function show(n) {
    scenes.forEach((s, i) => { s.classList.toggle('on', i === n); if (i === n) s.classList.remove('leaving'); });
    screen = n; setScreenAttr(n);
  }
  function leave(i) {
    const s = scenes[i];
    s.classList.remove('on');
    s.classList.add('leaving');
    setTimeout(() => { if (!s.classList.contains('on')) s.classList.remove('leaving', 'phone-mode'); }, RM ? 120 : 650);
  }

  function resetAll() {
    cancelAll();
    phoneWrap.classList.remove('on');
    tagBtn.classList.remove('in');
    scenes.forEach(s => s.classList.remove('on', 'leaving', 'phone-mode'));
    state.sit = 0; state.lvl = 3; state.tally = 0; state.current = null; state.sends = 0;
    Object.keys(used).forEach(key => delete used[key]);
    gen.no = 43;
    gen.renderSit(false); gen.renderLvl(false); gen.renderTally();
    screen = -1;
    go(0, { intro: true });
    /* Короткое затемнение, чтобы сброс не дёргал кадр */
    play(world, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
  }

  /* ---------- Кнопки ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'start') {
      S.click();
      b.classList.add('pressed');
      setTimeout(() => go(1), 120);
    } else if (act === 'pay') pay.pay();
    else if (act === 'again') { S.click(); gen.regen(); }
    else if (act === 'send') { S.click(); go(3); }
    else if (act === 'back') { S.click(); go(2); }
  });

  /* ---------- Звук ---------- */
  const sndBtn = $('.snd');
  function renderSnd() {
    sndBtn.setAttribute('aria-pressed', S.enabled);
    $('.snd-l', sndBtn).textContent = S.enabled ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ';
  }
  function toggleSound() { S.set(!S.enabled); renderSnd(); }
  sndBtn.addEventListener('click', () => { toggleSound(); S.click(); });
  renderSnd();
  const unlock = () => S.unlock();
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });
  addEventListener('touchend', unlock, { capture: true });

  /* ---------- Клавиатура ----------
     Пока идёт печать, любые клавиши печатают. Режиссёрские клавиши
     работают всегда с Shift, а без Shift — когда машинка не печатает:
     R — сброс на главную, 1/2/3 — экраны, 4 — мессенджер, M — звук, H — подсказки */
  const DIRECTOR = {
    KeyR: resetAll,
    Digit1: () => go(0), Digit2: () => go(1), Digit3: () => go(2), Digit4: () => go(3),
    KeyM: toggleSound,
    KeyH: () => Hint.toggle()
  };
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { Tool.drop(); return; }
    if (!e.shiftKey && Typer.active) {
      if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') { e.preventDefault(); Typer.key(); }
      return;
    }
    if (!e.shiftKey && Typer.grace) { if (e.key.length === 1) e.preventDefault(); return; }
    const act = DIRECTOR[e.code.replace('Numpad', 'Digit')];
    if (e.repeat || !act) return;
    e.preventDefault();
    if (document.activeElement) document.activeElement.blur();
    act();
  });

  /* ---------- Смена раскладки: компьютер ↔ телефон ---------- */
  onLayout = changed => {
    stampDefaults();
    Tool.relayout();
    if (changed && screen >= 0) go(screen === 3 ? 2 : screen);
  };

  /* ---------- Старт ---------- */
  gen.renderSit(false);
  gen.renderLvl(false);
  gen.renderTally();
  const start = () => go(0, { intro: true });
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(start);
  } else start();
})();
