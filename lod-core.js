// The collection's cars (v105): turning a car's gathered surfaces into a light copy. No three.js here: this runs in a
// worker (lod-worker.js), or on the page if a worker cannot be had, and in the stock-copy export (dev/proxy-export.js).
// In: parts { name: { pos Float32 xyz, nor Float32 xyz, col Float32 rgb, idx Uint32 } }.
// Out: [{ name, pos Float32, nor Int8 (x127), col Uint8, idx Uint32, from (triangles before) }].
import { MeshoptSimplifier } from './meshopt_simplifier.module.js';

// corners that share a place, a normal and a colour become one
function weld(p) {
  const n = p.pos.length / 3, map = new Map(), remap = new Uint32Array(n), keep = [];
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    const key = `${Math.round(p.pos[a] * 4000)},${Math.round(p.pos[a + 1] * 4000)},${Math.round(p.pos[a + 2] * 4000)},${Math.round(p.nor[a] * 16)},${Math.round(p.nor[a + 1] * 16)},${Math.round(p.nor[a + 2] * 16)},${Math.round(p.col[a] * 32)},${Math.round(p.col[a + 1] * 32)},${Math.round(p.col[a + 2] * 32)}`;
    let j = map.get(key); if (j === undefined) { j = keep.length; map.set(key, j); keep.push(i); }
    remap[i] = j;
  }
  const m = keep.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3);
  for (let j = 0; j < m; j++) { const a = keep[j] * 3, b = j * 3; pos[b] = p.pos[a]; pos[b + 1] = p.pos[a + 1]; pos[b + 2] = p.pos[a + 2]; nor[b] = p.nor[a]; nor[b + 1] = p.nor[a + 1]; nor[b + 2] = p.nor[a + 2]; col[b] = p.col[a]; col[b + 1] = p.col[a + 1]; col[b + 2] = p.col[a + 2]; }
  const out = []; for (let k = 0; k < p.idx.length; k += 3) { const a = remap[p.idx[k]], b = remap[p.idx[k + 1]], c = remap[p.idx[k + 2]]; if (a !== b && b !== c && a !== c) out.push(a, b, c); }
  return { pos, nor, col, idx: new Uint32Array(out) };
}

// `target`: triangles for the whole car, shared out by how much of the car each surface is (the paint gets half as much again:
// it is what the eye and the reflections run over)
export async function simplifyParts(parts, target = 26000) {
  await MeshoptSimplifier.ready; MeshoptSimplifier.useExperimentalFeatures = true;
  const names = Object.keys(parts).filter((k) => parts[k] && parts[k].idx.length >= 3);
  const share = (k) => Math.pow(parts[k].idx.length / 3, 0.7) * (k === 'paint' ? 1.5 : k === 'lamp' ? 1.2 : 1), total = names.reduce((s, k) => s + share(k), 0), out = [];
  for (const name of names) {
    const w = weld(parts[name]), nv = w.pos.length / 3, from = parts[name].idx.length / 3;
    if (w.idx.length < 3) continue;
    const att = new Float32Array(nv * 6); for (let i = 0; i < nv; i++) { att[i * 6] = w.nor[i * 3]; att[i * 6 + 1] = w.nor[i * 3 + 1]; att[i * 6 + 2] = w.nor[i * 3 + 2]; att[i * 6 + 3] = w.col[i * 3]; att[i * 6 + 4] = w.col[i * 3 + 1]; att[i * 6 + 5] = w.col[i * 3 + 2]; }
    const want = Math.max(240, Math.round(target * share(name) / total)) * 3;
    let ind = w.idx;
    if (ind.length > want) {
      // (lamps are never pruned: a ring of small LEDs is all loose pieces, and pruning took the Challenger's headlights away whole)
      const flags = name === 'lamp' ? [] : ['Prune'];
      [ind] = MeshoptSimplifier.simplifyWithAttributes(w.idx, w.pos, 3, att, 6, [0.5, 0.5, 0.5, 0.6, 0.6, 0.6], null, want, 0.02, flags);
      // a surface of a great many loose pieces stops well short: a second, looser pass
      if (ind.length > want * 1.6) [ind] = MeshoptSimplifier.simplifyWithAttributes(ind, w.pos, 3, att, 6, [0.2, 0.2, 0.2, 0.3, 0.3, 0.3], null, want, 0.06, flags);
      if (ind.length < 3) ind = w.idx;
    }
    const map = new Int32Array(nv).fill(-1); let m = 0; const idx = new Uint32Array(ind.length);
    for (let k = 0; k < ind.length; k++) { const i = ind[k]; if (map[i] < 0) map[i] = m++; idx[k] = map[i]; }
    const pos = new Float32Array(m * 3), nor = new Int8Array(m * 3), col = new Uint8Array(m * 3);
    for (let i = 0; i < nv; i++) { const j = map[i]; if (j < 0) continue; for (let c = 0; c < 3; c++) { pos[j * 3 + c] = w.pos[i * 3 + c]; nor[j * 3 + c] = Math.max(-127, Math.min(127, Math.round(w.nor[i * 3 + c] * 127))); col[j * 3 + c] = Math.max(0, Math.min(255, Math.round(w.col[i * 3 + c] * 255))); } }
    out.push({ name, pos, nor, col, idx, from: Math.round(from) });
  }
  return out;
}
