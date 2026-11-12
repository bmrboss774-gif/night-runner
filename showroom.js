// The collection (v103): a round car tower over the workshop, built in code.
// The owner: "a circular garage where you can see all of the cars and they are seperated by brand but like 5 cars
// per row ... each car has their own little section divder and you click on a car and it zooms in on it with the key
// hanging on the section divider next to it visible and then if you select the car it lowers it down and to the
// workshop with an animation", with two pictures of a round, wood-panelled garage with ring lights in the ceiling
// and a glass car lift in the middle.
//
// Shape (room space, the same space as garage.js: the workshop's floor is y = 0 and its turntable, which is the lift,
// is on the axis x = z = 0). The tower's ground floor is at Y0, over the workshop. Five floors (the rows), five bays a
// floor, on an arc of 140 degrees round the lift, every car nose-in towards it; walnut dividers between the bays;
// the other 220 degrees are an open hall, where the camera stands and sees every bay at once. Angles are measured
// from the -z axis (the middle of the arc), growing towards +x.
//
// Frame rate: the 23 cars here are light copies (assets/showroom-cars.txt: about 20,000 triangles each with their
// colours baked into the corners, no textures, five materials), not the 100,000 to 400,000 triangle models the game
// drives; the building is a dozen merged meshes whose lighting is worked out once, when it is built, and stored in
// the corners (no real lights, no shadows). The full model is only loaded for the one car you walk up to.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const D2R = Math.PI / 180;
export const TOWER = { Y0: 6.2, NF: 5, NB: 5, FH: 3.1, SLAB: 0.32, RI: 6.0, RC: 9.15, RO: 12.3, RH: 12.85, ALPHA: 28 * D2R, TUBE: 3.38, EDGE: 2.2 };   // EDGE: how far back from the slab's edge the dividers start (they stand beside the back of the car, so the hall sees into every bay)
TOWER.A = TOWER.NB * TOWER.ALPHA / 2;                       // half the arc
TOWER.YT = TOWER.Y0 + TOWER.NF * TOWER.FH + 1.1;            // the hall's ceiling
const er = (th) => [Math.sin(th), -Math.cos(th)], et = (th) => [Math.cos(th), Math.sin(th)];   // radial and tangential unit vectors (x, z)
const P = (r, th, y) => [r * Math.sin(th), y, -r * Math.cos(th)];

const canvasTex = (w, h, draw, { repeat = false, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const rnd = (a, b) => a + Math.random() * (b - a);
// dark porcelain tiles, 1.2 m, four to the texture, each a slightly different tone, thin dark joints
function tileTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const v = 30 + Math.round(rnd(-3, 3)); g.fillStyle = `rgb(${v},${v + 1},${v + 3})`; g.fillRect(a * 256, b * 256, 256, 256);
      for (let i = 0; i < 26; i++) { const x = a * 256 + rnd(0, 256), y = b * 256 + rnd(0, 256), r = rnd(20, 90), gr = g.createRadialGradient(x, y, 0, x, y, r), c = Math.random() < 0.5 ? '255,255,255' : '0,0,0'; gr.addColorStop(0, `rgba(${c},0.022)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    for (let i = 0; i < 9000; i++) { const v = rnd(20, 70); g.fillStyle = `rgba(${v},${v},${v + 4},${rnd(0.1, 0.3)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 2.5), rnd(1, 2.5)); }
    g.fillStyle = 'rgba(0,0,0,.6)'; for (const k of [0, 256]) { g.fillRect(k - 1, 0, 2.5, h); g.fillRect(0, k - 1, w, 2.5); }
    g.fillStyle = 'rgba(255,255,255,.06)'; for (const k of [0, 256]) { g.fillRect(k + 2, 0, 1, h); g.fillRect(0, k + 2, w, 1); }
  }, { repeat: true });
}
// walnut boards, upright: eight to the texture, each its own tone, long wavering grain lines, the odd knot
function woodTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const n = 8, bw = w / n;
    for (let b = 0; b < n; b++) {
      const t = rnd(0, 1), r0 = 92 + t * 34, g0 = 58 + t * 22, b0 = 34 + t * 12, x0 = b * bw;
      const gr = g.createLinearGradient(x0, 0, x0 + bw, 0); gr.addColorStop(0, `rgb(${r0 * 0.9},${g0 * 0.9},${b0 * 0.9})`); gr.addColorStop(0.5, `rgb(${r0},${g0},${b0})`); gr.addColorStop(1, `rgb(${r0 * 0.86},${g0 * 0.86},${b0 * 0.86})`);
      g.fillStyle = gr; g.fillRect(x0, 0, bw, h);
      g.save(); g.beginPath(); g.rect(x0, 0, bw, h); g.clip();
      const ph = rnd(0, 6), amp = rnd(2, 9), f = rnd(0.004, 0.011);
      for (let i = 0; i < 46; i++) {
        const gx = x0 + rnd(-6, bw + 6), dark = Math.random() < 0.72;
        g.strokeStyle = dark ? `rgba(38,20,10,${rnd(0.07, 0.3)})` : `rgba(214,160,110,${rnd(0.04, 0.14)})`; g.lineWidth = rnd(0.6, 2.6);
        g.beginPath(); for (let y = 0; y <= h; y += 16) { const x = gx + Math.sin(y * f + ph + i * 0.13) * amp + Math.sin(y * f * 3.1 + i) * amp * 0.25; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
      if (Math.random() < 0.5) { const kx = x0 + rnd(bw * 0.25, bw * 0.75), ky = rnd(60, h - 60); for (let k = 5; k > 0; k--) { g.strokeStyle = `rgba(30,14,6,${0.1 + 0.07 * (5 - k)})`; g.lineWidth = 1.6; g.beginPath(); g.ellipse(kx, ky, k * 3.4, k * 7, 0, 0, 7); g.stroke(); } g.fillStyle = 'rgba(24,11,5,.6)'; g.beginPath(); g.ellipse(kx, ky, 3, 6, 0, 0, 7); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(12,6,3,.8)'; g.fillRect(x0 - 1, 0, 2.2, h); g.fillStyle = 'rgba(255,220,180,.07)'; g.fillRect(x0 + 2, 0, 1, h);
    }
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(20,10,5,${rnd(0.03, 0.12)})`; g.fillRect(rnd(0, w), rnd(0, h), 1, rnd(3, 14)); }
  }, { repeat: true });
}
// the back of a bay: dark graphite panels with three wall-washers' scallops of light falling down them
function backTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#17191d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = rnd(18, 60); g.fillStyle = `rgba(${v},${v},${v + 4},${rnd(0.08, 0.22)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), 1); }
    g.globalCompositeOperation = 'lighter';
    for (const cx of [w / 6, w / 2, w * 5 / 6]) {
      g.save(); g.translate(cx, 16); g.scale(1, 3.3);
      const gr = g.createRadialGradient(0, 0, 2, 0, 0, 86); gr.addColorStop(0, 'rgba(255,236,208,.95)'); gr.addColorStop(0.35, 'rgba(255,232,200,.42)'); gr.addColorStop(0.75, 'rgba(255,228,196,.1)'); gr.addColorStop(1, 'rgba(255,228,196,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 86, 0, 7); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(0,0,0,.55)'; for (const x of [0, w / 3, w * 2 / 3]) g.fillRect(x - 1, 0, 2, h); g.fillRect(0, h * 0.62, w, 2);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (const x of [0, w / 3, w * 2 / 3]) g.fillRect(x + 2, 0, 1, h);
    g.fillStyle = '#0c0d10'; g.fillRect(0, h - 22, w, 22);
  });
}
const blobTexture = () => canvasTex(128, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.scale(1, 2);
  const gr = g.createRadialGradient(0, 0, 8, 0, 0, 62); gr.addColorStop(0, 'rgba(0,0,0,.92)'); gr.addColorStop(0.6, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill(); g.restore();
});

// A surface whose light is worked out when it is built and kept in its corners (the `bake` attribute): the surface
// glows by its own colour times that light. Real lights and the room's reflections still fall on it.
function baked(o, gain = 1) {
  const m = new THREE.MeshStandardMaterial({ envMapIntensity: 0.5, ...o });
  m.userData.gain = { value: gain };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGain = m.userData.gain;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float bake; varying float vBake;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBake; uniform float uGain;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vBake * uGain;');
  };
  m.customProgramCacheKey = () => 'nr-baked';
  return m;
}
// geometry gathered a grid at a time: f(u, v) -> [x, y, z, nx, ny, nz, s, t, bake]
class Acc {
  constructor() { this.p = []; this.n = []; this.uv = []; this.b = []; this.i = []; }
  grid(nu, nv, f) {
    const base = this.p.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = f(i / nu, j / nv); this.p.push(q[0], q[1], q[2]); this.n.push(q[3], q[4], q[5]); this.uv.push(q[6], q[7]); this.b.push(q[8]); }
    // wound to face the way its normals say (checked on the last cell: the first can be a point, at a disc's centre)
    const q = (k) => [this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]], a0 = base + (nv - 1) * (nu + 1) + nu - 1, A = q(a0), B = q(a0 + 1), C = q(a0 + nu + 1);
    const ux = C[0] - A[0], uy = C[1] - A[1], uz = C[2] - A[2], vx = B[0] - A[0], vy = B[1] - A[1], vz = B[2] - A[2];
    const flip = (uy * vz - uz * vy) * this.n[a0 * 3] + (uz * vx - ux * vz) * this.n[a0 * 3 + 1] + (ux * vy - uy * vx) * this.n[a0 * 3 + 2] < 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; if (flip) this.i.push(a, b, c, b, d, c); else this.i.push(a, c, b, b, c, d); }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('bake', new THREE.Float32BufferAttribute(this.b, 1)); g.setIndex(this.i);
    return g;
  }
}
// a box between two room-space points, w wide (across, level) and t tall
function beam(a, b, w, t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  let g;
  if (Math.abs(dy) > Math.hypot(dx, dz)) g = new THREE.BoxGeometry(w, len, t);
  else { g = new THREE.BoxGeometry(len, t, w); g.rotateY(-Math.atan2(dz, dx)); }
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}
// an arc of light: a thin band following radius r from th0 to th1 at height y (h tall, facing the axis)
function arcBand(r, th0, th1, y, h, n = 40, d = 0.03) {
  const geos = [];
  for (let i = 0; i < n; i++) { const a = th0 + (th1 - th0) * i / n, b = th0 + (th1 - th0) * (i + 1) / n; geos.push(beam(P(r, a, y), P(r, b, y), d, h)); }
  return geos;
}

export function createShowroom({ parent, rows, defs, displayFont = 'Arial Narrow, sans-serif' }) {
  const T = TOWER, deckY = (f) => T.Y0 + f * T.FH, thBay = (k) => (k - (T.NB - 1) / 2) * T.ALPHA, thDiv = (j) => (j - T.NB / 2) * T.ALPHA;
  const group = new THREE.Group(); group.name = 'showroom'; group.visible = false; parent.add(group);
  const liftGroup = new THREE.Group(); liftGroup.name = 'car lift'; liftGroup.visible = false; parent.add(liftGroup);
  const cars = new THREE.Group(); cars.name = 'showroom cars'; group.add(cars);
  // the bays, bottom floor first: every car has a home; a car no row names takes the first empty bay
  const bays = [];
  for (let f = 0; f < T.NF; f++) for (let k = 0; k < T.NB; k++) {
    const th = thBay(k), y = deckY(f), p = P(T.RC, th, y), thd = thDiv(k + 1), e = er(thd), rk = T.RI + T.EDGE - 0.05;
    bays.push({ floor: f, k, th, y, id: null, row: rows[f] || { name: '', sub: '' }, pos: p, yaw: -th, locked: false, holder: null, proxy: null, paint: null, key: null,
      // where the key hangs: on the end of the divider on the bay's +theta side, the panel that faces the lift
      keyPos: [e[0] * rk, y + 1.6, e[1] * rk], keyYaw: -thd });
  }
  const byId = {};
  rows.forEach((row, f) => row.cars.forEach((id, k) => { const b = bays[f * T.NB + k]; if (b && defs[id]) { b.id = id; byId[id] = b; } }));
  for (const id in defs) if (!byId[id]) { const b = bays.find((q) => !q.id); if (b) { b.id = id; byId[id] = b; } }
  const mats = {}, disposables = [];
  let built = null, envTex = null;

  // ---- the light that is baked in: one lamp per bay (the ring in its ceiling) and the hall's big rings
  const lightOf = (b) => ({ p: P(T.RC - 0.3, b.th, b.y + T.FH - T.SLAB - 0.12), I: b.locked ? 1.1 : b.id ? 5.2 : 2.2, floor: b.floor, bay: b.k });
  let lights = [];
  const hallLights = [[0, 0, 95], [8, 2, 40], [-8, 2, 40], [0, 9, 46], [0, -8, 30], [7, 8, 30], [-7, 8, 30]].map(([x, z, I]) => ({ p: [x, T.YT - 0.4, z], I }));
  function bake(p, n, floor = null, bay = null, amb = 0.05) {
    let E = amb;
    for (const l of lights) {
      if (floor === null || l.floor !== floor) continue;
      const w = bay === null || l.bay === bay ? 1 : Math.abs(l.bay - bay) === 1 ? 0.22 : 0.05;
      const dx = l.p[0] - p[0], dy = l.p[1] - p[1], dz = l.p[2] - p[2], d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
      E += l.I * w * (0.22 + 0.78 * Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d)) / (d2 + 1.6);
    }
    for (const l of hallLights) { const dx = l.p[0] - p[0], dy = l.p[1] - p[1], dz = l.p[2] - p[2], d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1; E += l.I * (0.3 + 0.7 * Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d)) / (d2 + 30) * (floor === null ? 1 : 0.35); }
    return Math.min(1.25, E);
  }

  // ---- textures drawn once
  function fasciaTexture() {
    return canvasTex(4096, 128 * T.NF, (g, w, h) => {
      for (let f = 0; f < T.NF; f++) {
        const y0 = h - (f + 1) * 128, row = rows[f] || { name: '', sub: '' };
        const gr = g.createLinearGradient(0, y0, 0, y0 + 128); gr.addColorStop(0, '#2b2e33'); gr.addColorStop(0.5, '#1d1f23'); gr.addColorStop(1, '#131417'); g.fillStyle = gr; g.fillRect(0, y0, w, 128);
        for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.05)})`; g.fillRect(rnd(0, w), y0 + rnd(0, 128), rnd(40, 300), 1); }
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, y0 + 2, w, 2); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y0 + 124, w, 4);
        const name = (row.name || '').toUpperCase().split('').join(' '), sub = (row.sub || '').toUpperCase();
        g.textBaseline = 'middle'; g.font = `700 78px ${displayFont}`; const wn = g.measureText(name).width; g.font = `500 46px ${displayFont}`; const ws = g.measureText(sub).width, gap = sub ? 70 : 0, x0 = (w - wn - gap - ws) / 2;
        g.font = `700 78px ${displayFont}`; g.fillStyle = '#f2f5f8'; g.shadowColor = 'rgba(190,225,255,.9)'; g.shadowBlur = 16; g.textAlign = 'left'; g.fillText(name, x0, y0 + 66);
        g.shadowBlur = 0; g.font = `500 46px ${displayFont}`; g.fillStyle = '#aab2bc'; g.fillText(sub, x0 + wn + gap, y0 + 68);
        if (sub) { g.fillStyle = '#5ad7ff'; g.fillRect(x0 + wn + gap / 2 - 2, y0 + 36, 4, 60); }
      }
    });
  }
  // the bays' nameplates, all on one sheet: brushed aluminium, the car's name engraved, a line of small print under it
  const PLATE = { cols: 4, rows: 8, w: 512, h: 128 };
  function plateTexture() {
    return canvasTex(PLATE.cols * PLATE.w, PLATE.rows * PLATE.h, (g) => {
      bays.forEach((b, i) => {
        const x0 = (i % PLATE.cols) * PLATE.w, y0 = Math.floor(i / PLATE.cols) * PLATE.h, d = b.id ? defs[b.id] : null;
        const gr = g.createLinearGradient(0, y0, 0, y0 + PLATE.h); gr.addColorStop(0, '#d5d9de'); gr.addColorStop(0.5, '#a4aab2'); gr.addColorStop(1, '#c0c5cc'); g.fillStyle = gr; g.fillRect(x0, y0, PLATE.w, PLATE.h);
        for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,44,50'},${rnd(0.04, 0.13)})`; g.fillRect(x0 + rnd(0, PLATE.w), y0 + rnd(0, PLATE.h), rnd(30, 150), 1); }
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.strokeRect(x0 + 3, y0 + 3, PLATE.w - 6, PLATE.h - 6); g.strokeStyle = 'rgba(30,34,40,.55)'; g.lineWidth = 2; g.strokeRect(x0 + 6, y0 + 6, PLATE.w - 12, PLATE.h - 12);
        for (const sx of [26, PLATE.w - 26]) { const sg = g.createRadialGradient(x0 + sx - 2, y0 + 61, 1, x0 + sx, y0 + 64, 11); sg.addColorStop(0, '#eef1f4'); sg.addColorStop(1, '#7c838c'); g.fillStyle = sg; g.beginPath(); g.arc(x0 + sx, y0 + 64, 10, 0, 7); g.fill(); g.strokeStyle = 'rgba(20,22,26,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + sx - 6, y0 + 60); g.lineTo(x0 + sx + 6, y0 + 68); g.stroke(); }
        const name = (d ? d.short || d.name : 'Empty bay').toUpperCase(), small = d ? (b.locked ? `LOCKED  ·  LEVEL ${b.level}` : (d.pick || '').toUpperCase()) : 'RESERVED';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        let size = 54; g.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; while (g.measureText(name).width > PLATE.w - 96 && size > 22) { size -= 2; g.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
        g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText(name, x0 + PLATE.w / 2, y0 + 50); g.fillStyle = '#1d2025'; g.fillText(name, x0 + PLATE.w / 2, y0 + 48);
        g.font = '600 24px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.fillStyle = b.locked ? '#8f1118' : '#3a3f47'; g.fillText(small, x0 + PLATE.w / 2, y0 + 96);
      });
    });
  }

  // ---- the building
  function build() {
    lights = bays.map(lightOf);
    const deck = new Acc(), wood = new Acc(), back = new Acc(), conc = new Acc(), fascia = new Acc(), plates = new Acc(), blobs = new Acc();
    const ledW = [], ledR = [], steel = [], dark = [];
    const A = T.A, UP = [0, 1, 0], DN = [0, -1, 0];
    // the hall's floor, round the lift, out to the wall; the ground floor's bays stand on it
    deck.grid(96, 14, (u, v) => { const th = u * Math.PI * 2 - Math.PI, r = T.TUBE + (T.RH - T.TUBE) * v * v * 0.55 + (T.RH - T.TUBE) * v * 0.45, p = P(r, th, T.Y0); return [...p, ...UP, p[0] / 2.4, p[2] / 2.4, bake(p, UP, 0, null, 0.07)]; });
    for (let f = 1; f <= T.NF; f++) {
      const y = deckY(f);
      // a floor's slab: its top (a deck, except the roof), its underside (the ceiling of the floor below)
      if (f < T.NF) deck.grid(T.NB * 6, 6, (u, v) => { const th = -A + 2 * A * u, r = T.RI + (T.RO - T.RI) * v, p = P(r, th, y), k = Math.min(T.NB - 1, Math.floor(u * T.NB)); return [...p, ...UP, p[0] / 2.4, p[2] / 2.4, bake(p, UP, f, k)]; });
      conc.grid(T.NB * 6, 6, (u, v) => { const th = -A + 2 * A * u, r = T.RI + (T.RO - T.RI) * v, p = P(r, th, y - T.SLAB), k = Math.min(T.NB - 1, Math.floor(u * T.NB)); return [...p, ...DN, 0, 0, bake(p, DN, f - 1, k) * 0.8]; });
      // its edge towards the lift: a band that carries the name of the row below it, and a line of light under its lip
      fascia.grid(60, 1, (u, v) => { const th = -A + 2 * A * u, e = er(th), p = P(T.RI, th, y - 0.5 + 0.5 * v); return [...p, -e[0], 0, -e[1], u, (f - 1 + v) / T.NF, 1]; });
      ledW.push(...arcBand(T.RI - 0.012, -A, A, y - 0.5 - 0.016, 0.03, 60));
      // (the top of the band, where it stands a hand proud of the deck)
      if (f < T.NF) conc.grid(30, 1, (u, v) => { const th = -A + 2 * A * u, p = P(T.RI + 0.06 * v, th, y + 0.001); return [...p, ...UP, 0, 0, 0.5]; });
    }
    for (const b of bays) {
      const f = b.floor, y = b.y, c0 = thDiv(b.k), c1 = thDiv(b.k + 1), yc = y + T.FH - T.SLAB;
      // the back wall of the bay
      back.grid(4, 3, (u, v) => { const th = c0 + (c1 - c0) * u, e = er(th), p = P(T.RO, th, y + (yc - y) * v); return [...p, -e[0], 0, -e[1], u, v, b.locked ? 0.32 : b.id ? 1 : 0.5]; });
      // the ring of light in its ceiling
      { const g = new THREE.TorusGeometry(1.3, 0.028, 6, 56).rotateX(Math.PI / 2).translate(...P(T.RC - 0.3, b.th, yc - 0.05)); (b.locked ? ledR : ledW).push(g); dark.push(new THREE.TorusGeometry(1.3, 0.05, 6, 56).rotateX(Math.PI / 2).translate(...P(T.RC - 0.3, b.th, yc - 0.012))); }
      // the pallet the car stands on, its soft shadow
      { const g = new THREE.BoxGeometry(2.36, 0.03, 5.1); g.rotateY(b.yaw); g.translate(b.pos[0], y + 0.015, b.pos[2]); steel.push(g); }
      if (b.id) { const e = er(b.th), t = et(b.th); blobs.grid(1, 1, (u, v) => { const a = (u - 0.5) * 2.9, r = (v - 0.5) * 6.0; return [b.pos[0] + t[0] * a + e[0] * r, y + 0.034, b.pos[2] + t[1] * a + e[1] * r, ...UP, u, v, 0]; }); }
      // the key board on the divider beside it: a dark steel plate, the hook, the nameplate under it
      { const e = er(c1), t = et(c1), q = b.keyPos, i = bays.indexOf(b), u0 = (i % PLATE.cols) / PLATE.cols, v0 = 1 - (Math.floor(i / PLATE.cols) + 1) / PLATE.rows;
        const plate = new THREE.BoxGeometry(0.42, 0.74, 0.012); plate.rotateY(b.keyYaw); plate.translate(q[0] + e[0] * 0.012, q[1] - 0.22, q[2] + e[1] * 0.012); dark.push(plate);
        const hook = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8).rotateX(Math.PI / 2); hook.rotateY(b.keyYaw); hook.translate(q[0] - e[0] * 0.012, q[1] + 0.05, q[2] - e[1] * 0.012); steel.push(hook);
        const W = 0.36, H = 0.09, py = q[1] - 0.51;
        plates.grid(1, 1, (u, v) => [q[0] + e[0] * 0.004 + t[0] * (u - 0.5) * W, py + (v - 0.5) * H, q[2] + e[1] * 0.004 + t[1] * (u - 0.5) * W, -e[0], 0, -e[1], u0 + u / PLATE.cols, v0 + v / PLATE.rows, 1]); }
    }
    // dividers: walnut fins between the bays, floor to ceiling, a line of light down the edge that faces the lift
    for (let j = 0; j <= T.NB; j++) {
      const th = thDiv(j), e = er(th), t = et(th), end = j === 0 || j === T.NB, h = 0.08;
      for (let f = 0; f < T.NF; f++) {
        const y0 = deckY(f), y1 = y0 + T.FH - T.SLAB;
        for (const s of [-1, 1]) {
          const k = s < 0 ? j - 1 : j; if (k < 0 || k >= T.NB) continue;   // the outer faces of the end walls are the hall's (below)
          wood.grid(8, 4, (u, v) => { const r = T.RI + T.EDGE + (T.RO - T.RI - T.EDGE) * u, p = [e[0] * r + t[0] * h * s, y0 + (y1 - y0) * v, e[1] * r + t[1] * h * s], n = [t[0] * s, 0, t[1] * s]; return [...p, ...n, r / 1.9, p[1] / 3.1, bake(p, n, f, k) * 1.25]; });
        }
        // its end towards the lift: a walnut panel a little wider than the fin (the key board hangs on it), a line of light down each edge
        { const r = T.RI + T.EDGE - 0.03, n = [-e[0], 0, -e[1]];
          wood.grid(2, 4, (u, v) => { const a = (u - 0.5) * 0.62, p = [e[0] * r + t[0] * a, y0 + (y1 - y0) * v, e[1] * r + t[1] * a]; return [...p, ...n, u * 0.33, p[1] / 3.1, bake(p, n, f, null) * 1.2 + 0.3]; });
          for (const sd of [-1, 1]) ledW.push(beam([e[0] * (r - 0.012) + t[0] * 0.325 * sd, y0 + 0.12, e[1] * (r - 0.012) + t[1] * 0.325 * sd], [e[0] * (r - 0.012) + t[0] * 0.325 * sd, y1 - 0.12, e[1] * (r - 0.012) + t[1] * 0.325 * sd], 0.03, 0.02)); }
      }
      if (end) {
        // the outer face of an end wall is the hall's
        const s = j === 0 ? -1 : 1;
        wood.grid(8, 16, (u, v) => { const r = T.RI + T.EDGE + (T.RH - T.RI - T.EDGE) * u, p = [e[0] * r + t[0] * h * s, T.Y0 + (T.YT - T.Y0) * v, e[1] * r + t[1] * h * s], n = [t[0] * s, 0, t[1] * s]; return [...p, ...n, r / 1.9, p[1] / 3.1, bake(p, n, null, null, 0.1) * 1.5 + 0.2]; });
        // and the floors' cut ends, in front of it
        for (let f = 1; f <= T.NF; f++) conc.grid(4, 1, (u, v) => { const r = T.RI + (T.RO - T.RI) * u, p = [e[0] * r + t[0] * 0.001 * s, deckY(f) - 0.5 + 0.5 * v, e[1] * r + t[1] * 0.001 * s]; return [...p, t[0] * s, 0, t[1] * s, 0, 0, 0.45]; });
      }
    }
    // the hall: its wall (the 220 degrees the tower leaves), its ceiling with three great rings of light
    wood.grid(60, 12, (u, v) => { const th = A + (2 * Math.PI - 2 * A) * u, e = er(th), p = P(T.RH, th, T.Y0 + (T.YT - T.Y0) * v), n = [-e[0], 0, -e[1]]; return [...p, ...n, th * T.RH / 1.9, p[1] / 3.1, bake(p, n, null, null, 0.1) * 1.4 + 0.2]; });
    for (let f = 1; f <= T.NF; f++) ledW.push(...arcBand(T.RH - 0.02, A + 0.02, 2 * Math.PI - A - 0.02, deckY(f) - 0.25, 0.03, 70));
    conc.grid(48, 8, (u, v) => { const th = u * Math.PI * 2, p = P(T.RH * v, th, T.YT); return [...p, ...DN, 0, 0, 0.16 + 0.2 * Math.exp(-Math.pow((T.RH * v - 8) / 5, 2))]; });
    for (const r of [4.6, 7.6, 10.6]) { ledW.push(new THREE.TorusGeometry(r, 0.05, 6, 96).rotateX(Math.PI / 2).translate(0, T.YT - 0.35, 0)); dark.push(new THREE.TorusGeometry(r, 0.1, 6, 96).rotateX(Math.PI / 2).translate(0, T.YT - 0.27, 0)); }
    // the lift's glass tube: uprights and a hoop at every floor in steel; the shaft below, down to the workshop
    // (its eight slim guide rails stand where, from the hall, they line up with the dividers behind them, or behind the viewer)
    for (const d of [22.5, 75, 105, 157.5]) for (const sg of [-1, 1]) { const th = sg * d * D2R; steel.push(beam(P(T.TUBE, th, T.Y0), P(T.TUBE, th, T.YT), 0.05, 0.05)); }
    for (let f = 0; f <= T.NF; f++) steel.push(new THREE.TorusGeometry(T.TUBE, 0.028, 6, 72).rotateX(Math.PI / 2).translate(0, f === 0 ? T.Y0 + 0.05 : deckY(f) - 0.25, 0));

    const tile = tileTexture(), woodT = woodTexture(), backT = backTexture(), fasT = fasciaTexture(), plT = plateTexture(), blobT = blobTexture();
    disposables.push(tile, woodT, backT, fasT, plT, blobT);
    mats.deck = baked({ name: 'showroom deck', map: tile, roughness: 0.24, metalness: 0, envMapIntensity: 0.55 }, 2.4);
    mats.wood = baked({ name: 'showroom walnut', map: woodT, roughness: 0.5, metalness: 0, envMapIntensity: 0.25 }, 2.2);
    mats.back = baked({ name: 'showroom back wall', map: backT, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.15 }, 1.5);
    mats.conc = baked({ name: 'showroom concrete', color: 0x3a3d43, roughness: 0.92, metalness: 0, envMapIntensity: 0.1 }, 1.6);
    mats.fascia = baked({ name: 'showroom fascia', map: fasT, roughness: 0.4, metalness: 0.6, envMapIntensity: 0.3 }, 1.5);
    mats.plates = baked({ name: 'showroom plates', map: plT, roughness: 0.42, metalness: 0.7, envMapIntensity: 0.5 }, 0.75);
    mats.steel = new THREE.MeshStandardMaterial({ name: 'showroom steel', color: 0x9aa0a8, roughness: 0.32, metalness: 0.9, envMapIntensity: 0.9, emissive: 0x9aa0a8, emissiveIntensity: 0.06 });
    mats.dark = new THREE.MeshStandardMaterial({ name: 'showroom dark steel', color: 0x15171a, roughness: 0.5, metalness: 0.7, envMapIntensity: 0.6, emissive: 0x15171a, emissiveIntensity: 0.5 });
    mats.glass = new THREE.MeshStandardMaterial({ name: 'lift glass', color: 0xbfd6e6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    mats.ledW = new THREE.MeshBasicMaterial({ name: 'showroom led', color: new THREE.Color(2.1, 2.0, 1.85), fog: false });
    mats.ledR = new THREE.MeshBasicMaterial({ name: 'showroom led locked', color: new THREE.Color(1.5, 0.1, 0.07), fog: false });
    mats.blob = new THREE.MeshBasicMaterial({ name: 'showroom shadow', map: blobT, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    const meshes = [];
    const add = (geo, mat, order = 0) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.castShadow = m.receiveShadow = false; m.layers.enable(2); group.add(m); meshes.push(m); return m; };
    add(deck.geo(), mats.deck); add(wood.geo(), mats.wood); add(back.geo(), mats.back); add(conc.geo(), mats.conc); add(fascia.geo(), mats.fascia); add(plates.geo(), mats.plates);
    const flat = (list) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))) : null);
    add(flat(ledW), mats.ledW); add(flat(ledR), mats.ledR); add(flat(steel), mats.steel); add(flat(dark), mats.dark);
    { const m = add(blobs.geo(), mats.blob, 1); if (m) m.layers.disable(2); }
    { const g = new THREE.CylinderGeometry(T.TUBE, T.TUBE, T.YT - T.Y0, 64, 1, true).translate(0, (T.YT + T.Y0) / 2, 0); const m = add(g, mats.glass, 4); m.layers.disable(2); }
    if (envTex) api.setEnv(envTex);
    built = meshes;
  }
  function unbuild() {
    if (!built) return;
    for (const m of built) { group.remove(m); m.geometry.dispose(); }
    for (const k in mats) mats[k].dispose();
    for (const t of disposables) t.dispose(); disposables.length = 0; built = null;
  }

  // ---- the lift: the round platform (the workshop's turntable), the pallet that carries a car out of its bay, and
  // the two rails the pallet runs along from the bay to the platform
  const lift = { y: 0, platform: null, pallet: null, rails: null };
  {
    const steelM = new THREE.MeshStandardMaterial({ name: 'lift steel', color: 0x2a2d32, roughness: 0.42, metalness: 0.85, envMapIntensity: 0.8, emissive: 0x2a2d32, emissiveIntensity: 0.25 });
    const top = new THREE.MeshStandardMaterial({ name: 'lift deck', color: 0x0b0c0f, roughness: 0.3, metalness: 0.2, envMapIntensity: 0.6, emissive: 0x0b0c0f, emissiveIntensity: 0.6 });
    const led = new THREE.MeshBasicMaterial({ name: 'lift led', color: new THREE.Color(0.5, 1.7, 2.3), fog: false });
    const pf = new THREE.Group();
    pf.add(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.16, 72).translate(0, -0.085, 0), steelM), new THREE.Mesh(new THREE.CylinderGeometry(3.22, 3.22, 0.012, 72).translate(0, -0.003, 0), top), new THREE.Mesh(new THREE.TorusGeometry(3.26, 0.022, 6, 96).rotateX(Math.PI / 2).translate(0, 0.004, 0), led),
      new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 30, 20).translate(0, -15.17, 0), steelM));   // the ram under it
    const pallet = new THREE.Group(); pallet.add(new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.03, 5.1).translate(0, 0.015, 0), new THREE.MeshStandardMaterial({ name: 'pallet', color: 0x9aa0a8, roughness: 0.32, metalness: 0.9, envMapIntensity: 0.9, emissive: 0x9aa0a8, emissiveIntensity: 0.06 })));
    const rails = new THREE.Group(); for (const s of [-0.85, 0.85]) rails.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1).translate(s, -0.05, 0.5), steelM));
    pf.traverse((o) => { o.castShadow = false; }); liftGroup.add(pf, pallet, rails);
    lift.platform = pf; lift.pallet = pallet; lift.rails = rails; lift.mats = [steelM, top, pallet.children[0].material];
  }

  // ---- the cars: the light copies, one in each bay
  const PM = {
    metal: new THREE.MeshStandardMaterial({ name: 'proxy metal', vertexColors: true, metalness: 0.92, roughness: 0.3, envMapIntensity: 1 }),
    gloss: new THREE.MeshStandardMaterial({ name: 'proxy gloss', vertexColors: true, metalness: 0, roughness: 0.32, envMapIntensity: 0.9 }),
    matte: new THREE.MeshStandardMaterial({ name: 'proxy matte', vertexColors: true, metalness: 0, roughness: 0.8, envMapIntensity: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ name: 'proxy glass', color: 0x06080b, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.86, envMapIntensity: 1.5 }),
  };
  for (const b of bays) { b.holder = new THREE.Group(); b.holder.position.set(b.pos[0], b.y + 0.03, b.pos[2]); b.holder.rotation.y = b.yaw; cars.add(b.holder); }
  let loading = null;
  function loadCars(decoder) {
    loading ||= (async () => {
      const res = await fetch('showroom-cars.txt'); if (!res.ok) throw new Error('showroom cars ' + res.status);
      const bin = atob((await res.text()).trim()), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const loader = new GLTFLoader(); if (decoder) loader.setMeshoptDecoder(decoder);
      const gltf = await new Promise((ok, no) => loader.parse(bytes.buffer, '', ok, no));
      for (const node of [...gltf.scene.children]) {
        const b = byId[node.name]; if (!b) continue;
        b.paint = new THREE.MeshPhysicalMaterial({ name: 'proxy paint ' + b.id, vertexColors: true, color: 0xffffff, metalness: 0, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1 });
        node.traverse((o) => { if (!o.isMesh) return; const k = o.material.name; o.material = k === 'paint' ? b.paint : PM[k] || PM.matte; o.castShadow = o.receiveShadow = false; if (k === 'glass') o.renderOrder = 2; });   // (the copies keep the models' own normals: worked out afresh from the simplified faces they came out blotched black, the models' faces not all being wound one way)
        b.proxy = node; b.size = node.userData.bounds || null; b.holder.add(node);
        if (b.pending) { api.setPaint(b.id, ...b.pending); b.pending = null; }
      }
      if (envTex) api.setEnv(envTex);
      api.carsReady = true;
    })().catch((e) => { console.warn('showroom cars', e); api.carsFailed = true; });
    return loading;
  }

  const inv = new THREE.Matrix4(), ro = new THREE.Vector3(), rd = new THREE.Vector3();
  const api = {
    group, liftGroup, bays, byId, lift, carsReady: false, carsFailed: false, ready: false,
    // (re)build the tower: `locks` maps a car id to the level it opens at, for the cars still locked
    build(locks = {}) {
      for (const b of bays) { b.level = b.id ? locks[b.id] || 0 : 0; b.locked = b.level > 0; }
      unbuild(); build(); api.ready = true;
    },
    loadCars,
    show(on) { group.visible = on && api.ready; },
    // the reflections every surface here mirrors: the game's cube of the hall
    setEnv(tex) {
      envTex = tex;
      const all = [...Object.values(mats), ...Object.values(PM), ...lift.mats, ...bays.map((b) => b.paint).filter(Boolean)];
      for (const m of all) if (m && 'envMap' in m && !m.isMeshBasicMaterial && m.envMap !== tex) { m.envMap = tex; m.needsUpdate = true; }
    },
    // a car's copy wears its owner's paint
    setPaint(id, hex, fin) {
      const b = byId[id]; if (!b) return; if (!b.paint) { b.pending = [hex, fin]; return; }
      b.paint.color.set(hex);
      if (fin) { b.paint.metalness = fin.metalness; b.paint.roughness = fin.roughness; b.paint.clearcoat = fin.clearcoat; b.paint.clearcoatRoughness = fin.clearcoatRoughness; }
    },
    // the bay whose car a ray (world space) hits first
    pick(ray) {
      inv.copy(parent.matrixWorld).invert(); ro.copy(ray.origin).applyMatrix4(inv); rd.copy(ray.direction).transformDirection(inv);
      let best = null, bt = Infinity;
      for (const b of bays) {
        if (!b.id) continue;
        const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw), ox = ro.x - b.pos[0], oz = ro.z - b.pos[2];
        const o = [c * ox + s * oz, ro.y - b.y, -s * ox + c * oz], d = [c * rd.x + s * rd.z, rd.y, -s * rd.x + c * rd.z], lo = [-1.2, 0, -2.75], hi = [1.2, 1.55, 2.75];
        let t0 = 0, t1 = Infinity;
        for (let a = 0; a < 3; a++) { if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) { t0 = Infinity; break; } continue; } let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { t0 = Infinity; break; } }
        if (t0 < bt) { bt = t0; best = b; }
      }
      return best;
    },
    // where the camera stands to take in the whole tower, and to look at one bay (room space: [position, target])
    overview() { return { pos: [0, T.Y0 + 12.3, 11.7], tgt: [0, T.Y0 + 7.0, -8.6] }; },
    bayView(b, portrait = false) {
      const e = er(b.th), t = et(b.th);
      // (a tall, narrow screen cannot hold the whole car and the key side by side: it stands further round and higher, on the car's nose and the key)
      if (portrait) return { pos: [e[0] * 4.2 - t[0] * 1.9, b.y + 1.95, e[1] * 4.2 - t[1] * 1.9], tgt: [e[0] * 8.2 + t[0] * 1.15, b.y + 0.5, e[1] * 8.2 + t[1] * 1.15] };
      const r = 4.55, a = -1.35; return { pos: [e[0] * r + t[0] * a, b.y + 1.5, e[1] * r + t[1] * a], tgt: [e[0] * 8.4 + t[0] * 0.55, b.y + 0.85, e[1] * 8.4 + t[1] * 0.55] };
    },
    // the lift's parts: the platform at height y; the pallet at a room-space spot; the rails from the platform out to radius r towards a bay
    setLift({ y = 0, pallet = null, rail = 0, th = 0, show = true }) {
      liftGroup.visible = show; lift.y = y; lift.platform.position.y = y;
      lift.pallet.visible = !!pallet; if (pallet) { lift.pallet.position.set(pallet[0], pallet[1], pallet[2]); lift.pallet.rotation.y = pallet[3]; }
      lift.rails.visible = rail > 0.01; if (lift.rails.visible) { const e = er(th); lift.rails.position.set(e[0] * 3.2, y, e[1] * 3.2); lift.rails.rotation.y = Math.atan2(e[0], e[1]); lift.rails.scale.z = rail; }
    },
    hideCar(id, hide) { const b = byId[id]; if (b && b.holder) b.holder.visible = !hide; },
  };
  return api;
}
