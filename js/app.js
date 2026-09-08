/* ============================================================================
   app.js - scroll choreography, live controls, labels.
   ========================================================================== */
'use strict';

const NCH = 13;
const centerP = i => i / (NCH - 1);

/* target, radius, azimuth(deg), polar(deg), lateral framing offset (fraction of
   radius, positive pushes the engine left), explode, shatter, run, focus group */
const KEYS = [
  { tgt: [0, 0, 0.13],    r: 1.62, th: 228, ph: 67, sx: -0.19, ex: 0, sh: 0, run: 1, focus: null },
  { tgt: [0, 0, 0.16],    r: 2.45, th: 232, ph: 74, sx: 0.13,  ex: 0, sh: 1, run: 0, focus: null },
  { tgt: [0, 0, 0.24],    r: 3.00, th: 200, ph: 74, sx: -0.13, ex: 1, sh: 0, run: 0, focus: null },
  { tgt: [0, 0, 0.04],    r: 1.85, th: 122, ph: 72, sx: 0.17,  ex: 1, sh: 0, run: 0, focus: 'block' },
  { tgt: [0, 0, -0.06],   r: 1.20, th: 148, ph: 80, sx: -0.17, ex: 1, sh: 0, run: 0, focus: 'crank' },
  { tgt: [0.02, 0, 0.26], r: 1.58, th: 172, ph: 66, sx: 0.17,  ex: 1, sh: 0, run: 0, focus: 'piston' },
  { tgt: [0, 0, 0.50],    r: 1.95, th: 196, ph: 62, sx: -0.17, ex: 1, sh: 0, run: 0, focus: 'head' },
  { tgt: [0, 0, 0.60],    r: 1.90, th: 222, ph: 60, sx: 0.16,  ex: 1, sh: 0, run: 0, focus: 'valve' },
  { tgt: [0, 0, 0.60],    r: 1.85, th: 252, ph: 54, sx: -0.17, ex: 1, sh: 0, run: 0, focus: 'intake' },
  { tgt: [0.08, 0, 0.02], r: 2.05, th: 286, ph: 68, sx: 0.17,  ex: 1, sh: 0, run: 0, focus: 'exhaust' },
  { tgt: [0, 0, 0.44],    r: 1.72, th: 316, ph: 62, sx: -0.17, ex: 1, sh: 0, run: 0, focus: 'fuel' },
  { tgt: [-0.04, 0, 0.06], r: 1.78, th: 348, ph: 70, sx: 0.17, ex: 1, sh: 0, run: 0, focus: 'drive' },
  { tgt: [0, 0, 0.13],    r: 1.70, th: 392, ph: 69, sx: -0.17, ex: 0, sh: 0, run: 1, focus: null }
];

/* which parts get a callout in each chapter */
const CALLOUTS = {
  block: ['V6_EngineBlock', 'V6_Liner_1', 'V6_MainCap_2', 'V6_OilPan'],
  crank: ['V6_Crankshaft', 'V6_Flywheel', 'V6_CrankPulley'],
  piston: ['V6_Piston_1', 'V6_ConRod_1', 'V6_WristPin_3'],
  head: ['V6_Head_A', 'V6_HeadGasket_A', 'V6_ValveCover_A'],
  valve: ['V6_Cam_A_IN', 'V6_Valve_1_IN_1', 'V6_Spring_1_EX_1', 'V6_Retainer_3_IN_2'],
  intake: ['V6_IntakePlenum', 'V6_ThrottleBody', 'V6_Runner_3'],
  exhaust: ['V6_Header_1', 'V6_Collector_A'],
  fuel: ['V6_FuelRail_A', 'V6_Injector_2', 'V6_SparkPlug_4'],
  drive: ['V6_Flywheel', 'V6_DriveBelt', 'V6_Idler', 'V6_TimingCover']
};

const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
const lerp = (a, b, t) => a + (b - a) * t;

const state = {
  crank: 0, rpm: 1500, targetRpm: 1500, fuel: 100, burn: 0.55,
  running: true, speed: 0.055, explode: 0, shatter: 0,
  manualExplode: null, p: 0, focus: null, canvasVis: 1
};

let renderer, parts, canvas, lineCanvas, lctx;
let labelHost, selected = null;

/* ------------------------------------------------------------------- boot */
function boot() {
  canvas = document.getElementById('stage');
  lineCanvas = document.getElementById('lines');
  lctx = lineCanvas.getContext('2d');
  labelHost = document.getElementById('labels');

  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    document.getElementById('fallback').hidden = false;
    document.getElementById('fallback').textContent =
      'This page needs WebGL2, which this browser did not provide. ' + e.message;
    return;
  }
  parts = buildEngine(renderer);
  buildReference();
  wireControls();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  canvas.addEventListener('click', onPick);
  onScroll();
  requestAnimationFrame(frame);
  document.getElementById('partcount').textContent = parts.length;
}

/* -------------------------------------------------------------- scrolling */
function onScroll() {
  const track = document.getElementById('chapters');
  const top = track.offsetTop;
  const h = track.offsetHeight - window.innerHeight;
  state.p = clamp01((window.scrollY - top) / Math.max(1, h));

  /* fade the canvas out once the reference section takes over */
  const ref = document.getElementById('reference');
  const refTop = ref.offsetTop - window.innerHeight * 0.85;
  state.canvasVis = clamp01(1 - (window.scrollY - refTop) / (window.innerHeight * 0.5));
  canvas.style.opacity = state.canvasVis;
  document.querySelector('.dock').style.opacity = state.canvasVis;
  document.querySelector('.dock').style.pointerEvents = state.canvasVis > 0.4 ? 'auto' : 'none';
  document.getElementById('inspect').style.visibility = state.canvasVis > 0.4 ? 'visible' : 'hidden';
  lineCanvas.style.opacity = state.canvasVis;
  labelHost.style.opacity = state.canvasVis;

  /* chapter text opacity */
  for (let i = 0; i < NCH; i++) {
    const el = document.getElementById('ch' + i);
    if (!el) continue;
    const d = Math.abs(state.p - centerP(i)) * (NCH - 1);
    const o = clamp01(1 - (d - 0.30) / 0.55);
    el.style.opacity = o;
    el.style.transform = 'translateY(' + ((state.p - centerP(i)) * (NCH - 1) * -26) + 'px)';
    const cd = el.firstElementChild;
    if (cd) cd.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
  }
  const bar = document.getElementById('progress');
  if (bar) bar.style.transform = 'scaleX(' + state.p + ')';
}

function sample() {
  const p = state.p;
  let i = 0;
  while (i < NCH - 1 && p > centerP(i + 1)) i++;
  const a = KEYS[i], b = KEYS[Math.min(NCH - 1, i + 1)];
  const p0 = centerP(i), p1 = centerP(Math.min(NCH - 1, i + 1));
  let t = p1 > p0 ? clamp01((p - p0) / (p1 - p0)) : 0;
  if (p <= centerP(0)) t = 0;
  if (p >= centerP(NCH - 1)) t = 1;
  const s = smooth(t);
  return {
    tgt: V3.lerp(a.tgt, b.tgt, s),
    r: lerp(a.r, b.r, s),
    th: lerp(a.th, b.th, s),
    ph: lerp(a.ph, b.ph, s),
    sx: lerp(a.sx || 0, b.sx || 0, s),
    ex: lerp(a.ex, b.ex, s),
    sh: lerp(a.sh, b.sh, s),
    run: lerp(a.run, b.run, s),
    fromFocus: a.focus, toFocus: b.focus, ft: s,
    chapter: s < 0.5 ? i : Math.min(NCH - 1, i + 1)
  };
}

/* ------------------------------------------------------------------- loop */
let last = 0;
let loopFailed = false;
function frame(ts) {
  requestAnimationFrame(frame);
  try { tick(ts); } catch (e) {
    if (!loopFailed) { loopFailed = true; console.error('V6 frame error:', e && e.stack || e); }
  }
}

function tick(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  const k = sample();

  state.explode = state.manualExplode !== null ? state.manualExplode : k.ex;
  state.shatter = state.manualExplode !== null ? 0 : k.sh;
  state.focus = k.ft < 0.5 ? k.fromFocus : k.toFocus;

  /* engine physics */
  const scrollWantsRun = k.run > 0.5;
  const wants = state.userRun === undefined ? scrollWantsRun : state.userRun;
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

  updateParts(parts, state);

  /* per group dimming */
  const dimA = k.fromFocus, dimB = k.toFocus;
  for (const p of parts) {
    const oa = !dimA || dimA === p.group ? 1 : 0.062;
    const ob = !dimB || dimB === p.group ? 1 : 0.062;
    p.opacity = lerp(oa, ob, k.ft);
    if (selected === p) p.opacity = 1;
    if (p.anim === 'flame' && p.hidden) p.opacity = 0;
  }

  const th = k.th * Math.PI / 180, ph = k.ph * Math.PI / 180;
  let eye = [
    k.tgt[0] + k.r * Math.sin(ph) * Math.cos(th),
    k.tgt[1] + k.r * Math.sin(ph) * Math.sin(th),
    k.tgt[2] + k.r * Math.cos(ph)
  ];
  let tgt = k.tgt;
  /* slide the whole camera sideways so the engine sits clear of the text card */
  if (Math.abs(k.sx) > 1e-4 && window.innerWidth > 900) {
    const fwd = V3.norm(V3.sub(tgt, eye));
    const right = V3.norm(V3.cross(fwd, [0, 0, 1]));
    const d = V3.scale(right, k.sx * k.r);
    eye = V3.add(eye, d);
    tgt = V3.add(tgt, d);
  }
  const cam = { eye, target: tgt, fov: 0.62 };
  state.cam = cam;

  if (state.canvasVis > 0.01) {
    renderer.render(parts, cam, {
      groundAmt: (1 - k.sh) * (1 - k.ex * 0.55) * 0.95,
      groundZ: -0.30
    });
    drawLabels(k, cam);
  }
  paintHud();
}

/* ----------------------------------------------------------------- labels */
function drawLabels(k, cam) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (lineCanvas.width !== Math.round(w * dpr)) {
    lineCanvas.width = Math.round(w * dpr);
    lineCanvas.height = Math.round(h * dpr);
  }
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, w, h);

  const g = state.focus;
  const wanted = (g && CALLOUTS[g] && state.shatter < 0.05 && state.explode > 0.4) ? CALLOUTS[g] : [];
  const strength = clamp01((state.explode - 0.4) / 0.3);

  const need = new Set(wanted);
  for (const el of Array.from(labelHost.children)) {
    if (!need.has(el.dataset.name)) el.remove();
  }
  const placed = [];
  wanted.forEach(name => {
    const p = parts.find(q => q.name === name);
    if (!p) return;
    let el = labelHost.querySelector('[data-name="' + name + '"]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'label';
      el.dataset.name = name;
      el.innerHTML = '<span class="lb-num"></span><span class="lb-txt"></span>';
      labelHost.appendChild(el);
    }
    const sp = renderer.project(worldCenter(p));
    if (!sp || sp[0] < -200 || sp[0] > w + 200) { el.style.opacity = 0; return; }
    const right = sp[0] < w * 0.52;
    let lx = sp[0] + (right ? 74 : -74);
    let ly = sp[1];
    for (const q of placed) {
      if (Math.abs(q[1] - ly) < 34 && Math.abs(q[0] - lx) < 220) ly = q[1] + 34;
    }
    placed.push([lx, ly]);
    el.style.opacity = strength;
    el.style.left = lx + 'px';
    el.style.top = ly + 'px';
    el.classList.toggle('left', !right);
    el.querySelector('.lb-txt').textContent = p.title;
    el.querySelector('.lb-num').textContent = String(placed.length).padStart(2, '0');

    lctx.globalAlpha = 0.55 * strength;
    lctx.strokeStyle = '#1d1d1f';
    lctx.lineWidth = 1;
    lctx.beginPath();
    lctx.moveTo(sp[0], sp[1]);
    lctx.lineTo(lx + (right ? -12 : 12), ly);
    lctx.stroke();
    lctx.globalAlpha = 0.9 * strength;
    lctx.beginPath();
    lctx.arc(sp[0], sp[1], 2.6, 0, Math.PI * 2);
    lctx.fillStyle = '#b3261e';
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
    const on = state.running;
    btn.textContent = on ? 'STOP ENGINE' : 'START ENGINE';
    btn.classList.toggle('on', on);
  }
  const warn = document.getElementById('fuelWarn');
  if (warn) {
    warn.textContent = state.fuel <= 0 ? 'Tank empty — engine stalled'
      : state.fuel < 18 ? 'Low fuel — lean misfire, rpm sagging' : '';
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
    document.getElementById('autoBtn').classList.remove('show');
  });
  document.querySelectorAll('[data-jump]').forEach(a => {
    a.addEventListener('click', ev => {
      ev.preventDefault();
      const i = +a.dataset.jump;
      const track = document.getElementById('chapters');
      const h = track.offsetHeight - window.innerHeight;
      window.scrollTo({ top: track.offsetTop + centerP(i) * h, behavior: 'smooth' });
    });
  });
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
    const sec = document.createElement('div');
    sec.className = 'idx-group';
    const seen = new Set();
    const uniq = [];
    list.forEach(p => {
      const base = p.title.replace(/\s+\d+(,.*)?$/, '').replace(/\s+[AB]$/, '');
      if (seen.has(base)) return;
      seen.add(base);
      uniq.push(p);
    });
    sec.innerHTML = '<h3>' + label + ' <span class="idx-n">' + list.length + ' parts</span></h3>';
    const ul = document.createElement('ul');
    uniq.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = '<strong>' + p.title.replace(/\s+\d+$/, '') + '</strong><span>' + p.desc + '</span>';
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    host.appendChild(sec);
  });
}

document.addEventListener('DOMContentLoaded', boot);
