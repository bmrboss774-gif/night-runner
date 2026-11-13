// Night Runner pursuit pieces: spike strips laid across some lanes ahead of the player, and the rear-view mirror.
import * as THREE from 'three';
import { ROAD_DS, GLOW } from './world.js?b=1d92d0be98';

const LANE = 3.65, U_IN = 1.5, U_MED = 0.38, U_PAVE = 19.55;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
// a lane's edges in road coordinates (u across, + = right of the median; lane 0 is the fast lane by the median)
export const laneSpan = (k) => [U_IN + LANE * k, U_IN + LANE * (k + 1)];

// render-space position and heading of a road position (s along, u across)
function roadAt(world, s, u, out = {}) {
  const f = world.road.frameAt(s / ROAD_DS), off = world.offset;
  const rx = -Math.cos(f.th), rz = Math.sin(f.th);
  out.x = f.x + rx * u - off.x; out.y = f.y; out.z = f.z + rz * u - off.z; out.th = f.th; out.g = f.g;
  return out;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ spike strips
// A strip is a run of linked spike blocks laid across the closed lanes (the outer ones carry on over the shoulder
// to the barrier or the median, so there is no way round on the hard shoulder). Nothing on the road leads up to it
// (v27 took the flares off at the user's request): the on-screen warning is the only sign. Built in the strip's own
// frame: z along the road, x = -u.
export class SpikeStrips {
  constructor({ scene, world }) {
    this.scene = scene; this.world = world; this.list = []; this.t = 0;
    this.baseTex = canvasTex(256, 32, (g, w, h) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2b705';
      for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 13, h); g.lineTo(x + 29, 0); g.lineTo(x + 16, 0); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    });
    this.baseTex.wrapS = THREE.RepeatWrapping;
    this.baseMat = new THREE.MeshStandardMaterial({ name: 'spike strip', map: this.baseTex, roughness: 0.62, metalness: 0.1 });
    this.linkMat = new THREE.MeshStandardMaterial({ name: 'spike links', color: 0x0e0f11, roughness: 0.5, metalness: 0.3 });
    this.spikeMat = new THREE.MeshStandardMaterial({ name: 'spikes', color: 0xdfe3ea, roughness: 0.18, metalness: 1, envMapIntensity: 1.4 });
    this.spikeGeo = new THREE.ConeGeometry(0.014, 0.075, 6).translate(0, 0.034 + 0.0375, 0);
    this.linkGeo = new THREE.BoxGeometry(0.03, 0.026, 0.42).translate(0, 0.02, 0);
  }
  // lanes: indices 0..3 to close. inset (v98, the owner: "the spike strips are sort of hard to dodge"): the strip
  // stops this far short of the open lanes, so the gap is wider than the lanes it leaves. Returns the strip.
  place(s, lanes, inset = 0) {
    const W = this.world;
    W.road.ensure?.(s / ROAD_DS + 30);
    lanes = [...new Set(lanes)].sort((a, b) => a - b);
    const spans = [];
    for (const k of lanes) {
      const [a, b] = laneSpan(k), last = spans[spans.length - 1];
      if (last && Math.abs(last[1] - a) < 0.01) last[1] = b; else spans.push([a, b]);
    }
    for (const sp of spans) { if (sp[0] < U_IN + 0.01) sp[0] = U_MED; else sp[0] += inset; if (sp[1] > U_IN + LANE * 4 - 0.01) sp[1] = U_PAVE; else sp[1] -= inset; }
    const open = [0, 1, 2, 3].filter((k) => !lanes.includes(k));
    const g = new THREE.Group(); g.name = 'spike strip'; g.rotation.order = 'YXZ';
    // the strip itself
    let nSpikes = 0, nLinks = 0;
    for (const [a, b] of spans) { nSpikes += Math.ceil((b - a) / 0.11) * 3; nLinks += Math.ceil((b - a) / 0.16); }
    const spikes = new THREE.InstancedMesh(this.spikeGeo, this.spikeMat, nSpikes);
    const links = new THREE.InstancedMesh(this.linkGeo, this.linkMat, nLinks);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let i = 0, j = 0;
    for (const [a, b] of spans) {
      const w = b - a, base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.034, 0.3).translate(-(a + b) / 2, 0.017, 0), this.baseMat);
      base.geometry.attributes.uv.array.forEach((_, k, arr) => { if (k % 2 === 0) arr[k] *= w / 0.5; });
      base.receiveShadow = true; g.add(base);
      for (let x = a + 0.05; x < b - 0.02; x += 0.11) for (const z of [-0.1, 0, 0.1]) {
        e.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25)); q.setFromEuler(e); v.set(-(x + (z === 0 ? 0.055 : 0)), 0, z); m.compose(v, q, one);
        if (i < nSpikes) spikes.setMatrixAt(i++, m);
      }
      // the scissor links on top, alternating, so it reads as a real deployable strip
      for (let x = a + 0.08, k = 0; x < b - 0.04; x += 0.16, k++) {
        e.set(0, k % 2 ? 0.62 : -0.62, 0); q.setFromEuler(e); v.set(-x, 0, 0); m.compose(v, q, one);
        if (j < nLinks) links.setMatrixAt(j++, m);
      }
    }
    spikes.count = i; links.count = j;
    g.add(spikes, links);
    this.scene.add(g);
    const st = { s, lanes, spans, open, group: g, done: false, hit: false, gone: 0, mid: (spans[0][0] + spans[spans.length - 1][1]) / 2 };
    this.list.push(st);
    this.position(st);
    return st;
  }
  position(st) {
    const p = roadAt(this.world, st.s, 0, this.tmp ||= {});
    st.group.position.set(p.x, p.y + 0.004, p.z);
    st.group.rotation.set(-Math.atan(p.g), p.th, 0);
  }
  // the next strip ahead of s (or one just under the car)
  ahead(s) {
    let best = null;
    for (const st of this.list) if (!st.done && st.s > s - 3 && (!best || st.s < best.s)) best = st;
    return best;
  }
  // wheels: [[sPrev, s, u], ...] in road coordinates; returns the strip a wheel rolled over this frame
  crossed(wheels) {
    for (const st of this.list) {
      if (st.done) continue;
      for (const [s0, s1, u] of wheels) {
        // the tyre's footprint (±0.15 m) swept from last frame to this one touches the strip
        if (Math.min(s0, s1) - 0.15 > st.s || Math.max(s0, s1) + 0.15 < st.s) continue;
        if (st.spans.some(([a, b]) => u > a + 0.02 && u < b - 0.02)) return st;   // (v98: the middle of the tyre has to be on it; it used to reach 10 cm past each end)
      }
    }
    return null;
  }
  update(dt, sPlayer) {
    for (const st of this.list) {
      this.position(st);
      // taken up once it's well behind you (a while after you pass it, not the moment it leaves the mirror)
      if (sPlayer - st.s > 160) st.gone += dt;
    }
    for (const st of this.list.filter((x) => x.gone > 1.25 || sPlayer - x.s > 600)) this.remove(st);
  }
  remove(st) {
    this.scene.remove(st.group);
    const shared = [this.spikeGeo, this.linkGeo];
    st.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!shared.includes(o.geometry)) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    this.list = this.list.filter((x) => x !== st);
  }
  clear() { for (const st of [...this.list]) this.remove(st); }
  // build every shader a strip needs ahead of time (compile(obj) compiles obj's materials), so the first strip of a
  // chase doesn't stall the game while they build
  warm(compile) {
    const st = this.place(80, [1, 2]);
    try { compile(st.group); } finally { this.remove(st); }
  }
  show(on) { for (const st of this.list) st.group.visible = on; }
}

// ------------------------------------------------------------------ the rear-view mirror
const MIRROR_TILT = 8 * Math.PI / 180;   // how far the mirror's view looks down (see Mirror.place)
// A camera ahead of the car looking back over it (so you see your own nose and everything coming up behind),
// drawn into a render target and then into a rectangle at the top of the screen, flipped left-to-right like a
// real mirror, with rounded corners. The glow halos are sized for the main view, so they are rescaled while the
// mirror draws.
export class Mirror {
  constructor(renderer, scene, { samples = 4 } = {}) {
    this.renderer = renderer; this.scene = scene; this.on = true;
    this.cam = new THREE.PerspectiveCamera(34, 3.3, 0.4, 1600);
    // roadside detail stops being drawn a little sooner than in the main view (see DetailLOD): it was three times
    // sooner, which left the mirror looking bare next to the road ahead
    this.cam.userData.detailScale = 1.4;
    this.rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples });
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uni = { map: { value: this.rt.texture }, uAspect: { value: 3.3 }, uRadius: { value: 0.14 }, uFade: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float uAspect, uRadius, uFade; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(map, vec2(1.0 - vUv.x, vUv.y)).rgb;
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0), b = vec2(uAspect, 1.0) * 0.5 - uRadius;
          float d = length(max(abs(p) - b, 0.0)) - uRadius;
          float a = 1.0 - smoothstep(-0.006, 0.006, d);
          // a touch of glass: darker at the edges
          float v = 1.0 - 0.22 * smoothstep(0.3, 0.8, length((vUv - 0.5) * vec2(1.0, 1.6)));
          gl_FragColor = vec4(c * v * 1.05, a * uFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.look = new THREE.Vector3(); this.tmp = new THREE.Vector2();
  }
  // where the car is: x, y (road height), z, the heading to look back along, its front overhang and its height.
  // The camera sits 5.5 m ahead of the nose, high enough to see over the roof (anything more than ~10 m behind the
  // car is in full view), tilted 8° down (v27; it was ~3.5°, which cut the nose off at the bottom): the whole front
  // of your car down to the bumper sits along the bottom of the picture, the road behind over its roof.
  place(x, y, z, yaw, front, height) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), ahead = front + 5.5, h = Math.max(2.6, height + 1.35), back = 28;
    this.cam.position.set(x + sy * ahead, y + h, z + cy * ahead);
    this.look.set(x - sy * back, y + h - (ahead + back) * Math.tan(MIRROR_TILT), z - cy * back);
    this.cam.lookAt(this.look);
  }
  // rect: the mirror's inner rectangle in CSS pixels, from the top-left of the canvas. refresh = false draws the
  // last image again without re-rendering the scene (on a slow machine the scene goes in every other frame).
  render(rect, refresh = true) {
    if (!this.on || !rect || rect.w < 8 || rect.h < 8) return;
    // drawn at the screen's own pixel density (up to 2x) even when the main view runs at less: the mirror is small,
    // so this costs little, and it is supersampled down where the canvas is coarser (sharper, no crawling edges)
    const r = this.renderer, pr = Math.max(r.getPixelRatio(), Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
    const W = Math.max(8, Math.round(rect.w * pr)), H = Math.max(8, Math.round(rect.h * pr));
    if (this.rt.width !== W || this.rt.height !== H) { this.rt.setSize(W, H); refresh = true; }
    const aspect = rect.w / rect.h;
    if (Math.abs(this.cam.aspect - aspect) > 1e-3) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
    this.uni.uAspect.value = aspect;
    this.uni.uRadius.value = Math.min(0.3, 10 / rect.h);
    if (refresh) {
      const s0 = GLOW.uScale.value, m0 = GLOW.uMaxPx.value;
      GLOW.uScale.value = H * 0.5; GLOW.uMaxPx.value = Math.min(m0, H * 0.3);
      const prevTarget = r.getRenderTarget();
      r.setRenderTarget(this.rt); r.clear(); r.render(this.scene, this.cam);
      GLOW.uScale.value = s0; GLOW.uMaxPx.value = m0;
      r.setRenderTarget(prevTarget);
    }
    const cssH = r.domElement.clientHeight || innerHeight, cssW = r.domElement.clientWidth || innerWidth;
    const y = cssH - rect.y - rect.h;
    const ac = r.autoClear; r.autoClear = false;
    r.setViewport(rect.x, y, rect.w, rect.h); r.setScissor(rect.x, y, rect.w, rect.h); r.setScissorTest(true);
    r.render(this.quadScene, this.quadCam);
    r.setScissorTest(false); r.setViewport(0, 0, cssW, cssH);
    r.autoClear = ac;
  }
}
