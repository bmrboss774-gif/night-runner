// The collection's cars (v105): a car as its owner built it, captured for the tower.
// The owner: "I want every car to be loaded how it is based on your mods and look how it looks in the game and I want all
// the headlights to be on ... the cars should have good quality from far away and they shouldnt have to be loaded".
// The tower cannot hold 23 real models (80 MB to fetch, six million triangles), and a copy made ahead of time cannot know
// the wheels, wing or carbon its owner chose. So the copy is made from the real car, here in the browser, each time its
// build changes while it is in the workshop: gatherRig reads every piece the car is showing, sorted into six surfaces
// with their colours (and textures, sampled at each corner) in the corners; a worker simplifies that to about 26,000
// triangles; the result is kept in the browser's own storage (IndexedDB) and stands in the car's bay from then on. A car
// never touched stands there as the stock copy shipped with the game (showroom-cars.txt, made the same way).
import * as THREE from 'three';

export const LOD_PARTS = ['paint', 'glass', 'metal', 'gloss', 'matte', 'lamp'];
const pxCache = new Map();
function pixels(tex) {
  if (!tex || !tex.image) return null;
  if (pxCache.has(tex.uuid)) return pxCache.get(tex.uuid);
  let out = null;
  try {
    const w = Math.min(256, tex.image.width || 1), h = Math.min(256, tex.image.height || 1), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(tex.image, 0, 0, w, h); out = { d: x.getImageData(0, 0, w, h).data, w, h, flipY: tex.flipY, rep: tex.repeat, off: tex.offset };
  } catch (e) { out = null; }
  pxCache.set(tex.uuid, out); return out;
}
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const c4 = [1, 1, 1, 1];
function sample(px, u, v) {
  u = u * px.rep.x + px.off.x; v = v * px.rep.y + px.off.y;
  u -= Math.floor(u); v -= Math.floor(v); if (px.flipY) v = 1 - v;
  const i = (Math.min(px.h - 1, Math.floor(v * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
  c4[0] = LIN[px.d[i]]; c4[1] = LIN[px.d[i + 1]]; c4[2] = LIN[px.d[i + 2]];
}
const lum = (c, k = 1) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * k;

// Every piece the car is showing, in the car's own frame (`top` = the group the car hangs in). The headlights are read
// as lit whatever the build's light switch says: `head` = the materials of the headlamps (r.lamps.head, r.mats.headLens).
export function gatherRig(r, top, { head = [], headLevel = 2.6 } = {}) {
  top.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(top.matrixWorld).invert(), M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3();
  const headSet = new Set(head), driver = r.driver || null, list = [], size = {};
  const shown = (o) => { for (let p = o; p && p !== top.parent; p = p.parent) if (!p.visible) return false; return true; };
  top.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    for (let p = o; p; p = p.parent) if (p === driver) return;
    const m = o.material; if (!m || Array.isArray(m) || o.userData.kind === 'glow' || m.blending === THREE.AdditiveBlending) return;
    const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal; if (!P || !Nn) return;
    let b;
    if (m.isMeshBasicMaterial) { if (m.transparent || Math.max(m.color.r, m.color.g, m.color.b) <= 1) return; b = 'lamp'; }   // the lit outlines of the running lights
    else if (!m.isMeshStandardMaterial) return;
    else if (headSet.has(m) || lum(m.emissive, m.emissiveIntensity || 0) > 0.6) b = 'lamp';
    else if (m === r.mats.paint) b = 'paint';
    else if (r.mats.glass.has(m) || o.userData.kind === 'glass' || o.userData.kind === 'lampGlass' || (m.transparent && m.opacity < 0.85)) b = 'glass';
    else b = m.metalness > 0.5 ? 'metal' : m.roughness < 0.45 ? 'gloss' : 'matte';
    const nv = P.count, ni = g.index ? g.index.count : P.count; const s = (size[b] ||= { v: 0, i: 0 }); s.v += nv; s.i += ni - ni % 3;
    list.push([o, b]);
  });
  const parts = {}, at = {};
  for (const b in size) { parts[b] = { pos: new Float32Array(size[b].v * 3), nor: new Float32Array(size[b].v * 3), col: new Float32Array(size[b].v * 3), idx: new Uint32Array(size[b].i) }; at[b] = { v: 0, i: 0 }; }
  let tris = 0;
  for (const [o, b] of list) {
    const m = o.material, g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, UV = g.attributes.uv, part = parts[b], a = at[b], v0 = a.v;
    M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
    const px = m.map && m.name !== 'carbon' ? pixels(m.map) : null, ex = b === 'lamp' && m.emissiveMap ? pixels(m.emissiveMap) : null;
    let cr = m.color.r, cg = m.color.g, cb = m.color.b, er = 0, eg = 0, eb = 0;
    // (the game's carbon weave is drawn by its shader, on a white base: read as it was, a carbon hood came out white)
    const carbon = m.name === 'carbon'; if (carbon) { cr = 0.028; cg = 0.03; cb = 0.034; }
    if (b === 'lamp') {
      // a lamp: its light, brought to an even, modest level (the owner: "not incredibly bright")
      if (m.isMeshBasicMaterial) { const k = 1 / Math.max(cr, cg, cb); cr *= k; cg *= k; cb *= k; }
      else { const e = m.emissive, on = lum(e) > 0.02, k = on ? 1 / Math.max(e.r, e.g, e.b, 1e-3) : 1; cr = on ? e.r * k : 1; cg = on ? e.g * k : 0.97; cb = on ? e.b * k : 0.92; }
    } else if (m.emissive) { const ei = Math.min(1, m.emissiveIntensity || 0) * 0.5; er = m.emissive.r * ei; eg = m.emissive.g * ei; eb = m.emissive.b * ei; }
    const plain = b === 'paint' && !px;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M); part.pos[a.v * 3] = v.x; part.pos[a.v * 3 + 1] = v.y; part.pos[a.v * 3 + 2] = v.z;
      v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); part.nor[a.v * 3] = v.x; part.nor[a.v * 3 + 1] = v.y; part.nor[a.v * 3 + 2] = v.z;
      let R = cr, G = cg, B = cb;
      if (plain) R = G = B = 1;
      else if (b === 'lamp') { if (ex && UV) { sample(ex, UV.getX(i), UV.getY(i)); const k = 0.04 + 0.96 * Math.max(c4[0], c4[1], c4[2]); R *= k; G *= k; B *= k; } }   // (only what the lamp's own picture lights: the reflector's dark parts stay dark)
      else { if (px && UV) { sample(px, UV.getX(i), UV.getY(i)); R *= c4[0]; G *= c4[1]; B *= c4[2]; } R = Math.min(1, R + er); G = Math.min(1, G + eg); B = Math.min(1, B + eb); }
      part.col[a.v * 3] = R; part.col[a.v * 3 + 1] = G; part.col[a.v * 3 + 2] = B; a.v++;
    }
    const ix = g.index, ni = ix ? ix.count : P.count, n3 = ni - ni % 3;
    for (let k = 0; k < n3; k++) part.idx[a.i++] = v0 + (ix ? ix.getX(k) : k);
    tris += n3 / 3;
  }
  pxCache.clear();
  return { parts, tris: Math.round(tris), bounds: r.bounds ? [r.bounds.min.toArray(), r.bounds.max.toArray()] : null };
}

// ---- the simplifying: in a worker; on the page itself if a worker cannot be started
let worker = null, workerBad = false, jobs = new Map(), seq = 0;
export function simplify(raw, target = 26000) {
  if (!worker && !workerBad) {
    try {
      worker = new Worker(new URL('./lod-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); if (e.data.error) j.no(new Error(e.data.error)); else j.ok(e.data.parts); };
      worker.onerror = () => { workerBad = true; worker = null; for (const j of jobs.values()) j.retry(); jobs.clear(); };
    } catch (e) { workerBad = true; worker = null; }
  }
  const onPage = () => import('./lod-core.js').then((m) => m.simplifyParts(raw.parts, target));
  if (!worker) return onPage();
  return new Promise((ok, no) => { const id = ++seq; jobs.set(id, { ok, no, retry: () => onPage().then(ok, no) }); worker.postMessage({ id, parts: raw.parts, target }); });
}

// ---- a copy as something to draw: `mats` = { paint, glass, metal, gloss, matte, lamp } materials
export function lodObject(parts, mats) {
  const grp = new THREE.Group();
  for (const p of parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 3, true)); g.setAttribute('color', new THREE.BufferAttribute(p.col, 3, true)); g.setIndex(new THREE.BufferAttribute(p.idx, 1));
    const m = new THREE.Mesh(g, mats[p.name] || mats.matte); m.name = p.name; m.castShadow = m.receiveShadow = false; grp.add(m);
  }
  return grp;
}

// ---- kept between visits (IndexedDB: one record a car, { id, carId, sig, at, parts })
const DB = 'night-runner-lod', STORE = 'cars';
const open = () => new Promise((ok, no) => { let q; try { q = indexedDB.open(DB, 1); } catch (e) { no(e); return; } q.onupgradeneeded = () => q.result.createObjectStore(STORE, { keyPath: 'id' }); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
export async function lodLoadAll() { try { const db = await open(); return await new Promise((ok) => { const q = db.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }); } catch (e) { return []; } }
export async function lodSave(rec) { try { const db = await open(); await new Promise((ok) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(rec); t.oncomplete = ok; t.onerror = ok; t.onabort = ok; }); } catch (e) { /* storage full or switched off: the copy still stands for this visit */ } }
export async function lodDelete(id) { try { const db = await open(); await new Promise((ok) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(id); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* nothing kept */ } }
