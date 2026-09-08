/* ============================================================================
   engine.js - the V6 itself: geometry, part metadata and kinematics.
   Every dimension here matches the Blender model part for part.
   ========================================================================== */
'use strict';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

const P = {
  bore: 0.089,
  stroke: 0.086,
  rod: 0.150,
  spacing: 0.114,
  bank: 30 * D2R,
  bankDx: 0.021,
  deck: 0.226,
  lift: 0.0105,
  springLen: 0.042
};
const CR = P.stroke / 2;
const XS = [-P.spacing, 0, P.spacing];
const FIRE = { 1: 0, 4: 120, 2: 240, 5: 360, 3: 480, 6: 600 };
/* [cylinder number, crank throw index, bank sign]  A = +Y, B = -Y */
const CYLS = [[1, 0, 1], [3, 1, 1], [5, 2, 1], [2, 0, -1], [4, 1, -1], [6, 2, -1]];
const NUM2 = {};
CYLS.forEach(([n, i, s]) => { NUM2[n] = [i, s]; });

const GROUPS = [
  ['block', 'Block & Crankcase'],
  ['crank', 'Rotating Assembly'],
  ['piston', 'Pistons & Rods'],
  ['head', 'Cylinder Heads'],
  ['valve', 'Valvetrain'],
  ['intake', 'Intake System'],
  ['exhaust', 'Exhaust System'],
  ['fuel', 'Fuel & Ignition'],
  ['drive', 'Drive & Accessories']
];

const EX = {
  liner: 0.17, piston: 0.30, wpin: 0.36, rod: 0.09, gasket: 0.39, head: 0.48,
  valve: 0.60, spring: 0.66, retainer: 0.66, cam: 0.71, cover: 0.80,
  plug: 0.90, rail: 0.74, inj: 0.70
};

const MATS = {
  alu:      { color: [0.480, 0.492, 0.520], metal: 0.88, rough: 0.44 },
  aluMach:  { color: [0.680, 0.692, 0.725], metal: 1.00, rough: 0.19 },
  iron:     { color: [0.150, 0.156, 0.172], metal: 0.70, rough: 0.64 },
  steel:    { color: [0.585, 0.598, 0.628], metal: 1.00, rough: 0.22 },
  crank:    { color: [0.400, 0.410, 0.445], metal: 1.00, rough: 0.28 },
  piston:   { color: [0.735, 0.748, 0.772], metal: 1.00, rough: 0.25 },
  copper:   { color: [0.720, 0.395, 0.190], metal: 1.00, rough: 0.31 },
  brass:    { color: [0.735, 0.590, 0.245], metal: 1.00, rough: 0.27 },
  rubber:   { color: [0.048, 0.048, 0.056], metal: 0.00, rough: 0.78 },
  red:      { color: [0.430, 0.055, 0.045], metal: 0.35, rough: 0.31 },
  carbon:   { color: [0.062, 0.064, 0.072], metal: 0.25, rough: 0.47 },
  chrome:   { color: [0.860, 0.868, 0.892], metal: 1.00, rough: 0.055 },
  titanium: { color: [0.445, 0.440, 0.470], metal: 1.00, rough: 0.35 },
  flame:    { color: [1.000, 0.470, 0.120], metal: 0.00, rough: 0.60 }
};

/* how far apart the exploded view spreads, as a multiple of the design values */
const EXPLODE_SCALE = 0.62;

/* --------------------------------------------------------------- geometry */
function bankDir(s) { return [0, s * Math.sin(P.bank), Math.cos(P.bank)]; }
function bankRx(s) { return -s * P.bank; }
function bankX(i, s) { return XS[i] + s * P.bankDx; }

function bankPlace(s, lx, ly, lz) {
  const th = bankRx(s), c = Math.cos(th), sn = Math.sin(th);
  return [lx, ly * c - lz * sn, ly * sn + lz * c];
}

function crankPin(i, alpha) {
  const a = (alpha + 120 * i) * D2R;
  return [XS[i], CR * Math.sin(a), CR * Math.cos(a)];
}

function pistonS(i, s, alpha) {
  const pin = crankPin(i, alpha), b = bankDir(s);
  const dx = bankX(i, s) - pin[0];
  const d = pin[1] * b[1] + pin[2] * b[2];
  const q = Math.max(0, d * d - CR * CR - dx * dx + P.rod * P.rod);
  return d + Math.sqrt(q);
}

function bumpFn(x, w) {
  const d = ((x + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(d) > w) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * d / w));
}

function valveLift(num, kind, alpha) {
  const c = ((alpha - FIRE[num]) % 720 + 720) % 720;
  return P.lift * bumpFn(c * 0.5 - (kind === 'IN' ? 225 : 135), 62);
}

function combustion(num, alpha) {
  const c = ((alpha - FIRE[num]) % 720 + 720) % 720;
  if (c > 200) return 0;
  return bumpFn(c - 14, 42);
}

function arc3(p0, p1, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
      u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]
    ]);
  }
  return out;
}

function helixPts(r, h, turns, n, m) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = TAU * turns * t;
    const p = [Math.cos(a) * r, Math.sin(a) * r, t * h];
    out.push(m ? M4.transformPoint(m, p) : p);
  }
  return out;
}

const T = (pos, rot) => M4.trs(pos, rot || [0, 0, 0], [1, 1, 1]);

/* ------------------------------------------------------------ part record */
let PARTS = [];
let RND = 1;
function rnd() { RND = (RND * 16807) % 2147483647; return RND / 2147483647; }

function addPart(renderer, geo, spec) {
  const b = geo.bounds();
  const dir = spec.edir ? V3.norm(spec.edir) : [0, 0, 0];
  const p = {
    id: PARTS.length,
    name: spec.name,
    title: spec.title || spec.name,
    group: spec.group,
    desc: spec.desc || '',
    mat: MATS[spec.mat],
    mesh: renderer.upload(geo),
    center: b.mid,
    radius: Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) / 2,
    baseLoc: spec.loc || [0, 0, 0],
    baseRot: spec.rot || [0, 0, 0],
    edir: dir,
    emag: (spec.emag || 0) * EXPLODE_SCALE,
    anim: spec.anim || '',
    cyl: spec.cyl || 0,
    kind: spec.kind || '',
    bank: spec.bank || 0,
    matrix: M4.ident(),
    opacity: 1,
    emit: 0,
    hidden: false,
    shDir: null,
    shSpin: null
  };
  const sd = V3.norm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
  p.shDir = sd;
  p.shDist = 0.16 + rnd() * 0.46;
  p.shSpin = [(rnd() - 0.5) * 7, (rnd() - 0.5) * 7, (rnd() - 0.5) * 7];
  PARTS.push(p);
  return p;
}

/* ----------------------------------------------------------------- builds */
function buildBlock(R) {
  /* open deck block: side walls, end walls, bulkheads and bore barrels */
  const g = new Geo();
  g.box(0.420, 0.020, 0.146, T([0, 0.103, -0.005]));
  g.box(0.420, 0.020, 0.146, T([0, -0.103, -0.005]));
  g.box(0.020, 0.226, 0.146, T([0.200, 0, -0.005]));
  g.box(0.020, 0.226, 0.146, T([-0.200, 0, -0.005]));
  [-0.171, -0.057, 0.057, 0.171].forEach(x => {
    g.box(0.024, 0.200, 0.046, T([x, 0, 0.045]));
    g.box(0.024, 0.032, 0.100, T([x, 0.086, -0.028]));
    g.box(0.024, 0.032, 0.100, T([x, -0.086, -0.028]));
  });
  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      g.tube(0.0615, 0.0458, 0.172, T(bankPlace(s, bankX(i, s), 0, 0.146), [bankRx(s), 0, 0]), 30);
    }
  }
  for (const s of [1, -1]) {
    g.box(0.420, 0.018, 0.172, T(bankPlace(s, 0, 0.068, 0.146), [bankRx(s), 0, 0]));
    g.box(0.420, 0.018, 0.172, T(bankPlace(s, 0, -0.068, 0.146), [bankRx(s), 0, 0]));
    g.box(0.420, 0.148, 0.012, T(bankPlace(s, 0, 0, 0.226), [bankRx(s), 0, 0]));
  }
  addPart(R, g, {
    name: 'V6_EngineBlock', title: 'Cylinder block', group: 'block', mat: 'alu',
    loc: [0, 0, 0], edir: [0, 0, 0], emag: 0,
    desc: 'The aluminium block sets the 60 degree bank angle and holds everything else in ' +
      'relation to everything else. Six bore barrels rise out of an open deck, and four ' +
      'main bearing bulkheads hang the crankshaft down the centre of the V.'
  });

  CYLS.forEach(([num, i, s]) => {
    const g2 = new Geo();
    g2.tube(0.0505, 0.0445, 0.168, null, 32);
    addPart(R, g2, {
      name: 'V6_Liner_' + num, title: 'Cylinder liner ' + num, group: 'block', mat: 'iron',
      loc: bankPlace(s, bankX(i, s), 0, 0.148), rot: [bankRx(s), 0, 0],
      edir: bankDir(s), emag: EX.liner,
      desc: 'Cast iron liner for cylinder ' + num + '. Aluminium is too soft to be a running ' +
        'surface, so the bore the rings actually slide on is a separate iron sleeve pressed into the block.'
    });
  });

  [-0.171, -0.057, 0.057, 0.171].forEach((x, k) => {
    const g2 = new Geo();
    g2.box(0.046, 0.104, 0.052, null);
    g2.cyl(0.0325, 0.050, 24, T([0, 0, 0.020], [0, Math.PI / 2, 0]));
    [-0.040, 0.040].forEach(by => g2.cyl(0.006, 0.060, 12, T([0, by, -0.020])));
    addPart(R, g2, {
      name: 'V6_MainCap_' + (k + 1), title: 'Main bearing cap ' + (k + 1), group: 'block', mat: 'steel',
      loc: [x, 0, -0.062], edir: [0, 0, -1], emag: 0.18,
      desc: 'Clamps a crankshaft main journal against the block through a thin plain bearing shell. ' +
        'The crank never touches metal here - it floats on a film of pressurised oil.'
    });
  });

  const gp = new Geo();
  gp.box(0.386, 0.206, 0.030, T([0, 0, 0.038]));
  gp.box(0.200, 0.176, 0.070, T([0.060, 0, 0.008]));
  gp.cyl(0.012, 0.030, 16, T([0.150, 0.070, -0.010], [Math.PI / 2, 0, 0]));
  addPart(R, gp, {
    name: 'V6_OilPan', title: 'Oil pan & sump', group: 'block', mat: 'alu',
    loc: [0, 0, -0.108], edir: [0, 0, -1], emag: 0.32,
    desc: 'Holds around five litres of oil. The rear sump keeps the pickup submerged under ' +
      'acceleration; the drain plug is the low point.'
  });

  const gt = new Geo();
  gt.box(0.026, 0.210, 0.250, null);
  gt.cyl(0.052, 0.030, 24, T([0, 0, -0.062], [0, Math.PI / 2, 0]));
  addPart(R, gt, {
    name: 'V6_TimingCover', title: 'Timing cover', group: 'drive', mat: 'alu',
    loc: [-0.225, 0, 0.048], edir: [-1, 0, 0], emag: 0.34,
    desc: 'Seals the timing chain that ties the crankshaft to all four camshafts, and carries ' +
      'the front crankshaft oil seal.'
  });

  const gr = new Geo();
  gr.box(0.022, 0.250, 0.270, null);
  addPart(R, gr, {
    name: 'V6_RearPlate', title: 'Bellhousing face', group: 'drive', mat: 'alu',
    loc: [0.224, 0, 0.040], edir: [1, 0, 0], emag: 0.30,
    desc: 'The mounting face for the gearbox, and the datum the crankshaft endfloat is measured from.'
  });
}

function buildCrank(R) {
  const g = new Geo();
  [-0.171, -0.057, 0.057, 0.171].forEach(x =>
    g.cyl(0.0315, 0.032, 28, T([x, 0, 0], [0, Math.PI / 2, 0])));
  g.cyl(0.024, 0.090, 24, T([-0.222, 0, 0], [0, Math.PI / 2, 0]));
  g.cyl(0.030, 0.026, 24, T([0.200, 0, 0], [0, Math.PI / 2, 0]));
  g.cyl(0.056, 0.020, 28, T([0.219, 0, 0], [0, Math.PI / 2, 0]));
  for (let i = 0; i < 3; i++) {
    const ph = 120 * i * D2R;
    const py = CR * Math.sin(ph), pz = CR * Math.cos(ph);
    g.cyl(0.0265, 0.058, 28, T([XS[i], py, pz], [0, Math.PI / 2, 0]));
    [-0.037, 0.037].forEach(dx => {
      g.cyl(0.062, 0.016, 28, T([XS[i] + dx, -py * 0.30, -pz * 0.30], [0, Math.PI / 2, 0]));
      g.box(0.015, 0.052, 0.052, T([XS[i] + dx, py * 0.5, pz * 0.5], [-Math.atan2(py, pz), 0, 0]));
    });
  }
  addPart(R, g, {
    name: 'V6_Crankshaft', title: 'Crankshaft', group: 'crank', mat: 'crank',
    loc: [0, 0, 0], edir: [0, 0, -1], emag: 0.10, anim: 'crank',
    desc: 'A forged steel crank with three throws spaced 120 degrees apart. Each throw carries two ' +
      'connecting rods, one from each bank, which is exactly why a V6 needs only three throws for six ' +
      'cylinders. The counterweights cancel the shaking forces of everything going up and down.'
  });

  const gf = new Geo();
  gf.cyl(0.130, 0.020, 44, T([0, 0, 0], [0, Math.PI / 2, 0]));
  gf.cyl(0.138, 0.010, 48, T([0.012, 0, 0], [0, Math.PI / 2, 0]));
  for (let k = 0; k < 8; k++) {
    const a = TAU * k / 8;
    gf.cyl(0.010, 0.024, 10, T([0, Math.cos(a) * 0.070, Math.sin(a) * 0.070], [0, Math.PI / 2, 0]));
  }
  addPart(R, gf, {
    name: 'V6_Flywheel', title: 'Flywheel', group: 'drive', mat: 'steel',
    loc: [0.248, 0, 0], edir: [1, 0, 0], emag: 0.46, anim: 'crank',
    desc: 'Six power strokes per two revolutions still arrive as six separate kicks. The flywheel ' +
      'stores energy between them so what reaches the clutch feels like torque rather than hammering. ' +
      'Its outer ring gear is what the starter motor engages.'
  });

  const gp = new Geo();
  gp.cyl(0.075, 0.018, 40, T([0, 0, 0], [0, Math.PI / 2, 0]));
  gp.cyl(0.068, 0.030, 40, T([-0.020, 0, 0], [0, Math.PI / 2, 0]));
  gp.cyl(0.028, 0.050, 24, T([0.010, 0, 0], [0, Math.PI / 2, 0]));
  addPart(R, gp, {
    name: 'V6_CrankPulley', title: 'Crank pulley & damper', group: 'drive', mat: 'steel',
    loc: [-0.262, 0, 0], edir: [-1, 0, 0], emag: 0.46, anim: 'crank',
    desc: 'Drives the accessory belt, and its rubber isolation ring absorbs the torsional wind-up ' +
      'that would otherwise crack the crankshaft nose.'
  });
}

function buildPistons(R) {
  CYLS.forEach(([num, i, s]) => {
    const b = bankDir(s), sv = pistonS(i, s, 0);
    const pos = [bankX(i, s), b[1] * sv, b[2] * sv];
    const rot = [bankRx(s), 0, 0];

    const g = new Geo();
    g.cyl(0.0440, 0.026, 36, T([0, 0, 0.0225]));
    g.cyl(0.0432, 0.044, 36, T([0, 0, -0.012]));
    [0.0300, 0.0245, 0.0185].forEach(z => g.tube(0.0445, 0.0410, 0.0030, T([0, 0, z]), 36));
    g.cyl(0.016, 0.052, 20, T([0, 0, 0], [0, Math.PI / 2, 0]));
    addPart(R, g, {
      name: 'V6_Piston_' + num, title: 'Piston ' + num, group: 'piston', mat: 'piston',
      loc: pos, rot, edir: b, emag: EX.piston, anim: 'piston', cyl: num, bank: s,
      desc: 'Forged piston, 89 mm bore. Two compression rings seal the burning charge above it and ' +
        'one oil control ring scrapes the bore clean below. It changes direction completely twice per ' +
        'revolution, which at 6000 rpm is 200 times a second.'
    });

    const gw = new Geo();
    gw.cyl(0.0148, 0.062, 20, T([0, 0, 0], [0, Math.PI / 2, 0]));
    addPart(R, gw, {
      name: 'V6_WristPin_' + num, title: 'Gudgeon pin ' + num, group: 'piston', mat: 'chrome',
      loc: pos, rot, edir: b, emag: EX.wpin, anim: 'piston', cyl: num, bank: s,
      desc: 'The hinge between piston and rod. Fully floating, held in by a circlip at each end.'
    });

    const gr = new Geo();
    gr.tube(0.0195, 0.0150, 0.026, T([0, 0, 0], [0, Math.PI / 2, 0]), 24);
    gr.box(0.017, 0.030, 0.104, T([0, 0, -0.073]));
    gr.box(0.030, 0.014, 0.098, T([0, 0, -0.073]));
    gr.tube(0.0385, 0.0268, 0.030, T([0, 0, -P.rod], [0, Math.PI / 2, 0]), 28);
    gr.box(0.030, 0.076, 0.020, T([0, 0, -P.rod - 0.030]));
    [-0.031, 0.031].forEach(by => gr.cyl(0.0055, 0.052, 10, T([0, by, -P.rod - 0.016])));
    addPart(R, gr, {
      name: 'V6_ConRod_' + num, title: 'Connecting rod ' + num, group: 'piston', mat: 'titanium',
      loc: pos, rot, edir: b, emag: EX.rod, anim: 'rod', cyl: num, bank: s,
      desc: '150 mm between centres. It turns the piston straight-line motion into rotation, and its ' +
        'split big end is what lets the crankshaft be one solid forging.'
    });
  });
}

function buildHeads(R) {
  for (const s of [1, -1]) {
    const bank = s > 0 ? 'A' : 'B';
    const g = new Geo();
    g.box(0.420, 0.150, 0.078, T([0, 0, 0.265]));
    for (let i = 0; i < 3; i++) {
      g.box(0.076, 0.034, 0.056, T([bankX(i, s), -s * 0.070, 0.262]));
      g.box(0.076, 0.034, 0.050, T([bankX(i, s), s * 0.070, 0.256]));
    }
    [-s * 0.024, s * 0.024].forEach(ly => {
      [-0.175, -0.058, 0.058, 0.175].forEach(cx => g.box(0.026, 0.040, 0.036, T([cx, ly, 0.320])));
    });
    addPart(R, g, {
      name: 'V6_Head_' + bank, title: 'Cylinder head ' + bank, group: 'head', mat: 'alu',
      loc: [0, 0, 0], rot: [bankRx(s), 0, 0], edir: bankDir(s), emag: EX.head, bank: s,
      desc: 'Four valves per cylinder in a pentroof chamber with the plug dead centre. Intake ports face ' +
        'into the V, exhaust ports face outboard. More than anything else, the head is what decides how ' +
        'much air this engine can breathe, and therefore how much power it makes.'
    });

    const gg = new Geo();
    gg.box(0.420, 0.150, 0.0035, null);
    for (let i = 0; i < 3; i++) gg.tube(0.050, 0.0448, 0.005, T([bankX(i, s), 0, 0]), 28);
    addPart(R, gg, {
      name: 'V6_HeadGasket_' + bank, title: 'Head gasket ' + bank, group: 'head', mat: 'copper',
      loc: bankPlace(s, 0, 0, 0.2278), rot: [bankRx(s), 0, 0], edir: bankDir(s), emag: EX.gasket, bank: s,
      desc: 'A multi layer steel shim that has to seal 60 bar of combustion pressure, coolant and oil ' +
        'across the same joint. It is the part that fails when an engine overheats.'
    });

    const gc = new Geo();
    gc.box(0.400, 0.146, 0.072, null);
    gc.box(0.412, 0.154, 0.010, T([0, 0, -0.036]));
    if (s > 0) gc.cyl(0.026, 0.026, 22, T([-0.140, 0, 0.042]));
    addPart(R, gc, {
      name: 'V6_ValveCover_' + bank, title: 'Cam cover ' + bank, group: 'head', mat: 'red',
      loc: bankPlace(s, 0, 0, 0.364), rot: [bankRx(s), 0, 0], edir: bankDir(s), emag: EX.cover, bank: s,
      desc: 'Encloses the camshafts and drains splash oil back to the sump. The cap on bank A is the ' +
        'engine oil filler.'
    });
  }
}

function buildValvetrain(R) {
  CYLS.forEach(([num, i, s]) => {
    ['IN', 'EX'].forEach(kind => {
      const ly = kind === 'IN' ? -s * 0.024 : s * 0.024;
      const hr = kind === 'IN' ? 0.0178 : 0.0156;
      const mat = kind === 'IN' ? 'steel' : 'titanium';
      const word = kind === 'IN' ? 'Intake' : 'Exhaust';
      [-0.026, 0.026].forEach((dx, k) => {
        const x = bankX(i, s) + dx;

        const gv = new Geo();
        gv.cone(hr, 0.0060, 0.011, 24, T([0, 0, -0.0035]));
        gv.cyl(0.0036, 0.108, 14, T([0, 0, 0.0525]));
        gv.cyl(0.0050, 0.006, 14, T([0, 0, 0.1045]));
        addPart(R, gv, {
          name: 'V6_Valve_' + num + '_' + kind + '_' + (k + 1),
          title: word + ' valve ' + (k + 1) + ', cyl ' + num,
          group: 'valve', mat, loc: bankPlace(s, x, ly, 0.226), rot: [bankRx(s), 0, 0],
          edir: bankDir(s), emag: EX.valve, anim: 'valve', cyl: num, kind, bank: s,
          desc: word + ' valve. It is pushed open by the cam and slammed shut by its spring, ' +
            (kind === 'IN'
              ? 'and it is made larger than the exhaust valve because getting air in is harder than pushing it out.'
              : 'and it runs red hot because burnt gas leaves through it - which is why it is the lighter, ' +
                'heat resistant alloy of the four.')
        });

        const gs = new Geo();
        gs.sweep(helixPts(0.0108, P.springLen, 6.5, 46), 0.0021, 8, null, false);
        addPart(R, gs, {
          name: 'V6_Spring_' + num + '_' + kind + '_' + (k + 1),
          title: 'Valve spring, ' + word.toLowerCase() + ' ' + (k + 1) + ', cyl ' + num,
          group: 'valve', mat: 'chrome', loc: bankPlace(s, x, ly, 0.2665), rot: [bankRx(s), 0, 0],
          edir: bankDir(s), emag: EX.spring, anim: 'spring', cyl: num, kind, bank: s,
          desc: 'The only thing closing this valve. If it is too weak for the revs, the valve floats ' +
            'off the cam and the engine stops making power - or meets a piston.'
        });

        const gr2 = new Geo();
        gr2.cyl(0.0118, 0.0055, 20, null);
        gr2.cyl(0.0135, 0.0060, 20, T([0, 0, 0.0065]));
        addPart(R, gr2, {
          name: 'V6_Retainer_' + num + '_' + kind + '_' + (k + 1),
          title: 'Bucket tappet, ' + word.toLowerCase() + ' ' + (k + 1) + ', cyl ' + num,
          group: 'valve', mat: 'steel', loc: bankPlace(s, x, ly, 0.3095), rot: [bankRx(s), 0, 0],
          edir: bankDir(s), emag: EX.retainer, anim: 'valve', cyl: num, kind, bank: s,
          desc: 'The cam lobe wipes directly across this bucket, which keeps the valvetrain light ' +
            'and lets the engine rev.'
        });
      });
    });
  });

  for (const s of [1, -1]) {
    const bank = s > 0 ? 'A' : 'B';
    ['IN', 'EX'].forEach(kind => {
      const ly = kind === 'IN' ? -s * 0.024 : s * 0.024;
      const g = new Geo();
      g.cyl(0.0115, 0.430, 22, T([0, 0, 0], [0, Math.PI / 2, 0]));
      CYLS.forEach(([num, i, s2]) => {
        if (s2 !== s) return;
        const base = kind === 'IN' ? 450 : 270;
        const phi = (180 - (FIRE[num] + base) * 0.5) * D2R;
        const d = [0, -Math.sin(phi), Math.cos(phi)];
        [-0.026, 0.026].forEach(dx => {
          const cx = bankX(i, s) + dx;
          g.cyl(0.0158, 0.013, 24, T([cx, 0, 0], [0, Math.PI / 2, 0]));
          g.cyl(0.0106, 0.013, 20, T([cx, d[1] * 0.0125, d[2] * 0.0125], [0, Math.PI / 2, 0]));
          g.box(0.013, 0.021, 0.021, T([cx, d[1] * 0.007, d[2] * 0.007], [-Math.atan2(d[1], d[2]), 0, 0]));
        });
      });
      g.cyl(0.052, 0.012, 36, T([-0.222, 0, 0], [0, Math.PI / 2, 0]));
      g.cyl(0.020, 0.030, 20, T([-0.210, 0, 0], [0, Math.PI / 2, 0]));
      addPart(R, g, {
        name: 'V6_Cam_' + bank + '_' + kind,
        title: (kind === 'IN' ? 'Intake' : 'Exhaust') + ' camshaft, bank ' + bank,
        group: 'valve', mat: 'crank', loc: bankPlace(s, 0, ly, 0.334), rot: [bankRx(s), 0, 0],
        edir: bankDir(s), emag: EX.cam, anim: 'cam', kind, bank: s,
        desc: 'Turns at exactly half crankshaft speed, because a four stroke cycle takes two crank ' +
          'revolutions. The shape of each lobe - when it lifts, how far, and for how long - is the ' +
          'single biggest influence on an engine’s character.'
      });
    });
  }
}

function buildIntake(R) {
  const g = new Geo();
  g.box(0.300, 0.150, 0.090, T([0.020, 0, 0.375]));
  g.box(0.320, 0.090, 0.055, T([0.020, 0, 0.340]));
  g.cyl(0.030, 0.040, 28, T([-0.150, 0, 0.375], [0, Math.PI / 2, 0]));
  addPart(R, g, {
    name: 'V6_IntakePlenum', title: 'Intake plenum', group: 'intake', mat: 'aluMach',
    loc: [0, 0, 0], edir: [0, 0, 1], emag: 0.62,
    desc: 'A shared air reservoir sitting in the V. Six cylinders gulp in turn, and without this volume ' +
      'each gulp would starve its neighbours.'
  });

  const gt = new Geo();
  gt.cyl(0.038, 0.062, 32, T([0, 0, 0], [0, Math.PI / 2, 0]));
  gt.cyl(0.048, 0.010, 32, T([0.028, 0, 0], [0, Math.PI / 2, 0]));
  gt.cyl(0.036, 0.004, 6, T([0, 0, 0], [0, Math.PI / 2, 0]));
  gt.cyl(0.010, 0.040, 14, T([0, 0.042, 0]));
  addPart(R, gt, {
    name: 'V6_ThrottleBody', title: 'Throttle body', group: 'intake', mat: 'aluMach',
    loc: [-0.205, 0, 0.375], edir: [-1, 0, 0.4], emag: 0.60,
    desc: 'One butterfly plate decides how much air the whole engine may draw. Everything the driver ' +
      'calls "throttle" happens here; the fuel simply follows the air.'
  });

  CYLS.forEach(([num, i, s]) => {
    const p0 = [XS[i], s * 0.072, 0.362];
    const p1 = [XS[i], s * 0.150, 0.312];
    const p2 = bankPlace(s, bankX(i, s), -s * 0.072, 0.262);
    const gr = new Geo();
    gr.sweep(arc3(p0, p1, p2, 18), 0.0175, 16, null, true);
    addPart(R, gr, {
      name: 'V6_Runner_' + num, title: 'Intake runner ' + num, group: 'intake', mat: 'aluMach',
      loc: [0, 0, 0], edir: [bankDir(s)[0] * 0.5, bankDir(s)[1] * 0.5, bankDir(s)[2] * 0.5 + 1], emag: 0.52,
      desc: 'Length is tuned, not arbitrary. When the valve shuts, a pressure wave runs up the runner ' +
        'and back down; time it right and it arrives just before the valve closes next cycle and rams ' +
        'in extra air for free.'
    });
  });
}

function buildExhaust(R) {
  for (const s of [1, -1]) {
    const bank = s > 0 ? 'A' : 'B';
    CYLS.forEach(([num, i, s2]) => {
      if (s2 !== s) return;
      const p0 = bankPlace(s, bankX(i, s), s * 0.072, 0.258);
      const p1 = [XS[i], s * 0.255, 0.130];
      const p2 = [0.150, s * 0.185, 0.010];
      const g = new Geo();
      g.sweep(arc3(p0, p1, p2, 20), 0.0165, 14, null, true);
      addPart(R, g, {
        name: 'V6_Header_' + num, title: 'Exhaust primary ' + num, group: 'exhaust', mat: 'steel',
        loc: [0, 0, 0], edir: [0, s, -0.3], emag: 0.46,
        desc: 'Equal length primaries so each cylinder gets the same scavenging pulse, and so no ' +
          'cylinder blows its exhaust back down its neighbour’s pipe.'
      });
    });
    const gc = new Geo();
    gc.cone(0.034, 0.026, 0.090, 26, T([0, 0, 0], [0, Math.PI / 2, 0]));
    gc.cyl(0.026, 0.120, 26, T([0.100, 0, 0], [0, Math.PI / 2, 0]));
    gc.cyl(0.034, 0.010, 26, T([0.158, 0, 0], [0, Math.PI / 2, 0]));
    addPart(R, gc, {
      name: 'V6_Collector_' + bank, title: 'Collector ' + bank, group: 'exhaust', mat: 'steel',
      loc: [0.196, s * 0.185, 0.010], edir: [0.4, s, -0.3], emag: 0.52,
      desc: 'Three primaries merge into one pipe. The oxygen sensor screwed in here is what tells the ' +
        'ECU whether the mixture was right, closing the loop on the fuel system.'
    });
  }
}

function buildFuel(R) {
  for (const s of [1, -1]) {
    const bank = s > 0 ? 'A' : 'B';
    const g = new Geo();
    g.cyl(0.0115, 0.360, 20, T([0, 0, 0], [0, Math.PI / 2, 0]));
    g.cyl(0.016, 0.020, 20, T([-0.180, 0, 0], [0, Math.PI / 2, 0]));
    addPart(R, g, {
      name: 'V6_FuelRail_' + bank, title: 'Fuel rail ' + bank, group: 'fuel', mat: 'aluMach',
      loc: bankPlace(s, 0, -s * 0.098, 0.244), rot: [bankRx(s), 0, 0],
      edir: [bankDir(s)[0], bankDir(s)[1] - s * 0.6, bankDir(s)[2]], emag: EX.rail, bank: s,
      desc: 'Petrol held at a regulated pressure so that identical injector opening times deliver ' +
        'identical amounts of fuel to all six cylinders.'
    });
  }

  CYLS.forEach(([num, i, s]) => {
    const gi = new Geo();
    gi.cyl(0.0090, 0.048, 16, null);
    gi.cyl(0.0125, 0.012, 16, T([0, 0, 0.024]));
    gi.cone(0.0075, 0.0035, 0.014, 14, T([0, 0, -0.029]));
    addPart(R, gi, {
      name: 'V6_Injector_' + num, title: 'Fuel injector ' + num, group: 'fuel', mat: 'carbon',
      loc: bankPlace(s, bankX(i, s), -s * 0.090, 0.236), rot: [bankRx(s), 0, 0],
      edir: [bankDir(s)[0], bankDir(s)[1] - s * 0.5, bankDir(s)[2]], emag: EX.inj, cyl: num, bank: s,
      desc: 'Opens for a couple of milliseconds per cycle and atomises petrol into the port. ' +
        'That opening time - the pulse width - is exactly what the fuel control on this page scales.'
    });

    const gp = new Geo();
    gp.cyl(0.0080, 0.040, 14, T([0, 0, 0.020]));
    gp.cyl(0.0105, 0.014, 6, T([0, 0, 0.047]));
    gp.cyl(0.0092, 0.030, 16, T([0, 0, 0.070]));
    gp.cyl(0.0065, 0.014, 14, T([0, 0, 0.092]));
    gp.cyl(0.0018, 0.012, 8, T([0, 0, -0.004]));
    addPart(R, gp, {
      name: 'V6_SparkPlug_' + num, title: 'Spark plug ' + num, group: 'fuel', mat: 'brass',
      loc: bankPlace(s, bankX(i, s), 0, 0.240), rot: [bankRx(s), 0, 0],
      edir: bankDir(s), emag: EX.plug, cyl: num, bank: s,
      desc: 'Fires a few degrees before top dead centre on the compression stroke, so peak pressure ' +
        'lands just after the crank has gone over the top and can actually be pushed on.'
    });

    const gf = new Geo();
    gf.sphere(0.030, 14, null);
    addPart(R, gf, {
      name: 'V6_Flame_' + num, title: 'Combustion, cylinder ' + num, group: 'fuel', mat: 'flame',
      loc: bankPlace(s, bankX(i, s), 0, 0.208), rot: [bankRx(s), 0, 0],
      edir: bankDir(s), emag: 0, anim: 'flame', cyl: num, bank: s,
      desc: 'The power stroke for cylinder ' + num + '.'
    });
  });
}

function buildDrive(R) {
  const g = new Geo();
  g.cyl(0.036, 0.020, 28, T([0, 0, 0], [0, Math.PI / 2, 0]));
  g.cyl(0.014, 0.040, 16, T([0.012, 0, 0], [0, Math.PI / 2, 0]));
  addPart(R, g, {
    name: 'V6_Idler', title: 'Idler & tensioner', group: 'drive', mat: 'steel',
    loc: [-0.262, 0, 0.235], edir: [-1, 0, 0.5], emag: 0.40,
    desc: 'Keeps the accessory belt tight as it stretches and as the alternator load swings.'
  });

  const pts = [];
  const cA = [-0.262, 0, 0], cB = [-0.262, 0, 0.235];
  for (let k = 0; k <= 24; k++) {
    const a = (-90 + 180 * k / 24) * D2R;
    pts.push([cA[0], Math.cos(a) * 0.076, Math.sin(a) * 0.076]);
  }
  for (let k = 0; k <= 24; k++) {
    const a = (90 + 180 * k / 24) * D2R;
    pts.push([cB[0], Math.cos(a) * 0.037, cB[2] + Math.sin(a) * 0.037]);
  }
  pts.push(pts[0].slice());
  const gb = new Geo();
  gb.sweep(pts, 0.0055, 8, null, false);
  addPart(R, gb, {
    name: 'V6_DriveBelt', title: 'Accessory belt', group: 'drive', mat: 'rubber',
    loc: [0, 0, 0], edir: [-1, 0, 0.2], emag: 0.36,
    desc: 'Takes power off the crank nose to run the water pump, alternator and air conditioning ' +
      'compressor. It is the only part here that is meant to be replaced on a schedule.'
  });
}

function buildEngine(renderer) {
  PARTS = [];
  RND = 1;
  buildBlock(renderer);
  buildCrank(renderer);
  buildPistons(renderer);
  buildHeads(renderer);
  buildValvetrain(renderer);
  buildIntake(renderer);
  buildExhaust(renderer);
  buildFuel(renderer);
  buildDrive(renderer);
  return PARTS;
}

/* ------------------------------------------------------------- kinematics */
const _tmpA = new Float32Array(16);
const _tmpB = new Float32Array(16);

function updateParts(parts, st) {
  const a = st.crank, ex = st.explode, sh = st.shatter;
  const ff = st.running ? Math.min(1, Math.max(0, st.fuel / 18)) : 0;

  for (const p of parts) {
    let pos, rotM;
    switch (p.anim) {
      case 'crank':
        pos = p.baseLoc.slice();
        rotM = T([0, 0, 0], [a * D2R, 0, 0]);
        break;
      case 'piston': {
        const [i, s] = NUM2[p.cyl];
        const b = bankDir(s), sv = pistonS(i, s, a);
        pos = [bankX(i, s), b[1] * sv, b[2] * sv];
        rotM = T([0, 0, 0], p.baseRot);
        break;
      }
      case 'rod': {
        const [i, s] = NUM2[p.cyl];
        const b = bankDir(s), sv = pistonS(i, s, a);
        pos = [bankX(i, s), b[1] * sv, b[2] * sv];
        const pin = crankPin(i, a);
        const v = V3.norm(V3.sub(pin, pos));
        rotM = M4.fromTo([0, 0, -1], v, [0, 0, 0]);
        break;
      }
      case 'valve': {
        const lift = valveLift(p.cyl, p.kind, a);
        const b = bankDir(p.bank);
        pos = [p.baseLoc[0] - b[0] * lift, p.baseLoc[1] - b[1] * lift, p.baseLoc[2] - b[2] * lift];
        rotM = T([0, 0, 0], p.baseRot);
        break;
      }
      case 'spring': {
        const lift = valveLift(p.cyl, p.kind, a);
        pos = p.baseLoc.slice();
        rotM = M4.trs([0, 0, 0], p.baseRot, [1, 1, 1 - lift / P.springLen]);
        break;
      }
      case 'cam':
        pos = p.baseLoc.slice();
        rotM = T([0, 0, 0], [bankRx(p.bank) + a * 0.5 * D2R, 0, 0]);
        break;
      case 'flame': {
        const v = combustion(p.cyl, a) * ff;
        pos = p.baseLoc.slice();
        const sc = 0.02 + 1.05 * v;
        rotM = M4.trs([0, 0, 0], p.baseRot, [sc, sc, sc]);
        p.emit = 30 * v;
        p.hidden = v < 0.02;
        break;
      }
      default:
        pos = p.baseLoc.slice();
        rotM = T([0, 0, 0], p.baseRot);
    }

    if (ex > 0.0001) {
      const k = p.emag * ex;
      pos = [pos[0] + p.edir[0] * k, pos[1] + p.edir[1] * k, pos[2] + p.edir[2] * k];
    }
    if (sh > 0.0001) {
      const k = p.shDist * sh;
      pos = [pos[0] + p.shDir[0] * k, pos[1] + p.shDir[1] * k, pos[2] + p.shDir[2] * k];
      const spin = T([0, 0, 0], [p.shSpin[0] * sh, p.shSpin[1] * sh, p.shSpin[2] * sh]);
      rotM = M4.mul(rotM, spin, _tmpB);
    }
    rotM[12] = pos[0]; rotM[13] = pos[1]; rotM[14] = pos[2]; rotM[15] = 1;
    p.matrix.set(rotM);
    if (p.anim !== 'flame') p.emit = 0;
  }
}

function worldCenter(p) { return M4.transformPoint(p.matrix, p.center); }
