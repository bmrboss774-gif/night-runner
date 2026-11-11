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
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARED } from './world.js';

const ROOM = { x0: -10, x1: 10, z0: -8.5, z1: 8.5, h: 5 };
const TURNTABLE_R = 3.35;

export const GARAGE_SPEC = {
  spot: [0, 0],              // where the car sits, room space: the middle of the turntable
  heading: -Math.PI / 2,     // car forward in room space: -x
  ceiling: 3.9,              // highest the camera goes
  rooms: [[-9.1, 9.1, -7.6, 7.6]],   // [x0, x1, z0, z1] boxes the camera may be in
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
    g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = 40 + Math.random() * 160, v = Math.random() < 0.5 ? 0 : 255; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},0.035)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    speckle(g, w, h, 16000, 30, 90, 0.12, 0.35);
    g.fillStyle = 'rgba(0,0,0,.45)'; for (const k of [0, 512]) { g.fillRect(k - 1.5, 0, 3, h); g.fillRect(0, k - 1.5, w, 3); }
    g.fillStyle = 'rgba(255,255,255,.05)'; for (const k of [0, 512]) { g.fillRect(k + 2, 0, 1, h); g.fillRect(0, k + 2, w, 1); }
  }, { repeat: [(ROOM.x1 - ROOM.x0) / 5, (ROOM.z1 - ROOM.z0) / 5] });
  const m = new THREE.MeshStandardMaterial({ name: 'garage floor', map: tex, color: 0xffffff, roughness: 0.3, metalness: 0, envMapIntensity: 0.35 });
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
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.02, 0.024) * (0.96 + 0.04 * sin(tr * 70.0)), inside);
  float groove = 1.0 - smoothstep(0.0, 0.025, abs(tr - uTurnR - 0.05));
  diffuseColor.rgb *= 1.0 - 0.8 * groove;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float ring = 1.0 - smoothstep(0.012, 0.03, abs(tr - uTurnR - 0.05));
  float halo = exp(-abs(tr - uTurnR - 0.05) * 9.0);
  totalEmissiveRadiance += vec3(0.25, 0.85, 1.0) * (ring * 3.2 + halo * 0.05);`)
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
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#24272e'); gr.addColorStop(1, '#1c1f25'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1800, 20, 60, 0.08, 0.2);
    const y = (m) => h - m / 5 * h;
    g.fillStyle = '#121418'; g.fillRect(0, y(1.15), w, h - y(1.15));
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, y(1.15) - 2, w, 2);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y(3.4), w, 2); g.fillRect(0, 0, 3, h);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(3, 0, 1, h); g.fillRect(0, y(3.4) + 2, w, 1);
  });
  return new THREE.MeshStandardMaterial({ name: 'garage wall', map: tex, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.2 });
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
  const X = 5.3, Z = 3.4;
  for (let row = -6; row <= 6; row++) for (let col = -8; col <= 8; col++) {
    const cx = col * W + (row & 1 ? W / 2 : 0), cz = row * 1.5 * R;
    if (Math.abs(cx) + W / 2 > X || Math.abs(cz) + R > Z) continue;
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
  glow('— TUNING  ·  GARAGE —', 74, h * 0.86, '#ff4fd8', '#ffe6fa');
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

export function createGarage(scene) {
  const S = GARAGE_SPEC;
  const group = new THREE.Group(); group.name = 'garage'; group.visible = false; scene.add(group);
  const tmp = new THREE.Vector3();
  const build = () => {
    const { x0, x1, z0, z1, h } = ROOM, L = x1 - x0, D = z1 - z0;
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, D), floorMaterial());
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2); floor.receiveShadow = true;
    // walls: four inward-facing planes in one mesh, the panel texture repeating every 2.5 m along each
    const wall = (len, rotY, px, pz) => { const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.5); g.rotateY(rotY); g.translate(px, h / 2, pz); return g; };
    const walls = new THREE.Mesh(mergeGeometries([wall(L, 0, 0, z0), wall(L, Math.PI, 0, z1), wall(D, Math.PI / 2, x0, 0), wall(D, -Math.PI / 2, x1, 0)]), wallMaterial());
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L, D).rotateX(Math.PI / 2).translate(0, h, 0), new THREE.MeshStandardMaterial({ name: 'garage ceiling', color: 0x0d0e11, roughness: 0.95 }));
    // light: white tubes (honeycomb, wall bars, the line along the top of each wall, over the shutter) and cyan
    // (the cove line round the floor, the bar under the sign)
    const white = [], cyan = [];
    white.push(...honeycomb(4.5));
    const barsFar = [-9, -6.5, -4, 4, 6.5, 9], barsNear = [-8.75, -6.25, -3.75, -1.25, 1.25, 3.75, 6.25, 8.75];
    for (const x of barsFar) white.push(bar(x, 0.55, z0 + 0.05, x, 3.95, z0 + 0.05, 0.15, 0.05));
    for (const x of barsNear) white.push(bar(x, 0.55, z1 - 0.05, x, 3.95, z1 - 0.05, 0.15, 0.05));
    white.push(bar(x0 + 0.1, 4.2, z0 + 0.06, x1 - 0.1, 4.2, z0 + 0.06, 0.04, 0.075), bar(x0 + 0.1, 4.2, z1 - 0.06, x1 - 0.1, 4.2, z1 - 0.06, 0.04, 0.075));
    white.push(bar(x0 + 0.06, 4.0, -2.9, x0 + 0.06, 4.0, 2.9, 0.06, 0.05));
    for (const [ax, az, bx, bz] of [[x0, z0 + 0.07, x1, z0 + 0.07], [x0, z1 - 0.07, x1, z1 - 0.07], [x0 + 0.07, z0, x0 + 0.07, z1], [x1 - 0.07, z0, x1 - 0.07, z1]]) cyan.push(bar(ax, 0.07, az, bx, 0.07, bz, 0.07, 0.05));
    cyan.push(bar(-3.1, 1.95, z0 + 0.06, 3.1, 1.95, z0 + 0.06, 0.05, 0.065));
    const led = (geos, r, g, b, name) => new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ name, color: new THREE.Color(r, g, b), fog: false }));
    const ledW = led(white, 2.0, 2.0, 2.1, 'garage led white'), ledC = led(cyan, 0.42, 1.7, 2.45, 'garage led cyan');
    // the sign, the shutter
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.65), new THREE.MeshBasicMaterial({ name: 'garage sign', map: signTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8), fog: false }));
    sign.position.set(0, 3.05, z0 + 0.04);
    const shutter = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.9).rotateY(Math.PI / 2).translate(x0 + 0.03, 1.95, 0), new THREE.MeshStandardMaterial({ name: 'garage shutter', map: shutterTexture(), roughness: 0.55, metalness: 0.5, envMapIntensity: 0.3 }));
    // props: a tool chest against the far wall, two stacks of tyres in the back corners
    const dark = [], metal = [];
    const chest = new THREE.BoxGeometry(1.7, 1.05, 0.62).translate(5.25, 0.6, z0 + 0.42);
    dark.push(new THREE.BoxGeometry(1.74, 0.05, 0.66).translate(5.25, 1.15, z0 + 0.42), new THREE.BoxGeometry(1.6, 0.1, 0.52).translate(5.25, 0.05, z0 + 0.42));
    for (const x of [4.55, 5.95]) for (const zz of [z0 + 0.2, z0 + 0.64]) metal.push(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12).rotateX(Math.PI / 2).translate(x, 0.045, zz));
    const tyre = (x, y, z) => { dark.push(new THREE.CylinderGeometry(0.33, 0.33, 0.245, 28).translate(x, y, z)); metal.push(new THREE.CylinderGeometry(0.21, 0.21, 0.25, 20).translate(x, y, z)); };
    for (const [x, z, n] of [[8.7, z0 + 0.75, 4], [8.7, z0 + 1.55, 3], [-8.6, z1 - 0.8, 4]]) for (let k = 0; k < n; k++) tyre(x + (k & 1) * 0.03, 0.125 + k * 0.25, z);
    const chestM = new THREE.Mesh(chest, new THREE.MeshStandardMaterial({ name: 'tool chest', map: chestTexture(), roughness: 0.32, metalness: 0.35 }));
    const darkM = new THREE.Mesh(mergeGeometries(dark), new THREE.MeshStandardMaterial({ name: 'garage rubber', color: 0x101113, roughness: 0.85 }));
    const metalM = new THREE.Mesh(mergeGeometries(metal), new THREE.MeshStandardMaterial({ name: 'garage metal', color: 0x8d939c, roughness: 0.35, metalness: 0.85 }));
    const parts = [floor, walls, ceil, ledW, ledC, sign, shutter, chestM, darkM, metalM];
    // everything shows in the road mirror (layer 1, used for the floor here) and in the car's reflection probe (2)
    for (const o of parts) { o.castShadow = false; if (o !== floor) { o.layers.enable(1); o.layers.enable(2); } }   // the floor is the mirror: never in it
    group.add(...parts);
  };
  const api = {
    group, ready: false, failed: false,
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
  };
  return api;
}
