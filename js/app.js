/* ============================================================================
   app.js — scroll choreography, backdrops, annotations, live controls.

   One STEP = one camera pose + one card. Each step owns a scroll block; the
   camera makes its entire move in the first third of that block and then holds
   absolutely still for the rest, which is where the reading happens.
   ========================================================================== */
'use strict';

const ENVS = {
  light: { a: [0.90, 0.91, 0.95], b: [0.035, 0.038, 0.048], e: 1.00 },
  cool:  { a: [0.80, 0.87, 0.99], b: [0.028, 0.034, 0.052], e: 1.02 },
  warm:  { a: [0.97, 0.91, 0.83], b: [0.048, 0.042, 0.038], e: 1.00 },
  navy:  { a: [0.46, 0.53, 0.70], b: [0.014, 0.020, 0.040], e: 1.24 }
};

const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/* rests, accelerates hard through the middle, settles gently back to rest */
const easeExpo = t => t <= 0 ? 0 : t >= 1 ? 1
  : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

const MOVE_BAND = 0.32;

const state = {
  crank: 0, rpm: 1500, targetRpm: 1500, fuel: 100, burn: 0.42,
  running: true, speed: 0.055, explode: 0, sandwich: 0,
  manualExplode: null, step: 0, u: 0, focus: null, canvasVis: 1, t0: 0
};

let renderer, parts, canvas, lineCanvas, lctx, labelHost;
let selected = null, spans = [], backdrops = [], marks = [];
let isNarrow = false;

/* ------------------------------------------------------------------- boot */
function boot() {
  canvas = document.getElementById('stage');
  lineCanvas = document.getElementById('lines');
  lctx = lineCanvas.getContext('2d');
  labelHost = document.getElementById('labels');
  isNarrow = window.innerWidth <= 980;

  initTheme();
  buildChapterMarks();
  buildSections();
  buildBackdrops();
  buildNav();

  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    const f = document.getElementById('fallback');
    f.hidden = false;
    f.textContent = 'This page draws its engine with WebGL2, which this browser did '
      + 'not provide. Everything written below still reads normally. (' + e.message + ')';
    document.body.classList.add('no-gl');
    return;
  }
  parts = buildEngine(renderer);
  buildReference();
  wireControls();
  measure();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    isNarrow = window.innerWidth <= 980;
    applySpans(); measure(); onScroll();
  });
  canvas.addEventListener('click', onPick);
  onScroll();
  state.t0 = performance.now();
  requestAnimationFrame(frame);
  document.querySelectorAll('[data-partcount]').forEach(n => { n.textContent = parts.length; });
}

/* --------------------------------------------------------- DOM generation */
function buildChapterMarks() {
  const seen = {};
  STEPS.forEach(s => { seen[s.chapter] = (seen[s.chapter] || 0) + 1; });
  const run = {};
  marks = STEPS.map(s => {
    run[s.chapter] = (run[s.chapter] || 0) + 1;
    return { name: s.chapter, i: run[s.chapter], n: seen[s.chapter] };
  });
}

function buildSections() {
  const host = document.getElementById('chapters');
  STEPS.forEach((s, i) => {
    const m = marks[i];
    const art = document.createElement('article');
    art.className = 'chapter' + (s.hero ? ' is-hero' : '');
    art.id = 'ch' + i;

    const note = (n, k) => `
        <li><b>${String(k + 1).padStart(2, '0')}</b>
          <span><i>${n.title}</i>${n.body}</span></li>`;
    const ns = s.notes || [];
    /* slot one carries the lede and the first two callouts; slot two takes the
       rest, so a narrow screen never has to show everything at once */
    const slotA = (s.lede ? `<p class="lede">${s.lede}</p>` : '')
                + (s.body ? `<p>${s.body}</p>` : '')
                + (ns.length ? `<ul class="card-notes">${ns.slice(0, 2).map(note).join('')}</ul>` : '');
    const restNotes = ns.slice(2);
    const slotBinner = (s.body2 ? `<p>${s.body2}</p>` : '')
                + (restNotes.length ? `<ul class="card-notes">${restNotes.map((n, k) => note(n, k + 2)).join('')}</ul>` : '');
    const slots = slotBinner ? [slotA, slotBinner] : [slotA];
    art.dataset.slots = slots.length;

    art.innerHTML = `
      <div class="card${s.hero ? ' card-hero' : ''}">
        <p class="eyebrow">
          <span class="eb-name">${s.eyebrow || m.name}</span>
          ${m.n > 1 ? `<span class="eb-step">${m.i}/${m.n}</span>` : ''}
        </p>
        <h2 class="c-title">${(s.title || '').replace(/\n/g, '<br>')}</h2>
        ${slots.map((c, k) => `<div class="slot" data-slot="${k}">${c}</div>`).join('')}
        ${slots.length > 1 ? `<p class="dots">${slots.map((_, k) =>
          `<i data-dot="${k}"></i>`).join('')}</p>` : ''}
        ${s.hero ? '<p class="hint">Scroll</p>' : ''}
      </div>`;
    host.appendChild(art);
  });
  applySpans();
}

/* narrow screens get extra scroll length for steps that split into two slots */
function applySpans() {
  STEPS.forEach((s, i) => {
    const el = document.getElementById('ch' + i);
    if (!el) return;
    const slots = +el.dataset.slots || 1;
    const base = s.hero ? 1.14 : 1.30;
    el.style.setProperty('--span', (base + (isNarrow && slots > 1 ? 0.52 : 0)).toFixed(2));
  });
}

function buildBackdrops() {
  const host = document.getElementById('backdrops');
  backdrops = STEPS.map((s, i) => {
    const d = document.createElement('div');
    d.className = 'backdrop ' + s.bg;
    d.style.opacity = i === 0 ? 1 : 0;
    host.appendChild(d);
    return d;
  });
}

function buildNav() {
  const desk = document.getElementById('navLinks');
  const menu = document.getElementById('menu');
  const firsts = [];
  marks.forEach((m, i) => { if (m.i === 1) firsts.push({ name: m.name, i }); });
  firsts.forEach(f => {
    const a = document.createElement('a');
    a.href = '#'; a.dataset.jump = f.i; a.textContent = f.name;
    desk.appendChild(a);
    menu.appendChild(a.cloneNode(true));
  });
  const r = document.createElement('a');
  r.href = '#reference'; r.textContent = 'Reference';
  desk.appendChild(r);
  menu.appendChild(r.cloneNode(true));
}

function measure() {
  spans = [];
  for (let i = 0; i < STEPS.length; i++) {
    const el = document.getElementById('ch' + i);
    if (!el) continue;
    spans.push({ top: el.offsetTop, h: el.offsetHeight, el });
  }
}

/* -------------------------------------------------------------- scrolling */
function onScroll() {
  if (!spans.length) measure();
  const y = window.scrollY;
  const vh = window.innerHeight;

  let i = 0;
  for (let k = 0; k < spans.length; k++) if (y >= spans[k].top - 1) i = k;
  const sp = spans[i];
  const u = clamp01((y - sp.top) / Math.max(1, sp.h - vh));
  state.step = i;
  state.u = u;

  const ref = document.getElementById('reference');
  const vis = clamp01(1 - (y - (ref.offsetTop - vh * 0.9)) / (vh * 0.45));
  state.canvasVis = vis;
  canvas.style.opacity = vis;
  lineCanvas.style.opacity = vis;
  labelHost.style.opacity = vis;
  document.getElementById('backdrops').style.opacity = vis;
  const dock = document.querySelector('.dock');
  dock.style.opacity = vis;
  dock.style.pointerEvents = vis > 0.4 ? 'auto' : 'none';
  document.getElementById('inspect').style.visibility = vis > 0.4 ? 'visible' : 'hidden';
  document.getElementById('toTop').classList.toggle('show', y > vh * 1.4);

  for (let k = 0; k < spans.length; k++) {
    const card = spans[k].el.querySelector('.card');
    if (!card) continue;
    let o = 0;
    if (k === i) o = (i === 0 ? 1 : clamp01((u - 0.14) / 0.14)) * clamp01((0.985 - u) / 0.10);
    card.style.opacity = o;
    card.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
    card.style.setProperty('--dy', ((1 - o) * 12).toFixed(1) + 'px');
  }

  /* within the hold band, walk through the card's slots one at a time */
  const nSlots = +sp.el.dataset.slots || 1;
  const holdT = clamp01((u - MOVE_BAND) / (1 - MOVE_BAND));
  const sub = Math.min(nSlots - 1, Math.floor(holdT * nSlots * 0.999));
  state.sub = sub;
  if (isNarrow) {
    sp.el.querySelectorAll('.slot').forEach(el => {
      const on = +el.dataset.slot === sub;
      el.classList.toggle('on', on);
    });
    sp.el.querySelectorAll('.dots i').forEach(d =>
      d.classList.toggle('on', +d.dataset.dot === sub));
  } else {
    sp.el.querySelectorAll('.slot').forEach(el => el.classList.add('on'));
    sp.el.querySelectorAll('.dots i').forEach(d => d.classList.add('on'));
  }

  const bt = easeExpo(clamp01(u / MOVE_BAND));
  const prev = Math.max(0, i - 1);
  backdrops.forEach((d, k) => {
    let o = 0;
    if (k === i) o = i === 0 ? 1 : bt;
    else if (k === prev && i !== 0) o = 1 - bt;
    d.style.opacity = o;
  });

  const first = spans[0], lastSp = spans[spans.length - 1];
  const gp = clamp01((y - first.top) / Math.max(1, lastSp.top + lastSp.h - vh - first.top));
  document.getElementById('progress').style.transform = 'scaleX(' + gp + ')';

  const m = marks[i];
  document.getElementById('markName').textContent = m.name;
  document.getElementById('markStep').textContent = m.n > 1 ? m.i + '/' + m.n : '';
  document.body.classList.toggle('on-dark', STEPS[i].env === 'navy' && u > MOVE_BAND * 0.5);
}

function sample() {
  const i = state.step;
  const t = easeExpo(clamp01(state.u / MOVE_BAND));
  const A = STEPS[Math.max(0, i - 1)], B = STEPS[i];
  const ea = ENVS[A.env], eb = ENVS[B.env];
  const modeVal = s => s.mode === 'sandwich' ? 1 : s.mode === 'exploded' ? 2 : 0;
  const ma = modeVal(A), mb = modeVal(B);
  /* sandwich and exploded cross-fade through each other rather than snapping */
  const sand = lerp(ma === 1 ? 1 : 0, mb === 1 ? 1 : 0, t);
  const expl = lerp(ma === 2 ? 1 : 0, mb === 2 ? 1 : 0, t);
  return {
    tgt: V3.lerp(A.cam.tgt, B.cam.tgt, t),
    r: lerp(A.cam.r, B.cam.r, t),
    th: lerp(A.cam.th, B.cam.th, t),
    ph: lerp(A.cam.ph, B.cam.ph, t),
    sx: lerp(A.cam.sx, B.cam.sx, t),
    sand, expl,
    run: lerp(A.run ? 1 : 0, B.run ? 1 : 0, t),
    envA: lerp3(ea.a, eb.a, t), envB: lerp3(ea.b, eb.b, t),
    expo: lerp(ea.e, eb.e, t),
    fromFocus: A.focus, toFocus: B.focus, ft: t
  };
}

/* ------------------------------------------------------------------- loop */
let last = 0, loopFailed = false;
function frame(ts) {
  requestAnimationFrame(frame);
  try { tick(ts); } catch (e) {
    if (!loopFailed) { loopFailed = true; console.error('V6 frame error:', (e && e.stack) || e); }
  }
}

function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  const k = sample();
  const age = (ts - state.t0) / 1000;

  state.explode = state.manualExplode !== null ? state.manualExplode : k.expl;
  state.sandwich = state.manualExplode !== null ? 0 : k.sand;
  state.focus = k.ft < 0.5 ? k.fromFocus : k.toFocus;

  const wants = state.userRun === undefined ? k.run > 0.5 : state.userRun;
  const live = wants && state.fuel > 0;
  state.running = live;
  if (live) {
    const ff = clamp01(state.fuel / 18);
    let rpm = state.targetRpm * (0.30 + 0.70 * ff);
    if (ff < 1) rpm *= 1 + 0.06 * Math.sin(state.crank * 0.35) * (1 - ff);
    state.rpm = rpm;
    state.crank = (state.crank + 6 * rpm * dt * state.speed) % 720;
    state.fuel = Math.max(0, state.fuel - dt * state.burn * (rpm / 1000));
  } else {
    state.rpm = 0;
  }

  /* the whole assembly floats, and drops into place once on first load */
  const settle = 1 - clamp01(easeOutBack(clamp01(age / 1.25)));
  const assembled = 1 - Math.max(state.explode, state.sandwich);
  state.lift = assembled * (Math.sin(age * 0.72) * 0.011 + Math.sin(age * 1.13) * 0.004)
             - settle * 0.34;
  state.tiltZ = assembled * Math.sin(age * 0.51) * 0.016;

  updateParts(parts, state);

  const dimA = k.fromFocus, dimB = k.toFocus;
  const ghostAlpha = document.documentElement.dataset.theme === 'dark' ? 0.24 : 0.34;
  for (const p of parts) {
    const ga = !dimA || dimA === p.group ? 0 : 1;
    const gb = !dimB || dimB === p.group ? 0 : 1;
    p.ghost = lerp(ga, gb, k.ft);
    p.opacity = lerp(1, ghostAlpha, p.ghost);
    if (selected === p) { p.ghost = 0; p.opacity = 1; }
    if (p.anim === 'flame') p.opacity = p.hidden ? 0 : 1;
  }

  const th = k.th * Math.PI / 180, ph = k.ph * Math.PI / 180;
  const W = window.innerWidth;
  const rad = k.r * (W < 620 ? 1.85 : W <= 980 ? 1.45 : 1);
  let eye = [
    k.tgt[0] + rad * Math.sin(ph) * Math.cos(th),
    k.tgt[1] + rad * Math.sin(ph) * Math.sin(th),
    k.tgt[2] + rad * Math.cos(ph)
  ];
  let tgt = k.tgt.slice();
  const fwd = V3.norm(V3.sub(tgt, eye));
  const right = V3.norm(V3.cross(fwd, [0, 0, 1]));
  const shift = isNarrow
    ? V3.scale(V3.norm(V3.cross(right, fwd)), -0.19 * rad)
    : V3.scale(right, k.sx * rad);
  eye = V3.add(eye, shift);
  tgt = V3.add(tgt, shift);
  const cam = { eye, target: tgt, fov: 0.62 };
  state.cam = cam;

  const dark = document.documentElement.dataset.theme === 'dark';
  renderer.env.a = dark ? V3.scale(k.envA, 0.60) : k.envA;
  renderer.env.b = dark ? V3.scale(k.envB, 0.55) : k.envB;
  renderer.env.exposure = k.expo * (dark ? 1.14 : 1.0);
  renderer.env.ghost = dark ? [0.15, 0.18, 0.24] : [0.46, 0.52, 0.62];

  if (state.canvasVis > 0.01) {
    renderer.render(parts, cam, {
      groundAmt: (1 - state.sandwich) * (1 - state.explode * 0.6) * (dark ? 0.45 : 0.82),
      groundZ: -0.30 + state.lift
    });
    drawLabels();
  }
  paintHud();
}

/* ------------------------------------------------------------- annotations */
function drawLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (lineCanvas.width !== Math.round(w * dpr)) {
    lineCanvas.width = Math.round(w * dpr);
    lineCanvas.height = Math.round(h * dpr);
  }
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, w, h);

  const step = STEPS[state.step];
  const on = !isNarrow && step.notes && step.notes.length
    && state.sandwich < 0.05 && state.explode > 0.5 && state.u > MOVE_BAND * 0.8;
  const wanted = on ? step.notes : [];
  const strength = on ? clamp01((state.u - MOVE_BAND * 0.8) / 0.09) : 0;

  const need = new Set(wanted.map(n => n.part));
  for (const el of Array.from(labelHost.children)) {
    if (!need.has(el.dataset.name)) el.remove();
  }
  if (!wanted.length) return;

  const cardEl = spans[state.step] && spans[state.step].el.querySelector('.card');
  const cr = cardEl ? cardEl.getBoundingClientRect() : null;
  const css = getComputedStyle(document.documentElement);
  const lead = (css.getPropertyValue('--lead') || '#26313f').trim();
  const acc = (css.getPropertyValue('--accent') || '#c0342b').trim();

  const items = [];
  wanted.forEach((n, idx) => {
    const p = parts.find(q => q.name === n.part);
    if (!p) return;
    const sp = renderer.project(worldCenter(p));
    if (!sp) return;
    items.push({ n, sp, idx });
  });
  items.sort((a, b) => a.sp[1] - b.sp[1]);

  const placed = [];
  items.forEach(({ n, sp }, rank) => {
    let el = labelHost.querySelector('[data-name="' + n.part + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'note';
      el.dataset.name = n.part;
      el.innerHTML = '<b class="n-num"></b><span class="n-body">'
        + '<span class="n-title"></span><span class="n-desc"></span></span>';
      labelHost.appendChild(el);
    }
    el.querySelector('.n-title').textContent = n.title;
    el.querySelector('.n-desc').textContent = n.body;
    el.querySelector('.n-num').textContent = String(rank + 1).padStart(2, '0');

    const NW = 272, NH = el.offsetHeight || 88;
    let right = sp[0] < w * 0.5;
    let lx = sp[0] + (right ? 86 : -86);
    if (cr) {
      const l = right ? lx : lx - NW;
      if (l < cr.right + 18 && l + NW > cr.left - 18 && sp[1] > cr.top - 60 && sp[1] < cr.bottom + 60) {
        right = !right;
        lx = sp[0] + (right ? 86 : -86);
      }
    }
    let ly = sp[1];
    for (const q of placed) {
      if (Math.abs(q.y - ly) < NH + 14 && Math.abs(q.x - lx) < NW + 48) ly = q.y + NH + 14;
    }
    ly = Math.max(NH / 2 + 92, Math.min(h - NH / 2 - 128, ly));
    lx = Math.max(right ? 28 : NW + 28, Math.min(right ? w - NW - 28 : w - 28, lx));
    placed.push({ x: lx, y: ly });

    el.style.opacity = strength;
    el.style.left = lx + 'px';
    el.style.top = ly + 'px';
    el.classList.toggle('left', !right);

    const elbow = lx + (right ? -18 : 18);
    lctx.globalAlpha = 0.6 * strength;
    lctx.strokeStyle = lead;
    lctx.lineWidth = 1;
    lctx.beginPath();
    lctx.moveTo(sp[0], sp[1]);
    lctx.lineTo(elbow - (right ? 26 : -26), sp[1]);
    lctx.lineTo(elbow, ly);
    lctx.stroke();
    lctx.globalAlpha = strength;
    lctx.beginPath();
    lctx.arc(sp[0], sp[1], 3.2, 0, Math.PI * 2);
    lctx.fillStyle = acc;
    lctx.fill();
  });
}

/* -------------------------------------------------------------------- HUD */
function paintHud() {
  const f = document.getElementById('fuelFill');
  if (f) f.style.width = state.fuel.toFixed(1) + '%';
  const fv = document.getElementById('fuelVal');
  if (fv) fv.textContent = Math.round(state.fuel) + '%';
  const rv = document.getElementById('rpmVal');
  if (rv) rv.textContent = Math.round(state.rpm);
  const cv = document.getElementById('crankVal');
  if (cv) cv.textContent = Math.round(state.crank) + '°';
  const btn = document.getElementById('runBtn');
  if (btn) {
    btn.textContent = state.running ? 'Stop' : 'Start';
    btn.classList.toggle('on', state.running);
  }
  const warn = document.getElementById('fuelWarn');
  if (warn) {
    warn.textContent = state.fuel <= 0 ? 'Tank empty — stalled'
      : state.fuel < 18 ? 'Lean — rpm sagging' : '';
  }
  const fb = document.getElementById('fuelBar');
  if (fb) fb.classList.toggle('low', state.fuel < 18);
}

/* --------------------------------------------------------------- controls */
function wireControls() {
  document.getElementById('runBtn').addEventListener('click', () => {
    if (!state.running && state.fuel <= 0) return;
    state.userRun = !state.running;
  });
  document.getElementById('refuelBtn').addEventListener('click', () => {
    state.fuel = 100;
    if (state.userRun === undefined) state.userRun = true;
  });
  const rpm = document.getElementById('rpmRange');
  rpm.addEventListener('input', () => { state.targetRpm = +rpm.value; });
  const tear = document.getElementById('tearRange');
  tear.addEventListener('input', () => {
    state.manualExplode = +tear.value / 100;
    document.getElementById('autoBtn').classList.add('show');
  });
  document.getElementById('autoBtn').addEventListener('click', () => {
    state.manualExplode = null;
    document.getElementById('tearRange').value = 0;
    document.getElementById('autoBtn').classList.remove('show');
  });
  document.addEventListener('click', ev => {
    const a = ev.target.closest('[data-jump]');
    if (!a) return;
    ev.preventDefault();
    closeMenu();
    const el = document.getElementById('ch' + a.dataset.jump);
    if (el) window.scrollTo({ top: el.offsetTop + (el.offsetHeight - innerHeight) * 0.55, behavior: 'smooth' });
  });
  document.getElementById('menuBtn').addEventListener('click',
    () => document.body.classList.toggle('menu-open'));
  document.querySelectorAll('#menu a').forEach(a => a.addEventListener('click', closeMenu));
  document.querySelectorAll('[data-theme-toggle]').forEach(b =>
    b.addEventListener('click', toggleTheme));
  document.getElementById('toTop').addEventListener('click',
    () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function closeMenu() { document.body.classList.remove('menu-open'); }

function initTheme() {
  let t = null;
  try { t = localStorage.getItem('v6-theme'); } catch (e) { /* private mode */ }
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('v6-theme', next); } catch (e) { /* ignore */ }
}

function onPick(ev) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const p = renderer.pickAt(parts, state.cam,
    (ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr);
  selected = p;
  const card = document.getElementById('inspect');
  if (!p) { card.classList.remove('show'); return; }
  card.classList.add('show');
  card.querySelector('.ins-group').textContent =
    (GROUPS.find(g => g[0] === p.group) || ['', ''])[1];
  card.querySelector('.ins-title').textContent = p.title;
  card.querySelector('.ins-desc').textContent = p.desc;
}

/* --------------------------------------------------- generated part index */
function buildReference() {
  const host = document.getElementById('partIndex');
  GROUPS.forEach(([key, label]) => {
    const list = parts.filter(p => p.group === key);
    if (!list.length) return;
    const seen = new Map();
    list.forEach(p => {
      const base = p.title
        .replace(/,\s*cyl\s*\d+$/i, '').replace(/,\s*bank\s*[AB]$/i, '')
        .replace(/\s+\d+$/, '').replace(/\s+[AB]$/, '');
      seen.set(base, (seen.get(base) || 0) + 1);
    });
    const sec = document.createElement('section');
    sec.className = 'idx-group';
    const rows = [...seen.entries()]
      .map(([n, c]) => '<li><span>' + n + '</span><i>' + (c > 1 ? '×' + c : '') + '</i></li>')
      .join('');
    sec.innerHTML = '<h3>' + label + '<em>' + list.length + '</em></h3><ul>' + rows + '</ul>';
    host.appendChild(sec);
  });
}

document.addEventListener('DOMContentLoaded', boot);
