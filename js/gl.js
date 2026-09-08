/* ============================================================================
   gl.js - a small dependency-free WebGL2 renderer.
   Coordinate convention matches the Blender model: Z is up, cylinders run
   along local +Z, and the engine crankshaft axis is world X.
   ========================================================================== */
'use strict';

/* ------------------------------------------------------------------ maths */
const V3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};

/* column-major 4x4, m[col * 4 + row] - the layout WebGL wants */
const M4 = {
  ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },

  mul(a, b, out) {
    out = out || new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  },

  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    const o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf;
    o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },

  lookAt(eye, center, up) {
    const z = V3.norm(V3.sub(eye, center));
    const x = V3.norm(V3.cross(up, z));
    const y = V3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -V3.dot(x, eye), -V3.dot(y, eye), -V3.dot(z, eye), 1
    ]);
  },

  /* Blender style: translation, XYZ euler, uniform-ish scale */
  trs(pos, rot, scl) {
    const [rx, ry, rz] = rot || [0, 0, 0];
    const s = scl || [1, 1, 1];
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    /* R = Rz * Ry * Rx  (Blender XYZ euler) */
    const m00 = cz * cy,               m01 = cz * sy * sx - sz * cx, m02 = cz * sy * cx + sz * sx;
    const m10 = sz * cy,               m11 = sz * sy * sx + cz * cx, m12 = sz * sy * cx - cz * sx;
    const m20 = -sy,                   m21 = cy * sx,                m22 = cy * cx;
    return new Float32Array([
      m00 * s[0], m10 * s[0], m20 * s[0], 0,
      m01 * s[1], m11 * s[1], m21 * s[1], 0,
      m02 * s[2], m12 * s[2], m22 * s[2], 0,
      pos[0], pos[1], pos[2], 1
    ]);
  },

  /* rotation matrix that takes unit vector a onto unit vector b */
  fromTo(a, b, pos) {
    const v = V3.cross(a, b);
    const c = V3.dot(a, b);
    let m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1;
    if (c < -0.999999) {
      m00 = -1; m11 = -1;                       /* 180 degrees */
    } else if (c < 0.999999) {
      const k = 1 / (1 + c);
      const [vx, vy, vz] = v;
      m00 = 1 - (vy * vy + vz * vz) * k; m01 = -vz + vx * vy * k;      m02 = vy + vx * vz * k;
      m10 = vz + vx * vy * k;            m11 = 1 - (vx * vx + vz * vz) * k; m12 = -vx + vy * vz * k;
      m20 = -vy + vx * vz * k;           m21 = vx + vy * vz * k;       m22 = 1 - (vx * vx + vy * vy) * k;
    }
    const p = pos || [0, 0, 0];
    return new Float32Array([
      m00, m10, m20, 0,
      m01, m11, m21, 0,
      m02, m12, m22, 0,
      p[0], p[1], p[2], 1
    ]);
  },

  transformPoint(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
  },

  transformDir(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8]  * p[2],
      m[1] * p[0] + m[5] * p[1] + m[9]  * p[2],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2]
    ];
  },

  /* upper-left 3x3 as a mat3 for normals (our transforms are rigid) */
  normalMat(m) {
    return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  }
};

/* -------------------------------------------------------- geometry builder */
class Geo {
  constructor() { this.pos = []; this.nor = []; this.idx = []; }

  _push(verts, norms, faces, m) {
    const base = this.pos.length / 3;
    if (m) {
      for (let i = 0; i < verts.length; i += 3) {
        const p = M4.transformPoint(m, [verts[i], verts[i + 1], verts[i + 2]]);
        const n = M4.transformDir(m, [norms[i], norms[i + 1], norms[i + 2]]);
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(n[0], n[1], n[2]);
      }
    } else {
      for (let i = 0; i < verts.length; i++) { this.pos.push(verts[i]); this.nor.push(norms[i]); }
    }
    for (let i = 0; i < faces.length; i++) this.idx.push(base + faces[i]);
    return this;
  }

  box(sx, sy, sz, m) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const v = [], n = [], f = [];
    const faces = [
      [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0]],
      [[-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-1, 0, 0]],
      [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], [0, 1, 0]],
      [[x, -y, -z], [x, -y, z], [-x, -y, z], [-x, -y, -z], [0, -1, 0]],
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
      [[-x, y, -z], [x, y, -z], [x, -y, -z], [-x, -y, -z], [0, 0, -1]]
    ];
    faces.forEach((fc, k) => {
      const nv = fc[4];
      for (let i = 0; i < 4; i++) { v.push(...fc[i]); n.push(...nv); }
      const b = k * 4;
      f.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return this._push(v, n, f, m);
  }

  cone(r1, r2, h, seg, m, caps) {
    caps = caps !== false;
    const v = [], n = [], f = [];
    const dr = r2 - r1, nz = -dr, nr = h;
    const ln = Math.hypot(nr, nz) || 1;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.push(c * r1, s * r1, -h / 2); n.push(c * nr / ln, s * nr / ln, nz / ln);
      v.push(c * r2, s * r2, h / 2);  n.push(c * nr / ln, s * nr / ln, nz / ln);
    }
    for (let k = 0; k < seg; k++) {
      const b = k * 2;
      f.push(b, b + 2, b + 3, b, b + 3, b + 1);
    }
    if (caps) {
      let base = (seg + 1) * 2;
      if (r2 > 1e-6) {
        v.push(0, 0, h / 2); n.push(0, 0, 1);
        for (let k = 0; k <= seg; k++) {
          const a = (k / seg) * Math.PI * 2;
          v.push(Math.cos(a) * r2, Math.sin(a) * r2, h / 2); n.push(0, 0, 1);
        }
        for (let k = 0; k < seg; k++) f.push(base, base + 1 + k, base + 2 + k);
        base += seg + 2;
      }
      if (r1 > 1e-6) {
        v.push(0, 0, -h / 2); n.push(0, 0, -1);
        for (let k = 0; k <= seg; k++) {
          const a = (k / seg) * Math.PI * 2;
          v.push(Math.cos(a) * r1, Math.sin(a) * r1, -h / 2); n.push(0, 0, -1);
        }
        for (let k = 0; k < seg; k++) f.push(base, base + 2 + k, base + 1 + k);
      }
    }
    return this._push(v, n, f, m);
  }

  cyl(r, h, seg, m, caps) { return this.cone(r, r, h, seg, m, caps); }

  tube(ro, ri, h, m, seg) {
    seg = seg || 28;
    const v = [], n = [], f = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.push(c * ro, s * ro, -h / 2); n.push(c, s, 0);
      v.push(c * ro, s * ro, h / 2);  n.push(c, s, 0);
    }
    for (let k = 0; k < seg; k++) { const b = k * 2; f.push(b, b + 2, b + 3, b, b + 3, b + 1); }
    let base = (seg + 1) * 2;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.push(c * ri, s * ri, -h / 2); n.push(-c, -s, 0);
      v.push(c * ri, s * ri, h / 2);  n.push(-c, -s, 0);
    }
    for (let k = 0; k < seg; k++) { const b = base + k * 2; f.push(b, b + 3, b + 2, b, b + 1, b + 3); }
    base += (seg + 1) * 2;
    [[h / 2, 1], [-h / 2, -1]].forEach(([z, dir]) => {
      const st = v.length / 3;
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        v.push(c * ro, s * ro, z); n.push(0, 0, dir);
        v.push(c * ri, s * ri, z); n.push(0, 0, dir);
      }
      for (let k = 0; k < seg; k++) {
        const b = st + k * 2;
        if (dir > 0) f.push(b, b + 2, b + 3, b, b + 3, b + 1);
        else f.push(b, b + 3, b + 2, b, b + 1, b + 3);
      }
    });
    return this._push(v, n, f, m);
  }

  sphere(r, seg, m) {
    const v = [], n = [], f = [];
    const rows = Math.max(4, seg >> 1);
    for (let j = 0; j <= rows; j++) {
      const phi = (j / rows) * Math.PI;
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(th), y = Math.sin(phi) * Math.sin(th), z = Math.cos(phi);
        v.push(x * r, y * r, z * r); n.push(x, y, z);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < seg; k++) {
        const a = j * (seg + 1) + k, b = a + seg + 1;
        f.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    return this._push(v, n, f, m);
  }

  sweep(pts, r, seg, m, caps) {
    caps = caps !== false;
    const v = [], n = [], f = [];
    const N = pts.length;
    const up = [0, 0, 1];
    const rings = [];
    for (let i = 0; i < N; i++) {
      let t;
      if (i === 0) t = V3.sub(pts[1], pts[0]);
      else if (i === N - 1) t = V3.sub(pts[N - 1], pts[N - 2]);
      else t = V3.sub(pts[i + 1], pts[i - 1]);
      if (V3.len(t) < 1e-9) t = [0, 0, 1];
      t = V3.norm(t);
      const ref = Math.abs(V3.dot(t, up)) < 0.93 ? up : [1, 0, 0];
      const n1 = V3.norm(V3.sub(ref, V3.scale(t, V3.dot(ref, t))));
      const n2 = V3.cross(t, n1);
      const rr = Array.isArray(r) ? r[i] : r;
      const ring = [];
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nn = V3.norm(V3.add(V3.scale(n1, c), V3.scale(n2, s)));
        const p = V3.add(pts[i], V3.scale(nn, rr));
        ring.push(p);
        v.push(p[0], p[1], p[2]); n.push(nn[0], nn[1], nn[2]);
      }
      rings.push(ring);
    }
    const per = seg + 1;
    for (let i = 0; i < N - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = i * per + k, b = a + per;
        f.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    if (caps) {
      [[0, -1], [N - 1, 1]].forEach(([ri, dir]) => {
        const c = pts[ri];
        let tv;
        if (ri === 0) tv = V3.norm(V3.sub(pts[0], pts[1]));
        else tv = V3.norm(V3.sub(pts[N - 1], pts[N - 2]));
        const st = v.length / 3;
        v.push(c[0], c[1], c[2]); n.push(tv[0], tv[1], tv[2]);
        for (let k = 0; k <= seg; k++) {
          const p = rings[ri][k];
          v.push(p[0], p[1], p[2]); n.push(tv[0], tv[1], tv[2]);
        }
        for (let k = 0; k < seg; k++) {
          if (dir > 0) f.push(st, st + 1 + k, st + 2 + k);
          else f.push(st, st + 2 + k, st + 1 + k);
        }
      });
    }
    return this._push(v, n, f, m);
  }

  bounds() {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        lo[j] = Math.min(lo[j], this.pos[i + j]);
        hi[j] = Math.max(hi[j], this.pos[i + j]);
      }
    }
    return { lo, hi, mid: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] };
  }
}

/* ------------------------------------------------------------- the shader */
const VS = `#version 300 es
in vec3 aPos;
in vec3 aNor;
uniform mat4 uVP;
uniform mat4 uModel;
uniform mat3 uNM;
out vec3 vN;
out vec3 vW;
out vec3 vL;
out vec3 vLN;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vL = aPos;
  vLN = aNor;
  vN = normalize(uNM * aNor);
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN;
in vec3 vW;
in vec3 vL;
in vec3 vLN;
uniform vec3 uCam;
uniform vec3 uColor;
uniform float uMetal;
uniform float uRough;
uniform float uOpacity;
uniform float uEmit;
uniform vec3 uTint;
uniform float uTintAmt;
uniform float uFinish;
uniform float uFScale;
uniform float uBump;
uniform float uRVar;
uniform vec3 uEnvA;
uniform vec3 uEnvB;
uniform float uExposure;
uniform float uGhost;
uniform vec3 uGhostCol;
out vec4 outColor;

/* ---- cheap value noise, used for every surface finish ---- */
float h31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x),
                 mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x),
                 mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
/* rough cellular field for shot peening and powder coat */
float cell(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(h31(i + g), h31(i + g + 11.5), h31(i + g + 27.3));
    d = min(d, length(g + o - f));
  }
  return d;
}

float surf(vec3 p) {
  float S = uFScale;
  int k = int(uFinish + 0.5);
  if (k == 1) return fbm(p * S);                                    // sand cast
  if (k == 2) return 0.5 + 0.5 * sin(p.z * S * 2.6 + fbm(p * S * 0.5) * 5.0); // machined
  if (k == 3) return fbm(p * S) * 0.7 + fbm(p * S * 3.7) * 0.3;     // cast iron
  if (k == 4) return fbm(vec3(p.x * S * 0.05, p.y * S, p.z * S));   // brushed
  if (k == 5) return cell(p * S * 0.55);                            // powder coat
  if (k == 6) return 1.0 - cell(p * S * 0.5);                       // shot peened
  if (k == 7) return abs(fract(p.z * S * 0.22) - 0.5) * 2.0;        // ribbed
  if (k == 8) return fbm(p * S * 0.6);                              // heat tinted
  if (k == 9) return fbm(p * S) * 0.8 + 0.2 * cell(p * S * 0.3);    // forged
  return fbm(p * S * 0.7) * 0.35;                                   // polished
}

vec3 sky(vec3 d) {
  float t = clamp(d.z * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(uEnvB, uEnvA, pow(t, 1.35));
  c += (uEnvA * 0.34) * exp(-abs(d.z) * 9.0) * 0.55;
  return c;
}

float ggx(vec3 N, vec3 H, float a) {
  float a2 = a * a;
  float d = max(dot(N, H), 0.0);
  float k = d * d * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159 * k * k, 1e-5);
}
float gsmith(float ndv, float ndl, float a) {
  float k = (a + 1.0) * (a + 1.0) / 8.0;
  return (ndv / (ndv * (1.0 - k) + k)) * (ndl / (ndl * (1.0 - k) + k));
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;

  /* --- surface finish: bump from the height field, plus roughness break-up --- */
  vec3 LN = normalize(vLN);
  vec3 ref = abs(LN.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 Tl = normalize(cross(LN, ref));
  vec3 Bl = cross(LN, Tl);
  float e = 1.35 / max(uFScale, 1.0);
  float h0 = surf(vL);
  float dhu = (surf(vL + Tl * e) - h0) / e;
  float dhv = (surf(vL + Bl * e) - h0) / e;
  float amp = uBump * 0.0016;
  vec3 Tw = normalize(cross(N, normalize(mix(vec3(0.0,0.0,1.0), vec3(1.0,0.0,0.0), step(0.9, abs(N.z))))));
  vec3 Bw = cross(N, Tw);
  N = normalize(N - (Tw * dhu + Bw * dhv) * amp);

  vec3 R = reflect(-V, N);
  float rough = clamp(uRough * mix(1.0 - uRVar, 1.0 + uRVar, fbm(vL * uFScale * 0.22)), 0.035, 1.0);
  float a = rough * rough;

  vec3 base = mix(uColor, uTint, uTintAmt) * mix(1.0 - 0.13, 1.0 + 0.13, h0);
  vec3 diffCol = base * (1.0 - uMetal);
  vec3 F0 = mix(vec3(0.045), base, uMetal);
  float ndv = max(dot(N, V), 1e-4);

  vec3 L1 = normalize(vec3(-0.42, -0.66, 0.62));
  vec3 L2 = normalize(vec3(0.74, -0.30, 0.60));
  vec3 L3 = normalize(vec3(0.10, 0.85, 0.42));
  vec3 C1 = vec3(1.00, 0.99, 0.96) * 1.45;
  vec3 C2 = vec3(0.90, 0.93, 1.00) * 0.62;
  vec3 C3 = vec3(1.00, 0.96, 0.92) * 0.42;

  vec3 lit = vec3(0.0);
  vec3 Ls[3]; Ls[0] = L1; Ls[1] = L2; Ls[2] = L3;
  vec3 Cs[3]; Cs[0] = C1; Cs[1] = C2; Cs[2] = C3;
  for (int i = 0; i < 3; i++) {
    vec3 L = Ls[i];
    float ndl = max(dot(N, L), 0.0);
    if (ndl <= 0.0) continue;
    vec3 H = normalize(L + V);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float spec = ggx(N, H, a) * gsmith(ndv, ndl, rough) / (4.0 * ndv * ndl + 1e-4);
    lit += (diffCol / 3.14159 * (1.0 - F) + F * spec) * Cs[i] * ndl;
  }

  vec3 irr = sky(N) * 0.42;
  vec3 Fenv = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - ndv, 5.0);
  vec3 envSpec = sky(R) * Fenv * mix(1.00, 0.16, rough);
  float b1 = pow(max(dot(R, L1), 0.0), mix(700.0, 5.0, rough)) * mix(2.20, 0.18, rough);
  float b2 = pow(max(dot(R, L2), 0.0), mix(400.0, 4.0, rough)) * mix(1.10, 0.10, rough);
  envSpec += (b1 + b2) * F0;

  vec3 col = (lit + diffCol * irr + envSpec) * uExposure;
  col += base * uEmit;

  /* parts outside the current focus are drawn as flat context: same silhouette
     and shading direction, but a neutral slate that cannot be mistaken for the
     material of the part being described. */
  if (uGhost > 0.001) {
    float key = 0.42 + 0.58 * max(dot(N, L1), 0.0);
    float rim = pow(1.0 - ndv, 2.5) * 0.30;
    vec3 flat_ = uGhostCol * key + rim;
    col = mix(col, flat_, uGhost);
  }

  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  outColor = vec4(col, uOpacity);
}`;

const PICK_FS = `#version 300 es
precision highp float;
uniform vec3 uPickColor;
out vec4 outColor;
void main() { outColor = vec4(uPickColor, 1.0); }`;

const GROUND_VS = `#version 300 es
in vec3 aPos;
uniform mat4 uVP;
out vec2 vXY;
void main() { vXY = aPos.xy; gl_Position = uVP * vec4(aPos, 1.0); }`;

const GROUND_FS = `#version 300 es
precision highp float;
in vec2 vXY;
uniform float uAmt;
out vec4 outColor;
void main() {
  float d = length(vec2(vXY.x * 0.85, vXY.y * 1.25));
  float s = exp(-d * d * 4.2) * 0.42 + exp(-d * d * 1.1) * 0.13;
  outColor = vec4(vec3(0.05, 0.06, 0.10), s * uAmt);
}`;

/* ----------------------------------------------------------- the renderer */
class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: true, alpha: true, premultipliedAlpha: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    this.prog = this._program(VS, FS);
    this.pick = this._program(VS, PICK_FS);
    this.ground = this._program(GROUND_VS, GROUND_FS);
    this.u = this._uniforms(this.prog, ['uVP', 'uModel', 'uNM', 'uCam', 'uColor', 'uMetal',
      'uRough', 'uOpacity', 'uEmit', 'uTint', 'uTintAmt',
      'uFinish', 'uFScale', 'uBump', 'uRVar', 'uEnvA', 'uEnvB', 'uExposure',
      'uGhost', 'uGhostCol']);
    this.up = this._uniforms(this.pick, ['uVP', 'uModel', 'uNM', 'uPickColor']);
    this.ug = this._uniforms(this.ground, ['uVP', 'uAmt']);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this._buildGround();
    this._pickFBO = null;
    this.env = { a: [0.90, 0.91, 0.95], b: [0.035, 0.038, 0.048], exposure: 1.0,
                 ghost: [0.46, 0.52, 0.62] };
  }

  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aNor');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _uniforms(prog, names) {
    const o = {};
    names.forEach(n => { o[n] = this.gl.getUniformLocation(prog, n); });
    return o;
  }

  upload(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.nor), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const big = geo.pos.length / 3 > 65535;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      big ? new Uint32Array(geo.idx) : new Uint16Array(geo.idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: geo.idx.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  _buildGround() {
    const g = new Geo();
    const s = 2.6;
    g.box(s, s, 0.0001, M4.trs([0, 0, 0], [0, 0, 0], [1, 1, 1]));
    this.groundMesh = this.upload(g);
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c.clientWidth / Math.max(1, c.clientHeight);
  }

  render(parts, cam, opts) {
    const gl = this.gl;
    opts = opts || {};
    const aspect = this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = M4.perspective(cam.fov, aspect, 0.03, 60);
    const view = M4.lookAt(cam.eye, cam.target, [0, 0, 1]);
    const vp = M4.mul(proj, view);
    this.vp = vp;

    /* ground shadow */
    if (opts.groundAmt > 0.001) {
      gl.useProgram(this.ground);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      const gvp = M4.mul(vp, M4.trs([0, 0, opts.groundZ || -0.30], [0, 0, 0], [1, 1, 1]));
      gl.uniformMatrix4fv(this.ug.uVP, false, gvp);
      gl.uniform1f(this.ug.uAmt, opts.groundAmt);
      gl.bindVertexArray(this.groundMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.groundMesh.count, this.groundMesh.type, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, vp);
    gl.uniform3fv(this.u.uCam, new Float32Array(cam.eye));
    gl.uniform3fv(this.u.uEnvA, new Float32Array(this.env.a));
    gl.uniform3fv(this.u.uEnvB, new Float32Array(this.env.b));
    gl.uniform1f(this.u.uExposure, this.env.exposure);
    gl.uniform3fv(this.u.uGhostCol, new Float32Array(this.env.ghost));

    const solid = [], ghost = [];
    for (const p of parts) {
      if (p.hidden || p.opacity <= 0.012) continue;
      (p.opacity >= 0.995 ? solid : ghost).push(p);
    }
    for (const p of solid) this._drawPart(p);

    if (ghost.length) {
      for (const p of ghost) {
        const c = M4.transformPoint(p.matrix, p.center);
        p._d = (c[0] - cam.eye[0]) ** 2 + (c[1] - cam.eye[1]) ** 2 + (c[2] - cam.eye[2]) ** 2;
      }
      ghost.sort((a, b) => b._d - a._d);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const p of ghost) this._drawPart(p);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _drawPart(p) {
    const gl = this.gl, m = p.mat;
    gl.uniformMatrix4fv(this.u.uModel, false, p.matrix);
    gl.uniformMatrix3fv(this.u.uNM, false, M4.normalMat(p.matrix));
    gl.uniform3fv(this.u.uColor, m.color);
    gl.uniform1f(this.u.uMetal, m.metal);
    gl.uniform1f(this.u.uRough, m.rough);
    gl.uniform1f(this.u.uOpacity, p.opacity);
    gl.uniform1f(this.u.uEmit, p.emit || 0);
    gl.uniform3fv(this.u.uTint, p.tint || ZERO3);
    gl.uniform1f(this.u.uTintAmt, p.tintAmt || 0);
    gl.uniform1f(this.u.uFinish, m.finish || 0);
    gl.uniform1f(this.u.uFScale, m.fscale || 200);
    gl.uniform1f(this.u.uBump, m.bump || 0);
    gl.uniform1f(this.u.uRVar, m.rvar || 0);
    gl.uniform1f(this.u.uGhost, p.ghost || 0);
    gl.bindVertexArray(p.mesh.vao);
    gl.drawElements(gl.TRIANGLES, p.mesh.count, p.mesh.type, 0);
  }

  /* --- click identification via an offscreen id buffer --- */
  pickAt(parts, cam, px, py) {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    if (!this._pickFBO || this._pw !== W || this._ph !== H) {
      if (this._pickFBO) { gl.deleteFramebuffer(this._pickFBO); gl.deleteTexture(this._pt); gl.deleteRenderbuffer(this._pr); }
      this._pickFBO = gl.createFramebuffer();
      this._pt = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._pt);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this._pr = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this._pr);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._pickFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._pt, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._pr);
      this._pw = W; this._ph = H;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._pickFBO);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pick);
    const aspect = W / H;
    const vp = M4.mul(M4.perspective(cam.fov, aspect, 0.03, 60), M4.lookAt(cam.eye, cam.target, [0, 0, 1]));
    gl.uniformMatrix4fv(this.up.uVP, false, vp);
    parts.forEach((p, i) => {
      if (p.hidden || p.opacity < 0.12) return;
      const id = i + 1;
      gl.uniformMatrix4fv(this.up.uModel, false, p.matrix);
      gl.uniform3f(this.up.uPickColor, ((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255);
      gl.bindVertexArray(p.mesh.vao);
      gl.drawElements(gl.TRIANGLES, p.mesh.count, p.mesh.type, 0);
    });
    const buf = new Uint8Array(4);
    gl.readPixels(Math.round(px), Math.round(H - py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const id = (buf[0] << 16) | (buf[1] << 8) | buf[2];
    return id > 0 && id <= parts.length ? parts[id - 1] : null;
  }

  project(world) {
    const vp = this.vp;
    if (!vp) return null;
    const x = vp[0] * world[0] + vp[4] * world[1] + vp[8] * world[2] + vp[12];
    const y = vp[1] * world[0] + vp[5] * world[1] + vp[9] * world[2] + vp[13];
    const w = vp[3] * world[0] + vp[7] * world[1] + vp[11] * world[2] + vp[15];
    if (w <= 0.0001) return null;
    return [(x / w * 0.5 + 0.5) * this.canvas.clientWidth,
            (0.5 - y / w * 0.5) * this.canvas.clientHeight];
  }
}

const ZERO3 = new Float32Array([0, 0, 0]);
