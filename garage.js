// The garage: a night tuning studio built in code, dropped over the car wherever it is when the garage opens, so the
// car never moves and nothing about the world has to pause. (It replaced a photo-scanned parking deck whose ragged
// open edges, holes and baked daylight could not be cleaned up.)
//
// Room space: floor y = 0, the car on the turntable at the origin facing -x. The room runs x -10..10 (along the car),
// z -8.5..8.5, 5 m high. The garage camera mostly sits off the car's left (+z) looking across it, so the far wall
// (z = -8.5) carries the neon sign; both long walls have vertical light bars that stripe down the car's flanks, the
// ceiling over the car is a honeycomb of LED tubes that the paint and chrome mirror, a cyan cove line runs round the
// floor and the turntable's rim glows. The floor is dark polished epoxy that mirrors all of it (the game's planar
// reflection keeps running while the room is up). About ten draw calls in all, nothing to download.
//
// v103, the owner: "rework the garage make it more of a workshop where the cars are built and modified". The room is
// now a working shop: a poured concrete floor with a hazard ring painted round the car lift (the turntable is the
// lift that brings cars down from the collection above: showroom.js; its shaft opens in the ceiling), painted block
// walls, a long workbench under the sign with a vice, a toolbox and a pegboard of tools over it, roller cabinets, a
// rack of tyres, an engine swinging from a hoist, oil drums, a compressor, gas bottles, a trolley jack and stands,
// and racking stacked with parts boxes. All of it built here from boxes and cylinders in six more draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARED } from './world.js?b=d06c7df3b2';

const ROOM = { x0: -10, x1: 10, z0: -8.5, z1: 8.5, h: 5 };
const TURNTABLE_R = 3.35, SHAFT_R = 3.38;

export const GARAGE_SPEC = {
  spot: [0, 0],              // where the car sits, room space: the middle of the turntable
  heading: -Math.PI / 2,     // car forward in room space: -x
  ceiling: 3.9,              // highest the camera goes
  rooms: [[-8.7, 8.7, -7.3, 7.3]],   // [x0, x1, z0, z1] boxes the camera may be in
  lights: [[-2.3, 3.7, 0.4], [2.5, 3.7, 0.4], [0.3, 2.9, 4.9]],   // work lights: over the nose, over the tail, a fill off the car's left
  fog: { color: 0x05060a, density: 0.016 },
};

const canvasTex = (w, h, draw, { repeat = null, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
};
const speckle = (g, w, h, n, lo, hi, a0, a1) => { for (let i = 0; i < n; i++) { const v = lo + Math.random() * (hi - lo); g.fillStyle = `rgba(${v},${v},${v + 3},${a0 + Math.random() * (a1 - a0)})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };

// The floor: dark epoxy, mottled, with faint saw-cut joints every 2.5 m (the texture covers 5 m). In the shader: the
// turntable (a smooth darker disc, its rim a cyan LED line with a soft halo), the planar mirror (blurred a little,
// fading only where the mirror image runs off the screen), and the work lights' direct highlights turned well
// down, so they don't burn white pools into a floor this glossy.
function floorMaterial() {
  const tex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#3b3e42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 160, v = Math.random() < 0.5 ? 0 : 255; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},0.035)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    speckle(g, w, h, 22000, 30, 110, 0.12, 0.35);
    // (v103) a shop floor: old oil spots, and the grey arcs tyres leave turning on it
    for (let i = 0; i < 9; i++) { const x = Math.random() * w, y = Math.random() * h, r = 14 + Math.random() * 46, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(8,7,6,.5)'); gr.addColorStop(0.6, 'rgba(10,9,8,.22)'); gr.addColorStop(1, 'rgba(10,9,8,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, 7); g.fill(); }
    g.lineCap = 'round'; for (let i = 0; i < 7; i++) { g.strokeStyle = `rgba(12,12,13,${0.1 + Math.random() * 0.14})`; g.lineWidth = 16 + Math.random() * 10; g.beginPath(); const x = Math.random() * w, y = Math.random() * h, r = 200 + Math.random() * 500, a = Math.random() * 6.3; g.arc(x, y, r, a, a + 0.35 + Math.random() * 0.5); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.45)'; for (const k of [0, 512]) { g.fillRect(k - 1.5, 0, 3, h); g.fillRect(0, k - 1.5, w, 3); }
    g.fillStyle = 'rgba(255,255,255,.05)'; for (const k of [0, 512]) { g.fillRect(k + 2, 0, 1, h); g.fillRect(0, k + 2, w, 1); }
  }, { repeat: [(ROOM.x1 - ROOM.x0) / 5, (ROOM.z1 - ROOM.z0) / 5] });
  const m = new THREE.MeshStandardMaterial({ name: 'garage floor', map: tex, color: 0xffffff, roughness: 0.36, metalness: 0, envMapIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRefl: SHARED.uRefl, uReflMatrix: SHARED.uReflMatrix, uReflOn: SHARED.uReflOn, uTurnR: { value: TURNTABLE_R } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix; varying vec4 vReflC; varying vec2 vFloorP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvReflC = uReflMatrix * vec4(worldPosition.xyz, 1.0); vFloorP = position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uRefl; uniform float uReflOn; uniform float uTurnR; varying vec4 vReflC; varying vec2 vFloorP;')
      // the turntable: inside the rim the joints and mottling give way to a smooth, slightly darker disc
      .replace('#include <map_fragment>', `#include <map_fragment>
  float tr = length(vFloorP);
  float inside = 1.0 - smoothstep(uTurnR - 0.02, uTurnR, tr);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.032, 0.036) * (0.94 + 0.06 * sin(tr * 70.0)), inside);
  float groove = 1.0 - smoothstep(0.0, 0.025, abs(tr - uTurnR - 0.05));
  diffuseColor.rgb *= 1.0 - 0.8 * groove;
  // (v103) the hazard ring painted round the lift: yellow and black slanting bars, scuffed
  float band = smoothstep(uTurnR + 0.14, uTurnR + 0.155, tr) * (1.0 - smoothstep(uTurnR + 0.385, uTurnR + 0.4, tr));
  float bars = step(0.5, fract(atan(vFloorP.y, vFloorP.x) * 16.0 + (tr - uTurnR) * 1.6));
  float wear = 0.72 + 0.28 * sin(vFloorP.x * 3.7 + sin(vFloorP.y * 2.9) * 2.0) * sin(vFloorP.y * 4.3 + 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.02, 0.02, 0.022), vec3(0.78, 0.55, 0.04), bars) * wear, band * 0.9);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float ring = 1.0 - smoothstep(0.012, 0.03, abs(tr - uTurnR - 0.05));
  float halo = exp(-abs(tr - uTurnR - 0.05) * 9.0);
  totalEmissiveRadiance += vec3(1.0, 0.96, 0.88) * (ring * 2.2 + halo * 0.03);`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
  #if defined( RE_IndirectSpecular )
  if (uReflOn > 0.5) {
    vec2 ruv = vReflC.xy / vReflC.w;
    vec3 refl = vec3(0.0); float wsum = 0.0;
    // a 3x3 tent over a coarser mip: the mirror is drawn at half size, and thin lit lines in it twinkled as the
    // camera moved; spread like this they hold still (and read as a polished floor rather than glass)
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { float w = (2.0 - abs(float(i))) * (2.0 - abs(float(j))); refl += textureLod(uRefl, ruv + vec2(float(i) * 0.004, float(j) * 0.006), 2.1).rgb * w; wsum += w; }
    float edge = smoothstep(0.0, 0.05, min(min(ruv.x, 1.0 - ruv.x), min(ruv.y, 1.0 - ruv.y)));
    radiance = mix(radiance, refl / wsum, 0.95 * edge);
  }
  #endif`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.directSpecular *= 0.22;');
  };
  m.customProgramCacheKey = () => 'nr-studio-floor';
  return m;
}

// Wall panels, one 2.5 m x 5 m panel per texture: a dark upper panel, a darker skirting band to 1.15 m with a lit
// edge, a seam at 3.4 m, and the panel joint down one side.
function wallMaterial() {
  const tex = canvasTex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2d3138'); gr.addColorStop(1, '#23262c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2600, 20, 70, 0.08, 0.2);
    // (v103) painted concrete block: courses 20 cm high, the blocks 40 cm long, half a block's step from course to course
    for (let c = 0; c < 25; c++) { const yy = h - (c + 1) / 25 * h; g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, yy, w, 1.5); g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, yy + 1.5, w, 1); for (let b = 0; b < 7; b++) { const xx = ((b + (c & 1) * 0.5) / 6.25) * w; g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(xx, yy, 1.5, h / 25); } }
    const y = (m) => h - m / 5 * h;
    g.fillStyle = '#121418'; g.fillRect(0, y(1.15), w, h - y(1.15));
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, y(1.15) - 2, w, 2);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y(3.4), w, 2); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(3, 0, 1, h); g.fillRect(0, y(3.4) + 2, w, 1);
  });
  return new THREE.MeshStandardMaterial({ name: 'garage wall', map: tex, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.16 });   // (v103: a little of its own light, so the far walls read as walls behind the kit)
}

// a box from a to b (a horizontal or vertical run), `w` wide and `t` thick
function bar(ax, ay, az, bx, by, bz, w, t) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  let geo;
  if (Math.abs(dy) > Math.abs(dx) + Math.abs(dz)) geo = new THREE.BoxGeometry(w, len, t);
  else { geo = new THREE.BoxGeometry(len, t, w); geo.rotateY(-Math.atan2(dz, dx)); }
  return geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
// the ceiling's honeycomb: pointy-top hexagons of LED tube over the car, every shared edge drawn once, in a frame
function honeycomb(y) {
  const R = 0.5, W = Math.sqrt(3) * R, geos = [], seen = new Set();
  const X = 7.0, Z = 4.9;   // (v103: wider, with a round gap over the lift for its shaft)
  for (let row = -8; row <= 8; row++) for (let col = -10; col <= 10; col++) {
    const cx = col * W + (row & 1 ? W / 2 : 0), cz = row * 1.5 * R;
    if (Math.abs(cx) + W / 2 > X || Math.abs(cz) + R > Z || Math.hypot(cx, cz) < SHAFT_R + 0.62) continue;
    const pts = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); }
    for (let k = 0; k < 6; k++) {
      const [a, b] = [pts[k], pts[(k + 1) % 6]], key = [a, b].map((p) => p.map((v) => Math.round(v * 100)).join(',')).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez), ux = ex / l * 0.02, uz = ez / l * 0.02;
      geos.push(bar(a[0] - ux, y, a[1] - uz, b[0] + ux, y, b[1] + uz, 0.11, 0.045));
    }
  }
  const fx = X + 0.25, fz = Z + 0.25;
  for (const [ax, az, bx, bz] of [[-fx, -fz, fx, -fz], [-fx, fz, fx, fz], [-fx, -fz, -fx, fz], [fx, -fz, fx, fz]]) geos.push(bar(ax, y, az, bx, y, bz, 0.13, 0.05));
  return geos;
}

// the neon sign on the far wall
function signTexture() {
  const tex = canvasTex(2048, 512, drawSign);
  // drawn before the display font has loaded, it would come out in the fallback face: redraw once it has
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { drawSign(tex.image.getContext('2d'), 2048, 512); tex.needsUpdate = true; });
  return tex;
}
function drawSign(g, w, h) {
  g.clearRect(0, 0, w, h);
  const font = (px) => `italic 800 ${px}px "Saira Condensed","Arial Narrow",Arial,sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const glow = (text, px, y, col, core) => {
    g.font = font(px);
    for (const [blur, a] of [[60, 0.55], [26, 0.8], [10, 1]]) { g.shadowColor = col; g.shadowBlur = blur; g.globalAlpha = a; g.lineWidth = 10; g.strokeStyle = col; g.strokeText(text, w / 2, y); }
    g.shadowBlur = 0; g.globalAlpha = 1; g.lineWidth = 4; g.strokeStyle = core; g.strokeText(text, w / 2, y);
  };
  glow('NIGHT RUNNER', 250, h * 0.42, '#29c8ff', '#e9fbff');
  glow('— TUNING  ·  WORKSHOP —', 74, h * 0.86, '#ff4fd8', '#ffe6fa');
}
// a roller shutter for the wall ahead of the car: horizontal slats, a bottom rail, a hazard strip on the floor edge
function shutterTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h - 40; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, '#5d636c'); gr.addColorStop(0.5, '#444951'); gr.addColorStop(1, '#2c3036'); g.fillStyle = gr; g.fillRect(0, y, w, 15); g.fillStyle = '#1b1d21'; g.fillRect(0, y + 15, w, 1); }
    g.fillStyle = '#23262b'; g.fillRect(0, h - 40, w, 16);
    for (let x = -32; x < w; x += 32) { g.fillStyle = '#e8b21a'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, h - 24); g.lineTo(x + 16, h - 24); g.fill(); g.fillStyle = '#121212'; g.beginPath(); g.moveTo(x + 16, h); g.lineTo(x + 32, h); g.lineTo(x + 48, h - 24); g.lineTo(x + 32, h - 24); g.fill(); }
    speckle(g, w, h, 1500, 40, 110, 0.05, 0.18);
  });
}
// drawer fronts for the tool chest
function chestTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b3141f'; g.fillRect(0, 0, w, h);
    const rows = [0, 0.14, 0.26, 0.38, 0.5, 0.66, 0.82, 1];
    for (let i = 0; i < rows.length - 1; i++) {
      const y0 = rows[i] * h, y1 = rows[i + 1] * h;
      g.fillStyle = '#5a070c'; g.fillRect(0, y1 - 3, w, 3);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y0, w, 2);
      g.fillStyle = '#c9ccd2'; g.fillRect(w * 0.12, y0 + (y1 - y0) * 0.3, w * 0.76, 4);
    }
  });
}

// the bench top: maple butcher block, strips 4 cm wide running its length, worn and stained by work
function benchTexture() {
  return canvasTex(1024, 256, (g, w, h) => {
    for (let i = 0; i < 20; i++) { const t = Math.random(), y = i * h / 20; g.fillStyle = `rgb(${150 + t * 40},${112 + t * 30},${70 + t * 22})`; g.fillRect(0, y, w, h / 20 + 1); g.fillStyle = 'rgba(60,35,15,.35)'; g.fillRect(0, y, w, 1); for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(70,40,18,${0.05 + Math.random() * 0.12})`; g.fillRect(Math.random() * w, y + Math.random() * h / 20, 30 + Math.random() * 200, 1); } }
    for (let i = 0; i < 16; i++) { const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,14,10,.4)'); gr.addColorStop(1, 'rgba(20,14,10,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    speckle(g, w, h, 1500, 20, 60, 0.08, 0.2);
  });
}
// the pegboard over the bench with its tools: spanners in order of size, screwdrivers, pliers, hammers, a saw, a square
function toolBoardTexture() {
  return canvasTex(4096, 588, (g, w, h) => {
    const k = h / 0.86;   // pixels to the metre
    if (!g.roundRect) g.roundRect = function (x, y, ww, hh) { this.rect(x, y, ww, hh); };   // (older browsers)
    g.fillStyle = '#50555d'; g.fillRect(0, 0, w, h); speckle(g, w, h, 9000, 40, 110, 0.05, 0.16);
    for (let x = k * 0.0125; x < w; x += k * 0.025) for (let y = k * 0.0125; y < h; y += k * 0.025) { g.fillStyle = '#0a0b0d'; g.beginPath(); g.arc(x, y, k * 0.0032, 0, 7); g.fill(); }
    const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,255,255,.1)'); lg.addColorStop(0.3, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
    const steel = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#f1f3f5'); gr.addColorStop(0.45, '#aeb4bc'); gr.addColorStop(1, '#6f757e'); return gr; };
    const shadow = (on) => { g.shadowColor = on ? 'rgba(0,0,0,.55)' : 'transparent'; g.shadowBlur = on ? k * 0.012 : 0; g.shadowOffsetX = on ? k * 0.006 : 0; g.shadowOffsetY = on ? k * 0.012 : 0; };
    const hookAt = (x, y) => { shadow(false); g.fillStyle = '#d5d9de'; g.fillRect(x - k * 0.004, y - k * 0.012, k * 0.008, k * 0.03); };
    // combination spanners, largest first: a ring at the top, the shaft, an open jaw at the foot
    let x = k * 0.16;
    for (let i = 0; i < 13; i++) {
      const L = k * (0.42 - i * 0.02), W = k * (0.026 - i * 0.0011), y0 = k * 0.1;
      shadow(true); g.fillStyle = steel(x - W, 0, x + W, 0); g.strokeStyle = 'rgba(30,34,40,.7)'; g.lineWidth = 1.5;
      g.fillRect(x - W * 0.42, y0 + W, W * 0.84, L - W * 2.2);
      g.beginPath(); g.arc(x, y0 + W, W * 1.05, 0, 7); g.arc(x, y0 + W, W * 0.55, 0, 7, true); g.fill('evenodd');
      g.beginPath(); g.arc(x, y0 + L - W * 0.6, W * 1.15, 0.9, Math.PI - 0.9, true); g.lineTo(x - W * 0.5, y0 + L - W * 0.4); g.lineTo(x + W * 0.5, y0 + L - W * 0.4); g.closePath(); g.fill();
      hookAt(x, y0 + W); x += W * 2.6 + k * 0.016;
    }
    // screwdrivers: a coloured handle over a steel shank
    x += k * 0.1;
    for (let i = 0; i < 8; i++) {
      const L = k * (0.3 - (i % 4) * 0.035), hw = k * 0.016, y0 = k * 0.14, col = ['#c4261d', '#1f6fb0', '#e2a31c', '#15171a'][i % 4];
      shadow(true); g.fillStyle = steel(x - 4, 0, x + 4, 0); g.fillRect(x - k * 0.0035, y0 + k * 0.1, k * 0.007, L - k * 0.1);
      g.fillStyle = col; g.beginPath(); g.roundRect(x - hw, y0, hw * 2, k * 0.11, hw * 0.7); g.fill(); shadow(false); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x - hw * 0.55, y0 + k * 0.012, hw * 0.3, k * 0.085);
      x += k * 0.07;
    }
    // pliers and cutters: two handles spreading from a pivot, short jaws above it
    x += k * 0.08;
    for (let i = 0; i < 4; i++) {
      const y0 = k * 0.2, col = ['#c4261d', '#1f6fb0', '#e2a31c', '#2b8a4b'][i];
      shadow(true); g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = k * 0.02;
      g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x - k * 0.01, y0 + k * 0.1, x - k * 0.04, y0 + k * 0.22); g.moveTo(x, y0); g.quadraticCurveTo(x + k * 0.01, y0 + k * 0.1, x + k * 0.04, y0 + k * 0.22); g.stroke();
      g.strokeStyle = '#aeb4bc'; g.lineWidth = k * 0.014; g.beginPath(); g.moveTo(x, y0); g.lineTo(x - k * 0.008, y0 - k * 0.075); g.moveTo(x, y0); g.lineTo(x + k * 0.008, y0 - k * 0.075); g.stroke();
      shadow(false); g.fillStyle = '#5d636c'; g.beginPath(); g.arc(x, y0, k * 0.011, 0, 7); g.fill(); hookAt(x, y0 - k * 0.07); x += k * 0.15;
    }
    // two hammers: a steel head across the top, a wooden shaft
    x += k * 0.06;
    for (let i = 0; i < 2; i++) {
      const y0 = k * 0.13;
      shadow(true); const wg = g.createLinearGradient(x - 10, 0, x + 10, 0); wg.addColorStop(0, '#c59a62'); wg.addColorStop(1, '#8b6537'); g.fillStyle = wg; g.fillRect(x - k * 0.012, y0, k * 0.024, k * 0.38);
      g.fillStyle = steel(0, y0 - k * 0.03, 0, y0 + k * 0.03); g.fillRect(x - k * (i ? 0.085 : 0.07), y0 - k * 0.026, k * (i ? 0.17 : 0.14), k * 0.052); hookAt(x - k * 0.04, y0 + k * 0.03); hookAt(x + k * 0.04, y0 + k * 0.03); x += k * 0.26;
    }
    // a hacksaw; a steel square; a tape; a row of sockets on a rail
    { const y0 = k * 0.2; shadow(true); g.strokeStyle = '#d9a516'; g.lineWidth = k * 0.014; g.beginPath(); g.moveTo(x, y0 + k * 0.12); g.lineTo(x, y0); g.lineTo(x + k * 0.36, y0); g.lineTo(x + k * 0.36, y0 + k * 0.12); g.stroke(); g.strokeStyle = '#c9ccd2'; g.lineWidth = k * 0.006; g.beginPath(); g.moveTo(x, y0 + k * 0.12); g.lineTo(x + k * 0.36, y0 + k * 0.12); g.stroke(); g.fillStyle = '#15171a'; g.beginPath(); g.roundRect(x + k * 0.33, y0 + k * 0.06, k * 0.06, k * 0.16, 8); g.fill(); x += k * 0.52; }
    { const y0 = k * 0.12; shadow(true); g.fillStyle = steel(x, y0, x + k * 0.3, y0 + k * 0.3); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + k * 0.04, y0); g.lineTo(x + k * 0.04, y0 + k * 0.4); g.lineTo(x + k * 0.3, y0 + k * 0.4); g.lineTo(x + k * 0.3, y0 + k * 0.44); g.lineTo(x, y0 + k * 0.44); g.closePath(); g.fill(); x += k * 0.42; }
    { shadow(true); g.fillStyle = '#e2a31c'; g.beginPath(); g.roundRect(x, k * 0.3, k * 0.09, k * 0.09, 10); g.fill(); shadow(false); g.fillStyle = '#15171a'; g.beginPath(); g.arc(x + k * 0.045, k * 0.345, k * 0.022, 0, 7); g.fill(); x += k * 0.2; }
    { const y0 = k * 0.62; shadow(true); g.fillStyle = '#c4261d'; g.fillRect(k * 0.16, y0 + k * 0.045, k * 1.05, k * 0.02); for (let i = 0; i < 16; i++) { const r = k * (0.027 - i * 0.0009); g.fillStyle = steel(0, y0, 0, y0 + r * 2); g.beginPath(); g.arc(k * 0.2 + i * k * 0.064, y0 + k * 0.03, r, 0, 7); g.fill(); shadow(false); g.fillStyle = '#17191d'; g.beginPath(); g.arc(k * 0.2 + i * k * 0.064, y0 + k * 0.03, r * 0.5, 0, 7); g.fill(); shadow(true); } }
    shadow(false);
    g.strokeStyle = '#9aa0a8'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  });
}

export function createGarage(scene) {
  const S = GARAGE_SPEC;
  const group = new THREE.Group(); group.name = 'garage'; group.visible = false; scene.add(group);
  // (v103) the workshop itself is a group of its own inside: the car tower over it (showroom.js) shares the outer one
  const room = new THREE.Group(); room.name = 'workshop'; group.add(room);
  const tmp = new THREE.Vector3();
  const build = () => {
    const { x0, x1, z0, z1, h } = ROOM, L = x1 - x0, D = z1 - z0;
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, D), floorMaterial());
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); floor.receiveShadow = true;
    // walls: four inward-facing planes in one mesh, the panel texture repeating every 2.5 m along each
    const wall = (len, rotY, px, pz) => { const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.5); g.rotateY(rotY); g.translate(px, h / 2, pz); return g; };
    const walls = new THREE.Mesh(mergeGeometries([wall(L, 0, 0, z0), wall(L, Math.PI, 0, z1), wall(D, Math.PI / 2, x0, 0), wall(D, -Math.PI / 2, x1, 0)]), wallMaterial());
    // (v103) the ceiling has a round hole over the turntable: the lift's shaft, up to the car tower
    const cs = new THREE.Shape(); cs.moveTo(x0, z0); cs.lineTo(x1, z0); cs.lineTo(x1, z1); cs.lineTo(x0, z1); cs.closePath(); { const hole = new THREE.Path(); hole.absarc(0, 0, SHAFT_R, 0, Math.PI * 2, true); cs.holes.push(hole); }
    const ceil = new THREE.Mesh(new THREE.ShapeGeometry(cs, 48).rotateX(Math.PI / 2).translate(0, h, 0), new THREE.MeshStandardMaterial({ name: 'garage ceiling', color: 0x0d0e11, roughness: 0.95 }));
    // light: white tubes (honeycomb, wall bars, the line along the top of each wall, over the shutter) and cyan
    // (the cove line round the floor, the bar under the sign)
    const white = [], cyan = [];
    white.push(...honeycomb(4.5));
    const barsFar = [-9, -6.5, -4, 4, 6.5, 9], barsNear = [-8.75, -6.25, -3.75, -1.25, 1.25, 3.75, 6.25, 8.75];
    for (const x of barsFar) white.push(bar(x, 0.55, z0 + 0.05, x, 3.95, z0 + 0.05, 0.15, 0.05));
    for (const x of barsNear) white.push(bar(x, 0.55, z1 - 0.05, x, 3.95, z1 - 0.05, 0.15, 0.05));
    white.push(bar(x0 + 0.1, 4.2, z0 + 0.06, x1 - 0.1, 4.2, z0 + 0.06, 0.04, 0.075), bar(x0 + 0.1, 4.2, z1 - 0.06, x1 - 0.1, 4.2, z1 - 0.06, 0.04, 0.075));
    white.push(bar(x0 + 0.06, 4.0, -2.9, x0 + 0.06, 4.0, 2.9, 0.06, 0.05));
    cyan.push(bar(-3.1, 1.95, z0 + 0.06, 3.1, 1.95, z0 + 0.06, 0.05, 0.065));
    const led = (geos, r, g, b, name) => new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ name, color: new THREE.Color(r, g, b), fog: false }));
    const ledW = led(white, 2.0, 2.0, 2.1, 'garage led white'), ledC = led(cyan, 0.42, 1.7, 2.45, 'garage led cyan');
    // the sign, the shutter
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.65), new THREE.MeshBasicMaterial({ name: 'garage sign', map: signTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8), fog: false }));
    sign.position.set(0, 3.05, z0 + 0.04);
    const shutter = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.9).rotateY(Math.PI / 2).translate(x0 + 0.03, 1.95, 0), new THREE.MeshStandardMaterial({ name: 'garage shutter', map: shutterTexture(), color: 0x8f949b, roughness: 0.6, metalness: 0.35, envMapIntensity: 0.25 }));
    // ---- the shop's kit (v103). Everything painted goes into one mesh, its colours in its corners.
    const dark = [], metal = [], paint = [], chests = [], woods = [];
    const tint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const box = (w, hh, d, x, y, z, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, hh, d); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
    const cyl = (r0, r1, hh, x, y, z, seg = 20) => new THREE.CylinderGeometry(r0, r1, hh, seg).translate(x, y, z);
    const slant = (ax, ay, bx, by, z, w) => new THREE.BoxGeometry(Math.hypot(bx - ax, by - ay), w, w).rotateZ(Math.atan2(by - ay, bx - ax)).translate((ax + bx) / 2, (ay + by) / 2, z);   // a square bar between two points in a plane of constant z
    const RED = 0xa5141d, BLUE = 0x1d4a86, YEL = 0xd9a516, GREY = 0x555a62, CARD = 0x9a7648;
    const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    // the workbench under the sign: steel legs and shelf, a butcher-block top, two drawer units, a vice, a toolbox, cans
    { const bz = z0 + 0.45, top = 0.93;
      woods.push(box(6.2, 0.06, 0.8, 0, top, bz));
      for (const x of [-3.02, -1.0, 1.0, 3.02]) for (const dz of [-0.34, 0.34]) metal.push(box(0.06, top - 0.03, 0.06, x, (top - 0.03) / 2, bz + dz));
      paint.push(tint(box(6.0, 0.03, 0.66, 0, 0.16, bz), GREY), tint(box(6.1, 0.07, 0.04, 0, top - 0.07, bz + 0.36), GREY));
      for (const x of [-2.0, 2.0]) chests.push(box(1.3, 0.68, 0.62, x, 0.54, bz));
      // the vice
      paint.push(tint(box(0.2, 0.05, 0.24, 2.55, top + 0.055, bz + 0.12), BLUE), tint(box(0.11, 0.13, 0.26, 2.55, top + 0.14, bz + 0.12), BLUE), tint(box(0.15, 0.09, 0.035, 2.55, top + 0.2, bz + 0.27), BLUE), tint(box(0.15, 0.09, 0.035, 2.55, top + 0.2, bz + 0.2), BLUE));
      metal.push(cyl(0.012, 0.012, 0.3, 2.55, top + 0.12, bz + 0.3).rotateX(0), new THREE.CylinderGeometry(0.009, 0.009, 0.2, 8).rotateZ(Math.PI / 2).translate(2.55, top + 0.12, bz + 0.43), new THREE.CylinderGeometry(0.013, 0.013, 0.22, 10).rotateX(Math.PI / 2).translate(2.55, top + 0.12, bz + 0.34));
      // a steel toolbox with its tray open, an oil can, a row of spray cans, a parts tray
      paint.push(tint(box(0.52, 0.2, 0.24, -2.35, top + 0.13, bz), RED), tint(box(0.52, 0.03, 0.24, -2.35, top + 0.25, bz - 0.02, 0, 0), 0x7e0f16));
      metal.push(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8).rotateZ(Math.PI / 2).translate(-2.35, top + 0.3, bz - 0.02), box(0.42, 0.025, 0.3, 0.9, top + 0.045, bz + 0.05));
      { const cols = [0x1f6fb0, 0xd9d9d9, 0x111111, 0xc4261d, 0xe2a31c, 0x2b8a4b]; for (let i = 0; i < 6; i++) { paint.push(tint(cyl(0.033, 0.033, 0.19, -1.35 + i * 0.085, top + 0.125, bz - 0.2 + (i & 1) * 0.02, 14), cols[i])); metal.push(cyl(0.012, 0.014, 0.03, -1.35 + i * 0.085, top + 0.235, bz - 0.2 + (i & 1) * 0.02, 10)); } }
      paint.push(tint(cyl(0.05, 0.06, 0.12, -0.55, top + 0.09, bz - 0.12, 16), 0x2f6a3a), tint(cyl(0.04, 0.045, 0.14, 0.15, top + 0.1, bz - 0.18, 16), 0x20242a));
    }
    // roller cabinets right of the bench: a base unit and a top chest
    chests.push(box(1.7, 1.05, 0.62, 5.25, 0.6, z0 + 0.42), box(1.5, 0.5, 0.5, 5.25, 1.42, z0 + 0.42));
    dark.push(box(1.74, 0.05, 0.66, 5.25, 1.15, z0 + 0.42), box(1.6, 0.1, 0.52, 5.25, 0.05, z0 + 0.42));
    for (const x of [4.55, 5.95]) for (const zz of [z0 + 0.2, z0 + 0.64]) metal.push(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12).rotateX(Math.PI / 2).translate(x, 0.045, zz));
    // a rack of tyres left of the bench: two shelves, six tyres standing on each
    { const rx0 = -6.45, rx1 = -3.95, rz = z0 + 0.5;
      for (const x of [rx0, rx1]) for (const dz of [-0.27, 0.27]) paint.push(tint(box(0.05, 2.15, 0.05, x, 1.075, rz + dz), 0x24272c));
      for (const y of [0.5, 1.32, 2.13]) for (const dz of [-0.27, 0.27]) paint.push(tint(box(rx1 - rx0, 0.04, 0.04, (rx0 + rx1) / 2, y, rz + dz), 0x24272c));
      for (const y of [0.5, 1.32]) for (let i = 0; i < 6; i++) dark.push(new THREE.TorusGeometry(0.255, 0.092, 10, 26).rotateY(Math.PI / 2 + (rnd() - 0.5) * 0.1).translate(rx0 + 0.3 + i * 0.38, y + 0.365, rz)); }
    // stacks of wheels by the shutter
    const tyre = (x, y, z) => { dark.push(cyl(0.33, 0.33, 0.245, x, y, z, 28)); metal.push(cyl(0.21, 0.21, 0.25, x, y, z, 20)); };
    for (const [x, z, n] of [[-8.7, z1 - 0.8, 4], [-8.75, z1 - 1.62, 3], [-8.6, z0 + 0.8, 2]]) for (let k = 0; k < n; k++) tyre(x + (k & 1) * 0.03, 0.125 + k * 0.25, z);
    // oil drums in the far left corner
    for (const [x, z, c] of [[-8.9, z0 + 1.75, BLUE], [-8.15, z0 + 0.65, BLUE], [-7.45, z0 + 0.62, 0x22262b]]) {
      paint.push(tint(cyl(0.29, 0.29, 0.88, x, 0.44, z, 28), c), tint(cyl(0.275, 0.275, 0.012, x, 0.875, z, 28), 0x30343a));
      for (const y of [0.3, 0.6]) paint.push(tint(new THREE.TorusGeometry(0.292, 0.012, 6, 28).rotateX(Math.PI / 2).translate(x, y, z), c));
      metal.push(cyl(0.03, 0.03, 0.02, x + 0.15, 0.89, z + 0.05, 10));
    }
    // an engine on a hoist in the far right corner: the crane's legs, mast and boom, its ram, a chain, and a V8 on the hook
    { const hx = 7.9, hz = z0 + 2.3, ex = hx - 1.25;
      for (const dz of [-0.42, 0.42]) { paint.push(tint(box(1.7, 0.08, 0.08, hx - 0.55, 0.12, hz + dz), RED)); dark.push(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2).translate(hx - 1.35, 0.05, hz + dz), new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2).translate(hx + 0.25, 0.05, hz + dz)); }
      paint.push(tint(box(0.08, 0.08, 0.92, hx + 0.26, 0.12, hz), RED), tint(box(0.09, 1.7, 0.09, hx + 0.22, 0.97, hz), RED), tint(slant(hx + 0.3, 1.8, ex, 2.12, hz, 0.08), RED), tint(slant(hx + 0.22, 0.45, hx - 0.3, 1.9, hz, 0.06), 0x1a1c20));
      metal.push(slant(hx + 0.1, 0.7, hx - 0.2, 1.6, hz, 0.035), box(0.012, 0.52, 0.012, ex, 1.86, hz), new THREE.TorusGeometry(0.035, 0.008, 6, 14).translate(ex, 1.58, hz));
      // the engine: block, two heads leaning out, valve covers, intake, the front pulleys and belt, sump, bellhousing
      const ey = 1.18;
      paint.push(tint(box(0.62, 0.34, 0.46, ex, ey, hz), 0x3a3e45), tint(box(0.56, 0.12, 0.34, ex, ey - 0.22, hz), 0x15171a), tint(box(0.5, 0.1, 0.2, ex, ey + 0.27, hz), 0x9aa0a8));
      for (const sg of [-1, 1]) { paint.push(tint(new THREE.BoxGeometry(0.6, 0.13, 0.19).rotateX(sg * 0.72).translate(ex, ey + 0.17, hz + sg * 0.21), 0x8d939c), tint(new THREE.BoxGeometry(0.58, 0.06, 0.17).rotateX(sg * 0.72).translate(ex, ey + 0.235, hz + sg * 0.265), RED)); for (let i = 0; i < 4; i++) metal.push(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8).rotateX(sg * 0.9 + Math.PI / 2).translate(ex - 0.2 + i * 0.135, ey + 0.02, hz + sg * 0.33)); }
      metal.push(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 20).rotateZ(Math.PI / 2).translate(ex + 0.37, ey - 0.02, hz), new THREE.CylinderGeometry(0.085, 0.085, 0.03, 16).rotateZ(Math.PI / 2).translate(ex - 0.335, ey - 0.08, hz), new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14).rotateZ(Math.PI / 2).translate(ex - 0.335, ey + 0.12, hz + 0.13), new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14).rotateZ(Math.PI / 2).translate(ex - 0.335, ey + 0.1, hz - 0.14));
      dark.push(new THREE.TorusGeometry(0.115, 0.008, 4, 3).rotateY(Math.PI / 2).translate(ex - 0.352, ey + 0.035, hz)); }
    // parts racking along the right wall: four shelves of boxes, crates and jugs
    { const sx = x1 - 0.42;
      for (const z of [-3.1, -1.03, 1.03, 3.1]) for (const dx of [-0.3, 0.3]) paint.push(tint(box(0.05, 2.4, 0.05, sx + dx, 1.2, z), 0x2a3f6b));
      for (const y of [0.16, 0.86, 1.56, 2.26]) {
        paint.push(tint(box(0.62, 0.035, 6.2, sx, y, 0), 0xb0651c));
        let z = -2.95;
        while (z < 2.6) {
          const w = 0.28 + rnd() * 0.5, hh = 0.16 + rnd() * 0.36, d = 0.3 + rnd() * 0.22, kind = rnd();
          if (kind < 0.62) paint.push(tint(box(d, hh, w, sx + (rnd() - 0.5) * 0.06, y + 0.02 + hh / 2, z + w / 2, (rnd() - 0.5) * 0.08), [CARD, 0xa98350, 0x8a6a40][Math.floor(rnd() * 3)]));
          else if (kind < 0.84) paint.push(tint(box(d, Math.min(hh, 0.24), w, sx, y + 0.02 + Math.min(hh, 0.24) / 2, z + w / 2), [BLUE, 0x8c1a1f, 0x1b1d21, 0x2d6b3c][Math.floor(rnd() * 4)]));
          else { const n = Math.max(1, Math.floor(w / 0.15)); for (let i = 0; i < n; i++) paint.push(tint(cyl(0.06, 0.06, 0.24, sx - 0.08, y + 0.14, z + 0.08 + i * 0.15, 12), [0xe2a31c, 0x1d4a86, 0xd9d9d9][i % 3])); }
          z += w + 0.05 + rnd() * 0.16;
        }
      } }
    // a trolley jack and two axle stands by the racking; a compressor and gas bottles in the near right corner
    { const jx = x1 - 1.5, jz = z0 + 4.6;
      paint.push(tint(box(0.24, 0.1, 0.62, jx, 0.11, jz), RED), tint(new THREE.BoxGeometry(0.1, 0.07, 0.42).rotateX(0.2).translate(jx, 0.2, jz + 0.05), RED));
      metal.push(cyl(0.055, 0.055, 0.02, jx, 0.29, jz + 0.25, 14), new THREE.CylinderGeometry(0.014, 0.014, 0.95, 8).rotateX(-0.9).translate(jx, 0.5, jz - 0.62));
      for (const dx of [-0.13, 0.13]) for (const dz of [-0.26, 0.26]) dark.push(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateZ(Math.PI / 2).translate(jx + dx, 0.04, jz + dz));
      for (const dz of [1.0, 1.5]) { paint.push(tint(new THREE.CylinderGeometry(0.035, 0.15, 0.3, 4).rotateY(Math.PI / 4).translate(jx + 0.25, 0.15, jz + dz), YEL)); metal.push(cyl(0.02, 0.02, 0.16, jx + 0.25, 0.36, jz + dz, 8), box(0.07, 0.02, 0.05, jx + 0.25, 0.45, jz + dz)); } }
    { const cx = x1 - 0.95, cz = z1 - 0.95;
      paint.push(tint(cyl(0.3, 0.3, 1.0, cx, 0.72, cz, 26), RED), tint(new THREE.SphereGeometry(0.3, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, 1.22, cz), RED), tint(new THREE.SphereGeometry(0.3, 26, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(cx, 0.22, cz), RED), tint(box(0.34, 0.26, 0.3, cx, 1.62, cz), 0x1b1d21), tint(cyl(0.11, 0.11, 0.2, cx + 0.02, 1.86, cz, 14), 0x30343a));
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) dark.push(cyl(0.035, 0.045, 0.1, cx + dx, 0.05, cz + dz, 8));
      for (const [dx, c] of [[-1.25, 0x5e1b1f], [-1.52, 0x2c4f33]]) { paint.push(tint(cyl(0.115, 0.115, 1.25, cx + dx, 0.7, cz + 0.25, 18), c), tint(new THREE.SphereGeometry(0.115, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx + dx, 1.325, cz + 0.25), c)); metal.push(cyl(0.03, 0.035, 0.12, cx + dx, 1.48, cz + 0.25, 10)); }
      paint.push(tint(box(0.6, 0.04, 0.34, cx - 1.385, 0.06, cz + 0.25), 0x1b1d21), tint(box(0.03, 1.2, 0.03, cx - 1.385, 0.66, cz + 0.42), 0x1b1d21)); }
    // on the far wall: a fire extinguisher, and the pegboard of tools over the bench
    paint.push(tint(cyl(0.07, 0.07, 0.42, 3.55, 1.2, z0 + 0.1, 14), 0xc4161c)); metal.push(cyl(0.02, 0.03, 0.08, 3.55, 1.45, z0 + 0.1, 8));
    const peg = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.86).translate(0, 1.46, z0 + 0.045), new THREE.MeshStandardMaterial({ name: 'tool board', map: toolBoardTexture(), roughness: 0.75, metalness: 0.1, envMapIntensity: 0.3 }));
    const chestM = new THREE.Mesh(mergeGeometries(chests), new THREE.MeshStandardMaterial({ name: 'tool chest', map: chestTexture(), roughness: 0.32, metalness: 0.35 }));
    const darkM = new THREE.Mesh(mergeGeometries(dark), new THREE.MeshStandardMaterial({ name: 'garage rubber', color: 0x101113, roughness: 0.85 }));
    const metalM = new THREE.Mesh(mergeGeometries(metal), new THREE.MeshStandardMaterial({ name: 'garage metal', color: 0x8d939c, roughness: 0.35, metalness: 0.85 }));
    const paintM = new THREE.Mesh(mergeGeometries(paint), new THREE.MeshStandardMaterial({ name: 'shop paint', vertexColors: true, roughness: 0.5, metalness: 0.15, envMapIntensity: 0.4, emissive: 0xffffff, emissiveIntensity: 0.0 }));
    const woodM = new THREE.Mesh(mergeGeometries(woods), new THREE.MeshStandardMaterial({ name: 'bench top', map: benchTexture(), roughness: 0.6, metalness: 0, envMapIntensity: 0.25 }));
    // the lift's shaft: a short steel-lined drum over the hole in the ceiling with a ring of light in it; a black lid
    // closes it while the collection above is not being drawn (the lift's ride takes it off)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1.2, 64, 1, true).translate(0, h + 0.6, 0), new THREE.MeshStandardMaterial({ name: 'lift shaft', color: 0x2a2d32, roughness: 0.5, metalness: 0.7, side: THREE.BackSide, emissive: 0x2a2d32, emissiveIntensity: 0.35 }));
    white.length = 0; // (the light meshes are already built above; the shaft's ring is its own piece)
    const shaftLed = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_R - 0.03, 0.022, 6, 80).rotateX(Math.PI / 2).translate(0, h + 0.45, 0), ledW.material);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_R, 48).rotateX(Math.PI / 2).translate(0, h + 1.2, 0), new THREE.MeshBasicMaterial({ name: 'shaft lid', color: 0x000000, fog: false }));
    api.cap = cap;
    const parts = [floor, walls, ceil, ledW, ledC, sign, shutter, chestM, darkM, metalM, paintM, woodM, peg, shaft, shaftLed, cap];
    // everything shows in the road mirror (layer 1, used for the floor here) and in the car's reflection probe (2)
    for (const o of parts) { o.castShadow = false; if (o !== floor) { o.layers.enable(1); o.layers.enable(2); } }   // the floor is the mirror: never in it
    room.add(...parts);
  };
  const api = {
    group, room, ready: false, failed: false,
    load() { if (!api.ready) { try { build(); api.ready = true; } catch (e) { console.warn('garage', e); api.failed = true; } } return Promise.resolve(); },
    // put the room around the car: room-space spot -> the car's world position and heading
    place(x, y, z, yaw) {
      const a = yaw - S.heading, ca = Math.cos(a), sa = Math.sin(a), [sx, sz] = S.spot;
      group.rotation.y = a;
      group.position.set(x - (ca * sx + sa * sz), y + 0.012, z - (-sa * sx + ca * sz));
      group.updateMatrixWorld(true);
    },
    // world position of a room-space point
    toWorld(p, out = new THREE.Vector3()) { return group.localToWorld(out.set(p[0], p[1], p[2])); },
    // world height of the floor
    floorY() { return group.position.y + 0.004; },
    // keep a world-space camera position inside the room (nearest point of the nearest box, under the ceiling)
    clampCamera(pos) {
      if (!group.visible) return pos;
      group.worldToLocal(tmp.copy(pos));
      let best = null, bestD = Infinity;
      for (const [x0, x1, z0, z1] of S.rooms) {
        const cx = Math.min(x1, Math.max(x0, tmp.x)), cz = Math.min(z1, Math.max(z0, tmp.z));
        const d = (cx - tmp.x) ** 2 + (cz - tmp.z) ** 2;
        if (d < bestD) { bestD = d; best = [cx, cz]; }
      }
      tmp.x = best[0]; tmp.z = best[1]; tmp.y = Math.min(S.ceiling, Math.max(0.12, tmp.y));
      return group.localToWorld(pos.copy(tmp));
    },
    show(on) { group.visible = on && api.ready; },
    showRoom(on) { room.visible = on; },
    cap: null,
  };
  return api;
}
