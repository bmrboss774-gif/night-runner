// The collection's cars (v105): turning a car's gathered surfaces into a light copy. No three.js here: this runs in a
// worker (lod-worker.js), or on the page if a worker cannot be had, and in the stock-copy export (dev/proxy-export.js).
// In: parts { name: { pos Float32 xyz, nor Float32 xyz, col Float32 rgb, idx Uint32 } }.
// Out: [{ name, pos Float32, nor Int8 (x127), col Uint8, idx Uint32, from (triangles before) }].
// (v108: a surface's colour is three numbers a corner, or four: the lamps the tower switches, 'head' and 'drl'.)
import { MeshoptSimplifier } from './meshopt_simplifier.module.js';

// corners that share a place, a normal and a colour become one
function weld(p) {
  const n = p.pos.length / 3, cs = Math.round(p.col.length / n), map = new Map(), remap = new Uint32Array(n), keep = [];
  for (let i = 0; i < n; i++) {
    const a = i * 3, c = i * cs;
    const key = `${Math.round(p.pos[a] * 4000)},${Math.round(p.pos[a + 1] * 4000)},${Math.round(p.pos[a + 2] * 4000)},${Math.round(p.nor[a] * 16)},${Math.round(p.nor[a + 1] * 16)},${Math.round(p.nor[a + 2] * 16)},${Math.round(p.col[c] * 32)},${Math.round(p.col[c + 1] * 32)},${Math.round(p.col[c + 2] * 32)}${cs === 4 ? ',' + Math.round(p.col[c + 3] * 32) : ''}`;
    let j = map.get(key); if (j === undefined) { j = keep.length; map.set(key, j); keep.push(i); }
    remap[i] = j;
  }
  const m = keep.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * cs);
  for (let j = 0; j < m; j++) { const a = keep[j] * 3, b = j * 3; pos[b] = p.pos[a]; pos[b + 1] = p.pos[a + 1]; pos[b + 2] = p.pos[a + 2]; nor[b] = p.nor[a]; nor[b + 1] = p.nor[a + 1]; nor[b + 2] = p.nor[a + 2]; for (let c = 0; c < cs; c++) col[j * cs + c] = p.col[keep[j] * cs + c]; }
  const out = []; for (let k = 0; k < p.idx.length; k += 3) { const a = remap[p.idx[k]], b = remap[p.idx[k + 1]], c = remap[p.idx[k + 2]]; if (a !== b && b !== c && a !== c) out.push(a, b, c); }
  return { pos, nor, col, cs, idx: new Uint32Array(out) };
}

// `target`: triangles for the whole car, shared out by how much of the car each surface is (the paint gets half as much again:
// it is what the eye and the reflections run over)
export async function simplifyParts(parts, target = 26000) {
  await MeshoptSimplifier.ready; MeshoptSimplifier.useExperimentalFeatures = true;
  const names = Object.keys(parts).filter((k) => parts[k] && parts[k].idx.length >= 3);
  const LAMPS = new Set(['lamp', 'head', 'drl', 'lens']), share = (k) => Math.pow(parts[k].idx.length / 3, 0.7) * (k === 'paint' ? 1.5 : LAMPS.has(k) ? 1.2 : 1), total = names.reduce((s, k) => s + share(k), 0), out = [];
  for (const name of names) {
    const w = weld(parts[name]), nv = w.pos.length / 3, from = parts[name].idx.length / 3;
    if (w.idx.length < 3) continue;
    const cs = w.cs, na = 3 + cs, att = new Float32Array(nv * na); for (let i = 0; i < nv; i++) { att[i * na] = w.nor[i * 3]; att[i * na + 1] = w.nor[i * 3 + 1]; att[i * na + 2] = w.nor[i * 3 + 2]; for (let c = 0; c < cs; c++) att[i * na + 3 + c] = w.col[i * cs + c]; }
    const wt = (n, c) => [n, n, n, c, c, c, ...(cs === 4 ? [c] : [])];
    const want = Math.max(240, Math.round(target * share(name) / total)) * 3;
    let ind = w.idx;
    if (ind.length > want) {
      // (lamps are never pruned: a ring of small LEDs is all loose pieces, and pruning took the Challenger's headlights away whole)
      const flags = LAMPS.has(name) ? [] : ['Prune'];
      [ind] = MeshoptSimplifier.simplifyWithAttributes(w.idx, w.pos, 3, att, na, wt(0.5, 0.6), null, want, 0.02, flags);
      // a surface of a great many loose pieces stops well short: a second, looser pass
      if (ind.length > want * 1.6) [ind] = MeshoptSimplifier.simplifyWithAttributes(ind, w.pos, 3, att, na, wt(0.2, 0.3), null, want, 0.06, flags);
      if (ind.length < 3) ind = w.idx;
    }
    const map = new Int32Array(nv).fill(-1); let m = 0; const idx = new Uint32Array(ind.length);
    for (let k = 0; k < ind.length; k++) { const i = ind[k]; if (map[i] < 0) map[i] = m++; idx[k] = map[i]; }
    const pos = new Float32Array(m * 3), nor = new Int8Array(m * 3), col = new Uint8Array(m * cs);
    for (let i = 0; i < nv; i++) { const j = map[i]; if (j < 0) continue; for (let c = 0; c < 3; c++) { pos[j * 3 + c] = w.pos[i * 3 + c]; nor[j * 3 + c] = Math.max(-127, Math.min(127, Math.round(w.nor[i * 3 + c] * 127))); } for (let c = 0; c < cs; c++) col[j * cs + c] = Math.max(0, Math.min(255, Math.round(w.col[i * cs + c] * 255))); }
    out.push({ name, pos, nor, col, idx, from: Math.round(from) });
  }
  return out;
}
