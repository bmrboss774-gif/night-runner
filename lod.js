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

export const LOD_PARTS = ['paint', 'glass', 'metal', 'gloss', 'matte', 'lamp', 'head', 'drl', 'lens'];
export const LAMP_MAX = 6.4;   // a switched lamp's light is kept as a share of this level (the brightest in the game: a running-light strip at 6)
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

// Every piece the car is showing, in the car's own frame (`top` = the group the car hangs in).
// The lamps (v108). v107 read them as the car stood when its copy was made, so a car's copy only had the lights its menu
// says once the car itself had been in the workshop; every other car stood in the tower with white lights, on. The owner:
// "its not working correctly, the cars arent loading with the correct lights, ensure that the lights on the cars are
// exactly as they are within the players car menu ... make sure the color is correct and the options are set". So the
// copy no longer holds a light setting at all. The headlamps (`head`: r.lamps.head, r.mats.headLens; the MK2 projectors)
// and the running lights (`drl`: the strips' materials; the G80 and MK2 outlines) are surfaces of their own, 'head' and
// 'drl', with four numbers a corner: the surface's own colour as it looks switched off, and how much of the lamp's light
// that corner gives. The tower switches and colours them from each car's saved build (showroom.js setLights), and the
// `headDark`: the housing gives no light (the MK2 style).
// (v109: no bulbs. v106 put a small white ball of light in each headlamp so a lamp whose light is faint still read as on. The
// owner: "make sure that there are no white bulbs that was what I was trying to get rid of dont replace them with white bulbs if u
// cant see them just keep them the same". A copy's lamps are the real car's lamps and nothing else; one that is faint on the car
// is faint here. `bulbs` is left for a look at the old way only; lodObject leaves the bulbs out of copies made before.)
export function gatherRig(r, top, { head = [], drl = [], lens = [], headDark = false, bulbs = false } = {}) {
  top.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(top.matrixWorld).invert(), M = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3();
  const headSet = new Set(head), drlSet = new Set(drl), lensSet = new Set(lens), driver = r.driver || null, list = [], size = {};
  const stockLit = (m) => { const s = m.userData.stock; return s && s.emissive ? lum(s.emissive, s.emissiveIntensity || 0) > 0.35 : lum(m.emissive, m.emissiveIntensity || 0) > 0.35; };   // would it shine with the headlights on (whatever the switch says now)
  const shown = (o) => { for (let p = o; p && p !== top.parent; p = p.parent) if (!p.visible) return false; return true; };
  top.traverse((o) => {
    if (!o.isMesh) return;
    const kind = o.userData.kind;
    if (kind === 'mk2beam' ? !shown(o.parent) : !shown(o)) return;   // (the MK2 projectors are hidden while the headlights are off: still part of the copy)
    for (let p = o; p; p = p.parent) if (p === driver) return;
    const m = o.material; if (!m || Array.isArray(m) || o.userData.kind === 'glow' || m.blending === THREE.AdditiveBlending) return;
    // (v106: the clear covers over the lamps are left off the copy. Its glass is drawn dark and solid, and a cover of that over a
    // lamp hid the lit lamp behind it: most of the cars stood in the tower with their lights seemingly off.)
    if (o.userData.kind === 'lampGlass' || / \(lamp cover\)$/.test(m.name)) return;
    const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal; if (!P || (!Nn && !m.isMeshBasicMaterial)) return;   // (a lit outline needs no normals: the MK2 rings have none, and v107 left them off the copy)
    let b;
    if (kind === 'g80' || kind === 'mk2') b = 'drl';
    else if (kind === 'mk2beam') b = 'head';
    else if (m.isMeshBasicMaterial) { if (m.transparent || Math.max(m.color.r, m.color.g, m.color.b) <= 1) return; b = 'lamp'; }   // the lit outlines of the running lights
    else if (!m.isMeshStandardMaterial) return;
    else if (drlSet.has(m) || kind === 'drl') b = 'drl';
    // (v109) the lit lens inside some headlamps (`lens`: r.mats.headLens; the Corvette's strip, the M4's): a third switched surface.
    // The game lights it faintly as it comes and at 0.6 in a chosen colour; left as dark glass it hid the lamp behind it.
    else if (lensSet.has(m) || kind === 'headLens') b = 'lens';
    else if ((headSet.has(m) || kind === 'head') && !headDark && stockLit(m)) b = 'head';
    else if (lum(m.emissive, m.emissiveIntensity || 0) > 0.35 && !headSet.has(m) && kind !== 'head' && kind !== 'headLens') b = 'lamp';   // whatever else is giving light as the car stands
    else if (m === r.mats.paint) b = 'paint';
    else if (r.mats.glass.has(m) || o.userData.kind === 'glass' || o.userData.kind === 'lampGlass' || (m.transparent && m.opacity < 0.85)) b = 'glass';
    else b = m.metalness > 0.5 ? 'metal' : m.roughness < 0.45 ? 'gloss' : 'matte';
    const nv = P.count, ni = g.index ? g.index.count : P.count; const s = (size[b] ||= { v: 0, i: 0 }); s.v += nv; s.i += ni - ni % 3;
    list.push([o, b]);
  });
  const parts = {}, at = {};
  const CS = (b) => (b === 'head' || b === 'drl' || b === 'lens' ? 4 : 3);   // numbers a corner in its colour
  for (const b in size) { parts[b] = { pos: new Float32Array(size[b].v * 3), nor: new Float32Array(size[b].v * 3), col: new Float32Array(size[b].v * CS(b)), idx: new Uint32Array(size[b].i) }; at[b] = { v: 0, i: 0 }; }
  let tris = 0;
  const side = [{ x: 0, y: 0, n: 0, z: -1e9 }, { x: 0, y: 0, n: 0, z: -1e9 }];   // the headlamps, left and right: where their middles are
  for (const [o, b] of list) {
    const m = o.material, g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, UV = g.attributes.uv, part = parts[b], a = at[b], v0 = a.v;
    M.multiplyMatrices(inv, o.matrixWorld); N.getNormalMatrix(M);
    const sw = b === 'head' || b === 'drl' || b === 'lens', basic = m.isMeshBasicMaterial, cs = CS(b);   // sw: a lamp the tower switches
    const px = m.map && m.name !== 'carbon' ? pixels(m.map) : null, ex = b === 'lamp' || sw ? pixels(m.emissiveMap || m.map) : null;   // (a lamp with no picture of its light: its own picture, so the reflector's shapes show)
    let cr = m.color.r, cg = m.color.g, cb = m.color.b, er = 0, eg = 0, eb = 0;
    // (the game's carbon weave is drawn by its shader, on a white base: read as it was, a carbon hood came out white)
    const carbon = m.name === 'carbon'; if (carbon) { cr = 0.028; cg = 0.03; cb = 0.034; }
    if (b === 'lamp') {
      // a lamp: its light, brought to an even, modest level (the owner: "not incredibly bright")
      if (m.isMeshBasicMaterial) { const k = 1 / Math.max(cr, cg, cb); cr *= k; cg *= k; cb *= k; }
      else { const e = m.emissive, on = lum(e) > 0.02, k = on ? 1 / Math.max(e.r, e.g, e.b, 1e-3) : 1; cr = on ? e.r * k : 1; cg = on ? e.g * k : 0.97; cb = on ? e.b * k : 0.92; }
    } else if (m.emissive) { const ei = Math.min(1, m.emissiveIntensity || 0) * 0.5; er = m.emissive.r * ei; eg = m.emissive.g * ei; eb = m.emissive.b * ei; }
    // a switched lamp's level: the game's own for it with the headlights on and no colour chosen (def.lampLevels, kept in the
    // material's stock values), so the copy gives the light the real car gives, corner for corner
    let lvl = 0;
    if (sw && basic) { lvl = o.userData.kind === 'mk2beam' ? 3.4 / 1.6 : 2.6;   // (the projectors go with the headlamps, which the tower drives 1.6 times as hard in a chosen colour: 3.4 then, as in the game)
      cr = 0.02; cg = 0.02; cb = 0.024; }   // a lit outline or projector (the game's 2.6 and 3.4): black glass when it is off
    else if (sw) { const st = m.userData.stock; lvl = st && st.emissive ? (st.emissiveIntensity || 0) * Math.max(st.emissive.r, st.emissive.g, st.emissive.b) : (m.emissiveIntensity || 0); }
    lvl = Math.min(1, lvl / LAMP_MAX);
    const plain = b === 'paint' && !px, isHead = b === 'head' && !basic;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M); part.pos[a.v * 3] = v.x; part.pos[a.v * 3 + 1] = v.y; part.pos[a.v * 3 + 2] = v.z;
      if (isHead && Math.abs(v.x) > 0.2) { const q = side[v.x > 0 ? 1 : 0]; q.x += v.x; q.y += v.y; q.n++; if (v.z > q.z) q.z = v.z; }
      if (Nn) v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); else v.set(0, 0, 1);
      part.nor[a.v * 3] = v.x; part.nor[a.v * 3 + 1] = v.y; part.nor[a.v * 3 + 2] = v.z;
      let R = cr, G = cg, B = cb, A = 1;
      if (plain) R = G = B = 1;
      else if (sw) {
        // its own colour, and how much light this corner gives: the lamp's level, where its picture of light (if it has one) is lit, as the game draws it
        A = lvl;
        if (!basic) { if (m.emissiveMap && ex && UV) { sample(ex, UV.getX(i), UV.getY(i)); A *= Math.max(c4[0], c4[1], c4[2]); } if (px && UV) { sample(px, UV.getX(i), UV.getY(i)); R *= c4[0]; G *= c4[1]; B *= c4[2]; } }
      }
      else if (b === 'lamp') { if (ex && UV) { sample(ex, UV.getX(i), UV.getY(i)); const k = (m.emissiveMap ? 0.1 : 0.42) + (m.emissiveMap ? 0.9 : 0.58) * Math.max(c4[0], c4[1], c4[2]); R *= k; G *= k; B *= k; } }   // (only what the lamp's own picture lights: the reflector's dark parts stay dark)
      else { if (px && UV) { sample(px, UV.getX(i), UV.getY(i)); R *= c4[0]; G *= c4[1]; B *= c4[2]; } R = Math.min(1, R + er); G = Math.min(1, G + eg); B = Math.min(1, B + eb); }
      part.col[a.v * cs] = R; part.col[a.v * cs + 1] = G; part.col[a.v * cs + 2] = B; if (cs === 4) part.col[a.v * cs + 3] = A; a.v++;
    }
    const ix = g.index, ni = ix ? ix.count : P.count, n3 = ni - ni % 3;
    for (let k = 0; k < n3; k++) part.idx[a.i++] = v0 + (ix ? ix.getX(k) : k);
    tris += n3 / 3;
  }
  // (v106: a lamp's picture is often dark all over, its light being in how bright the game makes it, and such a lamp stood in the
  // tower looking switched off. Every headlamp gets a bulb: a small ball of light at its middle. v108: shown, and coloured, by the tower.)
  { const balls = bulbs ? side.filter((q) => q.n > 0) : []; if (balls.length) {
    const ico = new THREE.IcosahedronGeometry(0.052, 1), n = ico.attributes.position.count, pos = new Float32Array(n * 3 * balls.length), nor = new Float32Array(n * 3 * balls.length), col = new Float32Array(n * 3 * balls.length), idx = new Uint32Array(n * balls.length);
    // (each ball sits on the outermost surface the car has at that spot, lens and all: set just inside the lamp, four cars' bulbs were
    // hidden behind a lens that is not see-through in the copy)
    const front = (cx, cy, z0) => { let z = -1e9; for (const b in parts) { const pp = parts[b].pos; for (let i = 0; i < pp.length; i += 3) if (pp[i + 2] > z && pp[i + 2] > z0 - 0.6 && Math.abs(pp[i] - cx) < 0.05 && Math.abs(pp[i + 1] - cy) < 0.05) z = pp[i + 2]; } return z > -1e8 ? z : z0; };
    balls.forEach((q, k) => { const cx = q.x / q.n, cy = q.y / q.n, cz = front(cx, cy, q.z) - 0.012; for (let i = 0; i < n; i++) { const o3 = (k * n + i) * 3; pos[o3] = ico.attributes.position.getX(i) + cx; pos[o3 + 1] = ico.attributes.position.getY(i) + cy; pos[o3 + 2] = ico.attributes.position.getZ(i) + cz; nor[o3] = ico.attributes.normal.getX(i); nor[o3 + 1] = ico.attributes.normal.getY(i); nor[o3 + 2] = ico.attributes.normal.getZ(i); col[o3] = col[o3 + 1] = col[o3 + 2] = 1; idx[k * n + i] = k * n + i; } });
    parts.bulb = { pos, nor, col, idx }; ico.dispose();
  } }
  // (v109) Glass over a lamp. A copy's glass is drawn dark and solid, so any pane left in front of a headlamp or a running light
  // hides it: with the bulbs gone the Corvette, the Challenger and others stood with lamps that looked switched off while the real
  // car's were lit. Every glass triangle lying over a lamp (inside its outline seen from the front, level with it or ahead of it)
  // is left off, each side of the car by itself.
  if (parts.glass) {
    const boxes = [];
    for (const b of ['head', 'drl', 'lens']) { if (!parts[b]) continue; const hp = parts[b].pos, two = [null, null];
      for (let i = 0; i < hp.length; i += 3) { const q = (two[hp[i] > 0 ? 1 : 0] ||= [1e9, -1e9, 1e9, -1e9, 1e9]); if (hp[i] < q[0]) q[0] = hp[i]; if (hp[i] > q[1]) q[1] = hp[i]; if (hp[i + 1] < q[2]) q[2] = hp[i + 1]; if (hp[i + 1] > q[3]) q[3] = hp[i + 1]; if (hp[i + 2] < q[4]) q[4] = hp[i + 2]; }
      for (const q of two) if (q) boxes.push(q); }
    if (boxes.length) {
      const gp = parts.glass.pos, gi = parts.glass.idx, keep = new Uint32Array(gi.length); let n = 0;
      for (let k = 0; k < gi.length; k += 3) {
        const a = gi[k] * 3, b = gi[k + 1] * 3, c = gi[k + 2] * 3, cx = (gp[a] + gp[b] + gp[c]) / 3, cy = (gp[a + 1] + gp[b + 1] + gp[c + 1]) / 3, cz = (gp[a + 2] + gp[b + 2] + gp[c + 2]) / 3;
        let over = false; for (const q of boxes) if (cx > q[0] - 0.03 && cx < q[1] + 0.03 && cy > q[2] - 0.03 && cy < q[3] + 0.03 && cz > q[4] - 0.03) { over = true; break; }
        if (!over) { keep[n++] = gi[k]; keep[n++] = gi[k + 1]; keep[n++] = gi[k + 2]; }
      }
      parts.glass.idx = keep.slice(0, n);
    }
  }
  pxCache.clear();
  return { parts, tris: Math.round(tris), bounds: r.bounds ? [r.bounds.min.toArray(), r.bounds.max.toArray()] : null };
}

// ---- the simplifying: in a worker; on the page itself if a worker cannot be started
let worker = null, workerBad = false, jobs = new Map(), seq = 0;
export function simplify(raw, target = 26000) {
  if (!worker && !workerBad) {
    try {
      worker = new Worker(new URL('./lod-worker.js?b=56a2ff5b4d', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); if (e.data.error) j.no(new Error(e.data.error)); else j.ok(e.data.parts); };
      worker.onerror = () => { workerBad = true; worker = null; for (const j of jobs.values()) j.retry(); jobs.clear(); };
    } catch (e) { workerBad = true; worker = null; }
  }
  const onPage = () => import('./lod-core.js?b=56a2ff5b4d').then((m) => m.simplifyParts(raw.parts, target));
  if (!worker) return onPage();
  return new Promise((ok, no) => { const id = ++seq; jobs.set(id, { ok, no, retry: () => onPage().then(ok, no) }); worker.postMessage({ id, parts: raw.parts, target }); });
}

// ---- a copy as something to draw: `mats` = { paint, glass, metal, gloss, matte, lamp, head, drl, bulb } materials
export function lodObject(parts, mats) {
  const grp = new THREE.Group();
  // (v109) a copy made in v108 still has glass lying over its lamps (see gatherRig): taken off here, the same way
  const boxes = [];
  for (const p of parts) { if (p.name !== 'head' && p.name !== 'drl' && p.name !== 'lens') continue; const two = [null, null];
    for (let i = 0; i < p.pos.length; i += 3) { const q = (two[p.pos[i] > 0 ? 1 : 0] ||= [1e9, -1e9, 1e9, -1e9, 1e9]); if (p.pos[i] < q[0]) q[0] = p.pos[i]; if (p.pos[i] > q[1]) q[1] = p.pos[i]; if (p.pos[i + 1] < q[2]) q[2] = p.pos[i + 1]; if (p.pos[i + 1] > q[3]) q[3] = p.pos[i + 1]; if (p.pos[i + 2] < q[4]) q[4] = p.pos[i + 2]; }
    for (const q of two) if (q) boxes.push(q); }
  const clear = (p) => {
    const gp = p.pos, gi = p.idx, keep = new Uint32Array(gi.length); let n = 0;
    for (let k = 0; k < gi.length; k += 3) {
      const a = gi[k] * 3, b = gi[k + 1] * 3, c = gi[k + 2] * 3, cx = (gp[a] + gp[b] + gp[c]) / 3, cy = (gp[a + 1] + gp[b + 1] + gp[c + 1]) / 3, cz = (gp[a + 2] + gp[b + 2] + gp[c + 2]) / 3;
      let over = false; for (const q of boxes) if (cx > q[0] - 0.03 && cx < q[1] + 0.03 && cy > q[2] - 0.03 && cy < q[3] + 0.03 && cz > q[4] - 0.03) { over = true; break; }
      if (!over) { keep[n++] = gi[k]; keep[n++] = gi[k + 1]; keep[n++] = gi[k + 2]; }
    }
    return n === gi.length ? gi : keep.slice(0, n);
  };
  for (const p of parts) {
    if (p.name === 'bulb') continue;   // (v109: none; see gatherRig)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(p.nor, 3, true)); g.setAttribute('color', new THREE.BufferAttribute(p.col, Math.round(p.col.length / (p.pos.length / 3)), true)); g.setIndex(new THREE.BufferAttribute(p.name === 'glass' && boxes.length ? clear(p) : p.idx, 1));
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
