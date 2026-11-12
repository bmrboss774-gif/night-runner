// Night Runner traffic: everyday cars and trucks on both carriageways.
//  - models: real, detailed vehicles (see the Credits panel), prepared offline into two levels of detail and drawn
//    with instancing, so twenty or thirty cars cost a few dozen draw calls. Paint colour, wheel spin and lamp
//    brightness are per instance.
//  - drivers: the Intelligent Driver Model for following, a MOBIL-style rule for lane changes (signal first, keep
//    right when it's free), trucks stay in the right lanes. The player counts as a vehicle they react to.
//  - lamps: glowing halos for head, tail, brake, indicator and truck marker lamps, warm pools of headlight on the
//    road ahead of each car and a red wash behind when they brake; all of it shows in the wet-road reflection.
//  - contact: the player's car hits them as boxes, with an impulse shared by mass; a car that's hit slows to a stop
//    with its hazards on, then drives off again.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE_CENTERS, ROAD_DS, glowMaterial, GLOW as GLOW_U, SHARED, rampC } from './world.js';
// headlight beam strength (the weather turns it up)
export const BEAM = { gain: { value: 0.05 } };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const LANE = LANE_CENTERS[1] - LANE_CENTERS[0];   // lane width (3.65 m)
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);

// Per-kind setup, in each model's game space (front +Z, left +X, metres). Lamps are the left-hand lamp of a pair
// (mirrored to the right); trucks add amber cab markers, the trailer red rear markers.
export const TRAFFIC_KINDS = {
  camry: { file: 'tr-camry.txt', weight: 9, mass: 1550, v0: [28, 35], head: [0.70, 0.77, 2.30], tail: [0.70, 0.96, -2.36] },
  model3: { file: 'tr-model3.txt', weight: 5, mass: 1750, v0: [29, 37], head: [0.68, 0.72, 2.16], tail: [0.64, 0.93, -2.20] },
  rav4: { file: 'tr-rav4.txt', weight: 8, mass: 1650, v0: [27, 34], head: [0.72, 0.88, 2.18], tail: [0.72, 1.05, -2.22] },
  expedition: { file: 'tr-expedition.txt', weight: 5, mass: 2600, v0: [27, 33], fixedPaint: true, head: [0.80, 1.02, 2.62], tail: [0.93, 1.15, -2.60] },
  f150: { file: 'tr-f150.txt', weight: 6, mass: 2300, v0: [27, 34], head: [0.74, 1.05, 2.86], tail: [0.89, 1.03, -2.72] },
  van: { file: 'tr-van.txt', weight: 3, mass: 2600, v0: [26, 31], head: [0.72, 0.96, 2.78], tail: [0.90, 1.48, -2.80] },
  semi: { file: 'tr-semi.txt', weight: 5, mass: 17000, v0: [25, 29], truck: true, fixedPaint: true, trailer: 'trailer', head: [0.96, 0.96, 3.83],
    markers: [[-0.5, 2.67, 2.12], [-0.25, 2.69, 2.12], [0, 2.7, 2.12], [0.25, 2.69, 2.12], [0.5, 2.67, 2.12]], fifth: -2.2 },
  // the pursuit car: never spawns as traffic (part), the game asks for it
  cop: { file: 'tr-cop.txt', part: true, cop: true, weight: 0, mass: 2050, v0: [0, 0], fixedPaint: true, head: [0.72, 0.66, 2.2], tail: [0.72, 0.83, -2.4], beacon: [0.35, 1.44, -0.27] },
  trailer: { file: 'tr-trailer.txt', part: true, tail: [1.0, 1.12, -6.78], rearMarkers: [[-0.35, 4.1, -6.8], [0, 4.1, -6.8], [0.35, 4.1, -6.8]], kingpin: 5.9, bogie: -4.8 },
};
// US highway colours: lots of white, black, grey and silver
const PAINTS = [[0xe9e9e6, 14], [0xf1efe8, 6], [0x111214, 13], [0x9da1a6, 11], [0x55595e, 11], [0x1b2b46, 6], [0x6e0d10, 6], [0x8c1416, 3],
  [0x1f3f78, 4], [0x23362a, 2], [0xa89a80, 2], [0x3a3f45, 5], [0x5a1820, 2], [0xc9c7c0, 4]];
const TRAILER_PAINTS = [[0xcfcdc7, 10], [0xa9acb0, 3], [0x6d1012, 1], [0x1f3a6b, 1]];
const pick = (list) => { let t = Math.random() * list.reduce((s, x) => s + x[1], 0); for (const [v, w] of list) { if ((t -= w) <= 0) return v; } return list[0][0]; };

let LOD0_DIST = 40, LOD1_DIST = 270;
const SAME = { n: 18, behind: 320, ahead: 1150, spawn: [640, 1080], gap: 40 };
const ONCOMING = { n: 13, behind: 260, ahead: 1450, spawn: [950, 1400], gap: 40 };
// Traffic levels: cars on your side, on the other side, and the clear space a new car needs around it.
export const TRAFFIC_LEVELS = {
  light: { label: 'Light', same: 18, oncoming: 13, gap: 40 },
  medium: { label: 'Medium', same: 32, oncoming: 20, gap: 30 },
  heavy: { label: 'Heavy', same: 48, oncoming: 28, gap: 22 },
  extreme: { label: 'Extreme', same: 70, oncoming: 36, gap: 15 },
};

// ------------------------------------------------------------------ materials
// Wheels spin in the vertex shader (each tyre/rim vertex carries its wheel's id), tail lamps take their
// brightness per instance; both through small patches on three's standard material.
export function patchMaterial(mat, { wheels = null, lamp = false, vmr = false } = {}) {
  if (!wheels && !lamp && !vmr) return mat;
  const m = mat.clone();
  const centres = wheels ? wheels.map((w) => new THREE.Vector2(w.c[1], w.c[2])) : [];
  while (centres.length < 8) centres.push(new THREE.Vector2());
  m.onBeforeCompile = (sh) => {
    if (wheels) {
      sh.uniforms.uWheel = { value: centres };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float _wheel; attribute float aSpin; uniform vec2 uWheel[8];\nvec2 spinYZ(vec2 p, vec2 c, float a) { vec2 q = p - c; float s = sin(a), k = cos(a); return c + vec2(k * q.x - s * q.y, s * q.x + k * q.y); }')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (_wheel > 0.5) objectNormal.yz = spinYZ(objectNormal.yz, vec2(0.0), aSpin);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (_wheel > 0.5) { int wi = int(_wheel + 0.5) - 1; transformed.yz = spinYZ(transformed.yz, uWheel[wi], aSpin); }');
    }
    if (vmr) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMR; varying vec2 vMR;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = aMR;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.y;');
    }
    if (lamp) {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLamp; varying float vLamp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLamp;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLamp;');
    }
  };
  m.customProgramCacheKey = () => `tr${wheels ? 'w' : ''}${lamp ? 'l' : ''}${vmr ? 'm' : ''}`;
  return m;
}
function roleMaterial(role, src, kindName) {
  const m = src;
  if (role === 'paint') {
    const trailer = kindName === 'trailer';
    return new THREE.MeshPhysicalMaterial({ name: 'paint', color: 0xffffff, map: kindName === 'cop' ? src.map : null, metalness: trailer ? 0.15 : kindName === 'cop' ? 0.1 : 0.4, roughness: trailer ? 0.45 : 0.4, clearcoat: trailer ? 0.3 : 1, clearcoatRoughness: 0.14 });
  }
  if (role === 'glass') {
    m.transparent = true; m.depthWrite = false; m.opacity = Math.max(0.5, m.opacity); m.color.multiplyScalar(0.35); m.roughness = 0.05; m.metalness = 0;
    return m;
  }
  if (role === 'tail') { m.color.setRGB(0.25, 0.01, 0.01); m.emissive.setRGB(1, 0.035, 0.015); m.emissiveIntensity = 1; m.emissiveMap = null; m.transparent = false; m.depthWrite = true; m.opacity = 1; return m; }
  if (role === 'head') { m.emissive.setRGB(1, 0.93, 0.82); m.emissiveIntensity = 2.2; return m; }
  if (role === 'signal') { m.emissive.setRGB(1, 0.42, 0.05); m.emissiveIntensity = 0.15; return m; }
  if (role === 'beacon') { m.color.setRGB(0.12, 0.12, 0.14); m.emissive.setRGB(0, 0, 0); m.roughness = 0.2; return m; }
  return m;
}

// ------------------------------------------------------------------ the lamp halos and road light pools
const LAMP_MAX = 1400;
function radialTex(w, h, stops) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.translate(w / 2, h / 2); g.scale(w / 2, h / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(-1, -1, 2, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Traffic {
  constructor({ renderer, scene, world, base = './' }) {
    this.renderer = renderer; this.scene = scene; this.world = world; this.base = base;
    this.kinds = {}; this.ready = false; this.vehicles = []; this.enabled = true;
    // the pursuit: copHero = the game draws the police cars itself (full-detail models), so their instances are
    // skipped here; copTune = how fast they may go relative to the player; hazards = spike strips across lanes
    // ({ s, spans: [[u0, u1]...], lanes, open }) that the police steer round and other drivers move over for
    this.copHero = false;
    // v98, the owner: "the cop cars come up too fast you can never lose them ... they also clip through cars". A unit
    // is a real car now: vTop is its top speed and accel its pull away from rest (the game sets both from the heat
    // of the chase and the car you are in); it no longer runs at your speed plus whatever it takes.
    this.copTune = { vTop: 62, accel: 6.5 };
    // things standing in the road that the car can hit but nobody drives: the arrow board at a lane closure
    this.statics = []; this.clSeen = new Set();
    // drivers edge over to open a gap when you come up between two of them (see updateVehicle)
    this.giveRoom = true;
    this.hazards = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpE = new THREE.Euler(0, 0, 0, 'YXZ'); this.tmpV = new THREE.Vector3(); this.tmpS = new THREE.Vector3(1, 1, 1); this.tmpC = new THREE.Color();
    // halos: one Points cloud rebuilt every frame
    const g = new THREE.BufferGeometry();
    this.lampPos = new Float32Array(LAMP_MAX * 3); this.lampCol = new Float32Array(LAMP_MAX * 3); this.lampSize = new Float32Array(LAMP_MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.lampPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.lampCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.lampSize, 1).setUsage(THREE.DynamicDrawUsage));
    const tex = radialTex(64, 64, [[0, 1], [0.1, 0.75], [0.35, 0.18], [1, 0]]);
    const mat = glowMaterial(tex, 1, 1);
    mat.vertexShader = mat.vertexShader.replace('uniform float uScale, uMaxPx, uSize;', 'uniform float uScale, uMaxPx, uSize; attribute float aSize;').replace('float px = uSize * uScale', 'float px = aSize * uSize * uScale');
    this.lampPts = new THREE.Points(g, mat); this.lampPts.frustumCulled = false; this.lampPts.renderOrder = 7;
    this.lampPts.layers.enable(1); this.lampPts.layers.enable(2);
    this.group.add(this.lampPts);
    this.lampN = 0;
    // light pools on the road: instanced quads lying on the surface
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mkPool = (tex, max) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
      const im = new THREE.InstancedMesh(quad, m, max); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 4; this.group.add(im); return im;
    };
    this.headPool = mkPool(radialTex(64, 128, [[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]), 140);
    // headlight beams in the air: soft cones that read in the haze (and much more in rain)
    {
      const cone = new THREE.CylinderGeometry(1, 0.06, 1, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);   // apex at the lamp, opening along +z
      const mat = new THREE.ShaderMaterial({
        uniforms: { uGain: BEAM.gain, fogColor: GLOW_U.fogColor, fogDensity: GLOW_U.fogDensity },
        vertexShader: `
          varying float vZ; varying vec3 vN, vV; varying float vDepth; varying vec3 vCol;
          void main() {
            vZ = position.z; vCol = instanceColor;
            mat4 M = modelMatrix * instanceMatrix;
            vec4 wp = M * vec4(position, 1.0);
            // the cones are scaled very unevenly (wide, flat, long), so normals need the inverse-transpose
            vec3 sc2 = vec3(dot(M[0].xyz, M[0].xyz), dot(M[1].xyz, M[1].xyz), dot(M[2].xyz, M[2].xyz));
            vN = normalize(mat3(M) * (normal / sc2));
            vV = normalize(cameraPosition - wp.xyz);
            vec4 mv = viewMatrix * wp; vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float uGain; uniform vec3 fogColor; uniform float fogDensity;
          varying float vZ; varying vec3 vN, vV; varying float vDepth; varying vec3 vCol;
          void main() {
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            float along = smoothstep(0.0, 0.05, vZ) * pow(clamp(1.0 - vZ, 0.0, 1.0), 1.7);
            float f = fogDensity * vDepth, fog = 1.0 - exp(-f * f);
            // nothing from inside or right next to a cone (the hood camera sits in the player's own beams)
            float near = smoothstep(1.5, 6.0, vDepth);
            float k = edge * along * near;
            // a NaN anywhere here would spread over the whole frame through the bloom: never write one
            if (!(k >= 0.004) || !(k <= 1e6)) discard;
            gl_FragColor = vec4(vCol * k * uGain * (1.0 - fog), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const im = new THREE.InstancedMesh(cone, mat, 300); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 8; this.group.add(im); this.beams = im;
    }
    this.tailPool = mkPool(radialTex(64, 64, [[0, 1], [0.4, 0.4], [1, 0]]), 80);
    // rain: a plume of spray behind every moving car, a camera-facing billboard that scrolls its noise
    {
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uRain: SHARED.uRain, uTime: SHARED.uTime, uNoise: SHARED.uNoise, fogColor: GLOW_U.fogColor, fogDensity: GLOW_U.fogDensity },
        vertexShader: `
          varying vec2 vUv; varying float vDepth; varying vec3 vCol;
          void main() {
            vUv = uv; vCol = instanceColor;
            vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), 1.0);
            c.xy += position.xy * sc.xy;
            vDepth = -c.z;
            gl_Position = projectionMatrix * c;
          }`,
        fragmentShader: `
          uniform float uRain, uTime, fogDensity; uniform vec3 fogColor; uniform sampler2D uNoise;
          varying vec2 vUv; varying float vDepth; varying vec3 vCol;
          void main() {
            vec2 q = vUv - 0.5;
            float n = texture2D(uNoise, vUv * vec2(1.5, 0.8) + vec2(vCol.b * 7.0, -uTime * 1.3)).r;
            float m = (1.0 - smoothstep(0.1, 0.5, abs(q.x))) * (1.0 - smoothstep(0.0, 0.5, abs(q.y + 0.1))) * smoothstep(-0.5, -0.3, q.y);
            float a = m * (0.35 + 0.65 * n) * uRain * vCol.r * smoothstep(1.5, 6.0, vDepth);
            if (!(a > 0.002) || !(a <= 1.0)) discard;
            float f = fogDensity * vDepth, fog = 1.0 - exp(-f * f);
            gl_FragColor = vec4(mix(vec3(0.55, 0.6, 0.68) * vCol.g, fogColor, fog), a * 0.5);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false,
      });
      const im = new THREE.InstancedMesh(geo, mat, 80); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(80 * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 7; this.group.add(im); this.spray = im;
    }
    this.spawnTimer = 0; this.blink = 0;
    this.player = { s: 0, u: 0, v: 0, lanes: [], dir: 1, len: 4.5, active: false };
  }

  // lower settings: the detailed models only very close, fewer cars, no light pools on the road
  // rich (v93, computers): Low keeps the light pools on the road under every vehicle's lamps, and shows the detailed
  // models out to 26 m and the simple ones to 210 m (16 m and 170 m made nearby cars visibly coarse); the pools are a
  // few dozen small quads and the models are triangles, which a computer's graphics card has to spare
  setQuality(q, rich = false) {
    this.quality = q;
    LOD0_DIST = q >= 2 ? 40 : q === 1 ? 30 : rich ? 26 : 16;
    LOD1_DIST = q >= 2 ? 270 : q === 1 ? 230 : rich ? 210 : 170;
    this.applyDensity();
    this.headPool.visible = this.tailPool.visible = q >= 1 || rich;
    // beam cones are pure fill rate: none on Low, fewer and shorter-ranged on Medium
    this.beamRange = q >= 2 ? 200 : q === 1 ? 110 : 0;
    this.beams.visible = q >= 1;
  }
  // how busy the road is; Low graphics trims the busier levels a little
  setDensity(level) {
    this.density = TRAFFIC_LEVELS[level] ? level : 'light';
    this.applyDensity();
    if (this.populated) this.populate(this.player.s, false, true);
  }
  applyDensity() {
    // (v98) each highway is busier or quieter than the Settings level by its own factor
    const L = TRAFFIC_LEVELS[this.density || 'light'], low = ((this.quality ?? 2) < 1 ? 0.7 : 1) * (this.world.road?.theme?.traffic ?? 1);
    SAME.n = Math.round(L.same * low); ONCOMING.n = Math.round(L.oncoming * low);
    SAME.gap = ONCOMING.gap = L.gap;
  }
  // ---- loading: one base64 GLB per kind, meshopt-compressed
  async load(MeshoptDecoder, onProgress = () => {}) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const names = Object.keys(TRAFFIC_KINDS);
    let done = 0; onProgress(0, names.length);
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(this.base + TRAFFIC_KINDS[name].file);
        if (!res.ok) throw new Error(res.status);
        const bin = atob((await res.text()).trim()), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const gltf = await new Promise((ok, no) => loader.parse(bytes.buffer, '', ok, no));
        this.kinds[name] = this.buildKind(name, gltf);
      } catch (e) { console.warn('traffic model failed', name, e); }
      onProgress(++done, names.length);
    }));
    if (this.kinds.semi && !this.kinds.trailer) delete this.kinds.semi;
    this.ready = Object.keys(this.kinds).some((k) => !TRAFFIC_KINDS[k].part);
    return this.ready;
  }
  buildKind(name, gltf) {
    const spec = TRAFFIC_KINDS[name], ex = gltf.parser.json.extras || {};
    const kind = { name, spec, dims: ex.dims || [2, 1.5, 4.6], wheels: ex.wheels || [], credit: ex.credit, lods: [[], []], cap: 40, count: [0, 0] };
    kind.wheelR = kind.wheels.length ? kind.wheels.reduce((s, w) => s + w.r, 0) / kind.wheels.length : 0.38;
    gltf.scene.updateMatrixWorld(true);
    for (let L = 0; L < 2; L++) {
      const node = gltf.scene.getObjectByName('LOD' + L);
      if (!node) continue;
      // group the primitives by role + material look, merge each group into one geometry
      const groups = new Map();
      node.traverse((o) => {
        if (!o.isMesh) return;
        const [role] = (o.material.name || 'body|').split('|');
        const g = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) {
          const a = o.geometry.attributes[k]; if (!a) continue;
          // quantised attributes (int16 / int8, normalised) come out as plain floats
          const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz);
          for (let i = 0; i < n; i++) { f[i * sz] = a.getX(i); if (sz > 1) f[i * sz + 1] = a.getY(i); if (sz > 2) f[i * sz + 2] = a.getZ(i); }
          g.setAttribute(k, new THREE.BufferAttribute(f, sz));
        }
        const wa = o.geometry.attributes._wheel;   // one byte per vertex, stored with a 4-byte stride: read it element by element
        if (wa) { const f = new Float32Array(wa.count); for (let i = 0; i < wa.count; i++) f[i] = wa.getX(i); g.setAttribute('_wheel', new THREE.BufferAttribute(f, 1)); }
        if (o.geometry.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(o.geometry.index.array), 1));
        g.applyMatrix4(o.matrixWorld);
        if (!g.attributes.uv && o.material.map) return;
        const m = o.material, tex = [m.map, m.normalMap, m.roughnessMap, m.emissiveMap].map((t) => (t ? t.uuid : '-')).join(':');
        // plain opaque parts (trim, chrome, rims, tyres, cabin...) all share one material per side mode: their colour,
        // roughness and metalness go into the vertices, so a whole car is a handful of draw calls
        const plain = ['body', 'rim', 'tyre', 'chrome', 'interior'].includes(role) && tex === '-:-:-:-' && !m.transparent && m.opacity > 0.99 && m.emissive.getHex() === 0;
        let key;
        if (plain) {
          const n = g.attributes.position.count, col = new Float32Array(n * 3), mr = new Float32Array(n * 2);
          for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; mr[i * 2] = clamp(m.roughness, 0.04, 1); mr[i * 2 + 1] = m.metalness; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMR', new THREE.BufferAttribute(mr, 2));
          if (g.attributes.uv) g.deleteAttribute('uv');
          key = `plain|${m.side}`;
        } else key = role === 'paint' ? 'paint' : `${role}|${m.color.getHexString()}|${m.emissive.getHexString()}|${m.metalness.toFixed(2)}|${m.roughness.toFixed(2)}|${m.transparent}|${m.opacity.toFixed(2)}|${m.side}|${tex}|${Object.keys(g.attributes).sort().join(',')}`;
        let e = groups.get(key); if (!e) groups.set(key, e = { role: plain ? 'plain' : role, mat: m, geos: [] });
        e.geos.push(g);
      });
      for (const e of groups.values()) {
        // all geometries in a merged group need the same attributes
        const need = new Set(); for (const g of e.geos) for (const k of Object.keys(g.attributes)) need.add(k);
        for (const g of e.geos) {
          const n = g.attributes.position.count;
          if (need.has('_wheel') && !g.attributes._wheel) g.setAttribute('_wheel', new THREE.BufferAttribute(new Float32Array(n), 1));
          if (need.has('uv') && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
          if (!g.index) { const ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
        }
        const geo = e.geos.length > 1 ? mergeGeometries(e.geos, false) : e.geos[0];
        if (!geo) continue;
        const spin = !!geo.attributes._wheel && kind.wheels.length > 0;
        if (spin) geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(new Float32Array(kind.cap), 1).setUsage(THREE.DynamicDrawUsage));
        const lamp = e.role === 'tail';
        if (lamp) geo.setAttribute('aLamp', new THREE.InstancedBufferAttribute(new Float32Array(kind.cap), 1).setUsage(THREE.DynamicDrawUsage));
        const base = e.role === 'plain' ? new THREE.MeshStandardMaterial({ name: 'plain', vertexColors: true, side: e.mat.side, envMapIntensity: 1 }) : roleMaterial(e.role, e.mat.clone(), name);
        const mat = patchMaterial(base, { wheels: spin ? kind.wheels : null, lamp, vmr: e.role === 'plain' });
        const im = new THREE.InstancedMesh(geo, mat, kind.cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (e.role === 'paint') { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(kind.cap * 3).fill(1), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
        im.frustumCulled = false; im.count = 0; im.visible = false;
        im.layers.set(0); if (L === 0) im.layers.enable(1);
        im.userData = { role: e.role, spin, lamp };
        if (e.role === 'glass') im.renderOrder = 3;
        this.group.add(im);
        kind.lods[L].push(im);
      }
    }
    return kind;
  }

  // ---- population
  laneU(dir, lane) { return dir > 0 ? LANE_CENTERS[lane] : -LANE_CENTERS[lane]; }
  makeVehicle(dir, s, lane, v) {
    const kinds = Object.keys(this.kinds).filter((k) => !TRAFFIC_KINDS[k].part);
    const lorries = this.world.road?.theme?.trucks ?? 1;   // (v98) how many of them are lorries depends on the highway
    let name = pick(kinds.map((k) => [k, TRAFFIC_KINDS[k].weight * (TRAFFIC_KINDS[k].truck ? lorries : 1)]));
    const spec = TRAFFIC_KINDS[name];
    if (spec.truck && lane < 2) lane = 2 + (Math.random() < 0.5 ? 1 : 0);
    const kind = this.kinds[name];
    const veh = {
      kind: name, dir, s, lane, from: lane, to: lane, laneT: 1, u: this.laneU(dir, lane), du: 0,
      v: v ?? rand(...spec.v0), v0: rand(...spec.v0) * (dir > 0 ? 1 : 1.03), acc: 0, brake: false,
      color: spec.fixedPaint ? 0xffffff : pick(PAINTS), trailerColor: pick(TRAILER_PAINTS),
      len: kind.dims[2], halfW: kind.dims[0] / 2 - 0.12, front: kind.dims[2] / 2, rear: kind.dims[2] / 2, mass: spec.mass,
      spin: Math.random() * 6, signal: 0, signalT: 0, think: rand(0.5, 2.5), hitT: 0, wob: 0, wobV: 0, fade: 0, lat: 0, latV: 0, yawOff: 0,
      T: spec.truck ? rand(1.6, 2.0) : rand(1.0, 1.5), lcDur: spec.truck ? 4.5 : rand(2.6, 3.6), a: spec.truck ? 0.7 : rand(1.2, 1.9), b: spec.truck ? 2.0 : 2.6, politeness: rand(0.1, 0.5),
    };
    if (spec.truck) { const tr = TRAFFIC_KINDS.trailer; veh.rear = -(spec.fifth - tr.kingpin - this.kinds.trailer.dims[2] / 2); }
    return veh;
  }
  // free spot check: nothing within 'gap' metres in that lane
  laneFree(dir, lane, s, gapAhead, gapBehind) {
    for (const o of this.vehicles) {
      if (o.dir !== dir) continue;
      if (o.lane !== lane && o.to !== lane) continue;
      const d = (o.s - s) * dir;
      if (d > -gapBehind - o.front && d < gapAhead + o.rear) return false;
    }
    const p = this.player;
    if (p.active && dir > 0 && p.lanes.includes(lane) && Math.abs(p.s - s) < Math.max(gapAhead, gapBehind) + 6) return false;
    return true;
  }
  populate(sCar, initial = false, refill = false) {
    const W = this.world;
    for (const [dir, cfg] of [[1, SAME], [-1, ONCOMING]]) {
      // retire the ones out of range
      this.vehicles = this.vehicles.filter((o) => {
        if (o.gone) return false;
        if (o.cop) return true;
        if (o.dir !== dir) return true;
        if (o.parked) return (o.s - sCar) > -cfg.behind;
        const rel = (o.s - sCar) * dir;
        const out = rel < -cfg.behind || rel > cfg.ahead + 120 || o.s < 30;
        return !out;
      });
      let have = this.vehicles.filter((o) => o.dir === dir && !o.cop && !o.parked).length;
      // a quieter setting: drop the cars farthest from you (out of sight first)
      if (have > cfg.n) {
        const mine = this.vehicles.filter((o) => o.dir === dir && !o.cop && !o.parked).sort((a, b) => Math.abs(b.s - sCar) - Math.abs(a.s - sCar));
        const drop = new Set(mine.slice(0, have - cfg.n).filter((o) => refill || Math.abs(o.s - sCar) > 400));
        this.vehicles = this.vehicles.filter((o) => !drop.has(o)); have -= drop.size;
      }
      // a fresh road (or a busier setting) fills the whole stretch at once; after that cars join out of sight
      const fill = initial || refill;
      let tries = fill ? 60 * cfg.n : 6;
      while (have < cfg.n && tries-- > 0) {
        let rel;
        if (fill) rel = rand(-cfg.behind * 0.6, cfg.ahead * 0.92);
        else if (dir > 0 && this.player.v < 22 && Math.random() < 0.4) rel = -rand(cfg.behind * 0.75, cfg.behind * 0.95);   // a slow player gets traffic from behind
        else rel = rand(...cfg.spawn);
        const s = sCar + rel * dir;
        if (s < 80) continue;
        if (Math.abs(rel) < 45) continue;
        const lane = Math.floor(Math.random() * 4);
        if (dir > 0) { const cl = W.road.closureAt(s, 260, 20); if (cl && cl.lanes.includes(lane)) continue; }   // (v98) not in a lane that is shut for road works
        if (!this.laneFree(dir, lane, s, cfg.gap, cfg.gap)) continue;
        W.road.ensure(Math.ceil((s + 400) / ROAD_DS));
        const veh = this.makeVehicle(dir, s, lane);
        if (!this.kinds[veh.kind]) continue;
        if (dir > 0 && veh.lane !== lane) { const cl = W.road.closureAt(s, 260, 20); if (cl && cl.lanes.includes(veh.lane)) continue; }
        if (!this.laneFree(dir, veh.lane, s, cfg.gap + veh.front, cfg.gap + veh.rear)) continue;
        // match the speed of whatever is ahead in that lane so it doesn't spawn into a pile-up
        veh.fade = fill ? 1 : 0;
        if (fill) { const lead = this.leaderOf(veh, veh.lane); if (lead && lead.gap < 60) veh.v = Math.min(veh.v, lead.v); }
        this.vehicles.push(veh); have++;
      }
    }
  }

  // ---- the police
  // A pursuit car joins behind the player and tries to sit on their bumper, then on their rear quarter (a PIT
  // nudge: the ordinary collision does the rest). It reads the road like traffic does (s along, u across), but
  // steers continuously instead of lane by lane.
  spawnCop(sPlayer, uPlayer, vPlayer, gap = rand(160, 220)) {
    const kind = this.kinds.cop; if (!kind) return null;
    // the player's lane, or one either side of it, whichever has the most room behind the player
    const near = LANE_CENTERS.reduce((b, c, k) => (Math.abs(c - uPlayer) < Math.abs(LANE_CENTERS[b] - uPlayer) ? k : b), 0);
    const s = sPlayer - gap;
    if (s < 60) return null;
    let lane = near, room = -1;
    for (const k of [near, near - 1, near + 1]) {
      if (k < 0 || k > 3) continue;
      let r = 1e9; for (const o of this.vehicles) if (o.dir > 0 && (o.lane === k || o.to === k)) r = Math.min(r, Math.abs(o.s - s));
      if (r > room + 15) { room = r; lane = k; }
    }
    const veh = {
      kind: 'cop', dir: 1, s, lane, from: lane, to: lane, laneT: 1, u: LANE_CENTERS[lane], du: 0,
      v: clamp(vPlayer + 3, 24, this.copTune.vTop), v0: 80, acc: 0, brake: false, color: 0xffffff,   // (v98: it joins at about your speed, was 14 m/s quicker)
      len: kind.dims[2], halfW: kind.dims[0] / 2 - 0.12, front: kind.dims[2] / 2, rear: kind.dims[2] / 2, mass: 2050,
      spin: 0, signal: 0, signalT: 0, think: 0, hitT: 0, wob: 0, wobV: 0, fade: 0, lat: 0, latV: 0, yawOff: 0,
      // short following distance and hard braking: they tailgate traffic and dive round it
      T: 0.35, lcDur: 2, a: 8, b: 9, politeness: 0,
      cop: { mode: 'chase', side: Math.random() < 0.5 ? -1 : 1, t: 0, pitT: 0, phase: Math.random(), gapT: 0, uTarget: LANE_CENTERS[lane], lost: 0, far: 0, engaged: false, ramp: null },
    };
    this.vehicles.push(veh);
    return veh;
  }
  // a unit parked at a roadblock (on the shoulder by a spike strip), nose angled toward the road; once the player
  // has gone by it can be told to pull out and join in (cop.join)
  spawnParkedCop(s, u, angle = 0.35) {
    const veh = this.spawnCop(s + 1, LANE_CENTERS[3], 0, 1);
    if (!veh) return null;
    veh.s = s; veh.u = u; veh.v = 0; veh.wob = angle; veh.wobV = 0;
    veh.cop.mode = 'parked'; veh.cop.uTarget = u;
    return veh;
  }
  get cops() { return this.vehicles.filter((v) => v.cop); }
  dismissCops() { for (const v of this.vehicles) if (v.cop) v.cop.mode = 'leave'; }
  clearCops() { this.vehicles = this.vehicles.filter((v) => !v.cop); }
  // What is in a unit's way (v98, the owner: "they also clip through cars"). Until now a unit only looked at the lane
  // its centre was in, so it slid sideways through cars beside it and drove into the back of anything it straddled.
  // This looks at where the bodies really are: `lead` is the nearest vehicle ahead whose body overlaps this one's
  // path, and uMin..uMax is how far it can move across before it would touch a vehicle alongside.
  copSpace(veh) {
    let lead = null, bd = 1e9, uMin = -1e9, uMax = 1e9;
    for (const o of this.vehicles) {
      if (o === veh || o.dir !== veh.dir || o.gone) continue;
      const ds = o.s - veh.s;
      if (ds > 260 || ds < -40) continue;
      const need = veh.halfW + o.halfW + 0.5, du = o.u - veh.u;
      if (ds > 0 && Math.abs(du) < need) { const gap = ds - o.rear - veh.front; if (gap < bd) { bd = gap; lead = o; } }
      // alongside (or about to be, at the speed it is closing): a wall on that side
      const reach = ds > 0 ? o.rear + veh.front + 2 + Math.max(0, veh.v - o.v) * 0.9 : o.front + veh.rear + 2;
      if (Math.abs(ds) < reach) { if (du >= 0) uMax = Math.min(uMax, o.u - need); else uMin = Math.max(uMin, o.u + need); }
    }
    return { lead: lead ? { gap: bd, v: lead.v, o: lead } : null, uMin, uMax };
  }
  // metres of clear road ahead of a unit along the line u across the road
  corridorGap(veh, u) {
    let g = 1e9;
    for (const o of this.vehicles) {
      if (o === veh || o.dir !== veh.dir || o.gone) continue;
      const ds = o.s - veh.s;
      if (ds > -(o.front + veh.rear + 1) && ds < 260 && Math.abs(o.u - u) < veh.halfW + o.halfW + 0.5) g = Math.min(g, ds - o.rear - veh.front);
    }
    return g;
  }
  updateCop(veh, dt) {
    const c = veh.cop, p = this.player, W = this.world, T = this.copTune;
    c.t += dt;
    const ahead = p.s - veh.s;                   // metres the player is ahead
    if (c.mode === 'parked') {
      veh.v = 0; veh.acc = 0; veh.brake = false; veh.du = 0; veh.lat = 0; veh.latV = 0; veh.hitT = 0;
      veh.fade = Math.min(1, veh.fade + dt * 1.5);
      // a unit at a roadblock pulls out once you are by; one waiting on the shoulder ('ahead') pulls out as you come up to it
      if (c.join === 'ahead' ? ahead > -230 : c.join && ahead > 30) { c.mode = 'chase'; c.uTarget = veh.u; c.gapT = 0; }
      veh.gone = ahead > 700 || ahead < -1800;
      return;
    }
    if (veh.wob && c.mode !== 'parked') veh.wob *= Math.exp(-dt * 2);   // a unit pulling out straightens up
    // Speed (v98). A unit has a top speed (T.vTop) and pulls like a quick saloon; it closes on you no faster than
    // 16 m/s (about 35 mph) and eases to your own speed as it arrives, so it draws up to your bumper instead of
    // arriving like a missile. Go faster than its top speed and it falls back.
    const pv = Math.max(0, p.v), vMax = T.vTop;
    let uT, sGap, aMax = T.accel * (1 - Math.pow(Math.max(0, veh.v) / vMax, 2));
    if (c.mode === 'leave') { uT = LANE_CENTERS[3]; sGap = 1e9; aMax = 2; veh.v0 = 30; }
    else {
      // behind the player: close up; once close and matched, swing out to a rear quarter for a few seconds
      if (c.mode === 'chase') { if (ahead < 9 && ahead > 3 && Math.abs(p.v - veh.v) < 6) { c.gapT += dt; if (c.gapT > 1.6) { c.mode = 'pit'; c.pitT = 0; c.side = p.u > LANE_CENTERS[1] + 1 ? -1 : p.u < LANE_CENTERS[1] - 1 ? 1 : (Math.random() < 0.5 ? -1 : 1); } } else c.gapT = 0; }
      else if (c.mode === 'pit') { c.pitT += dt; if (c.pitT > 4 || ahead > 16 || ahead < -8) { c.mode = 'chase'; c.gapT = -2.5; } }   // (and a breather before it tries again)
      if (c.mode === 'pit') { uT = p.u + c.side * 2.1; sGap = 1.6; }           // front wheel at the player's rear quarter
      else { uT = p.u + Math.sin(c.t * 0.7 + c.phase * 6) * 0.6; sGap = 7.5; }
    }
    if (ahead < 60) c.engaged = true;   // it has been on you (the game only counts a unit as shaken off if it had)
    // longitudinal: close the gap, match the speed, don't run into traffic (the player is fair game)
    let vWant = c.mode === 'leave' ? 30
      : ahead < -5 ? clamp(pv - 7 + ahead * 0.05, 14, vMax)                       // in front of you (it pulled out ahead): a little slower than you, until you come up to it
        : clamp(pv + clamp((ahead - sGap) * 0.3, -8, 16), 0, vMax);
    const laneNow = LANE_CENTERS.reduce((b, l, k) => (Math.abs(l - veh.u) < Math.abs(LANE_CENTERS[b] - veh.u) ? k : b), 0);
    veh.lane = veh.from = veh.to = laneNow; veh.laneT = 1;
    // following one of the game's ramps (an exit the player took, or the entrance of the highway it led to): the
    // unit keeps to the ramp's lane until the ramp joins the road
    let onRamp = false;
    if (c.ramp) {
      const rp = c.ramp, inside = veh.s >= rp.lo - 2 && veh.s <= rp.hi + 2, done = rp.dir > 0 ? veh.s > rp.sM - 30 : false;
      if (!inside || done) { if (rp.dir > 0 || !inside) c.ramp = null; }
      else { uT = rampC(veh.s, rp) + clamp(p.u - rampC(p.s, rp), -1, 1) * 0.5; onRamp = (rp.sN - veh.s) * rp.dir > 0; }
    }
    const space = onRamp ? { lead: null, uMin: -1e9, uMax: 1e9 } : this.copSpace(veh);
    const lead = space.lead;
    let acc = clamp((vWant - veh.v) * 0.8, -9, aMax);
    if (lead) {
      const a2 = this.idm({ ...veh, a: Math.max(0.5, aMax) }, veh.v, lead, Math.max(vWant, 5));
      acc = Math.min(acc, a2);
      // a vehicle ahead: pick the clearest way through early, rather than braking behind it. The four lanes and the
      // hard shoulder are each weighed by the open road ahead in them, less how far across they are and how far
      // from you; one it cannot reach (a vehicle alongside in the way) or that is shut for road works is out.
      if (lead.gap < 50 + veh.v * 1.8 && c.mode !== 'leave' && !c.ramp) {
        const cl = W.road.closureAt(veh.s, 160 + veh.v * 3), shoulder = !cl && !W.road.rampAt(veh.s + 80, 160) && !W.road.isBridge(Math.round(veh.s / ROAD_DS) + 30);
        let best = uT, bestScore = Math.min(lead.gap, 170) - 2 * Math.abs(veh.u - p.u) + 10;
        for (let k = 0; k < 5; k++) {
          if (k === 4 ? !shoulder : cl && cl.lanes.includes(k)) continue;
          const cu = k === 4 ? 17.7 : LANE_CENTERS[k];
          if (cu < space.uMin - 0.3 || cu > space.uMax + 0.3) continue;
          const sc = Math.min(this.corridorGap(veh, cu), 170) - 5 * Math.abs(cu - veh.u) - 2 * Math.abs(cu - p.u) - (k === 4 ? 12 : 0);
          if (sc > bestScore) { bestScore = sc; best = cu; }
        }
        if (best !== uT) { uT = best; c.dodge = best; c.dodgeT = 1.2; }
      }
    }
    // (it holds the way through it picked for a moment, so it does not weave back behind the car it is passing)
    if (c.dodgeT > 0) { c.dodgeT -= dt; if (!lead || lead.gap > 30) { if (Math.abs(ahead) > 25) uT = c.dodge; } }
    // spike strips: the police know where they are, and take an open lane past them
    for (const hz of this.hazards) {
      const d = hz.s - veh.s;
      if (d < -6 || d > 40 + veh.v * 2.4 || !hz.open.length) continue;
      const inSpan = (u) => hz.spans.some(([a, b]) => u > a - 1.25 && u < b + 1.25);
      if (inSpan(uT) || inSpan(veh.u)) {
        let best = uT, bd = 1e9;
        for (const k of hz.open) { const dd = Math.abs(LANE_CENTERS[k] - veh.u); if (dd < bd) { bd = dd; best = LANE_CENTERS[k]; } }
        uT = best;
      }
    }
    // road works: they keep to the lanes that are open
    if (!onRamp) { const cl = W.road.closureAt(veh.s, 70 + veh.v * 2.6); if (cl && veh.s < cl.s1 - 10) uT = clamp(uT, LANE_CENTERS[cl.open[0]] - 0.5, LANE_CENTERS[cl.open[cl.open.length - 1]] + 0.5); }
    if (!Number.isFinite(acc)) acc = 0;
    veh.acc = lerp(Number.isFinite(veh.acc) ? veh.acc : 0, acc, 1 - Math.exp(-dt * 5));
    veh.v = Math.max(0, veh.v + veh.acc * dt);
    // and it never drives into the back of what is in front of it
    if (lead && !lead.o.player) { if (lead.gap < 0.8) veh.v = Math.min(veh.v, Math.max(0, lead.v - 0.5)); else veh.v = Math.min(veh.v, lead.v + Math.sqrt(2 * 9 * lead.gap)); }
    if (!Number.isFinite(veh.v)) veh.v = Math.max(0, p.v);
    veh.s += veh.v * dt;
    if (!Number.isFinite(veh.s)) veh.s = p.s - 80;
    veh.brake = veh.acc < -1.5;
    // lateral: head for the target, limited by speed (no sideways teleporting) and by the vehicles alongside
    if (!c.ramp) uT = clamp(uT, LANE_CENTERS[0] - 0.9, c.dodgeT > 0 && c.dodge > 17 ? 17.8 : LANE_CENTERS[3] + 1.0);
    if (space.uMin > space.uMax) uT = veh.u;   // boxed in on both sides: hold the line
    else uT = clamp(uT, space.uMin, space.uMax);
    c.uTarget = lerp(c.uTarget, uT, 1 - Math.exp(-dt * 2.5));
    const maxDu = 1.0 + veh.v * 0.11;
    const du = clamp((c.uTarget - veh.u) * 1.8, -maxDu, maxDu);
    let uNew = veh.u + du * dt + veh.lat;
    if (space.uMin <= space.uMax) {
      // already overlapping a vehicle alongside (it moved over, or this one was shoved): ease apart, never through
      if (uNew > space.uMax) uNew = Math.max(space.uMax, veh.u - 3 * dt);
      if (uNew < space.uMin) uNew = Math.min(space.uMin, veh.u + 3 * dt);
    }
    if (!Number.isFinite(uNew)) { uNew = c.uTarget = LANE_CENTERS[1]; veh.lat = 0; }
    veh.du = dt > 0 ? (uNew - veh.u) / dt : 0; veh.u = uNew;
    veh.lat *= Math.exp(-dt * 3); veh.latV = 0;
    veh.wobV += (-veh.wob * 9 - veh.wobV * 3.5) * dt; veh.wob += veh.wobV * dt;
    veh.spin += veh.v * dt / (this.kinds.cop?.wheelR || 0.35);
    veh.fade = Math.min(1, veh.fade + dt * 1.5);
    veh.hitT = 0;
    // out of the picture: far behind for a while, or leaving and gone
    if (ahead > 420) c.lost += dt; else c.lost = Math.max(0, c.lost - dt * 2);
    veh.gone = (c.mode === 'leave' && ahead > 300) || ahead > 900 || ahead < -400;
  }
  // (v98) a vehicle standing in the road: a works pick-up in a closed lane, hazards and a beacon going
  spawnParked(name, s, u) {
    if (!this.kinds[name]) return null;
    const veh = this.makeVehicle(1, s, 3, 0);
    const kind = this.kinds[name], spec = TRAFFIC_KINDS[name];
    Object.assign(veh, { kind: name, u, v: 0, v0: 1, parked: true, hitT: 1e9, fade: 0, color: 0xe9e9e6, len: kind.dims[2], halfW: kind.dims[0] / 2 - 0.12, front: kind.dims[2] / 2, rear: kind.dims[2] / 2, mass: spec.mass, lane: LANE_CENTERS.reduce((b, l, k) => (Math.abs(l - u) < Math.abs(LANE_CENTERS[b] - u) ? k : b), 0) });
    veh.from = veh.to = veh.lane;
    this.vehicles.push(veh);
    return veh;
  }
  // road works coming up: put the works pick-up in the closed lanes and note the arrow board as something solid
  syncClosures(sCar) {
    const R = this.world.road;
    for (const cl of R.closures) {
      if (cl.s0 > sCar + 1100 || cl.s1 < sCar - 300) continue;
      if (this.clSeen.has(cl)) continue;
      this.clSeen.add(cl);
      R.ensure(Math.ceil((cl.s1 + 400) / ROAD_DS));
      this.spawnParked('f150', cl.truck.s, cl.truck.u);
      this.statics.push({ static: true, cl, s: cl.board.s, u: cl.board.u, dir: 1, v: 0, du: 0, wob: 0, lat: 0, latV: 0, wobV: 0, hitT: 0, signal: 0, mass: 5000, dims: [2.3, 3.6, 2.2] });
    }
    this.statics = this.statics.filter((st) => st.cl.s1 > sCar - 300 && R.closures.includes(st.cl));
    for (const st of this.statics) { st.v = 0; st.pose = this.pose(st); }
  }
  // the lane closure a vehicle in `lane` is coming up to (or is inside), or null
  closureFor(veh, lane, look = 420) {
    if (veh.dir < 0) return null;
    const cl = this.world.road.closureAt(veh.s, look);
    return cl && cl.lanes.includes(lane) && veh.s < cl.s1 - 30 ? cl : null;
  }

  // ---- driving
  leaderOf(veh, lane, sOverride) {
    // nearest vehicle ahead in a lane (the player included); returns { gap, v }
    const s = sOverride ?? veh.s, dir = veh.dir;
    let best = null, bd = 1e9;
    for (const o of this.vehicles) {
      if (o === veh || o.dir !== dir) continue;
      if (o.lane !== lane && o.to !== lane && o.from !== lane) continue;
      if (o.laneT < 1 && o.from === lane && o.laneT > 0.6) continue;    // already mostly gone from this lane
      const d = (o.s - s) * dir;
      if (d <= 0) continue;
      const gap = d - o.rear - veh.front;
      if (gap < bd) { bd = gap; best = o; }
    }
    const p = this.player;
    if (p.active && dir > 0 && p.lanes.includes(lane)) { const d = p.s - s; if (d > 0) { const gap = d - p.rear - veh.front; if (gap < bd) { bd = gap; best = { v: p.v, player: true }; } } }
    return best ? { gap: bd, v: best.v, o: best } : null;
  }
  followerOf(veh, lane) {
    const dir = veh.dir; let best = null, bd = 1e9;
    for (const o of this.vehicles) {
      if (o === veh || o.dir !== dir || (o.lane !== lane && o.to !== lane)) continue;
      const d = (veh.s - o.s) * dir; if (d <= 0) continue;
      const gap = d - veh.rear - o.front; if (gap < bd) { bd = gap; best = o; }
    }
    const p = this.player;
    if (p.active && dir > 0 && p.lanes.includes(lane)) { const d = veh.s - p.s; if (d > 0) { const gap = d - veh.rear - p.front; if (gap < bd) { bd = gap; best = { v: p.v, player: true, a: 2, b: 3, T: 0.8, v0: Math.max(p.v, 30) }; } } }
    return best ? { gap: bd, o: best } : null;
  }
  idm(veh, v, lead, v0 = veh.v0) {
    const s0 = veh.kind === 'semi' ? 4 : 2.5;
    let acc = veh.a * (1 - Math.pow(Math.max(0, v) / v0, 4));
    if (lead) {
      const ab = Math.max(0.25, veh.a * veh.b), dv = v - lead.v, sStar = s0 + Math.max(0, v * veh.T + v * dv / (2 * Math.sqrt(ab)));
      acc -= Math.max(0.5, veh.a) * Math.pow(sStar / Math.max(lead.gap, 0.3), 2);
    }
    return clamp(acc, -9, veh.a);
  }
  // 1 when a chasing police car is closing on veh from behind in that lane
  copBehind(veh, lane) {
    if (veh.dir < 0) return 0;
    for (const o of this.vehicles) {
      if (!o.cop || (o.cop.mode !== 'chase' && o.cop.mode !== 'pit') || o.lane !== lane) continue;
      const d = veh.s - o.s; if (d > 0 && d < 110 && o.v > veh.v + 2) return 1;   // (v98: from 110 m, was 60: the units can no longer barge through, so drivers clear the way sooner)
    }
    return 0;
  }
  closedAhead(veh, lane) {
    for (const hz of this.hazards) { const d = (hz.s - veh.s) * veh.dir; if (veh.dir > 0 && d > 0 && d < 380 && hz.lanes.includes(lane)) return 1; }
    if (this.closureFor(veh, lane, 520)) return 2;   // (v98) road works: twice as pressing as a spike strip, and from further off
    return 0;
  }
  // clear other drivers out of some lanes over a stretch of road (where a strip is about to go down)
  thin(s0, s1, lanes) {
    for (const v of this.vehicles) if (!v.cop && v.dir > 0 && v.s > s0 && v.s < s1 && (lanes.includes(v.lane) || lanes.includes(v.to))) v.gone = true;
  }
  think(veh) {
    if (veh.laneT < 1 || veh.hitT > 0 || veh.signal) return;
    const spec = TRAFFIC_KINDS[veh.kind];
    const cur = this.leaderOf(veh, veh.lane), aCur = this.idm(veh, veh.v, cur);
    let bestLane = -1, bestGain = 0;
    for (const dl of [-1, 1]) {
      const lane = veh.lane + dl;
      if (lane < 0 || lane > 3) continue;
      if (spec.truck && lane < 2 && !this.closureFor(veh, veh.lane, 520)) continue;   // (a lorry keeps right, unless its lane is shut ahead)
      const lead = this.leaderOf(veh, lane), fol = this.followerOf(veh, lane);
      if (lead && lead.gap < 10 + veh.v * 0.4) continue;
      if (fol) {
        if (fol.gap < 8 + Math.max(0, (fol.o.v - veh.v)) * 2.2) continue;
        const f = fol.o.player ? fol.o : fol.o;
        const aF = this.idm(f.player ? { ...veh, a: 2, b: 3, T: 0.9 } : f, f.v, { gap: fol.gap, v: veh.v }, f.player ? Math.max(f.v, 30) : f.v0);
        if (aF < -2.8) continue;
      }
      const aNew = this.idm(veh, veh.v, lead);
      // keep right: a small bonus for moving right, a threshold for moving left; get out of a lane that a spike
      // strip closes up ahead; and get out of the way of a police car coming up fast behind
      const gain = aNew - aCur + (dl > 0 ? 0.25 : -0.35) - (veh.lane === 0 && dl < 0 ? 9 : 0) + 4 * (this.closedAhead(veh, veh.lane) - this.closedAhead(veh, lane))
        + 6 * (this.copBehind(veh, veh.lane) - this.copBehind(veh, lane));
      if (gain > bestGain) { bestGain = gain; bestLane = lane; }
    }
    if (bestLane >= 0 && Math.random() < 0.85) { veh.to = bestLane; veh.signal = bestLane > veh.lane ? 1 : -1; veh.signalT = rand(0.9, 1.6); }
  }
  updateVehicle(veh, dt) {
    if (veh.cop) return this.updateCop(veh, dt);
    const spec = TRAFFIC_KINDS[veh.kind];
    veh.fade = Math.min(1, veh.fade + dt * 0.8);
    if (veh.parked) { veh.v = 0; veh.acc = 0; veh.brake = false; veh.du = 0; veh.lat *= Math.exp(-dt * 3); veh.latV = 0; veh.wobV += (-veh.wob * 9 - veh.wobV * 3.5) * dt; veh.wob += veh.wobV * dt; veh.hitT = 1e9; return; }
    // lane change: indicate, then move over three seconds or so
    if (veh.signal && veh.laneT >= 1 && veh.to !== veh.lane) {
      veh.signalT -= dt;
      if (veh.signalT <= 0) { veh.from = veh.lane; veh.laneT = 0; }
    }
    if (veh.laneT < 1) {
      veh.laneT = Math.min(1, veh.laneT + dt / veh.lcDur);
      if (veh.laneT >= 0.5 && veh.lane !== veh.to) veh.lane = veh.to;
      if (veh.laneT >= 1) { veh.lane = veh.to; veh.from = veh.to; veh.signal = 0; }
    }
    const k = sstep(0, 1, veh.laneT), uFrom = this.laneU(veh.dir, veh.from), uTo = this.laneU(veh.dir, veh.to);
    // Room for the player: a car you're coming up beside (or about to split past) edges toward the far side of its
    // own lane, so two cars running side by side open a gap you can thread (two sedans leave ~1.7 m between them
    // at their lane centres, less than a car's width; edged over they leave ~3 m). It eases back once you're by.
    {
      const p = this.player;
      let want = 0;
      if (this.giveRoom && p.active && veh.dir > 0 && veh.hitT <= 0) {
        const ds = veh.s - p.s, closing = Math.max(0, p.v - veh.v);
        if (ds > -7 && ds < 12 + closing * 1.6) {
          const du = veh.u - (veh.room || 0) - p.u, adu = Math.abs(du);
          if (adu > 0.9 && adu < 4.6) want = Math.sign(du) * Math.max(0, Math.min(0.75, (LANE - 2 * (veh.halfW + 0.12)) / 2 - 0.05)) * clamp((4.6 - adu) / 1.6, 0, 1);
        }
      }
      veh.room = (veh.room || 0) + (want - (veh.room || 0)) * (1 - Math.exp(-dt * 2.2));
    }
    const uNew = (veh.laneT < 1 ? lerp(uFrom, uTo, k) : this.laneU(veh.dir, veh.lane)) + veh.lat + veh.room;
    veh.du = dt > 0 ? (uNew - veh.u) / dt : 0; veh.u = uNew;
    // following: the worst of the leaders in the lanes it occupies
    let acc;
    if (veh.hitT > 0) { veh.hitT -= dt; acc = veh.v > 0.5 ? -5.5 : 0; if (veh.hitT <= 0) { veh.hitT = 0; veh.signal = 0; } }
    else {
      const lanes = veh.laneT < 1 ? [veh.from, veh.to] : [veh.lane];
      acc = veh.a;
      for (const l of lanes) acc = Math.min(acc, this.idm(veh, veh.v, this.leaderOf(veh, l)));
      // (v98) road works: a driver still in a lane that is shut slows for the drums as for a stopped car, and waits
      // there for a gap to move over
      for (const l of lanes) {
        const cl = this.closureFor(veh, l, 320);
        if (!cl) continue;
        const outer = cl.side > 0 ? l === 3 : l === 0, stop = cl.s0 + cl.taper * (cl.n === 2 ? (outer ? 0.2 : 0.68) : 0.45) - 4, gap = stop - veh.s - veh.front;
        if (gap > 0.5) acc = Math.min(acc, this.idm(veh, veh.v, { gap, v: 0 }));
      }
    }
    veh.acc = lerp(veh.acc, acc, 1 - Math.exp(-dt * 6));
    veh.v = Math.max(0, veh.v + veh.acc * dt);
    veh.s += veh.v * dt * veh.dir;
    veh.brake = veh.acc < -0.9 || (veh.v < 1 && veh.hitT <= 0 && veh.acc < 0.2) || veh.hitT > 0;
    veh.spin += veh.v * dt / (this.kinds[veh.kind]?.wheelR || 0.38);
    // knocked sideways by a hit: settle back into the lane
    veh.latV += (-veh.lat * 3 - veh.latV * 2.6) * dt; veh.lat += veh.latV * dt;
    veh.wobV += (-veh.wob * 9 - veh.wobV * 3.5) * dt; veh.wob += veh.wobV * dt;
    if (veh.hitT <= 0 && veh.laneT >= 1) { veh.think -= dt; if (veh.think <= 0) { veh.think = this.closureFor(veh, veh.lane, 520) ? rand(0.25, 0.6) : rand(0.8, 2.2); this.think(veh); } }
  }

  // ---- placing a vehicle in the world (render space)
  pose(veh) {
    const R = this.world.road, off = this.world.offset;
    const f = R.frameAt(veh.s / ROAD_DS);
    const th = f.th + (veh.dir < 0 ? Math.PI : 0);
    const rx = -Math.cos(f.th), rz = Math.sin(f.th);
    const x = f.x + rx * veh.u - off.x, z = f.z + rz * veh.u - off.z;
    const steer = Math.atan2(veh.du, Math.max(veh.v, 3)) * veh.dir;   // heading into a lane change
    const yaw = th - steer + veh.wob, pitch = -Math.atan(f.g) * veh.dir;
    return { x, y: f.y, z, yaw, pitch, th: f.th };
  }
  setInstance(im, i, x, y, z, yaw, pitch) {
    this.tmpE.set(pitch, yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE);
    this.tmpV.set(x, y, z); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
    im.setMatrixAt(i, this.tmpM);
  }
  local(p, lx, ly, lz) {   // vehicle-local point to render space
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const y2 = ly * cp - lz * sp, z2 = ly * sp + lz * cp;
    return [p.x + cy * lx + sy * z2, p.y + y2, p.z - sy * lx + cy * z2];
  }

  // ---- per frame
  update(dt, ctx) {
    if (!this.ready || !this.enabled) { this.group.visible = false; return; }
    this.group.visible = !ctx.room;
    const W = this.world, L = ctx.loc;
    if (!L) return;
    // the player as a vehicle the drivers react to
    const p = this.player;
    p.active = !ctx.garage; p.s = L.s; p.u = L.u;
    p.v = ctx.speedAlong; p.front = 2.3; p.rear = 2.3;
    p.lanes = []; for (let k = 0; k < 4; k++) if (Math.abs(L.u - LANE_CENTERS[k]) < 2.9) p.lanes.push(k);
    if (!this.populated) { this.populate(L.s, true); this.populated = true; }
    this.spawnTimer -= dt; if (this.spawnTimer <= 0) { this.spawnTimer = 0.25; this.populate(L.s); }
    this.syncClosures(L.s);
    const sub = Math.min(dt, 0.05);
    for (const veh of this.vehicles) this.updateVehicle(veh, sub);
    this.blink = (this.blink + dt) % 0.8;
    this.draw(ctx);
  }
  draw(ctx) {
    for (const k of Object.values(this.kinds)) { k.count[0] = k.count[1] = 0; }
    const cam = ctx.camera.position;
    let nl = 0, nh = 0, nt = 0, nb = 0, nsp = 0;
    const LP = this.lampPos, LC = this.lampCol, LS = this.lampSize;
    const addLamp = (q, r, g, b, size) => { if (nl >= LAMP_MAX) return; LP[nl * 3] = q[0]; LP[nl * 3 + 1] = q[1]; LP[nl * 3 + 2] = q[2]; LC[nl * 3] = r; LC[nl * 3 + 1] = g; LC[nl * 3 + 2] = b; LS[nl] = size; nl++; };
    const blinkOn = this.blink < 0.42;
    const placePart = (kind, p, veh, colorHex) => {
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      const L = d < LOD0_DIST ? 0 : d < LOD1_DIST ? 1 : -1;
      if (L < 0) return d;
      const i = kind.count[L]++;
      if (i >= kind.cap) { kind.count[L]--; return d; }
      for (const im of kind.lods[L]) {
        this.setInstance(im, i, p.x, p.y, p.z, p.yaw, p.pitch);
        if (im.instanceColor) { this.tmpC.setHex(colorHex); im.instanceColor.setXYZ(i, this.tmpC.r, this.tmpC.g, this.tmpC.b); }
        if (im.userData.spin) im.geometry.attributes.aSpin.array[i] = veh.spin;
        if (im.userData.lamp) im.geometry.attributes.aLamp.array[i] = veh.brake ? 9 : 1.6;
      }
      return d;
    };
    for (const veh of this.vehicles) {
      const kind = this.kinds[veh.kind], spec = kind.spec;
      const p = this.pose(veh);
      veh.pose = p;
      // a police car near you is drawn by the game at full detail (veh.hero, decided by the game); the rest here
      const hero = veh.cop && this.copHero && veh.hero;
      veh.inst = !hero;
      const d = hero ? Math.hypot(p.x - cam.x, p.z - cam.z) : placePart(kind, p, veh, veh.color);
      // a tractor pulls its trailer: kingpin over the fifth wheel, rear axles following the lane behind
      let tp = null;
      if (spec.trailer) {
        const tk = this.kinds[spec.trailer], ts = tk.spec;
        const king = this.local(p, 0, 0, spec.fifth);
        const sB = veh.s - (-spec.fifth + ts.kingpin - ts.bogie) * veh.dir;
        const bp = this.pose({ ...veh, s: sB });
        const yaw = Math.atan2(king[0] - bp.x, king[2] - bp.z);
        const c = [king[0] - Math.sin(yaw) * ts.kingpin, 0, king[2] - Math.cos(yaw) * ts.kingpin];
        tp = { x: c[0], y: lerp(p.y, bp.y, 0.5), z: c[2], yaw, pitch: p.pitch };
        veh.trailerPose = tp;
        placePart(tk, tp, veh, veh.trailerColor);
      }
      // lamps: glows that face the way the lamp points, so headlights glare only toward you
      if (d > 2200) continue;
      const f = veh.fade;
      const toCam = (q) => { const dx = cam.x - q[0], dy = cam.y - q[1], dz = cam.z - q[2], l = Math.hypot(dx, dy, dz) || 1; return (Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz) / l; };
      const hz = veh.hitT > 0;
      for (const side of [-1, 1]) {
        const h = spec.head;
        if (h) {
          const q = this.local(p, h[0] * side, h[1], h[2]); const a = sstep(-0.15, 0.7, toCam(q));
          addLamp(q, 1.0 * f * (0.08 + a), 0.92 * f * (0.08 + a), 0.8 * f * (0.08 + a), 1.7 + 1.6 * a);
          // indicators at the front corners
          if ((veh.signal === side * -1 || hz) && blinkOn) addLamp(this.local(p, (h[0] + 0.12) * side, h[1] - 0.02, h[2] - 0.05), 1.0 * f, 0.42 * f, 0.04 * f, 1.1);
        }
        const tPose = tp || p, t = tp ? this.kinds.trailer.spec.tail : spec.tail;
        if (t) {
          const q = this.local(tPose, t[0] * side, t[1], t[2]); const back = -toCam(q) * (tp ? 1 : 1);
          const a = sstep(-0.2, 0.6, back), br = veh.brake ? 3.2 : 1;
          addLamp(q, 0.75 * f * br * (0.15 + a), 0.02 * f * br * (0.15 + a), 0.01 * f * br * (0.15 + a), (0.9 + 0.5 * a) * (veh.brake ? 1.45 : 1));
          if ((veh.signal === side * -1 || hz) && blinkOn) addLamp(this.local(tPose, (t[0] - 0.05) * side, t[1] - 0.12, t[2]), 1.0 * f, 0.38 * f, 0.03 * f, 1.0);
        }
      }
      if (veh.cop && spec.beacon) {
        // red and blue trade sides four times a second, with a double flash; the pattern is per car
        const ph = ((this.blink / 0.8) * 2.4 + veh.cop.phase) % 1, left = ph < 0.5, pulse = (ph % 0.5) < 0.18 || ((ph % 0.5) > 0.24 && (ph % 0.5) < 0.38) ? 1 : 0.12;
        for (const side of [-1, 1]) {
          const q = this.local(p, spec.beacon[0] * side, spec.beacon[1], spec.beacon[2]);
          const red = (side > 0) === left, k = pulse * f * 2.2;
          addLamp(q, red ? k : 0.08 * k, red ? 0.05 * k : 0.25 * k, red ? 0.04 * k : k, 1.6 + 1.6 * pulse);
          if (veh.cop.near) { const q2 = this.local(p, spec.beacon[0] * side * 0.5, spec.beacon[1] + 0.05, spec.beacon[2]); addLamp(q2, red ? k * 0.5 : 0, 0, red ? 0 : k * 0.5, 3.5 * pulse); }
        }
        veh.cop.flash = left ? 1 : -1; veh.cop.pulse = pulse;
      }
      if (veh.parked) { const ph = (this.blink / 0.8 * 2) % 1; if (ph < 0.3) addLamp(this.local(p, 0, kind.dims[1] + 0.12, -0.2), 2.2 * f, 1.05 * f, 0.1 * f, 2.6); }   // (v98) the works pick-up's amber beacon
      if (spec.markers) for (const m of spec.markers) { const q = this.local(p, m[0], m[1], m[2]); addLamp(q, 1.0 * f * 0.55, 0.45 * f * 0.55, 0.06 * f * 0.55, 0.55); }
      if (tp) for (const m of this.kinds.trailer.spec.rearMarkers) { const q = this.local(tp, m[0], m[1], m[2]); addLamp(q, 0.8 * f * 0.6, 0.02 * f * 0.6, 0.01 * f * 0.6, 0.5); }
      // pools of light on the road
      if (d < 420 && nh < this.headPool.instanceMatrix.count) {
        const len = 36, wid = 11, q = this.local(p, 0, 0, (spec.head ? spec.head[2] : 2.3) + len * 0.46);
        this.tmpE.set(p.pitch, p.yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(q[0], q[1] + 0.04, q[2]); this.tmpS.set(wid, 1, len);
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.headPool.setMatrixAt(nh, this.tmpM);
        const g = 0.55 * f; this.headPool.instanceColor.setXYZ(nh, g, g * 0.92, g * 0.8); nh++;
        this.tmpS.set(1, 1, 1);
      }
      if (d < this.beamRange && spec.head && nb < this.beams.instanceMatrix.count - 2) {
        // fade in over the last quarter of the range so beams never pop
        const bf = f * (1 - sstep(this.beamRange * 0.72, this.beamRange, d));
        for (const side of [-1, 1]) {
          const h = spec.head, q = this.local(p, h[0] * side, h[1], h[2] + 0.1);
          this.tmpE.set(p.pitch + 0.035, p.yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(q[0], q[1], q[2]); this.tmpS.set(3.2, 1.6, 30);
          this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.beams.setMatrixAt(nb, this.tmpM); this.beams.instanceColor.setXYZ(nb, bf, 0.93 * bf, 0.82 * bf); nb++;
        }
        this.tmpS.set(1, 1, 1);
      }
      if (d < 260 && nt < this.tailPool.instanceMatrix.count) {
        const tPose = tp || p, t = tp ? this.kinds.trailer.spec.tail : spec.tail;
        const q = this.local(tPose, 0, 0, t[2] - 2.4);
        this.tmpE.set(tPose.pitch, tPose.yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(q[0], q[1] + 0.04, q[2]); this.tmpS.set(4.2, 1, 5.5);
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tailPool.setMatrixAt(nt, this.tmpM);
        const g = (veh.brake ? 0.22 : 0.05) * f; this.tailPool.instanceColor.setXYZ(nt, g, g * 0.03, g * 0.02); nt++;
        this.tmpS.set(1, 1, 1);
      }
      // (no spray plumes behind cars in the rain since v27.2: the user found them odd; this.spray stays empty)
    }
    if (ctx.playerBeams) for (const b of ctx.playerBeams) {
      this.tmpE.set(b.pitch, b.yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(b.x, b.y, b.z); this.tmpS.set(b.r, b.r * 0.5, b.len);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.beams.setMatrixAt(nb, this.tmpM); this.beams.instanceColor.setXYZ(nb, b.c[0], b.c[1], b.c[2]); nb++;
      this.tmpS.set(1, 1, 1);
    }
    // the player's own brake lights go through the same halos
    if (ctx.playerLamps) for (const l of ctx.playerLamps) addLamp(l.p, l.c[0], l.c[1], l.c[2], l.size);
    if (ctx.playerPool) {
      const pp = ctx.playerPool;
      this.tmpE.set(pp.pitch, pp.yaw, 0, 'YXZ'); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(pp.x, pp.y + 0.04, pp.z); this.tmpS.set(4.2, 1, 5.5);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tailPool.setMatrixAt(nt, this.tmpM); this.tailPool.instanceColor.setXYZ(nt, pp.g, pp.g * 0.03, pp.g * 0.02); nt++;
      this.tmpS.set(1, 1, 1);
    }
    for (const k of Object.values(this.kinds)) for (let L = 0; L < 2; L++) {
      const lod = k.lods[L], n = k.count[L];
      for (const im of lod) { im.count = n; im.visible = n > 0; }
      if (!n || !lod.length) continue;
      // one bounding sphere round this LOD's instances (its meshes share them), so a view they're not in (the
      // rear-view mirror, mostly) skips them instead of drawing every car twice
      const s = (k.spheres ||= [new THREE.Sphere(), new THREE.Sphere()])[L], a = lod[0].instanceMatrix.array;
      if (!k.geoR) k.geoR = [0, 1].map((l) => Math.max(0, ...k.lods[l].map((im) => { const g = im.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.center.length() + g.boundingSphere.radius; })));
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) { const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      s.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      let r2 = 0; for (let i = 0; i < n; i++) r2 = Math.max(r2, (a[i * 16 + 12] - s.center.x) ** 2 + (a[i * 16 + 13] - s.center.y) ** 2 + (a[i * 16 + 14] - s.center.z) ** 2);
      s.radius = Math.sqrt(r2) + k.geoR[L];
      for (const im of lod) {
        im.boundingSphere = s; im.frustumCulled = true;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        if (im.userData.spin) im.geometry.attributes.aSpin.needsUpdate = true;
        if (im.userData.lamp) im.geometry.attributes.aLamp.needsUpdate = true;
      }
    }
    this.lampN = nl;
    const g = this.lampPts.geometry; g.setDrawRange(0, nl);
    for (const k of ['position', 'color', 'aSize']) { const a = g.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, nl * a.itemSize); }
    this.headPool.count = nh; this.tailPool.count = nt; this.beams.count = nb;
    this.spray.count = nsp; this.spray.visible = nsp > 0; this.spray.instanceMatrix.needsUpdate = true; this.spray.instanceColor.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true; this.beams.instanceColor.needsUpdate = true;
    this.headPool.instanceMatrix.needsUpdate = this.tailPool.instanceMatrix.needsUpdate = true;
    this.headPool.instanceColor.needsUpdate = this.tailPool.instanceColor.needsUpdate = true;
  }

  // ---- contact with the player's car: oriented boxes in the ground plane
  collide(car, dims, onHit) {
    if (!this.ready || !this.enabled || !(this.vehicles.length + this.statics.length)) return null;
    const pyaw = car.yaw, pc = Math.cos(pyaw), ps = Math.sin(pyaw);
    // Forgiving sides (v27.2): the boxes are measured over the door mirrors, so threading a gap clipped mirrors that
    // weren't touching anything. The player's box loses 12 cm a side, a civilian's 16 cm (police cars keep 10).
    const A = { x: car.x + ps * (dims.front - dims.rear) / 2, z: car.z + pc * (dims.front - dims.rear) / 2, hx: dims.hw - 0.12, hz: (dims.front + dims.rear) / 2, yaw: pyaw };
    let result = null;
    for (const veh of (this.statics.length ? this.vehicles.concat(this.statics) : this.vehicles)) {
      const parts = [[veh.pose, veh.dims || this.kinds[veh.kind].dims]];
      if (veh.trailerPose) parts.push([veh.trailerPose, this.kinds.trailer.dims]);
      for (const [p, dm] of parts) {
        if (!p || !Number.isFinite(p.x + p.z + p.yaw)) continue;
        if (!(Math.abs(p.x - A.x) <= 14 && Math.abs(p.z - A.z) <= 14)) continue;
        const B = { x: p.x, z: p.z, hx: dm[0] / 2 - (veh.cop ? 0.1 : 0.16), hz: dm[2] / 2 - 0.05, yaw: p.yaw };
        const hit = obb(A, B);
        if (!hit) continue;
        veh.ccHit = true;   // contact spoils a close call
        // push the player out, then trade an impulse along the contact normal
        const { nx, nz, depth, cx, cz } = hit;            // normal points from B into A
        car.x += nx * depth; car.z += nz * depth;
        const m1 = dims.mass, I1 = dims.Iz, m2 = veh.mass * (p === veh.trailerPose ? 0.7 : 1);
        let Vx = ps * car.vx + pc * car.vy, Vz = pc * car.vx - ps * car.vy, w = car.r;
        const rx = cx - car.x, rz = cz - car.z;
        const fx = Math.sin(veh.pose.yaw), fz = Math.cos(veh.pose.yaw);
        const vB = veh.v; const VBx = fx * vB, VBz = fz * vB;
        const rvx = Vx + w * rz - VBx, rvz = Vz - w * rx - VBz;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          // a graze (a civilian touched at under 3 m/s across the contact) only nudges you apart: little bounce,
          // little scrape, a third of the twist, so a clipped corner doesn't spin you out. Hits and the police
          // (a PIT is meant to turn you) keep the full response.
          const graze = !veh.cop && vn > -3, kSpin = graze ? 0.35 : 1;
          const lam = rz * nx - rx * nz;
          const e = graze ? 0.08 : 0.22, J = -(1 + e) * vn / (1 / m1 + lam * lam / I1 + 1 / m2);
          Vx += J * nx / m1; Vz += J * nz / m1; w += kSpin * lam * J / I1;
          // scraping friction
          const tx = -nz, tz = nx, vt = rvx * tx + rvz * tz, lamT = rz * tx - rx * tz, mu = graze ? 0.1 : 0.35;
          const Jt = clamp(-vt / (1 / m1 + lamT * lamT / I1 + 1 / m2), -mu * J, mu * J);
          Vx += Jt * tx / m1; Vz += Jt * tz / m1; w += kSpin * lamT * Jt / I1;
          car.vx = Vx * ps + Vz * pc; car.vy = Vx * pc - Vz * ps; car.r = clamp(w, -4, 4);
          // the other car: along its heading, and a shove sideways it recovers from
          const dvAlong = -(J * (nx * fx + nz * fz)) / m2, dvSide = -(J * (nx * -fz + nz * fx)) / m2;
          veh.v = Math.max(0, veh.v + dvAlong);
          veh.latV += dvSide * veh.dir * 0.9; veh.wobV += clamp(-lam * J / (m2 * 3), -2, 2);
          const impact = J / m1;
          if (impact > 1.2) { veh.hitT = Math.max(veh.hitT, impact > 4 ? 9 : 5); veh.signal = 0; }
          result = { impact, scrape: Math.abs(vt), x: cx, z: cz, y: p.y };
          if (onHit) onHit(result, veh);
        }
      }
    }
    return result;
  }
  // Close calls: slipping past another vehicle with little room to spare and without touching it. Each vehicle
  // is watched while the player is alongside it; when the player has gone by, the tightest gap and the speed
  // difference are scored. Returns this frame's events.
  closeCalls(car, dims) {
    const out = [];
    if (!this.ready || !this.enabled) return out;
    const pc = Math.cos(car.yaw), ps = Math.sin(car.yaw);
    const A = { x: car.x + ps * (dims.front - dims.rear) / 2, z: car.z + pc * (dims.front - dims.rear) / 2, hx: dims.hw, hz: (dims.front + dims.rear) / 2, yaw: car.yaw };
    const Vx = ps * car.vx + pc * car.vy, Vz = pc * car.vx - ps * car.vy;
    for (const veh of this.vehicles) {
      const p = veh.pose; if (!p) continue;
      if (Math.abs(p.x - A.x) > 40 || Math.abs(p.z - A.z) > 40) { veh.cc = null; veh.ccHit = false; continue; }
      const parts = [[p, this.kinds[veh.kind].dims]];
      if (veh.trailerPose) parts.push([veh.trailerPose, this.kinds.trailer.dims]);
      let gap = Infinity, beside = false;
      for (const [q, dm] of parts) {
        if (!q) continue;
        const B = { x: q.x, z: q.z, hx: dm[0] / 2, hz: dm[2] / 2, yaw: q.yaw };
        gap = Math.min(gap, boxGap(A, B));
        // alongside: the two overlap along the other vehicle's length (with a little slack)
        const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), along = (A.x - q.x) * fx + (A.z - q.z) * fz;
        const reach = B.hz + A.hz * Math.abs(Math.cos(A.yaw - q.yaw)) + A.hx * Math.abs(Math.sin(A.yaw - q.yaw)) + 0.4;
        if (Math.abs(along) < reach) beside = true;
      }
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rel = Math.hypot(Vx - fx * veh.v, Vz - fz * veh.v);
      if (beside && gap < 2.0 && car.speed > 13) {
        if (!veh.cc) veh.cc = { min: gap, rel, hit: false };
        else { veh.cc.min = Math.min(veh.cc.min, gap); veh.cc.rel = Math.max(veh.cc.rel, rel); }
      }
      if (veh.cc) {
        if (veh.ccHit) veh.cc.hit = true;
        if (!beside || gap > 3.5) {
          const c = veh.cc; veh.cc = null;
          if (!c.hit && c.min < 1.5 && c.rel > 6) out.push({ gap: c.min, rel: c.rel, kind: veh.kind, truck: veh.kind === 'semi', oncoming: veh.dir < 0 });
        }
      }
      veh.ccHit = false;
    }
    return out;
  }
  // how loud the rush of passing traffic is at the player's car: close, beside you, and fast relative to you
  passby(x, z, yaw, v) {
    if (!this.ready) return null;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let level = 0, pitch = 0;
    for (const veh of this.vehicles) {
      const p = veh.pose; if (!p) continue;
      const dx = p.x - x, dz = p.z - z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      const along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      const vAlong = veh.v * (Math.sin(p.yaw) * fx + Math.cos(p.yaw) * fz), rel = Math.abs(vAlong - v);
      const half = this.kinds[veh.kind].dims[2] / 2 + (veh.trailerPose ? 8 : 0);
      const near = clamp(1 - (side - 1.6) / 6, 0, 1) * Math.exp(-Math.pow(along / (half + 5), 2));
      const k = near * clamp(rel / 28, 0, 1.3) * (veh.kind === 'semi' ? 1.5 : 1);
      level += k; pitch = Math.max(pitch, clamp(rel / 60, 0, 1) * near);
    }
    return { level: Math.min(level, 1.5), pitch };
  }
  // nearest traffic around the player (for camera/audio effects and tests)
  nearest(x, z) { let best = null, bd = 1e9; for (const v of this.vehicles) { if (!v.pose) continue; const d = Math.hypot(v.pose.x - x, v.pose.z - z); if (d < bd) { bd = d; best = v; } } return best ? { veh: best, d: bd } : null; }
  reset() { this.vehicles = []; this.populated = false; this.hazards = []; this.statics = []; this.clSeen.clear(); }
  stats() {
    const per = {}; for (const v of this.vehicles) per[v.kind] = (per[v.kind] || 0) + 1;
    let calls = 0, tris = 0;
    for (const k of Object.values(this.kinds)) for (let L = 0; L < 2; L++) for (const im of k.lods[L]) if (im.visible) { calls++; tris += (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3 * im.count; }
    return { n: this.vehicles.length, same: this.vehicles.filter((v) => v.dir > 0).length, per, lamps: this.lampN, calls, tris: Math.round(tris) };
  }
}

// how far apart two boxes are (a lower bound from the separating axes; 0 when they touch)
function boxGap(A, B) {
  const axes = [[Math.cos(A.yaw), -Math.sin(A.yaw)], [Math.sin(A.yaw), Math.cos(A.yaw)], [Math.cos(B.yaw), -Math.sin(B.yaw)], [Math.sin(B.yaw), Math.cos(B.yaw)]];
  const dx = A.x - B.x, dz = A.z - B.z;
  const proj = (o, ax) => o.hx * Math.abs(Math.cos(o.yaw) * ax[0] - Math.sin(o.yaw) * ax[1]) + o.hz * Math.abs(Math.sin(o.yaw) * ax[0] + Math.cos(o.yaw) * ax[1]);
  let g = 0;
  for (const ax of axes) g = Math.max(g, Math.abs(dx * ax[0] + dz * ax[1]) - proj(A, ax) - proj(B, ax));
  return g;
}
// separating axis test for two boxes in the x-z plane; returns the push-out normal for A (from B), depth and a
// contact point
function obb(A, B) {
  const axes = [[Math.cos(A.yaw), -Math.sin(A.yaw)], [Math.sin(A.yaw), Math.cos(A.yaw)], [Math.cos(B.yaw), -Math.sin(B.yaw)], [Math.sin(B.yaw), Math.cos(B.yaw)]];
  const dx = A.x - B.x, dz = A.z - B.z;
  let best = 1e9, bn = null;
  const proj = (o, ax) => { const r = [Math.cos(o.yaw), -Math.sin(o.yaw)], f = [Math.sin(o.yaw), Math.cos(o.yaw)]; return o.hx * Math.abs(r[0] * ax[0] + r[1] * ax[1]) + o.hz * Math.abs(f[0] * ax[0] + f[1] * ax[1]); };
  for (const ax of axes) {
    const d = dx * ax[0] + dz * ax[1], o = proj(A, ax) + proj(B, ax) - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; bn = d >= 0 ? ax : [-ax[0], -ax[1]]; }
  }
  if (!bn) return null;   // a non-finite box (no axis compared): no contact
  // contact point: the corner of A deepest into B (or B's into A), roughly
  const corner = (o, sx, sz) => { const r = [Math.cos(o.yaw), -Math.sin(o.yaw)], f = [Math.sin(o.yaw), Math.cos(o.yaw)]; return [o.x + r[0] * o.hx * sx + f[0] * o.hz * sz, o.z + r[1] * o.hx * sx + f[1] * o.hz * sz]; };
  let cp = null, cd = 1e9;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = corner(A, sx, sz), d = (c[0] - B.x) * bn[0] + (c[1] - B.z) * bn[1]; if (d < cd) { cd = d; cp = c; } }
  if (!cp) return null;
  return { nx: bn[0], nz: bn[1], depth: best, cx: cp[0], cz: cp[1] };
}
