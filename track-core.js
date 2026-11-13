// The mountain circuit (v122): its line, its heights and the ground round it, as plain numbers (no three.js here, so the
// same file plans the track in Node and builds it in the game). The owner, with a photograph of steep green ridges
// under grey limestone crags and pale rocky peaks: "I want to build a mountain racetrack through the green mountains
// use these mountains as inspiration".
//  - buildTrack(): a closed loop through hand-placed points (x, z, height), resampled every ~2 m: X, Z, Y, heading T
//    (forward = (sin T, cos T)), curvature K (+ = bending left), grade G, and which side wears a kerb.
//  - buildGround(track): H(x, z), the height of the land anywhere. Beside the road it is the road's own height; away
//    from it rolling alpine meadow, then ridges and peaks that grow with distance, so the circuit runs along the
//    shoulders of the mountains with drops into valleys and big summits behind.
export const TRACK = { DS: 2, HW: 6.2, VERGE: 3.0, SKIRT: 26, SIZE: 4096, CELL: 8 };   // half width of the tarmac; tarmac edge to the rail; how far the hand-shaped ground reaches; the land's extent and grid
TRACK.WALL = TRACK.HW + TRACK.VERGE;

// [x, z, height]: clockwise seen from above with +x to the left (the game's frame), start/finish on the long straight
const POINTS = [
  [0, -330, 0], [0, -60, 0], [0, 200, 1], [-40, 380, 4],               // the main straight, a flat-out left kink
  [-170, 500, 10], [-350, 520, 19], [-500, 420, 29],                    // a long climbing left-hander
  [-540, 250, 40], [-450, 120, 50],                                     // up the shoulder
  [-300, 70, 58], [-230, -50, 64], [-320, -170, 71], [-470, -150, 79],  // the esses on the climb
  [-590, -250, 87], [-600, -410, 90],                                   // the summit curve
  [-500, -540, 84], [-360, -540, 74], [-255, -440, 64],                 // down and round
  [-140, -470, 53], [-110, -620, 40],                                   // the drop into the hairpin
  [-30, -730, 29], [100, -690, 19], [130, -560, 10], [70, -440, 3],     // the long last hairpin back onto the straight
];

const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothLoop = (a, half, passes = 1) => { const n = a.length; let cur = Float64Array.from(a); for (let p = 0; p < passes; p++) { const out = new Float64Array(n); let s = 0; for (let k = -half; k <= half; k++) s += cur[(k + n) % n]; for (let i = 0; i < n; i++) { out[i] = s / (2 * half + 1); s += cur[(i + half + 1) % n] - cur[(i - half + n) % n]; } cur = out; } return cur; };

export function buildTrack() {
  const P = POINTS, n = P.length, fine = [];
  for (let i = 0; i < n; i++) { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n]; for (let k = 0; k < 60; k++) { const t = k / 60; fine.push([cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t), cr(a[2], b[2], c[2], d[2], t)]); } }
  const m = fine.length, cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) { const p = fine[i], q = fine[(i + 1) % m]; cum[i + 1] = cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const L = cum[m], N = Math.round(L / TRACK.DS), DS = L / N;
  let X = new Float64Array(N), Z = new Float64Array(N), Y = new Float64Array(N);
  for (let i = 0, j = 0; i < N; i++) { const s = i * DS; while (cum[j + 1] < s) j++; const t = (s - cum[j]) / (cum[j + 1] - cum[j]), p = fine[j], q = fine[(j + 1) % m]; X[i] = p[0] + (q[0] - p[0]) * t; Z[i] = p[1] + (q[1] - p[1]) * t; Y[i] = p[2] + (q[2] - p[2]) * t; }
  X = smoothLoop(X, 3, 2); Z = smoothLoop(Z, 3, 2);            // takes the spline's small kinks out of the curvature
  Y = smoothLoop(Y, 30, 3);                                     // long, gentle crests and dips (about 120 m)
  const T = new Float64Array(N), K = new Float64Array(N), G = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; T[i] = Math.atan2(X[b] - X[a], Z[b] - Z[a]); G[i] = (Y[b] - Y[a]) / (2 * DS); }
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; K[i] = wrapA(T[b] - T[a]) / (2 * DS); }
  const Ks = smoothLoop(K, 4, 1);
  // kerbs: on the inside of anything tighter than a 150 m radius, run on a little either end
  const kerb = new Int8Array(N), raw = new Int8Array(N);
  for (let i = 0; i < N; i++) raw[i] = Math.abs(Ks[i]) > 1 / 150 ? Math.sign(Ks[i]) : 0;      // +1: the corner turns left, so the kerb is on the left
  for (let i = 0; i < N; i++) { if (raw[i]) { kerb[i] = raw[i]; continue; } for (let k = 1; k <= 6; k++) { const v = raw[(i + k) % N] || raw[(i - k + N) % N]; if (v) { kerb[i] = v; break; } } }
  return { N, DS, L, X, Z, Y, T, K: Ks, G, kerb };
}
// a frame of the track at a fractional sample index (wraps)
export function frameAt(tr, fi) {
  const N = tr.N, f = ((fi % N) + N) % N, i = Math.floor(f), j = (i + 1) % N, t = f - i;
  return { x: tr.X[i] + (tr.X[j] - tr.X[i]) * t, z: tr.Z[i] + (tr.Z[j] - tr.Z[i]) * t, y: tr.Y[i] + (tr.Y[j] - tr.Y[i]) * t, th: tr.T[i] + wrapA(tr.T[j] - tr.T[i]) * t, g: tr.G[i] + (tr.G[j] - tr.G[i]) * t, k: tr.K[i] + (tr.K[j] - tr.K[i]) * t };
}
// where a point is against the track: nearest sample (searched near `hint` first), then projected onto the segment
export function locateOn(tr, x, z, hint = -1) {
  const N = tr.N; let best = 0, bd = Infinity;
  if (hint >= 0) { const h = Math.round(hint); for (let k = -40; k <= 40; k++) { const i = ((h + k) % N + N) % N, d = (tr.X[i] - x) ** 2 + (tr.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
  if (bd > 625) { for (let i = 0; i < N; i += 4) { const d = (tr.X[i] - x) ** 2 + (tr.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } for (let k = -4; k <= 4; k++) { const i = ((best + k) % N + N) % N, d = (tr.X[i] - x) ** 2 + (tr.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
  let fi = best;
  for (const j of [(best - 1 + N) % N, best]) { const j2 = (j + 1) % N, ex = tr.X[j2] - tr.X[j], ez = tr.Z[j2] - tr.Z[j], t = ((x - tr.X[j]) * ex + (z - tr.Z[j]) * ez) / (ex * ex + ez * ez); if (t >= 0 && t <= 1) { fi = j + t; break; } }
  const f = frameAt(tr, fi), rx = -Math.cos(f.th), rz = Math.sin(f.th);
  return { fi, s: fi * tr.DS, u: (x - f.x) * rx + (z - f.z) * rz, y: f.y, th: f.th, g: f.g, k: f.k };
}

// ---- the land
// gradient noise (smooth, no grid showing): about -1..1, and 0..1 for fbm
const hash = (x, y) => { let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
const grad = (ix, iy, dx, dy) => { const a = hash(ix, iy) * 6.283185307; return Math.cos(a) * dx + Math.sin(a) * dy; };
const gnoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); const a = grad(ix, iy, fx, fy), b = grad(ix + 1, iy, fx - 1, fy), c = grad(ix, iy + 1, fx, fy - 1), d = grad(ix + 1, iy + 1, fx - 1, fy - 1); return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 1.5; };
export const fbm = (x, y, oct = 5) => { let a = 0.5, s = 0, n = 0; for (let k = 0; k < oct; k++) { s += a * gnoise(x, y); n += a; x = x * 2.03 + 31.7; y = y * 2.03 + 11.3; a *= 0.5; } return 0.5 + 0.5 * s / n; };
// ridged: sharp crests where the noise crosses zero, each octave fainter where the last one was low (so valleys are smooth and ridges are craggy)
const ridged = (x, y, oct = 4) => { let a = 0.5, s = 0, n = 0, w = 1; for (let k = 0; k < oct; k++) { let v = 1 - Math.min(1, Math.abs(gnoise(x, y))); v = k ? v * v : v * (0.55 + 0.45 * v); s += a * v * w; n += a; w = Math.min(1, v * 1.2); x = x * 2.07 + 19.1; y = y * 2.07 + 7.7; a *= 0.38; } return s / n; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildGround(tr) {
  const { SIZE, SKIRT } = TRACK, half = SIZE / 2, N = tr.N;
  // buckets of track samples, for an exact distance to the track near it
  const BK = 64, nb = Math.ceil(SIZE / BK), buckets = Array.from({ length: nb * nb }, () => []);
  for (let i = 0; i < N; i++) { const bx = Math.floor((tr.X[i] + half) / BK), bz = Math.floor((tr.Z[i] + half) / BK); buckets[bz * nb + bx].push(i); }
  const near = (x, z) => {   // [distance, sample] within ~64 m, or null
    const bx = Math.floor((x + half) / BK), bz = Math.floor((z + half) / BK); let bd = 1e18, bi = -1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const cx = bx + dx, cz = bz + dz; if (cx < 0 || cz < 0 || cx >= nb || cz >= nb) continue; for (const i of buckets[cz * nb + cx]) { const d = (tr.X[i] - x) ** 2 + (tr.Z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } }
    return bi < 0 || bd > 64 * 64 ? null : [Math.sqrt(bd), bi];
  };
  // coarse fields over the whole land: distance to the track, and the track's height spread out from it (each point
  // takes the heights of the track near it, weighted 1 / distance cubed: smooth everywhere, the road's own beside it)
  const CG = 32, cn = SIZE / CG + 1, Dc = new Float32Array(cn * cn), Bc = new Float32Array(cn * cn), step = 3;
  for (let j = 0; j < cn; j++) for (let i = 0; i < cn; i++) {
    const x = -half + i * CG, z = -half + j * CG; let bd = 1e18, sw = 0, sy = 0;
    for (let k = 0; k < N; k += step) { const d2 = (tr.X[k] - x) ** 2 + (tr.Z[k] - z) ** 2 + 36; if (d2 < bd) bd = d2; const w = 1 / (d2 * Math.sqrt(d2)); sw += w; sy += w * tr.Y[k]; }
    Dc[j * cn + i] = Math.sqrt(bd - 36); Bc[j * cn + i] = sy / sw;
  }
  const bil = (F, x, z) => { const gx = Math.min(cn - 1.001, Math.max(0, (x + half) / CG)), gz = Math.min(cn - 1.001, Math.max(0, (z + half) / CG)), i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, o = j * cn + i; return F[o] + (F[o + 1] - F[o]) * fx + (F[o + cn] - F[o]) * fz + (F[o] - F[o + 1] - F[o + cn] + F[o + cn + 1]) * fx * fz; };
  const dist = (x, z) => { const nr = near(x, z); return nr ? nr[0] : Math.max(60, bil(Dc, x, z)); };
  // H: the land's height; lower = true sinks it under the hand-shaped strip beside the road (the grid's copy only)
  const H = (x, z, lower = false) => {
    const nr = near(x, z), d = nr ? nr[0] : Math.max(60, bil(Dc, x, z));
    let base = bil(Bc, x, z);
    if (nr && d < 45) base += (tr.Y[nr[1]] - base) * (1 - sstep(20, 45, d));     // right by the road: exactly its height
    const edge = Math.min(1, Math.hypot(x, z) / half);                              // 0 in the middle, 1 at the land's edge
    const amp = 50 + 470 * sstep(140, 1500, d) + 260 * sstep(0.62, 1, edge);
    const roll = (fbm(x / 260, z / 260, 3) - 0.5) * 56;
    const peaks = ridged(x / 1050 + 3.1, z / 1050 + 8.4) - 0.52 + 0.5 * sstep(0.7, 1, edge);
    let h = base + sstep(9, 75, d) * (roll + peaks * amp);
    if (lower) h -= 3 * (1 - sstep(SKIRT - 9, SKIRT - 2, d));
    return h;
  };
  return { H, dist };
}
