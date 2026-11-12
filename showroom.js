// The collection: a round car tower over the workshop, built in code (v103; rebuilt v105).
// v103, the owner: "a circular garage where you can see all of the cars and they are seperated by brand but like 5 cars
// per row ... each car has their own little section divder and you click on a car and it zooms in on it with the key
// hanging on the section divider next to it visible and then if you select the car it lowers it down and to the
// workshop with an animation", with two pictures of a round garage with a glass car lift in the middle.
// v105, the owner: "the circles should go sort of all the way around that the cars sit on ... make the theme of the
// collection more industrial and more detailed with no wood it should be more industrial but very authentic and
// detailed and polished and luxury".
//
// Shape (room space, the same space as garage.js: the workshop's floor is y = 0 and its turntable, which is the lift,
// is on the axis x = z = 0). The tower's ground floor is at Y0, over the workshop. Every floor is a whole ring round
// the lift's shaft: polished concrete on a steel edge beam, held up by a ring of steel columns. Five floors (the rows),
// five bays a floor on an arc of 110 degrees, every car nose-in towards the lift, board-formed concrete fins between
// them; the rest of each ring is a gallery behind a steel and brass rail, with factory windows in its wall. The camera
// stands inside the ring, across the shaft from the bays. Angles are measured from the -z axis (the middle of the
// bays), growing towards +x.
//
// Frame rate: the cars are light copies (stock ones from showroom-cars.txt, the owner's own builds from lod.js), about
// 28,000 triangles each, their colours in their corners; the building is a dozen merged meshes with one shader, its
// light worked out when it is built and kept in the corners (no real lights, no shadows).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lodObject, LAMP_MAX } from './lod.js?v=109';   // (the same address the page uses: one copy of it)

const D2R = Math.PI / 180;
export const TOWER = { Y0: 6.2, NF: 5, NB: 5, FH: 3.05, SLAB: 0.34, RI: 8.4, RC: 11.55, RO: 14.7, RH: 15.3, ALPHA: 22 * D2R, TUBE: 3.38, EDGE: 2.15 };   // EDGE: how far back from the slab's edge the fins start
TOWER.A = TOWER.NB * TOWER.ALPHA / 2;                       // half the bays' arc
TOWER.YT = TOWER.Y0 + TOWER.NF * TOWER.FH + 1.2;            // the top of the shaft
const er = (th) => [Math.sin(th), -Math.cos(th)], et = (th) => [Math.cos(th), Math.sin(th)];   // radial and tangential unit vectors (x, z)
const P = (r, th, y) => [r * Math.sin(th), y, -r * Math.cos(th)];

const canvasTex = (w, h, draw, { repeat = false, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const rnd = (a, b) => a + Math.random() * (b - a);
const cloud = (g, x0, y0, w, h, n, a) => { for (let i = 0; i < n; i++) { const x = x0 + rnd(0, w), y = y0 + rnd(0, h), r = rnd(w * 0.04, w * 0.22), gr = g.createRadialGradient(x, y, 0, x, y, r), c = Math.random() < 0.5 ? '255,255,255' : '0,0,0'; gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } };
const grain = (g, w, h, n, lo, hi, a0, a1) => { for (let i = 0; i < n; i++) { const v = rnd(lo, hi); g.fillStyle = `rgba(${v},${v},${v + 3},${rnd(a0, a1)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 2.5), rnd(1, 2.5)); } };
// polished concrete, 6 m to the texture: clouded, fine aggregate, a hairline crack or two, saw-cut joints every 3 m
function floorTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#383b3f'; g.fillRect(0, 0, w, h); cloud(g, 0, 0, w, h, 90, 0.03); grain(g, w, h, 26000, 30, 110, 0.08, 0.26);
    g.strokeStyle = 'rgba(10,11,12,.35)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { let x = rnd(0, w), y = rnd(0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += rnd(-30, 30); y += rnd(8, 34); g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.6)'; for (const k of [0, 512]) { g.fillRect(k - 1.5, 0, 3, h); g.fillRect(0, k - 1.5, w, 3); }
    g.fillStyle = 'rgba(255,255,255,.07)'; for (const k of [0, 512]) { g.fillRect(k + 2, 0, 1, h); g.fillRect(0, k + 2, w, 1); }
  }, { repeat: true });
}
// board-formed concrete, 4 m by one floor's height: the grain of the form boards in bands 15 cm high, the lines where
// one pour met the next, a tie-hole every 60 cm, weather streaks down from the top
function concreteDraw(g, w, h, tone = 78) {
  g.fillStyle = `rgb(${tone},${tone + 2},${tone + 5})`; g.fillRect(0, 0, w, h); cloud(g, 0, 0, w, h, 60, 0.035);
  const rows = 20;
  for (let r = 0; r < rows; r++) { const y = r * h / rows, t = rnd(-7, 7); g.fillStyle = `rgba(${t > 0 ? '255,255,255' : '0,0,0'},${Math.abs(t) / 110})`; g.fillRect(0, y, w, h / rows); for (let k = 0; k < 22; k++) { g.fillStyle = `rgba(20,20,22,${rnd(0.03, 0.1)})`; g.fillRect(rnd(0, w), y + rnd(0, h / rows), rnd(30, 260), 1); } g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + 1.5, w, 1); }
  for (let x = w / 8; x < w; x += w / 4) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 0, 1.5, h); }
  for (let a = 0; a < 7; a++) for (let b = 0; b < 5; b++) { const x = (a + 0.5) * w / 7, y = (b + 0.5) * h / 5, gr = g.createRadialGradient(x, y - 1, 1, x, y, 7); gr.addColorStop(0, '#0b0c0e'); gr.addColorStop(0.7, '#1a1c1f'); gr.addColorStop(1, 'rgba(26,28,31,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
  for (let i = 0; i < 9; i++) { const x = rnd(0, w), gr = g.createLinearGradient(0, 0, 0, h * rnd(0.3, 0.8)); gr.addColorStop(0, 'rgba(12,13,14,.16)'); gr.addColorStop(1, 'rgba(12,13,14,0)'); g.fillStyle = gr; g.fillRect(x, 0, rnd(6, 30), h); }
  grain(g, w, h, 9000, 30, 120, 0.06, 0.2);
}
const wallTexture = () => canvasTex(1024, 512, (g, w, h) => concreteDraw(g, w, h), { repeat: true });
// the back of a bay: the same concrete with three wall-washers' light falling down it, a steel wainscot at its foot
function backTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    concreteDraw(g, w, h, 46);
    g.globalCompositeOperation = 'lighter';
    for (const cx of [w / 6, w / 2, w * 5 / 6]) { g.save(); g.translate(cx, 10); g.scale(1, 3.2); const gr = g.createRadialGradient(0, 0, 2, 0, 0, 92); gr.addColorStop(0, 'rgba(255,226,186,.95)'); gr.addColorStop(0.35, 'rgba(255,222,180,.42)'); gr.addColorStop(0.75, 'rgba(255,218,176,.1)'); gr.addColorStop(1, 'rgba(255,218,176,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 92, 0, 7); g.fill(); g.restore(); }
    g.globalCompositeOperation = 'source-over';
    const y0 = h * 0.7; g.fillStyle = '#121416'; g.fillRect(0, y0, w, h - y0); cloud(g, 0, y0, w, h - y0, 14, 0.04);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, y0, w, 2); g.fillStyle = '#7a6238'; g.fillRect(0, y0 + 5, w, 3);
    for (let x = 16; x < w; x += 42) for (const y of [y0 + 18, h - 12]) { const gr = g.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4.5); gr.addColorStop(0, '#6a6f76'); gr.addColorStop(1, '#17191c'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
  });
}
// blackened steel: near-black with the blue-brown bloom of the heat, mill scale, a few scratches down to the metal
function steelTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1c1e21'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = rnd(0, w), y = rnd(0, h), r = rnd(30, 150), gr = g.createRadialGradient(x, y, 0, x, y, r), c = ['40,52,70', '70,52,40', '0,0,0', '80,84,90'][Math.floor(rnd(0, 4))]; gr.addColorStop(0, `rgba(${c},.12)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.02, 0.07)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(20, 140), 1); }
    g.strokeStyle = 'rgba(190,196,204,.14)'; g.lineWidth = 0.8; for (let i = 0; i < 12; i++) { const x = rnd(0, w), y = rnd(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-60, 60), y + rnd(-60, 60)); g.stroke(); }
    grain(g, w, h, 5000, 20, 90, 0.05, 0.16);
  }, { repeat: true });
}
// the steel edge of a floor where it carries no name: a channel with a row of rivets top and bottom (1 m to the texture)
function channelTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2c2f33'); gr.addColorStop(0.12, '#1c1e21'); gr.addColorStop(0.88, '#16181a'); gr.addColorStop(1, '#0c0d0e'); g.fillStyle = gr; g.fillRect(0, 0, w, h); cloud(g, 0, 0, w, h, 10, 0.04);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.05)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(20, 120), 1); }
    for (let x = 16; x < w; x += 32) for (const y of [18, h - 18]) { const q = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5.5); q.addColorStop(0, '#7b8088'); q.addColorStop(0.6, '#2b2e32'); q.addColorStop(1, '#0d0e10'); g.fillStyle = q; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(w - 2, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, 1, h);
  }, { repeat: true });
}
// brushed brass
function brassTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9b877'); gr.addColorStop(0.5, '#a9854a'); gr.addColorStop(1, '#c9a766'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,244,214' : '70,48,16'},${rnd(0.05, 0.16)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(20, 120), 1); }
  }, { repeat: true });
}
// steel tread plate, 50 cm to the texture: raised diamonds lying two ways
function treadTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#26292d'; g.fillRect(0, 0, w, h); cloud(g, 0, 0, w, h, 12, 0.04);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { const x = (a + 0.5) * 32, y = (b + 0.5) * 32, tilt = (a + b) & 1 ? 0.785 : -0.785; g.save(); g.translate(x, y); g.rotate(tilt); const gr = g.createLinearGradient(0, -4, 0, 4); gr.addColorStop(0, '#8a9098'); gr.addColorStop(0.5, '#4a4f56'); gr.addColorStop(1, '#101214'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 11, 3.6, 0, 0, 7); g.fill(); g.restore(); }
    grain(g, w, h, 1500, 20, 100, 0.05, 0.16);
  }, { repeat: true });
}
// the underside of a floor: steel decking, its ribs 20 cm apart
function deckingTexture() {
  return canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 4; i++) { const gr = g.createLinearGradient(i * 32, 0, i * 32 + 32, 0); gr.addColorStop(0, '#0d0e10'); gr.addColorStop(0.3, '#2a2d31'); gr.addColorStop(0.55, '#33363b'); gr.addColorStop(0.8, '#1c1e21'); gr.addColorStop(1, '#0d0e10'); g.fillStyle = gr; g.fillRect(i * 32, 0, 32, h); } }, { repeat: true });
}
// yellow and black, on the slant, worn
function hazardTexture() {
  return canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#d0a312'; g.fillRect(0, 0, w, h); g.fillStyle = '#111213'; for (let x = -64; x < w + 64; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.fill(); } cloud(g, 0, 0, w, h, 16, 0.07); grain(g, w, h, 900, 20, 80, 0.1, 0.3); }, { repeat: true });
}
// a factory window: small panes in a black steel frame, the lit workshop beyond it a warm blur
function windowTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e9b56a'); gr.addColorStop(0.55, '#b87a35'); gr.addColorStop(1, '#5a3513'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { const x = rnd(0, w), y = rnd(0, h), r = rnd(40, 160), q = g.createRadialGradient(x, y, 0, x, y, r), c = Math.random() < 0.6 ? '255,236,190' : '40,20,6'; q.addColorStop(0, `rgba(${c},.28)`); q.addColorStop(1, `rgba(${c},0)`); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let a = 0; a < 5; a++) for (let b = 0; b < 6; b++) if (Math.random() < 0.16) { g.fillStyle = `rgba(20,14,8,${rnd(0.25, 0.6)})`; g.fillRect(a * w / 5, b * h / 6, w / 5, h / 6); }
    g.fillStyle = '#0c0d0f'; for (let a = 0; a <= 5; a++) g.fillRect(a * w / 5 - 4, 0, 8, h); for (let b = 0; b <= 6; b++) g.fillRect(0, b * h / 6 - 4, w, 8);
    g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h); g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
  });
}
const blobTexture = () => canvasTex(128, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.scale(1, 2);
  const gr = g.createRadialGradient(0, 0, 8, 0, 0, 62); gr.addColorStop(0, 'rgba(0,0,0,.92)'); gr.addColorStop(0.6, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill(); g.restore();
});
const whitePixel = () => canvasTex(2, 2, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2); });

// A surface whose light is worked out when it is built and kept in its corners (the `bake` attribute): it shows its own
// colour times that light (times `gain`, plus a floor of `amb` for pieces with no light in their corners), and mirrors
// the hall a little (`refl`). It takes no light from the scene's lamps at all: an unlit shader. (v105: these were
// MeshStandardMaterials at first; with eleven point lights, two spots and two suns in the scene every pixel of them
// was paying for sixteen lights it hardly showed, and the full rings put three or four such surfaces behind each
// other. Unlit, the building costs about a third less to draw.)
function baked(o, gain = 1, amb = 0.05) {
  const { refl = 0, ...rest } = o;
  const m = new THREE.MeshBasicMaterial({ ...rest, reflectivity: refl, combine: THREE.MixOperation });
  m.userData.gain = { value: gain }; m.userData.amb = { value: amb }; m.userData.mirrors = refl > 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGain = m.userData.gain; sh.uniforms.uAmb = m.userData.amb;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float bake; varying float vBake;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBake; uniform float uGain; uniform float uAmb;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= uAmb + vBake * uGain;')
      // the hall is mirrored from a well-blurred level of its cube: a soft sheen. (Read sharp, a 128-pixel cube with no
      // sense of where the lamps really are laid rows of blocky dashes across every floor.)
      .replace('#include <envmap_fragment>', THREE.ShaderChunk.envmap_fragment.replace('textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) )', 'textureLod( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ), 4.2 )'));
  };
  m.customProgramCacheKey = () => 'nr-baked-unlit3';
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
  get empty() { return this.i.length === 0; }
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
// a box standing at radius r, angle th, its middle at height y: wt across (along the ring), h high, dr deep (along the radius)
const boxAt = (r, th, y, wt, h, dr) => new THREE.BoxGeometry(wt, h, dr).rotateY(-th).translate(...P(r, th, y));
// a run following radius r from th0 to th1 at height y: h tall, d deep
function arcBand(r, th0, th1, y, h, n = 40, d = 0.03) {
  const geos = [];
  for (let i = 0; i < n; i++) { const a = th0 + (th1 - th0) * i / n, b = th0 + (th1 - th0) * (i + 1) / n; geos.push(beam(P(r, a, y), P(r, b, y), d, h)); }
  return geos;
}

export function createShowroom({ parent, rows, defs, displayFont = 'Arial Narrow, sans-serif', glowTex = null }) {
  const T = TOWER, deckY = (f) => T.Y0 + f * T.FH, thBay = (k) => (k - (T.NB - 1) / 2) * T.ALPHA, thDiv = (j) => (j - T.NB / 2) * T.ALPHA;
  const RD = T.RI + T.EDGE, RCOL = RD - 0.17;   // where the fins start; the columns that stand at their ends
  const group = new THREE.Group(); group.name = 'showroom'; group.visible = false; parent.add(group);
  const liftGroup = new THREE.Group(); liftGroup.name = 'car lift'; liftGroup.visible = false; parent.add(liftGroup);
  const cars = new THREE.Group(); cars.name = 'showroom cars'; group.add(cars);
  // the bays, bottom floor first: every car has a home; a car no row names takes the first empty bay
  const bays = [];
  for (let f = 0; f < T.NF; f++) for (let k = 0; k < T.NB; k++) {
    const th = thBay(k), y = deckY(f), p = P(T.RC, th, y), thd = thDiv(k + 1), e = er(thd), rk = RCOL - 0.2;
    bays.push({ floor: f, k, th, y, id: null, row: rows[f] || { name: '', sub: '' }, pos: p, yaw: -th, locked: false, holder: null, proxy: null, stock: null, lod: null, paint: null, key: null, code: 'ABCDE'[f] + (k + 1),
      // where the key hangs: on the column at the end of the fin on the bay's +theta side, on the face towards the lift
      keyPos: [e[0] * rk, y + 1.6, e[1] * rk], keyYaw: -thd });
  }
  const byId = {};
  rows.forEach((row, f) => row.cars.forEach((id, k) => { const b = bays[f * T.NB + k]; if (b && defs[id]) { b.id = id; byId[id] = b; } }));
  for (const id in defs) if (!byId[id]) { const b = bays.find((q) => !q.id); if (b) { b.id = id; byId[id] = b; } }
  const mats = {}, disposables = [];
  let built = null, envTex = null, hallCube = null, hallCam = null;
  // the gallery's bays (between its columns): how many, and the angle of each column
  const NG = 11, galStep = (2 * Math.PI - 2 * T.A) / NG, thGal = (i) => T.A + i * galStep;   // i = 0..NG (0 and NG are the bays' end fins)

  // ---- the light that is baked in: a lamp per bay (the two battens over the car), one per gallery bay, the shaft's rings
  let lights = [];
  const hallLights = [[0, 0, 90], [5, 3, 34], [-5, 3, 34], [0, 6, 40], [0, -6, 30]].map(([x, z, I]) => ({ p: [x, T.YT - 0.5, z], I }));
  function bake(p, n, floor = null, bay = null, amb = 0.05) {
    let E = amb;
    for (const l of lights) {
      if (floor === null || l.floor !== floor) continue;
      const w = bay === null || l.bay === null || l.bay === bay ? 1 : Math.abs(l.bay - bay) === 1 ? 0.22 : 0.05;
      const dx = l.p[0] - p[0], dy = l.p[1] - p[1], dz = l.p[2] - p[2], d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
      E += l.I * w * (0.22 + 0.78 * Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d)) / (d2 + 1.6);
    }
    for (const l of hallLights) { const dx = l.p[0] - p[0], dy = l.p[1] - p[1], dz = l.p[2] - p[2], d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1; E += l.I * (0.3 + 0.7 * Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d)) / (d2 + 30) * (floor === null ? 1 : 0.3); }
    return Math.min(1.25, E);
  }
  const bayOf = (th) => (Math.abs(th) < T.A ? Math.min(T.NB - 1, Math.floor((th + T.A) / T.ALPHA)) : null);

  // ---- pictures with words in them
  // the names on the floors' edges, one strip a row: a steel channel, riveted, the row's name in lit letters on it
  function fasciaTexture() {
    return canvasTex(4096, 128 * T.NF, (g, w, h) => {
      for (let f = 0; f < T.NF; f++) {
        const y0 = h - (f + 1) * 128, row = rows[f] || { name: '', sub: '' };
        const gr = g.createLinearGradient(0, y0, 0, y0 + 128); gr.addColorStop(0, '#2c2f33'); gr.addColorStop(0.12, '#1c1e21'); gr.addColorStop(0.88, '#16181a'); gr.addColorStop(1, '#0c0d0e'); g.fillStyle = gr; g.fillRect(0, y0, w, 128);
        for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.05)})`; g.fillRect(rnd(0, w), y0 + rnd(0, 128), rnd(40, 300), 1); }
        for (let x = 20; x < w; x += 41) for (const y of [y0 + 15, y0 + 113]) { const q = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5.5); q.addColorStop(0, '#7b8088'); q.addColorStop(0.6, '#2b2e32'); q.addColorStop(1, '#0d0e10'); g.fillStyle = q; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); }
        const name = (row.name || '').toUpperCase().split('').join(' '), sub = (row.sub || '').toUpperCase();
        g.textBaseline = 'middle'; g.font = `700 70px ${displayFont}`; const wn = g.measureText(name).width; g.font = `500 42px ${displayFont}`; const ws = g.measureText(sub).width, gap = sub ? 70 : 0, x0 = (w - wn - gap - ws) / 2;
        // a dark plate edged in brass behind the words
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x0 - 150, y0 + 28, wn + gap + ws + 300, 72); g.strokeStyle = '#a9854a'; g.lineWidth = 3; g.strokeRect(x0 - 150, y0 + 28, wn + gap + ws + 300, 72);
        g.font = `700 70px ${displayFont}`; g.fillStyle = '#fff3dc'; g.shadowColor = 'rgba(255,214,150,.95)'; g.shadowBlur = 16; g.textAlign = 'left'; g.fillText(name, x0, y0 + 66);
        g.shadowBlur = 0; g.font = `500 42px ${displayFont}`; g.fillStyle = '#c9b48a'; g.fillText(sub, x0 + wn + gap, y0 + 68);
        if (sub) { g.fillStyle = '#d9b877'; g.fillRect(x0 + wn + gap / 2 - 2, y0 + 40, 4, 50); }
        g.font = `700 50px ${displayFont}`; g.fillStyle = '#d9b877'; g.textAlign = 'right'; g.fillText('L' + (f + 1), x0 - 60, y0 + 66); g.textAlign = 'left'; g.fillText('L' + (f + 1), x0 + wn + gap + ws + 60, y0 + 66);
      }
    });
  }
  // the bays' nameplates, all on one sheet: brushed brass, the car's name engraved, a line of small print under it
  const PLATE = { cols: 4, rows: 8, w: 512, h: 128 };
  function plateTexture() {
    return canvasTex(PLATE.cols * PLATE.w, PLATE.rows * PLATE.h, (g) => {
      bays.forEach((b, i) => {
        const x0 = (i % PLATE.cols) * PLATE.w, y0 = Math.floor(i / PLATE.cols) * PLATE.h, d = b.id ? defs[b.id] : null;
        const gr = g.createLinearGradient(0, y0, 0, y0 + PLATE.h); gr.addColorStop(0, '#e3c88e'); gr.addColorStop(0.5, '#b59356'); gr.addColorStop(1, '#d2b377'); g.fillStyle = gr; g.fillRect(x0, y0, PLATE.w, PLATE.h);
        for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,246,220' : '70,50,18'},${rnd(0.04, 0.13)})`; g.fillRect(x0 + rnd(0, PLATE.w), y0 + rnd(0, PLATE.h), rnd(30, 150), 1); }
        g.strokeStyle = 'rgba(255,244,214,.7)'; g.lineWidth = 3; g.strokeRect(x0 + 3, y0 + 3, PLATE.w - 6, PLATE.h - 6); g.strokeStyle = 'rgba(60,42,14,.6)'; g.lineWidth = 2; g.strokeRect(x0 + 6, y0 + 6, PLATE.w - 12, PLATE.h - 12);
        for (const sx of [26, PLATE.w - 26]) { const sg = g.createRadialGradient(x0 + sx - 2, y0 + 61, 1, x0 + sx, y0 + 64, 11); sg.addColorStop(0, '#f4e2b8'); sg.addColorStop(1, '#7c6230'); g.fillStyle = sg; g.beginPath(); g.arc(x0 + sx, y0 + 64, 10, 0, 7); g.fill(); g.strokeStyle = 'rgba(40,28,8,.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + sx - 6, y0 + 60); g.lineTo(x0 + sx + 6, y0 + 68); g.stroke(); }
        const name = (d ? d.short || d.name : 'Empty bay').toUpperCase(), small = d ? (b.locked ? `LOCKED  ·  LEVEL ${b.level}` : (d.pick || '').toUpperCase()) : 'RESERVED';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        let size = 54; g.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; while (g.measureText(name).width > PLATE.w - 96 && size > 22) { size -= 2; g.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; }
        g.fillStyle = 'rgba(255,246,220,.6)'; g.fillText(name, x0 + PLATE.w / 2, y0 + 50); g.fillStyle = '#231a08'; g.fillText(name, x0 + PLATE.w / 2, y0 + 48);
        g.font = '600 24px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.fillStyle = b.locked ? '#7a0d12' : '#43330f'; g.fillText(small, x0 + PLATE.w / 2, y0 + 96);
      });
    });
  }
  // what is stencilled on the concrete: each bay's code, each gallery's floor number (5 by 6 cells, white spray paint)
  const STEN = { cols: 5, rows: 6, w: 256, h: 128 };
  function stencilTexture() {
    return canvasTex(STEN.cols * STEN.w, STEN.rows * STEN.h, (g) => {
      const cell = (i, text) => {
        const x0 = (i % STEN.cols) * STEN.w, y0 = Math.floor(i / STEN.cols) * STEN.h;
        g.font = `800 96px ${displayFont}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(236,238,240,.85)'; g.fillText(text, x0 + STEN.w / 2, y0 + STEN.h / 2 + 4);
        // the bridges a stencil leaves, and where the paint went on thin
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(x0, y0 + STEN.h / 2 + 1, STEN.w, 5);
        for (let k = 0; k < 420; k++) { g.fillStyle = `rgba(0,0,0,${rnd(0.2, 0.7)})`; g.fillRect(x0 + rnd(0, STEN.w), y0 + rnd(0, STEN.h), rnd(1, 4), rnd(1, 3)); }
        g.globalCompositeOperation = 'source-over';
      };
      bays.forEach((b, i) => cell(i, b.code[0] + ' ' + b.code[1]));
      for (let f = 0; f < T.NF; f++) cell(25 + f, 'L ' + (f + 1));
    });
  }
  const stenUV = (i) => [(i % STEN.cols) / STEN.cols, 1 - (Math.floor(i / STEN.cols) + 1) / STEN.rows, 1 / STEN.cols, 1 / STEN.rows];

  // ---- the building
  function build() {
    lights = [];
    for (const b of bays) lights.push({ p: P(T.RC - 0.3, b.th, b.y + T.FH - T.SLAB - 0.3), I: b.locked ? 1.1 : b.id ? 5.4 : 2.2, floor: b.floor, bay: b.k });
    for (let f = 0; f < T.NF; f++) for (let i = 0; i < NG; i++) lights.push({ p: P(11.9, thGal(i + 0.5), deckY(f) + T.FH - T.SLAB - 0.3), I: 2.6, floor: f, bay: null });
    const deck = new Acc(), wall = new Acc(), back = new Acc(), ceil = new Acc(), fascia = new Acc(), chan = new Acc(), plates = new Acc(), blobs = new Acc(), tread = new Acc(), haz = new Acc(), win = new Acc(), sten = new Acc();
    const ledW = [], ledR = [], steel = [], brass = [], dark = [];
    const A = T.A, UP = [0, 1, 0], DN = [0, -1, 0], TAU = Math.PI * 2;
    // the ground floor: polished concrete from the lift's shaft out to the wall, a hazard band round the shaft
    deck.grid(132, 14, (u, v) => { const th = u * TAU - Math.PI, r = T.TUBE + 0.42 + (T.RH - T.TUBE - 0.42) * v, p = P(r, th, T.Y0); return [...p, ...UP, p[0] / 6, p[2] / 6, bake(p, UP, 0, bayOf(th), 0.07)]; });
    haz.grid(96, 1, (u, v) => { const th = u * TAU, r = T.TUBE + 0.42 * v, p = P(r, th, T.Y0 + 0.002); return [...p, ...UP, th * T.TUBE / 0.9, v, 0.42]; });
    for (let f = 1; f <= T.NF; f++) {
      const y = deckY(f);
      // a floor's slab: its top (a deck, except the roof), its underside (steel decking, the ceiling of the floor below)
      if (f < T.NF) deck.grid(132, 6, (u, v) => { const th = u * TAU - Math.PI, r = T.RI + (T.RH - T.RI) * v, p = P(r, th, y); return [...p, ...UP, p[0] / 6, p[2] / 6, bake(p, UP, f, bayOf(th), 0.06)]; });
      ceil.grid(132, 6, (u, v) => { const th = u * TAU - Math.PI, r = T.RI + (T.RH - T.RI) * v, p = P(r, th, y - T.SLAB); return [...p, ...DN, r / 0.8, th * 3, bake(p, DN, f - 1, bayOf(th)) * 0.85 + 0.05]; });
      // its edge towards the lift: over the bays a channel that carries the name of the row below it; round the rest, plain riveted channel
      fascia.grid(60, 1, (u, v) => { const th = -A + 2 * A * u, e = er(th), p = P(T.RI, th, y - 0.5 + 0.5 * v); return [...p, -e[0], 0, -e[1], u, (f - 1 + v) / T.NF, 1]; });
      chan.grid(110, 1, (u, v) => { const th = A + (TAU - 2 * A) * u, e = er(th), p = P(T.RI, th, y - 0.5 + 0.5 * v); return [...p, -e[0], 0, -e[1], th * T.RI, v, 0.75]; });
      // a line of warm light under its lip, all the way round; the edge beam's lower flange behind it
      ledW.push(...arcBand(T.RI - 0.012, -Math.PI, Math.PI, y - 0.5 - 0.016, 0.03, 150));
      steel.push(...arcBand(T.RI + 0.16, -Math.PI, Math.PI, y - 0.53, 0.035, 150, 0.3));
    }
    // ---- the bays
    for (const b of bays) {
      const f = b.floor, y = b.y, c0 = thDiv(b.k), c1 = thDiv(b.k + 1), yc = y + T.FH - T.SLAB, e = er(b.th), t = et(b.th), i = bays.indexOf(b);
      // the back wall, and the bay's code stencilled on it
      back.grid(4, 3, (u, v) => { const th = c0 + (c1 - c0) * u, q = er(th), p = P(T.RO, th, y + (yc - y) * v); return [...p, -q[0], 0, -q[1], u, v, b.locked ? 0.32 : b.id ? 1 : 0.5]; });
      { const [su, sv, sw, sh] = stenUV(i); sten.grid(1, 1, (u, v) => { const a = (u - 0.5) * 1.5; return [e[0] * (T.RO - 0.02) + t[0] * a, y + 1.62 + v * 0.75, e[1] * (T.RO - 0.02) + t[1] * a, -e[0], 0, -e[1], su + u * sw, sv + v * sh, 0]; }); }
      // two battens of light over the car, hung from the decking: black housings, the lit strip under each
      for (const sd of [-1, 1]) {
        const c = P(T.RC - 0.25, b.th, yc - 0.34), x = c[0] + t[0] * 1.3 * sd, z = c[2] + t[1] * 1.3 * sd;
        (b.locked ? ledR : ledW).push(new THREE.BoxGeometry(0.07, 0.016, 3.5).rotateY(-b.th).translate(x, c[1] - 0.034, z));
        dark.push(new THREE.BoxGeometry(0.11, 0.06, 3.6).rotateY(-b.th).translate(x, c[1], z));
        for (const dr of [-1.5, 1.5]) dark.push(new THREE.BoxGeometry(0.012, 0.31, 0.012).translate(x + e[0] * dr, c[1] + 0.18, z + e[1] * dr));
      }
      // the pallet the car stands on, its soft shadow
      steel.push(new THREE.BoxGeometry(2.36, 0.03, 5.1).rotateY(b.yaw).translate(b.pos[0], y + 0.015, b.pos[2]));
      if (b.id) blobs.grid(1, 1, (u, v) => { const a = (u - 0.5) * 2.9, r = (v - 0.5) * 6.0; return [b.pos[0] + t[0] * a + e[0] * r, y + 0.034, b.pos[2] + t[1] * a + e[1] * r, ...UP, u, v, 0]; });
      // the bay's threshold: tread plate where the pallet runs out to the lift, a hazard line behind it
      tread.grid(4, 1, (u, v) => { const th = c0 + 0.02 + (c1 - c0 - 0.04) * u, r = T.RI + 0.03 + 0.62 * v, p = P(r, th, y + 0.003); return [...p, ...UP, th * T.RI / 0.5, r / 0.5, bake(p, UP, f, b.k) * 1.1 + 0.08]; });
      haz.grid(4, 1, (u, v) => { const th = c0 + 0.02 + (c1 - c0 - 0.04) * u, r = T.RI + 0.67 + 0.1 * v, p = P(r, th, y + 0.003); return [...p, ...UP, th * T.RI / 0.9, v, 0.5]; });
      // the key board on the column beside it: a blackened steel plate in a brass frame, the hook, the brass nameplate
      { const q = b.keyPos, n = er(c1), s = et(c1), u0 = (i % PLATE.cols) / PLATE.cols, v0 = 1 - (Math.floor(i / PLATE.cols) + 1) / PLATE.rows;
        dark.push(new THREE.BoxGeometry(0.46, 0.8, 0.014).rotateY(b.keyYaw).translate(q[0] + n[0] * 0.016, q[1] - 0.22, q[2] + n[1] * 0.016));
        for (const [w, h2, ox, oy] of [[0.5, 0.018, 0, 0.19], [0.5, 0.018, 0, -0.63], [0.018, 0.84, -0.241, -0.22], [0.018, 0.84, 0.241, -0.22]]) brass.push(new THREE.BoxGeometry(w, h2, 0.02).rotateY(b.keyYaw).translate(q[0] + n[0] * 0.012 + s[0] * ox, q[1] + oy, q[2] + n[1] * 0.012 + s[1] * ox));
        steel.push(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8).rotateX(Math.PI / 2).rotateY(b.keyYaw).translate(q[0] - n[0] * 0.012, q[1] + 0.05, q[2] - n[1] * 0.012));
        const W = 0.38, H = 0.095, py = q[1] - 0.51;
        plates.grid(1, 1, (u, v) => [q[0] + n[0] * 0.006 + s[0] * (u - 0.5) * W, py + (v - 0.5) * H, q[2] + n[1] * 0.006 + s[1] * (u - 0.5) * W, -n[0], 0, -n[1], u0 + u / PLATE.cols, v0 + v / PLATE.rows, 1]); }
    }
    // ---- fins between the bays: board-formed concrete, floor to ceiling, from behind the columns to the back wall
    for (let j = 0; j <= T.NB; j++) {
      const th = thDiv(j), e = er(th), t = et(th), h = 0.1;
      for (let f = 0; f < T.NF; f++) {
        const y0 = deckY(f), y1 = y0 + T.FH - T.SLAB;
        for (const s of [-1, 1]) {
          const k = s < 0 ? j - 1 : j, mine = k >= 0 && k < T.NB;   // (an end fin's outer face is the gallery's)
          wall.grid(8, 4, (u, v) => { const r = RD + (T.RO - RD) * u, p = [e[0] * r + t[0] * h * s, y0 + (y1 - y0) * v, e[1] * r + t[1] * h * s], n = [t[0] * s, 0, t[1] * s]; return [...p, ...n, r / 4, v, bake(p, n, f, mine ? k : null) * 1.25 + (mine ? 0 : 0.06)]; });
        }
        wall.grid(1, 2, (u, v) => { const p = [e[0] * RD + t[0] * h * (u * 2 - 1), y0 + (y1 - y0) * v, e[1] * RD + t[1] * h * (u * 2 - 1)]; return [...p, -e[0], 0, -e[1], u * 0.05, v, 0.3]; });
      }
    }
    // ---- the steel frame: a column at the end of every fin and every 23 degrees round the gallery, from the ground to the roof
    const colAngles = []; for (let j = 0; j <= T.NB; j++) colAngles.push(thDiv(j)); for (let i = 1; i < NG; i++) colAngles.push(thGal(i));
    const H = T.YT - 0.9 - T.Y0;
    for (const th of colAngles) {
      const ym = T.Y0 + H / 2, s = et(th);
      for (const dr of [-0.14, 0.14]) steel.push(boxAt(RCOL + dr, th, ym, 0.3, H, 0.026));
      steel.push(boxAt(RCOL, th, ym, 0.018, H, 0.26));
      for (let f = 0; f < T.NF; f++) {
        dark.push(boxAt(RCOL, th, deckY(f) + 0.012, 0.44, 0.024, 0.44));
        for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) { const c = P(RCOL + b, th, deckY(f) + 0.034); steel.push(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6).translate(c[0] + s[0] * a, c[1], c[2] + s[1] * a)); }
        // a line of light down each edge of the column's face
        for (const sd of [-1, 1]) { const c = P(RCOL - 0.16, th, 0); ledW.push(beam([c[0] + s[0] * 0.13 * sd, deckY(f) + 0.14, c[2] + s[1] * 0.13 * sd], [c[0] + s[0] * 0.13 * sd, deckY(f) + T.FH - T.SLAB - 0.14, c[2] + s[1] * 0.13 * sd], 0.022, 0.016)); }
      }
    }
    // ---- the gallery: the rest of each ring
    for (let f = 0; f < T.NF; f++) {
      const y0 = deckY(f), y1 = y0 + T.FH - T.SLAB;
      // its wall, concrete; a factory window in every second bay of it; the floor's number stencilled in four of the others
      wall.grid(110, 4, (u, v) => { const th = A + (TAU - 2 * A) * u, e = er(th), p = P(T.RH, th, y0 + (y1 - y0) * v), n = [-e[0], 0, -e[1]]; return [...p, ...n, th * T.RH / 4, v, bake(p, n, f, null, 0.08) * 1.3]; });
      for (let i = 0; i < NG; i++) {
        const th = thGal(i + 0.5), e = er(th), t = et(th);
        if (i % 2 === 1) win.grid(1, 1, (u, v) => { const a = (u - 0.5) * 2.5; return [e[0] * (T.RH - 0.04) + t[0] * a, y0 + 0.7 + v * 1.75, e[1] * (T.RH - 0.04) + t[1] * a, -e[0], 0, -e[1], u, v, 0.8]; });
        else if (i === 0 || i === NG - 1 || i === 4 || i === 6) { const [su, sv, sw, sh] = stenUV(25 + f); sten.grid(1, 1, (u, v) => { const a = (u - 0.5) * 1.8; return [e[0] * (T.RH - 0.02) + t[0] * a, y0 + 1.25 + v * 0.9, e[1] * (T.RH - 0.02) + t[1] * a, -e[0], 0, -e[1], su + u * sw, sv + v * sh, 0]; }); }
      }
      // two service pipes under the decking, a cable tray, the gallery's lamps
      steel.push(...arcBand(T.RH - 0.22, A + 0.04, TAU - A - 0.04, y1 - 0.2, 0.09, 110, 0.09), ...arcBand(T.RH - 0.4, A + 0.04, TAU - A - 0.04, y1 - 0.16, 0.06, 110, 0.06));
      dark.push(...arcBand(12.9, A + 0.04, TAU - A - 0.04, y1 - 0.12, 0.05, 110, 0.3));
      for (let i = 0; i < NG; i++) { const th = thGal(i + 0.5), c = P(11.9, th, y1 - 0.3); ledW.push(new THREE.BoxGeometry(1.5, 0.016, 0.07).rotateY(-th).translate(c[0], c[1] - 0.034, c[2])); dark.push(new THREE.BoxGeometry(1.6, 0.06, 0.11).rotateY(-th).translate(c[0], c[1], c[2])); }
      // its rail along the edge (not on the ground floor, where there is no drop): steel posts, two rods, a brass handrail, a kick plate
      if (f > 0) {
        const r = T.RI + 0.1, n = 26, a0 = A + 0.05, a1 = TAU - A - 0.05;
        for (let k = 0; k <= n; k++) steel.push(boxAt(r, a0 + (a1 - a0) * k / n, y0 + 0.53, 0.04, 1.06, 0.04));
        brass.push(...arcBand(r, a0, a1, y0 + 1.07, 0.032, 96, 0.07));
        steel.push(...arcBand(r, a0, a1, y0 + 0.74, 0.016, 96, 0.016), ...arcBand(r, a0, a1, y0 + 0.42, 0.016, 96, 0.016), ...arcBand(r, a0, a1, y0 + 0.08, 0.11, 96, 0.012));
      }
    }
    // ---- the top of the shaft: a ring of beams, two great rings of light
    ceil.grid(64, 6, (u, v) => { const th = u * TAU, p = P(T.RI * v, th, T.YT); return [...p, ...DN, T.RI * v / 0.8, th * 3, 0.14 + 0.16 * Math.exp(-Math.pow((T.RI * v - 4.5) / 3, 2))]; });
    for (let i = 0; i < 10; i++) { const th = i * TAU / 10; steel.push(beam(P(0.6, th, T.YT - 0.2), P(T.RI + 0.3, th, T.YT - 0.2), 0.16, 0.34)); }
    steel.push(...arcBand(4.6, 0, TAU, T.YT - 0.2, 0.3, 60, 0.14));
    for (const r of [3.2, 6.4]) { ledW.push(new THREE.TorusGeometry(r, 0.05, 6, 96).rotateX(Math.PI / 2).translate(0, T.YT - 0.48, 0)); dark.push(new THREE.TorusGeometry(r, 0.1, 6, 96).rotateX(Math.PI / 2).translate(0, T.YT - 0.4, 0)); }
    // ---- the lift's shaft: four slim guide rails, set where, from across the hall, they line up with the columns behind them
    // (only on the bays' side, and no hoops: the camera now stands right beside the shaft, and rails on its own side, or hoops, cut across every car)
    for (const d of [20, 64]) for (const sg of [-1, 1]) { const th = sg * d * D2R; steel.push(beam(P(T.TUBE, th, T.Y0), P(T.TUBE, th, T.YT), 0.045, 0.045)); }

    const tex = { floor: floorTexture(), wall: wallTexture(), back: backTexture(), steel: steelTexture(), chan: channelTexture(), brass: brassTexture(), tread: treadTexture(), ceil: deckingTexture(), haz: hazardTexture(), win: windowTexture(), fascia: fasciaTexture(), plates: plateTexture(), sten: stencilTexture(), blob: blobTexture(), white: whitePixel() };
    disposables.push(...Object.values(tex));
    mats.deck = baked({ name: 'tower floor', map: tex.floor, refl: 0.16 }, 2.3, 0.06);
    mats.wall = baked({ name: 'tower concrete', map: tex.wall }, 1.9, 0.05);
    mats.back = baked({ name: 'tower bay wall', map: tex.back }, 1.5, 0.03);
    mats.ceil = baked({ name: 'tower decking', map: tex.ceil, refl: 0.06 }, 1.7, 0.08);
    mats.fascia = baked({ name: 'tower name band', map: tex.fascia, refl: 0.08 }, 1.5, 0.05);
    mats.chan = baked({ name: 'tower channel', map: tex.chan, refl: 0.14 }, 1.5, 0.1);
    mats.plates = baked({ name: 'tower plates', map: tex.plates, refl: 0.25 }, 0.75, 0.05);
    mats.tread = baked({ name: 'tower tread plate', map: tex.tread, refl: 0.16 }, 1.7, 0.1);
    mats.haz = baked({ name: 'tower hazard paint', map: tex.haz }, 1.2, 0.08);
    mats.win = baked({ name: 'tower window', map: tex.win, refl: 0.06 }, 1.3, 0.05);
    // (the steelwork and fittings are built from boxes with no light in their corners: they show at their own level, and mirror the hall)
    mats.steel = baked({ name: 'tower steel', map: tex.steel, refl: 0.3 }, 1, 3.4);
    mats.brass = baked({ name: 'tower brass', map: tex.brass, refl: 0.38 }, 1, 0.85);
    mats.dark = baked({ name: 'tower black steel', map: tex.white, color: 0x121315, refl: 0.22 }, 1, 1.6);
    mats.ledW = new THREE.MeshBasicMaterial({ name: 'tower led', color: new THREE.Color(2.2, 1.95, 1.6), fog: false });
    mats.ledR = new THREE.MeshBasicMaterial({ name: 'tower led locked', color: new THREE.Color(1.5, 0.1, 0.07), fog: false });
    mats.blob = new THREE.MeshBasicMaterial({ name: 'tower shadow', map: tex.blob, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    mats.sten = new THREE.MeshBasicMaterial({ name: 'tower stencil', map: tex.sten, transparent: true, depthWrite: false, fog: false, opacity: 0.5 });
    const meshes = [];
    const add = (geo, mat, order = 0) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.castShadow = m.receiveShadow = false; m.layers.enable(2); group.add(m); meshes.push(m); return m; };
    for (const [acc, mat] of [[deck, mats.deck], [wall, mats.wall], [back, mats.back], [ceil, mats.ceil], [fascia, mats.fascia], [chan, mats.chan], [plates, mats.plates], [tread, mats.tread], [haz, mats.haz], [win, mats.win]]) if (!acc.empty) add(acc.geo(), mat);
    const flat = (list) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))) : null);
    add(flat(ledW), mats.ledW); add(flat(ledR), mats.ledR); add(flat(steel), mats.steel); add(flat(brass), mats.brass); add(flat(dark), mats.dark);
    { const m = add(blobs.empty ? null : blobs.geo(), mats.blob, 1); if (m) m.layers.disable(2); }
    { const m = add(sten.empty ? null : sten.geo(), mats.sten, 1); if (m) m.layers.disable(2); }
    // (no glass round the shaft any more: seen from beside it, even a faint sheet of it laid a pale band over the middle bays)
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
    const wpx = whitePixel(), tr = treadTexture(); tr.repeat.set(8, 8);
    const steelM = baked({ name: 'lift steel', map: wpx, color: 0x2a2d32, refl: 0.3 }, 1, 1.5);
    const top = baked({ name: 'lift deck', map: tr, refl: 0.16 }, 1, 2.2);
    const led = new THREE.MeshBasicMaterial({ name: 'lift led', color: new THREE.Color(2.2, 1.95, 1.6), fog: false });
    const pf = new THREE.Group();
    pf.add(new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.16, 72).translate(0, -0.085, 0), steelM), new THREE.Mesh(new THREE.CylinderGeometry(3.22, 3.22, 0.012, 72).translate(0, -0.003, 0), top), new THREE.Mesh(new THREE.TorusGeometry(3.26, 0.022, 6, 96).rotateX(Math.PI / 2).translate(0, 0.004, 0), led),
      new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 30, 20).translate(0, -15.17, 0), steelM));   // the ram under it
    const pallet = new THREE.Group(); pallet.add(new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.03, 5.1).translate(0, 0.015, 0), baked({ name: 'pallet', map: wpx, color: 0x2c2f33, refl: 0.3 }, 1, 1.4)));
    const rails = new THREE.Group(); for (const s of [-0.85, 0.85]) rails.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1).translate(s, -0.05, 0.5), steelM));
    pf.traverse((o) => { o.castShadow = false; }); liftGroup.add(pf, pallet, rails);
    lift.platform = pf; lift.pallet = pallet; lift.rails = rails; lift.mats = [steelM, top, pallet.children[0].material];
  }

  // ---- the cars: the light copies, one in each bay. Stock ones come in one file; a car its owner has changed is
  // given its own (setLod), made from the real car by lod.js. One shader for every part of them, lamps apart.
  const PM = {
    metal: new THREE.MeshStandardMaterial({ name: 'proxy metal', vertexColors: true, metalness: 0.92, roughness: 0.3, envMapIntensity: 1 }),
    gloss: new THREE.MeshStandardMaterial({ name: 'proxy gloss', vertexColors: true, metalness: 0, roughness: 0.32, envMapIntensity: 0.9 }),
    matte: new THREE.MeshStandardMaterial({ name: 'proxy matte', vertexColors: true, metalness: 0, roughness: 0.8, envMapIntensity: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ name: 'proxy glass', vertexColors: true, color: 0x0a0d12, metalness: 0.2, roughness: 0.04, envMapIntensity: 1.5 }),
    // the lamps: lit, at a modest level (the owner: "all the headlights to be on ... but not incredibly bright")
    lamp: new THREE.MeshBasicMaterial({ name: 'proxy lamp', vertexColors: true, color: new THREE.Color(1.25, 1.22, 1.16), fog: false }),
  };
  // (v108, the owner: "the cars arent loading with the correct lights, ensure that the lights on the cars are exactly as they are
  // within the players car menu and how they were customized. make sure the color is correct and the options are set". A copy used
  // to hold the lights its car had when the copy was made, and one is only made while the car is in the workshop: every other car
  // stood here with white lights, on. Now each car's headlamps ('head'), running lights ('drl') and bulbs have materials of their
  // own, switched and coloured from the car's saved build (setLights), so they are right for every car, at once, copy or stock.
  // They are drawn as the game draws the real lamp: the surface's own colour lit by the hall, plus, switched on, the lamp's light in
  // its colour at the game's own level for that lamp, corner by corner (the fourth number of the corner's colour).)
  // (v109) Each is drawn 4 cm nearer the eye than it stands. A copy's body is a simplified surface, and where a thin lamp lies right
  // against it (the Challenger's rings in their bowls) that surface came out in front and hid the lamp: with the bulbs gone, a car
  // whose lamps are lit on the real thing stood dark. `see`: the see-through lens inside some lamps.
  const glowMat = (name, see = false) => {
    const m = new THREE.MeshStandardMaterial({ name, vertexColors: true, metalness: 0, roughness: 0.6, envMapIntensity: 0.5, envMap: envTex, side: THREE.DoubleSide, ...(see ? { transparent: true, opacity: 0.45, depthWrite: false } : {}) });   // (both faces: the lit outlines are thin open shapes)
    const u = m.userData.glow = { value: new THREE.Color(0, 0, 0) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = u;
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tmvPosition.xyz *= 1.0 - 0.04 / max(length(mvPosition.xyz), 0.5);\n\tgl_Position = projectionMatrix * mvPosition;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'uniform vec3 uGlow;\n#include <common>')
        .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a = opacity;')   // (the fourth number is light, not see-through)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR_ALPHA\n\ttotalEmissiveRadiance += uGlow * vColor.a;\n#endif');
    };
    m.customProgramCacheKey = () => 'proxy lamp v109';
    return m;
  };
  const lightsOf = (b) => {
    if (!b.lm) {
      b.lm = { head: glowMat('proxy head ' + b.id), drl: glowMat('proxy drl ' + b.id), lens: glowMat('proxy lens ' + b.id, true) };
      // until a build is given: on, as a car comes
      b.lm.head.userData.glow.value.setScalar(LAMP_MAX); b.lm.drl.userData.glow.value.setRGB(0.847, 0.922, 1).multiplyScalar(LAMP_MAX);
    }
    return b.lm;
  };
  const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), lc = new THREE.Color();
  for (const b of bays) { b.holder = new THREE.Group(); b.holder.position.set(b.pos[0], b.y + 0.03, b.pos[2]); b.holder.rotation.y = b.yaw; cars.add(b.holder); }
  const paintOf = (b) => (b.paint ||= new THREE.MeshStandardMaterial({ name: 'proxy paint ' + b.id, vertexColors: true, color: 0xffffff, metalness: 0, roughness: 0.3, envMapIntensity: 1.15, envMap: envTex }));
  const matsOf = (b) => ({ ...PM, paint: paintOf(b), ...lightsOf(b) });
  let loading = null;
  function loadCars(decoder) {
    loading ||= (async () => {
      const res = await fetch('showroom-cars.txt?v=109'); if (!res.ok) throw new Error('showroom cars ' + res.status);
      const bin = atob((await res.text()).trim()), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const loader = new GLTFLoader(); if (decoder) loader.setMeshoptDecoder(decoder);
      const gltf = await new Promise((ok, no) => loader.parse(bytes.buffer, '', ok, no));
      for (const node of [...gltf.scene.children]) {
        const b = byId[node.name]; if (!b) continue;
        const M = matsOf(b);
        node.traverse((o) => { if (!o.isMesh) return; const k = o.material.name; o.material = M[k] || PM.matte; o.castShadow = o.receiveShadow = false; if (k === 'bulb') o.visible = false; });
        b.stock = node; b.bounds = node.userData.bounds || null;
        if (!b.lod) { b.proxy = node; b.holder.add(node); }
        if (b.lights) api.setLights(b.id, b.lights);   // (its underglow is sized by the car)
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
      const all = [...Object.values(mats), ...Object.values(PM), ...lift.mats, ...bays.map((b) => b.paint).filter(Boolean), ...bays.flatMap((b) => (b.lm ? [b.lm.head, b.lm.drl, b.lm.lens] : []))];
      for (const m of all) if (m && 'envMap' in m && !m.isMeshBasicMaterial && m.envMap !== tex) { m.envMap = tex; m.needsUpdate = true; }
    },
    // What the building's own surfaces mirror: a cube of the hall taken once, here, from the middle of the shaft. (Not the
    // game's cube, which the cars use: that one is redrawn as a car moves, the building is in it, and a surface cannot be
    // drawn into a picture it is reading from. This one is taken while the building mirrors nothing, then handed to it.)
    captureEnv(renderer, scene) {
      if (!built) return;
      const mirrors = [...Object.values(mats), ...lift.mats].filter((m) => m.userData && m.userData.mirrors);
      for (const m of mirrors) if (m.envMap) { m.envMap = null; m.needsUpdate = true; }
      hallCube ||= new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      hallCam ||= (() => { const c = new THREE.CubeCamera(0.2, 80, hallCube); for (const k of c.children) k.layers.set(2); return c; })();
      const was = group.visible, auto = renderer.shadowMap.autoUpdate; group.visible = true; renderer.shadowMap.autoUpdate = false;
      parent.localToWorld(hallCam.position.set(0, T.Y0 + 7.5, 2.2)); hallCam.updateMatrixWorld(true); hallCam.update(renderer, scene);
      renderer.shadowMap.autoUpdate = auto; group.visible = was;
      for (const m of mirrors) { m.envMap = hallCube.texture; m.needsUpdate = true; }
    },
    // a car's copy wears its owner's paint
    setPaint(id, hex, fin) {
      const b = byId[id]; if (!b) return; const m = paintOf(b);
      m.color.set(hex);
      if (fin) { m.metalness = fin.metalness; m.roughness = Math.max(0.12, fin.roughness - 0.14 * (fin.clearcoat || 0)); }   // (a clear coat reads as a glossier surface)
    },
    // (v108) a car's lamps as its own Lights menu has them. `mode`: 'on', 'drl' (running lights only) or 'off'; `color`: the
    // headlight colour chosen (hex; null = as the car comes); `glow`: the underglow colour (null = none)
    setLights(id, { mode = 'on', color = null, glow = null } = {}) {
      const b = byId[id]; if (!b) return; b.lights = { mode, color, glow };
      const L = lightsOf(b), on = mode === 'on', run = mode !== 'off', c = lc;
      if (color) c.set(color);
      // (the game's own figures, applyMods: a chosen colour goes on the headlamps at 1.6 times their level, on the running lights at their level)
      const lit = (m, is, stock, k) => { const g = m.userData.glow.value; if (!is) g.setScalar(0); else if (color) g.copy(c).multiplyScalar(LAMP_MAX * k); else g.setRGB(...stock).multiplyScalar(LAMP_MAX); };
      lit(L.head, on, [1, 1, 1], 1.6); lit(L.drl, run, [0.847, 0.922, 1], 1);
      // the lens inside a lamp: its own faint light as it comes; in a chosen colour, that colour all over at 0.6 (applyMods)
      lit(L.lens, on && !color, [1, 1, 1], 1); if (on && color) L.lens.emissive.copy(c); else L.lens.emissive.setScalar(0); L.lens.emissiveIntensity = 0.6;
      // (v109: no bulbs in the lamps: the owner, "make sure that there are no white bulbs ... if u cant see them just keep them the same")
      // the neon under the car: the game's own pool of colour, sized to the car as the game sizes it (placeUnderglow)
      if (glow && glowTex && b.holder) {
        if (!b.glow) { b.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ name: 'proxy underglow', map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); b.glow.renderOrder = 4; b.glow.position.y = 0.014; b.holder.add(b.glow); }
        const bb = b.bounds || [[-0.95, 0, -2.25], [0.95, 1.3, 2.25]], hw = Math.max(bb[1][0], -bb[0][0]), len = bb[1][2] - bb[0][2];
        b.glow.scale.set(hw * 2 / 0.5 * 0.94, 1, len / 0.69 * 0.96); b.glow.position.z = (bb[1][2] + bb[0][2]) / 2;
        b.glow.material.color.set(glow).multiplyScalar(1.4); b.glow.visible = true;
      } else if (b.glow) b.glow.visible = false;
    },
    // a car's own copy, made from the car as its owner built it (lod.js parts); null puts the stock copy back
    setLod(id, parts) {
      const b = byId[id]; if (!b) return;
      if (b.lod) { b.holder.remove(b.lod); b.lod.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); b.lod = null; }
      if (b.stock) b.holder.remove(b.stock);
      if (parts) { b.lod = lodObject(parts, matsOf(b)); b.holder.add(b.lod); b.proxy = b.lod; }
      else if (b.stock) { b.holder.add(b.stock); b.proxy = b.stock; }
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
    // where the camera stands to take in every bay (inside the ring, across the shaft from them), and to look at one
    // bay (room space: [position, target])
    overview() { return { pos: [0, T.Y0 + 13.5, 6.9], tgt: [0, T.Y0 + 7.3, -10.2] }; },
    bayView(b, portrait = false) {
      const e = er(b.th), t = et(b.th);
      // (a tall, narrow screen cannot hold the whole car and the key side by side: it stands further round and higher, on the car's nose and the key)
      if (portrait) return { pos: [e[0] * 6.5 - t[0] * 1.9, b.y + 1.95, e[1] * 6.5 - t[1] * 1.9], tgt: [e[0] * 10.4 + t[0] * 1.1, b.y + 0.5, e[1] * 10.4 + t[1] * 1.1] };
      const r = 6.8, a = -1.35; return { pos: [e[0] * r + t[0] * a, b.y + 1.5, e[1] * r + t[1] * a], tgt: [e[0] * 10.6 + t[0] * 0.55, b.y + 0.85, e[1] * 10.6 + t[1] * 0.55] };
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
