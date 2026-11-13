// Night Runner: the endless interstate after dark.
// A seeded generator lays down an I-95 style highway two metres at a time: straights, sweeping curves and
// gentle grades; forest, open fields, rock cuts and fill embankments either side; rivers crossed on steel
// girder or deck-arch bridges and lakes on long low causeways. The road is built in 100 m chunks ahead of the
// car and dropped behind it. Everything is lit for night: sodium streetlights on the median, lamp posts on the
// bridges, retroreflective paint, markers and signs that light up in the headlights, a wet road and open
// water with planar reflections, and a live reflection probe that rides with the car for its paint.
import * as THREE from 'three';
import { TRACK, buildTrack, buildGround, locateOn, frameAt as trackFrame } from './track-core.js?b=ab6084dc96';   // (v122) the mountain circuit

// ---------------------------------------------------------------- layout (metres; u = lateral offset, + = right of the median)
const DS = 2, CHUNK = 50, CH_LEN = DS * CHUNK;
// Roadside detail is only drawn within a distance of the camera. Past it a delineator, a sign post or a lamp
// housing is a pixel or less and deep in the fog, yet the far chunks' small parts were most of the world's draw
// calls (a chunk 800 m out cost as much as the one you're in). Tier 0 (delineators, post-mounted signs, lamp
// housings, nav lights) within DETAIL_CUT[0] m of the camera, tier 1 (poles, guardrails, parapets, the median
// barrier, lamp lenses, the big name and exit boards) within DETAIL_CUT[1] m; the road, terrain, trees, light cones,
// gantries and billboards always. Each tier of a chunk hangs off a DetailLOD, which three.js asks again for every
// camera it draws with; a camera can scale the distances (camera.userData.detailScale: the rear-view mirror's
// picture is small, so its details go sooner).
const DETAIL_CUT = [320, 700];
const _dA = new THREE.Vector3(), _dB = new THREE.Vector3();
class DetailLOD extends THREE.LOD {
  constructor(cut) { super(); this.cut = cut; this.layers.enableAll(); }
  update(camera) {
    const k = camera.userData.detailScale ?? 1;
    const on = _dA.setFromMatrixPosition(camera.matrixWorld).distanceTo(_dB.setFromMatrixPosition(this.matrixWorld)) * k < this.cut;
    for (const c of this.children) c.visible = on;
  }
}
const LANE = 3.65, LANES = 4;
const U_MID = 1.5 + LANE * 2;                        // the middle of a carriageway (v100: the lanes squeeze towards it at road works)
const U_IN = 1.5, U_OUT = U_IN + LANE * LANES;      // inside (yellow) and outside (white) edge lines
const U_PAVE = 19.6;                                // edge of the pavement = face of the outer barriers
const MED_HALF = 0.305, MED_H = 1.07;               // New Jersey barrier on the median
const POLE_EVERY = 60, POLE_H = 11.6, ARM = 2.75;
let DARK_LAMPS = null;   // (v98) the lamps round an exit on a highway that has none of its own; set once SODIUM exists
// Tunnels (v44, the user's ask): a 'tunnel' zone is a deep rock cut on both sides with the middle of it roofed over.
// TUN_W: where the tube's walls stand (just behind the outer barriers); TUN_H: its ceiling above the road;
// TUN_LID: the ground on top of it at the portals (it climbs to the full height of the hill further in).
const TUN_W = U_PAVE + 0.46, TUN_H = 6.4, TUN_LID = 7.7, TUN_FACE = 27;
const S_WRAP = 4800;                                // road texture coordinates wrap here (keeps floats small)
const TERRAIN_A = [19.9, 20.6, 21.6, 23, 24.5, 26.5, 29, 33, 39, 48, 62, 82, 110, 150, 200, 260];
// v91, the user: "an overpass through a city is cool and the mountain pass is cool". Two new kinds of zone.
// A 'city' zone carries the road on a viaduct CITY-high above the streets of a downtown: blocks of buildings with lit
// windows either side (CITY_BLOCK m of buildings, then a cross street), street lamps below, and two roads crossing
// over the top on their own bridges. A 'mountain' zone climbs to a summit and comes down again in a string of tight
// bends: a rock face and the mountain on one side (zone.mtn.hill), a long drop to a valley with a town's lights on the
// other. Mountain chunks get terrain (and trees) much further out than the rest, so the slopes do not end in mid air.
const CITY_BLOCK = 96, CITY_PITCH = 108;            // a block of buildings, and block + cross street
const OVER = { clear: 6.3, girder: 1.5, half: 7.6, reach: 250 };   // the crossing roads: clearance over the highway, girder depth, half width, how far out they run
const TERRAIN_A_FAR = [...TERRAIN_A, 330, 420, 540, 700, 900, 1150];
const MTN_TREES = 620;                              // trees out to here on a mountain
export const LANE_CENTERS = [0, 1, 2, 3].map((k) => U_IN + LANE * (k + 0.5));
export const LIMITS = { inner: MED_HALF + 0.06, outer: U_PAVE - 0.05 };
export const ROAD_DS = DS;
const OPEN_S = 1600;   // (v118) where along the unused road the open area says the car is: clear of the entrance ramp
const SODIUM = new THREE.Color(1.0, 0.62, 0.32), LED = new THREE.Color(0.86, 0.9, 1.0), LANTERN = new THREE.Color(1.0, 0.82, 0.58);
DARK_LAMPS = { c: SODIUM, every: POLE_EVERY, I: 620 };

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const bump = (a, a0, a1, a2) => (a < a1 ? sstep(a0, a1, a) : 1 - sstep(a1, a2, a));
// ---------------------------------------------------------------- the entrance ramp
// A run starts at the foot of an on-ramp to the right of the northbound carriageway. In road coordinates
// (s along, u across) the ramp lane's centre c(s) eases in from 46 m out to the hard shoulder, which becomes its
// acceleration lane. Before the nose of the gore the ramp is its own road between two guardrails; after the nose
// the pavement joins up and the ramp's right rail closes in until it is the highway's rail again.
// v98, the owner: "add exit ramps ... that will take you onto a new highway". A ramp is an object now, and a road has
// several: the entrance every road starts with (RAMP: its far end sA comes first, it joins at sM) and its exits, which
// are the same shape run the other way (they leave at sM and reach their far end sA further on, then carry on beside
// the highway for `run` metres: somewhere along there the game moves the car to the next highway). `back` is how far
// the entrance's own road reaches behind sA: 4 m to a closed end on a new run, 150 m of open road when the car has just
// come off another highway's exit.
export const RAMP = { kind: 'on', sA: 640, sM: 1080, cA: 46, cM: (U_OUT + U_PAVE) / 2, hl: LANE / 2, sh: 1.175, sN: 0, back: 4, run: 0 };
const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export function rampC(s, rp = RAMP) { return rp.cM + (rp.cA - rp.cM) * (1 - smoother((s - rp.sA) / (rp.sM - rp.sA))); }
// dc/ds: how fast the ramp drifts across (negative = towards the highway)
export function rampSlope(s, rp = RAMP) { const L = rp.sM - rp.sA, t = clamp((s - rp.sA) / L, 0, 1); return -(rp.cA - rp.cM) * 30 * t * t * (1 - t) * (1 - t) / L; }
// lane centre, the left pavement edge (the left rail's face before the nose) and the right rail's face
export function rampEdges(s, rp = RAMP) {
  s = clamp(s, Math.min(rp.sA, rp.sM), Math.max(rp.sA, rp.sM));
  const c = rampC(s, rp), sh = rp.sh - (rp.sh + 0.05) * sstep(rp.sN, rp.sM, s);
  return { c, left: c - rp.hl - rp.sh, right: c + rp.hl + sh };
}
// fills in the rest of a ramp: its direction (+1 an entrance, -1 an exit), the stretch of road it covers (lo..hi) and
// the nose of its gore (sN: the highway's rail and the ramp's own are apart from there to the far end)
function finishRamp(rp) {
  rp.dir = Math.sign(rp.sM - rp.sA);
  rp.lo = Math.min(rp.sA, rp.sM) - (rp.dir > 0 ? rp.back : 0); rp.hi = Math.max(rp.sA, rp.sM) + (rp.dir < 0 ? rp.run : 0);
  rp.sN = rp.sM;
  for (let s = rp.sA; (rp.sM - s) * rp.dir > 0; s += 0.5 * rp.dir) if (rampEdges(s, rp).left < 21.3) { rp.sN = s; break; }
  return rp;
}
finishRamp(RAMP);
// between the far end and the nose the ramp is a road of its own; from the nose to sM its pavement is the highway's
const rampApart = (rp, s) => (rp.sN - s) * rp.dir > 0;
const rampJoined = (rp, s) => (s - rp.sN) * rp.dir >= 0 && (rp.sM - s) * rp.dir > 0;
export const onRampS = (s, rp = RAMP) => s > rp.lo - 2 && s < rp.hi;
// the terrain is cut down to just below the ramp, with a 1:1.4 slope back up to the natural ground
function rampCutY(s, a, y, rp = RAMP) {
  if (s < rp.lo - 56 || s > rp.hi + 20) return Infinity;
  const e = rampEdges(s, rp), lot = rp.svc && s > rp.svc.s0 - 8 && s < rp.svc.s1 + 8;   // (v102) a fuel stop's lot: level ground well out to the right
  const lo = (rampApart(rp, s) ? e.left - 1.0 : U_PAVE) - (lot ? rp.svc.wl : 0), hi = e.right + 1.0 + (lot ? rp.svc.w : 0);
  const dLat = a < lo ? lo - a : a > hi ? a - hi : 0;
  const dLon = Math.max(0, rp.lo - 4 - s, s - rp.hi - 4);
  // in the gore (between the highway's rail and the ramp's) the ground may rise, but only gently
  return y - 0.32 + Math.hypot(dLat, dLon) / (a < lo ? 2.2 : 1.4);
}
// ---------------------------------------------------------------- the highways (v98)
// The owner: "the newer highways should just be different you need to come up with how this is". Five roads, each with
// its own country (which kinds of stretch come up, and how often), its own bends, lighting, road surface, weather,
// traffic and speed limit. A run starts on one picked at random; every exit leads to one of the others.
//   bag: the kinds of stretch, shuffled and dealt out again and again   straight: how often a piece of road is straight
//   radius: bends are this much wider (or tighter)                       light: the median's lamps (colour, spacing; null = none)
//   pave: 0 asphalt, 1 concrete                                          fog: how thick the mist is
//   traffic: how busy (x the Settings level)   trucks: how many of them are lorries   closures: how often a lane is shut
export const HIGHWAYS = [
  { id: 'i95', name: 'Interstate 95', label: 'I-95', route: 95, shield: 'interstate', tag: 'The interstate: a bit of everything',
    bag: ['forest', 'forest', 'fields', 'cut', 'cut', 'embank', 'river', 'river', 'lake', 'fields', 'tunnel', 'city', 'mountain'],
    straight: 0.42, radius: 1, light: { c: SODIUM, every: 60, I: 620 }, pave: 0, fog: 1, traffic: 1, trucks: 1, closures: 1, limit: 65 },
  { id: 'shore', name: 'Shoreline Causeway', label: 'US 1', route: 1, shield: 'us', tag: 'Long bridges over open water, white lights, sea mist',
    bag: ['lake', 'river', 'fields', 'lake', 'river', 'embank', 'fields', 'forest', 'lake'],
    straight: 0.5, radius: 1.7, light: { c: LED, every: 60, I: 560 }, pave: 1, fog: 1.55, traffic: 0.8, trucks: 0.6, closures: 0.7, limit: 55 },
  { id: 'pass', name: 'Skyline Pass', label: 'Route 44', route: 44, shield: 'state', tag: 'Mountain road: tight bends, rock cuts and tunnels, no street lights',
    bag: ['mountain', 'cut', 'tunnel', 'forest', 'mountain', 'cut', 'forest', 'tunnel', 'river'],
    straight: 0.22, radius: 0.72, light: null, pave: 0, fog: 0.8, traffic: 0.55, trucks: 0.25, closures: 0.5, limit: 50 },
  { id: 'metro', name: 'Metro Expressway', label: 'I-278', route: 278, shield: 'interstate', tag: 'Downtown: viaducts between the towers, bright lights, heavy traffic, road works',
    bag: ['city', 'tunnel', 'city', 'cut', 'river', 'city', 'embank', 'tunnel', 'forest'],
    straight: 0.45, radius: 1.15, light: { c: LED, every: 40, I: 520 }, pave: 1, fog: 0.9, traffic: 1.35, trucks: 0.8, closures: 2, limit: 55 },
  { id: 'pike', name: 'Pine Barrens Turnpike', label: 'Route 72', route: 72, shield: 'state', tag: 'Flat out through the woods: long straights, dark, lorries',
    bag: ['forest', 'fields', 'forest', 'fields', 'embank', 'forest', 'cut', 'river', 'forest'],
    straight: 0.68, radius: 2.1, light: null, pave: 0, fog: 1.1, traffic: 0.7, trucks: 1.7, closures: 0.8, limit: 75 },
];
export const highwayById = (id) => HIGHWAYS.find((h) => h.id === id) || HIGHWAYS[0];
// an exit: the ramp leaves the shoulder EXIT_IN metres into its stretch of road, is EXIT_LEN long and then runs on
// beside the highway for EXIT_RUN; the game takes the car to the next highway EXIT_GO metres past the ramp's far end
const EXIT_IN = 140, EXIT_LEN = 540, EXIT_RUN = 320;   // (540 m: the gore's nose is 160 m after the ramp starts to leave, room to move across at speed)
export const EXIT_GO = 36;
// v102, the owner, on fuel: "I can pull up a model for a gas station on sketchfab ... theres one in the car parts folder".
// A fuel stop is a pull-off on the same highway: a ramp leaves the shoulder as an exit does (kind 'svc', SVC_RAMP
// metres long), runs beside the highway for SVC_LOT metres through the station's forecourt, and a second ramp (kind
// 'join') brings it back. The gas station (the model, given to the world by the game: setStation) stands over the
// lane in the middle of the lot. lot: metres of pavement to the lane's right (w) and left (wl).
const SVC_IN = 140, SVC_RAMP = 300, SVC_LOT = 150;
const TERRAIN_A_RAMP = (() => { const A = new Set(TERRAIN_A.filter((a) => a < 23 || a > 72)); for (let a = 23; a <= 72; a += 1.4) A.add(Math.round(a * 10) / 10); for (const a of TERRAIN_A) if (a < 75) A.add(a); return [...A].sort((x, y) => x - y); })();

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * (vnoise(x * f, y * f, seed + i * 31) * 2 - 1); amp *= 0.5; f *= 2.03; }
  return s;
}
const RIVER_NAMES = ['HARLEM RIVER', 'BRONX RIVER', 'HUTCHINSON RIVER', 'MIANUS RIVER', 'SAUGATUCK RIVER', 'HOUSATONIC RIVER', 'QUINNIPIAC RIVER', 'CONNECTICUT RIVER', 'THAMES RIVER', 'MYSTIC RIVER', 'PAWCATUCK RIVER', 'RARITAN RIVER', 'PASSAIC RIVER', 'HACKENSACK RIVER', 'DELAWARE RIVER', 'SUSQUEHANNA RIVER'];
const LAKE_NAMES = ['LAKE WACCABUC', 'SAW MILL RESERVOIR', 'KENSICO RESERVOIR', 'LAKE ZOAR', 'MANSFIELD HOLLOW LAKE', 'LAKE HOPATCONG', 'CROTON RESERVOIR', 'SPRING LAKE'];
const CITIES = ['New Haven', 'Bridgeport', 'Stamford', 'New Rochelle', 'Providence', 'New London', 'Boston', 'Old Saybrook', 'Mystic', 'Norwalk', 'Greenwich', 'Rye', 'Port Chester', 'Westerly', 'Milford', 'Fairfield'];

// ---------------------------------------------------------------- the road: a sampled centreline with zones, rivers and lakes
class Road {
  // theme: one of HIGHWAYS. entry: true when the car arrives off another highway's exit (the entrance ramp is then an
  // open road behind the car instead of a closed end). exitNo: the number the last highway's exits had reached.
  constructor(seed, theme = HIGHWAYS[0], { entry = false, exitNo = null } = {}) {
    this.rng = mulberry32(seed);
    this.seed = seed; this.theme = theme; this.entry = entry;
    this.onRamp = finishRamp({ ...RAMP, back: entry ? 150 : 4 });
    this.ramps = [this.onRamp]; this.exits = []; this.closures = []; this.narrows = []; this.traps = [];
    // per sample (every DS metres): position, heading, grade, curvature, zone blend
    this.X = []; this.Z = []; this.Y = []; this.T = []; this.G = []; this.K = []; this.ZA = []; this.ZB = []; this.ZT = []; this.BR = [];
    this.zones = []; this.rivers = []; this.lakes = []; this.tunnels = []; this.cities = []; this.mountains = []; this.events = []; this.zoneEnd = 0;
    this.st = { x: 0, z: 0, y: 0, th: 0, k: 0, g: 0, kT: 0, gT: 0, gLeft: 700, pLeft: 520, pieceS: 0 };
    this.exitNo = exitNo ?? 9 + Math.floor(this.rng() * 8); this.mile = 0;
    // (v98) the first exit comes up two to three kilometres in, the first lane closure a little before or after it
    this.nextExit = 2300 + this.rng() * 900; this.nextClosure = 1500 + this.rng() * 1700;
    this.nextNarrow = 3200 + this.rng() * 2600; this.nextTrap = 1500 + this.rng() * 900;   // (v100)
    this.services = []; this.nextService = 3400 + this.rng() * 1400;                         // (v102) the first fuel stop, a couple of miles in
    this.planZone(true);
  }
  get length() { return this.X.length; }
  sAt(i) { return i * DS; }
  planZone(first = false) {
    const r = this.rng, s0 = this.zoneEnd, hw = this.theme;
    let type, len, exit = false, svc = false;
    // v98, the owner: "the roads need to always be random, whether a tunnel comes up is random ... and whether you pass
    // through a city is random". Until now every run began forest, river, tunnel, city, mountain, on one fixed road.
    // Only the first stretch is fixed (woods, for the entrance ramp); the rest is dealt from the highway's own bag.
    if (first) { type = 'forest'; len = 1100; }
    else if (s0 >= this.nextExit) {
      // an exit is due: a plain stretch of woods or fields, long enough for the ramp and the road it runs on to
      type = r() < 0.6 ? 'forest' : 'fields'; len = EXIT_IN + EXIT_LEN + EXIT_RUN + 160 + r() * 240; exit = true;
    } else if (s0 >= this.nextService) {
      // a fuel stop is due: the same kind of stretch, long enough for the way in, the lot and the way out
      type = r() < 0.6 ? 'forest' : 'fields'; len = SVC_IN + SVC_RAMP * 2 + SVC_LOT + 170 + r() * 200; svc = true;
    } else {
      // a shuffled bag keeps the mix varied: no repeats, never water straight after water
      const prev = this.zones[this.zones.length - 1].type, isWater = (t) => t === 'river' || t === 'lake';
      if (!this.bag || !this.bag.length) {
        this.bag = hw.bag.slice();
        for (let k = this.bag.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [this.bag[k], this.bag[j]] = [this.bag[j], this.bag[k]]; }
      }
      let k = this.bag.findIndex((t) => t !== prev && !(isWater(t) && isWater(prev)));
      if (k < 0) k = 0;
      type = this.bag.splice(k, 1)[0];
      if (type === prev) type = isWater(prev) ? 'forest' : prev === 'forest' ? 'fields' : 'forest';
    }
    if (!len) len = { forest: 800 + r() * 1200, fields: 700 + r() * 900, cut: 500 + r() * 700, embank: 500 + r() * 600 }[type] || 0;
    const z = { type, s0, s1: 0, seed: (r() * 1e9) | 0, cutL: 0, cutR: 0, emb: 0 };
    if (type === 'cut') { const both = r() < 0.45, left = r() < 0.5; z.cutL = both || left ? 7 + r() * 15 : 0; z.cutR = both || !left ? 7 + r() * 15 : 0; }
    if (type === 'embank') z.emb = 3 + r() * 5;
    if (type === 'tunnel') {
      // a cutting 240 m long at each end, the tube between them under a hill as high as the cut
      const L = 420 + r() * 520;
      len = L + 480;
      z.cutL = z.cutR = 12 + r() * 4;
      z.tunnel = { s0: s0 + 240, s1: s0 + 240 + L, H: z.cutL };
      this.tunnels.push(z.tunnel);
    }
    if (type === 'city') {
      // the viaduct runs from c.s0 to c.s1; the ground falls away to street level over the 190 m before it and comes
      // back up after it. Two roads cross over, each on a cross street between two blocks.
      len = 2500 + r() * 900;
      const c = { s0: s0 + 210, s1: s0 + len - 210, H: 11 + r() * 3, groundY: null, deckY: null, seed: (r() * 1e9) | 0, name: CITIES[(r() * CITIES.length) | 0], over: [] };
      c.b0 = c.s0 - 100;                               // where the first block starts
      const nB = Math.floor((c.s1 + 100 - c.b0) / CITY_PITCH);
      for (const f of [0.3 + r() * 0.08, 0.62 + r() * 0.1]) { const k = Math.round(nB * f); c.over.push({ k, s: c.b0 + k * CITY_PITCH - (CITY_PITCH - CITY_BLOCK) / 2 }); }
      this.cities.push(c); z.city = c;
    }
    if (type === 'mountain') {
      // up at grade G from m.s0 to the summit at m.top, down again to m.s1; the mountain is on the m.hill side
      len = 4200 + r() * 1400;
      const hill = r() < 0.5 ? -1 : 1, H = 11 + r() * 5;
      const m = { s0: s0 + 160, s1: s0 + len - 160, G: 0.046 + r() * 0.012, hill, baseY: null, topY: null, seed: (r() * 1e9) | 0, towns: [], th0: null, sign: 0 };
      m.top = (m.s0 + m.s1) / 2;
      if (hill < 0) z.cutL = H; else z.cutR = H;
      // a town on the valley floor, and a smaller one further along
      m.towns.push({ s: m.top - 500 + r() * 700, a: 560 + r() * 240, r: 300 + r() * 120, seed: (r() * 1e9) | 0, n: 620 });
      m.towns.push({ s: m.top + 700 + r() * 600, a: 420 + r() * 200, r: 150 + r() * 80, seed: (r() * 1e9) | 0, n: 220 });
      this.mountains.push(m); z.mtn = m;
    }
    if (type === 'river') {
      const halfW = 60 + r() * 230, bank = 22 + r() * 30, valley = 70 + r() * 90;
      const reach = halfW + bank + valley;
      len = 2 * reach + 420;
      const rv = { sMid: s0 + 260 + reach, halfW, bank, valley, reach, skew: (r() - 0.5) * 0.6, clear: 17 + r() * 15, depth: 5 + r() * 4,
        levelY: null, deckY: null, arch: halfW > 120 && r() < 0.8, name: RIVER_NAMES[(r() * RIVER_NAMES.length) | 0], seed: (r() * 1e9) | 0 };
      rv.flatA = rv.sMid - reach - 230; rv.flatB = rv.sMid + reach + 120;
      this.rivers.push(rv); z.river = rv;
    }
    if (type === 'lake') {
      const L = 650 + r() * 900;
      len = L + 520;
      const lk = { s0: s0 + 260, s1: s0 + 260 + L, levelY: null, deckY: null, name: LAKE_NAMES[(r() * LAKE_NAMES.length) | 0], seed: (r() * 1e9) | 0 };
      lk.flatA = lk.s0 - 230; lk.flatB = lk.s1 + 120;
      this.lakes.push(lk); z.lake = lk;
    }
    z.s1 = s0 + len;
    this.zones.push(z); this.zoneEnd = z.s1;
    if (exit) {
      // the ramp leaves the shoulder at sM and reaches its far end at sA; it leads to one of the other highways
      const sM = s0 + EXIT_IN, rp = finishRamp({ ...RAMP, kind: 'off', sA: sM + EXIT_LEN, sM, back: 0, run: EXIT_RUN });
      const others = HIGHWAYS.filter((h) => h.id !== hw.id);
      rp.to = others[(r() * others.length) | 0]; rp.no = ++this.exitNo; rp.city = CITIES[(r() * CITIES.length) | 0];
      this.ramps.push(rp); this.exits.push(rp); z.exit = rp;
      const thru = CITIES[(r() * CITIES.length) | 0];
      this.events.push({ s: sM - 1600, type: 'exitAdvance', exit: rp.no, dist: '1 MILE', to: rp.to });
      this.events.push({ s: sM - 800, type: 'gantry', exit: rp.no, city: thru, to: rp.to, dist: '1/2 MILE' });
      this.events.push({ s: sM - 40, type: 'gantry', exit: rp.no, city: thru, to: rp.to, dist: null });
      this.nextExit = z.s1 + 2000 + r() * 2200;
    } else if (svc) {
      const sM = s0 + SVC_IN, off = finishRamp({ ...RAMP, kind: 'svc', sA: sM + SVC_RAMP, sM, back: 0, run: SVC_LOT });
      const on = finishRamp({ ...RAMP, kind: 'join', sA: off.sA + SVC_LOT, sM: off.sA + SVC_LOT + SVC_RAMP, back: 0 });
      const sv = { off, on, s0: off.sA + 14, s1: off.sA + SVC_LOT - 14, sc: Math.round((off.sA + SVC_LOT / 2) / DS) * DS, w: 40, wl: 9 };
      off.svc = on.svc = sv; this.ramps.push(off, on); this.services.push(sv); z.service = sv;
      this.events.push({ s: sM - 1500, type: 'gas', text: '1 MILE' });
      this.events.push({ s: sM - 380, type: 'gas', text: 'NEXT RIGHT' });
      this.nextService = z.s1 + 3000 + r() * 2600;
    } else if (!first && s0 >= this.nextClosure && ['forest', 'fields', 'cut', 'embank', 'city'].includes(type) && len >= 900) {
      // v98, the owner: "lanes should close down and narrow sometimes". Road works: one or two lanes on one side shut
      // behind a line of drums. A taper of drums (110 m a lane) leads traffic across from s0; the lanes are shut to s1.
      const right = r() < 0.6, n = r() < 0.4 ? 2 : 1;
      const lead = type === 'city' ? 420 : 170, L = Math.min(280 + r() * 420, len - lead - 110 * n - 300), a = Math.round((s0 + lead + r() * Math.max(0, len - L - 110 * n - lead - 300)) / DS) * DS;
      const lanes = right ? (n === 2 ? [2, 3] : [3]) : (n === 2 ? [0, 1] : [0]);
      const cl = { s0: a, s1: a + L + 110 * n, taper: 110 * n, lanes, open: [0, 1, 2, 3].filter((k) => !lanes.includes(k)), side: right ? 1 : -1, n, seed: (r() * 1e9) | 0 };
      // the line the drums stand on once the taper is over (just inside the shut lanes), and the road's edge they start from
      cl.uLine = right ? U_IN + LANE * lanes[0] + 0.4 : U_IN + LANE * (lanes[n - 1] + 1) - 0.4;
      // (v100: the closure is a wall now, not a row of drums: it starts at the road's own barrier on that side)
      cl.uEdge = right ? U_PAVE - 0.3 : MED_HALF + 0.3;
      cl.uMid = (U_IN + LANE * lanes[0] + U_IN + LANE * (lanes[n - 1] + 1)) / 2;   // the middle of the shut lanes
      cl.board = { s: a + cl.taper + 14, u: cl.uMid };                              // the flashing arrow board, in the shut lanes behind the taper
      cl.truck = { s: Math.round(a + cl.taper + 60 + r() * Math.max(20, L - 150)), u: right ? U_IN + LANE * 3.5 : U_IN + LANE * 0.5 };   // a works pick-up parked further in
      this.closures.push(cl); z.closure = cl;
      const which = `${right ? 'RIGHT' : 'LEFT'} ${n === 2 ? '2 LANES' : 'LANE'}`;
      this.events.push({ s: a - 900, type: 'work', text: ['ROAD', 'WORK', 'AHEAD'] });
      this.events.push({ s: a - 520, type: 'work', text: [which, 'CLOSED', 'AHEAD'] });
      this.events.push({ s: a - 230, type: 'work', merge: right ? 1 : -1 });
      this.events.push({ s: cl.s1 + 70, type: 'work', text: ['END', 'ROAD', 'WORK'] });
      this.nextClosure = z.s1 + (1900 + r() * 2600) / hw.closures;
    } else if (!first && s0 >= this.nextNarrow && ['forest', 'fields', 'cut', 'embank'].includes(type) && len >= 800) {
      // v100, the owner: "there should be a different feature where the lanes just simply narrow and you are alerted".
      // Road works of another kind: for a few hundred metres the four lanes are squeezed from 3.65 m to 3 m each and
      // the shoulders are walled off, so the carriageway is 12 m wide between two rows of concrete barrier. k is how
      // much of their width the lanes keep; the squeeze eases in and out over `ease` metres at each end.
      const L = 320 + r() * 380, a = Math.round((s0 + 190 + r() * Math.max(0, len - L - 430)) / DS) * DS;
      const nz = { s0: a, s1: a + Math.min(L, len - 430), k: 0.82, ease: 110 };
      this.narrows.push(nz); z.narrow = nz;
      this.events.push({ s: a - 760, type: 'work', text: ['ROAD', 'WORK', 'AHEAD'] });
      this.events.push({ s: a - 380, type: 'work', text: ['ROAD', 'NARROWS'] });
      this.events.push({ s: a - 160, type: 'work', narrows: 1 });
      this.events.push({ s: nz.s1 + 70, type: 'work', text: ['END', 'ROAD', 'WORK'] });
      this.nextNarrow = z.s1 + 4200 + r() * 4200;
    } else if (!first && s0 >= this.nextTrap && ['forest', 'fields', 'cut', 'embank'].includes(type) && len >= 600) {
      // v100, the owner: "add more police on the side of the road with speed traps". A patrol car waits on the right
      // shoulder at trap.s; the game does the rest (the warning, the check of your speed as you pass, the chase).
      const tp = { s: Math.round((s0 + len * (0.35 + r() * 0.4)) / DS) * DS, limit: hw.limit, state: '' };
      this.traps.push(tp); z.trap = tp;
      this.events.push({ s: tp.s - 420, type: 'speed', mph: hw.limit });
      this.nextTrap = z.s1 + 2600 + r() * 3200;
    }
  }
  // (v100) road works that squeeze the lanes: how far in the squeeze is at s (0 = none, 1 = full), the stretch itself, and
  // where a place across the normal road (u) really is there. Lanes keep k of their width about the carriageway's middle.
  narrowAt(s, pad = 0) { for (let k = this.narrows.length - 1; k >= 0; k--) { const n = this.narrows[k]; if (s > n.s1 + pad) break; if (s >= n.s0 - pad) return n; } return null; }
  squeezeAt(s) { const n = this.narrowAt(s); return n ? sstep(n.s0, n.s0 + n.ease, s) * (1 - sstep(n.s1 - n.ease, n.s1, s)) * (1 - n.k) : 0; }
  squeeze(s, u) { if (u <= 0) return u; const q = this.squeezeAt(s); return q ? U_MID + (u - U_MID) * (1 - q) : u; }
  unsqueeze(s, u) { if (u <= 0) return u; const q = this.squeezeAt(s); return q ? U_MID + (u - U_MID) / (1 - q) : u; }
  // the walls of a squeezed stretch at s: [left face, right face] in real metres across, or null where there is no squeeze
  narrowWalls(s) { const n = this.narrowAt(s); if (!n) return null; const e = sstep(n.s0, n.s0 + n.ease, s) * (1 - sstep(n.s1 - n.ease, n.s1, s)); if (e <= 0) return null; const k = n.k; return [lerp(MED_HALF + 0.1, U_MID + (U_IN - U_MID) * k - 0.55, e), lerp(U_PAVE - 0.1, U_MID + (U_OUT - U_MID) * k + 0.55, e)]; }
  // the wall of a lane closure at s (the face towards the open lanes), or null outside it
  closureWall(cl, s) { if (s < cl.s0 || s > cl.s1) return null; const t = s - cl.s0; return t < cl.taper ? lerp(cl.uEdge, cl.uLine, t / cl.taper) : s > cl.s1 - 40 ? lerp(cl.uLine, cl.uEdge, (s - (cl.s1 - 40)) / 40) : cl.uLine; }
  trapAfter(s) { for (const t of this.traps) if (t.s > s) return t; return null; }
  // (v102) the next fuel stop whose way in has not been passed yet, and the one whose lot s is in
  serviceAfter(s) { for (const v of this.services) if (v.off.sN > s) return v; return null; }
  serviceAt(s) { for (let k = this.services.length - 1; k >= 0; k--) { const v = this.services[k]; if (s > v.s1) break; if (s >= v.s0) return v; } return null; }
  // the ramp (entrance or exit) that covers s, give or take pad metres; the lane closure at s (or coming up within `ahead` metres)
  rampAt(s, pad = 0) { for (let k = this.ramps.length - 1; k >= 0; k--) { const rp = this.ramps[k]; if (s >= rp.lo - pad && s <= rp.hi + pad) return rp; } return null; }
  closureAt(s, ahead = 0, behind = 0) { for (let k = this.closures.length - 1; k >= 0; k--) { const c = this.closures[k]; if (s > c.s1 + behind) break; if (s >= c.s0 - ahead) return c; } return null; }
  // the next exit whose ramp has not been passed yet
  nextExitAfter(s) { for (const rp of this.exits) if (rp.sN > s) return rp; return null; }
  // the tunnel whose tube covers s (pad: metres either side of it that count too), or null
  tunnelAt(s, pad = 0) {
    for (let k = this.tunnels.length - 1; k >= 0; k--) { const t = this.tunnels[k]; if (s > t.s1 + pad) break; if (s >= t.s0 - pad) return t; }
    return null;
  }
  // height of the ground on top of the tube above the road at sample i (0 where there is no tube): the portal's
  // height at each end, rising over 50 m to the hill's own
  lidH(i) {
    const s = i * DS, t = this.tunnelAt(s);
    if (!t) return 0;
    return lerp(TUN_LID, t.H, sstep(4, 54, Math.min(s - t.s0, t.s1 - s)));
  }
  zoneIndexAt(s, hint = this.zones.length - 1) {
    let k = clamp(hint, 0, this.zones.length - 1);
    while (k > 0 && this.zones[k].s0 > s) k--;
    while (k < this.zones.length - 1 && this.zones[k].s1 <= s) k++;
    return k;
  }
  flatRegions() { return [...this.rivers.map((r) => [r.flatA, r.flatB]), ...this.lakes.map((l) => [l.flatA, l.flatB])]; }
  pickPiece(s) {
    // (v98) the road also runs straight where an exit leaves it (but keeps whatever grade it has)
    const r = this.rng, hw = this.theme, regions = [...this.flatRegions(), ...this.exits.map((x) => [x.sM - 90, x.hi + 10]), ...this.services.map((v) => [v.off.sM - 90, v.on.sM + 10])];
    for (const [a, b] of regions) if (s >= a - 1 && s < b) return { kT: 0, len: b - s + 2, straight: true };
    let room = Infinity;
    for (const [a] of regions) if (a > s) room = Math.min(room, a - s);
    if (room < 140) return { kT: 0, len: room + 2, straight: true };
    const zc = this.zones[this.zoneIndexAt(s)], zt = zc.type;
    if (zt === 'mountain' && room >= 300 && s > zc.mtn.s0 - 120 && s < zc.mtn.s1 - 160) {
      // the pass: short straights and tight bends, mostly one way then the other. The road's heading is kept within
      // about 80 degrees of the way it came in, so it never doubles back on itself.
      const m = zc.mtn;
      if (m.th0 === null) m.th0 = clamp(this.st.th, -0.45, 0.45);   // (v98: measured from near the road's first heading, so pass after pass cannot wind it round on itself)
      if (r() < 0.16) return { kT: 0, len: 70 + r() * 130, straight: true };
      const R = r() < 0.6 ? 330 + r() * 150 : 480 + r() * 320, ang = (36 + r() * 52) * Math.PI / 180, off = this.st.th - m.th0;
      let sign = m.sign && r() < 0.75 ? -m.sign : (r() < 0.5 ? -1 : 1);
      if (Math.abs(off + sign * ang) > 1.4) sign = -Math.sign(off);
      m.sign = sign;
      return { kT: sign / R, len: Math.min(room - 30, R * ang + 110), R, sign };
    }
    if (zt === 'city' && room >= 300) {
      // the viaduct: long straights and wide sweeps between the towers
      if (r() < 0.4) return { kT: 0, len: Math.min(room - 30, 220 + r() * 420), straight: true };
      const R = 900 + r() * 900, ang = (14 + r() * 24) * Math.PI / 180, sign = this.bendSign();
      return { kT: sign / R, len: Math.min(room - 30, R * ang + 110), R, sign };
    }
    // (v98) each highway has its own share of straights and its own width of bend
    if (r() < (zt === 'cut' ? Math.min(0.25, hw.straight) : hw.straight) || room < 300) return { kT: 0, len: Math.min(room - 30, (160 + r() * 520) * (hw.straight > 0.6 ? 1.7 : 1)), straight: true };
    const roll = r();
    const R = Math.max(380, (roll < 0.27 ? 430 + r() * 380 : roll < 0.72 ? 800 + r() * 700 : 1500 + r() * 1500) * hw.radius);
    const ang = (14 + r() * (R < 820 ? 70 : 46)) * Math.PI / 180, sign = this.bendSign();
    // (v98: never longer than the road is planned ahead, so a wide bend cannot run on into an exit or a bridge that
    // had not been planned when the bend was picked)
    return { kT: sign / R, len: Math.min(room - 30, R * ang + 110, 3400), R, sign };
  }
  // Which way the next bend goes: left or right at random (v98, the owner: "it should also have the ability to turn
  // left and stay straight"; it always could, but the one fixed road hid it). Once the road has swung more than about
  // 65 degrees from the way it set out, the next bend brings it back, so over a long run it can never loop round and
  // cross itself.
  bendSign() { const th = this.st.th; return Math.abs(th) > 1.15 ? -Math.sign(th) : this.rng() < 0.5 ? -1 : 1; }
  gen() {
    const st = this.st, r = this.rng, i = this.X.length, s = i * DS;
    while (this.zoneEnd < s + 4000) this.planZone();
    if (st.pLeft <= 0) {
      const p = this.pickPiece(s);
      st.kT = p.kT; st.pLeft = p.len; st.pieceS = s;
      if (!p.straight && p.R < 1250) this.curveSigns(s, p);
    }
    if (st.gLeft <= 0) { st.gT = (r() * 2 - 1) * 0.032; st.gLeft = 280 + r() * 620; }
    let gT = st.gT;
    // the mountain pass sets its own grade (and is let out of the height limits below); the city viaduct is level
    const zNow = this.zones[this.zoneIndexAt(s)], mt = zNow.mtn || null;
    if (mt) {
      if (mt.baseY === null) mt.baseY = st.y;
      const lead = mt.G * 2600;                          // the length of road a change of grade takes (see below)
      gT = s < mt.s0 ? 0 : s < mt.top - lead ? mt.G : s < mt.s1 - lead ? -mt.G : 0;
      if (mt.topY === null && s >= mt.top) { mt.topY = st.y; this.events.push({ s: mt.top + 30, type: 'name', text: `SUMMIT  ELEV ${Math.round((420 + st.y * 3.281) / 10) * 10} FT` }); }
    }
    for (const c of this.cities) {
      if (s > c.s0 - 320 && s < c.s1 + 60) gT = 0;
      if (c.groundY === null && s >= c.s0 - 150) { c.deckY = st.y; c.groundY = st.y - c.H; this.events.push({ s: c.s0 - 232, type: 'name', text: `${c.name.toUpperCase()} CITY LIMIT` }); }
    }
    for (const [a, b] of this.flatRegions()) if (s > a - 320 && s < b + 60) gT = 0;
    if (!mt) { if (st.y > 28 && gT > 0) gT = -gT; if (st.y < -22 && gT < 0) gT = -gT; }
    // curvature ramps (clothoid-ish) and vertical curves
    const KR = 1 / (450 * 70);
    st.k += clamp(st.kT - st.k, -KR * DS, KR * DS);
    st.g += clamp(gT - st.g, -DS / 2600, DS / 2600);
    if (i > 0) {
      const thm = st.th + st.k * DS * 0.5;
      st.x += Math.sin(thm) * DS; st.z += Math.cos(thm) * DS; st.y += st.g * DS;
      st.th += st.k * DS;
    }
    st.pLeft -= DS; st.gLeft -= DS;
    this.X.push(st.x); this.Z.push(st.z); this.Y.push(st.y); this.T.push(st.th); this.G.push(st.g); this.K.push(st.k);
    // zone blend for the terrain: 90 m transitions
    const zi = this.zoneIndexAt(s), zc = this.zones[zi];
    let za = zi, zb = zi, t = 0;
    if (s - zc.s0 < 45 && zi > 0) { za = zi - 1; zb = zi; t = 0.5 + (s - zc.s0) / 90; }
    else if (zc.s1 - s < 45 && zi < this.zones.length - 1) { za = zi; zb = zi + 1; t = 0.5 - (zc.s1 - s) / 90; }
    this.ZA.push(za); this.ZB.push(zb); this.ZT.push(sstep(0, 1, t));
    // water levels are fixed once the road has levelled off for the crossing
    for (const rv of this.rivers) if (rv.levelY === null && s >= rv.flatA + 150) { rv.deckY = st.y; rv.levelY = st.y - rv.clear; this.riverSigns(rv); }
    for (const lk of this.lakes) if (lk.levelY === null && s >= lk.flatA + 150) { lk.deckY = st.y; lk.levelY = st.y - 5.2; this.lakeSigns(lk); }
    // regular signs
    if (i > 0 && s % 2600 === 900) this.events.push({ s, type: 'speed', mph: this.theme.limit });
    if (i > 0 && s % 2600 === 2100) this.events.push({ s, type: 'reg', k: this.regK = ((this.regK ?? -1) + 1) % 4 });
    const mileS = Math.round((this.mile + 1) * 1609.344 / DS) * DS;
    if (s >= mileS) { this.mile++; this.events.push({ s, type: 'mile', n: this.mile + 14 }); }
    // (v98: the exit signs used to come up every 3.3 km for exits that were not there; now planZone puts them up
    // for the real ones)
    if (i > 0 && s % 1900 === 1300 && r() < 0.55) this.events.push({ s, type: 'billboard', k: (r() * 8) | 0, side: r() < 0.7 ? 1 : -1 });
    if (i > 0 && s % 4100 === 3000) this.events.push({ s, type: 'reflectors' });
    this.BR.push(undefined);
  }
  curveSigns(s, p) {
    const dir = p.sign;                 // +1 left, -1 right
    this.events.push({ s: s - 240, type: 'curve', dir, mph: p.R < 600 ? 40 : p.R < 850 ? 50 : 55 });
    const arc = p.len - 60;
    for (let d = 30; d < arc; d += 42) this.events.push({ s: s + d, type: 'chevron', dir });
  }
  riverSigns(rv) {
    const b0 = rv.sMid - rv.reach + 10;
    this.events.push({ s: b0 - 330, type: 'icy' });
    this.events.push({ s: b0 - 70, type: 'name', text: rv.name });
  }
  lakeSigns(lk) {
    this.events.push({ s: lk.s0 - 330, type: 'icy' });
    this.events.push({ s: lk.s0 - 70, type: 'name', text: lk.name });
  }
  ensure(n) { while (this.X.length < n) this.gen(); }
  // ---- terrain
  // how much of a city zone's street level (or a mountain zone's mountain) there is at s: 0 at the zone's ends
  cityEnv(z, s) { return sstep(z.s0 + 20, z.s0 + 185, s) * (1 - sstep(z.s1 - 185, z.s1 - 20, s)); }
  mtnEnv(z, s) { return sstep(z.s0 + 10, z.s0 + 330, s) * (1 - sstep(z.s1 - 330, z.s1 - 10, s)); }
  profile(z, side, a, wx, wz, s = 0, y = 0) {
    const ditch = -0.15 * sstep(19.9, 20.8, a) - 1.05 * bump(a, 21.4, 23.2, 25.6);
    const wild = () => ditch + sstep(26, 60, a) * (2.4 + 6.5 * fbm(wx / 170, wz / 170, z.seed)) + sstep(60, 260, a) * (15 * fbm(wx / 480, wz / 480, z.seed + 3));
    switch (z.type) {
      case 'city': {
        // street level: flat, c.H below the deck
        const c = z.city, env = this.cityEnv(z, s);
        if (env <= 0) return wild();
        const street = (c.groundY !== null ? c.groundY - y : -c.H) + 0.1 * fbm(wx / 30, wz / 30, z.seed);
        return lerp(wild(), street, env);
      }
      case 'mountain': {
        const m = z.mtn, env = this.mtnEnv(z, s);
        if (env <= 0) return wild();
        let rel;
        if (side === m.hill) {
          // the mountain side: a rock face at the road's edge, then the slope climbing away, steeper and higher the further up the pass
          const H = (side > 0 ? z.cutR : z.cutL) * (0.8 + 0.45 * fbm(s / 90, 3.1, z.seed + 4)) * sstep(0, 0.3, env);
          const a0 = 22.4, a1 = a0 + 0.42 * H;
          const face = H * sstep(a0, a1, a) + (a > a0 && a < a1 + 3 ? 0.9 * fbm(wx / 6, wz / 6 + a * 0.3, z.seed + 9) : 0);
          const rise = env * (sstep(a1 + 2, 250, a) * 62 * (0.85 + 0.5 * fbm(wx / 210, wz / 210, z.seed + 2)) + Math.max(0, a - 250) * 0.17 * (1 + 0.5 * fbm(wx / 420, wz / 420, z.seed + 6)));
          rel = -0.15 * sstep(19.9, 20.8, a) - 0.5 * bump(a, 20.9, 21.6, 22.4) + face + rise + 5 * fbm(wx / 70, wz / 70, z.seed + 12) * sstep(a1 + 6, 80, a);
        } else {
          // the valley side: past the guardrail the ground falls away to the valley floor
          const floor = (m.baseY !== null ? m.baseY : y) - 26 - y + 6 * fbm(wx / 260, wz / 260, z.seed + 8);
          const fall = -Math.max(0, a - 21.8) * 0.6 * (0.85 + 0.3 * fbm(wx / 120, wz / 120, z.seed + 1)) + 3 * fbm(wx / 45, wz / 45, z.seed + 14) * sstep(30, 70, a);
          rel = -0.15 * sstep(19.9, 20.8, a) + Math.max(fall, floor);
        }
        return lerp(wild(), rel, sstep(0, 0.35, env));
      }
      case 'fields': case 'lake':
        return ditch + sstep(26, 90, a) * (0.8 + 2.2 * fbm(wx / 260, wz / 260, z.seed)) + sstep(110, 260, a) * (6 + 12 * fbm(wx / 600, wz / 600, z.seed + 5));
      case 'tunnel': case 'cut': {
        const H = side > 0 ? z.cutR : z.cutL;
        if (H > 0) {
          const a0 = 22.4, a1 = a0 + 0.42 * H;
          const face = H * sstep(a0, a1, a) + (a > a0 && a < a1 + 3 ? 0.9 * fbm(wx / 6, wz / 6 + a * 0.3, z.seed + 9) : 0);
          return -0.15 * sstep(19.9, 20.8, a) - 0.5 * bump(a, 20.9, 21.6, 22.4) + face + sstep(a1 + 4, 140, a) * (3 + 9 * fbm(wx / 300, wz / 300, z.seed + 2));
        }
      } // falls through to forest when that side is not cut
      case 'forest': case 'river':
        return ditch + sstep(26, 60, a) * (2.4 + 6.5 * fbm(wx / 170, wz / 170, z.seed)) + sstep(60, 260, a) * (15 * fbm(wx / 480, wz / 480, z.seed + 3));
      case 'embank':
        return -z.emb * sstep(20.4, 20.6 + 1.7 * z.emb, a) + sstep(22 + 1.7 * z.emb, 260, a) * (1.5 + 8 * fbm(wx / 400, wz / 400, z.seed));
    }
    return ditch;
  }
  // terrain height before the road edge is tied in (rivers and lakes carve their valleys here)
  natural(i, side, a, wx, wz) {
    const s = i * DS, y = this.Y[i];
    const za = this.zones[this.ZA[i]], zb = this.zones[this.ZB[i]], t = this.ZT[i];
    let rel = this.profile(za, side, a, wx, wz, s, y);
    if (zb !== za && t > 0) rel = lerp(rel, this.profile(zb, side, a, wx, wz, s, y), t);
    let h = y + rel;
    const u = side * a;
    for (let k = this.rivers.length - 1; k >= 0; k--) {
      const rv = this.rivers[k];
      if (rv.sMid - rv.reach - 400 > s) continue;
      if (rv.sMid + rv.reach + 400 < s) break;
      if (rv.levelY === null) continue;
      const d = Math.abs(s - rv.sMid + u * rv.skew);
      if (d > rv.reach + 20) continue;
      const v = sstep(rv.reach, rv.halfW + rv.bank, d);
      const bankTop = rv.levelY + 2.4 + 1.5 * fbm(wx / 40, wz / 40, rv.seed);
      h = lerp(h, Math.min(h, bankTop + 0.25 * Math.max(0, rel)), v);
      const f = sstep(rv.halfW + rv.bank, rv.halfW, d);
      h = lerp(h, rv.levelY - rv.depth, f);
    }
    for (let k = this.lakes.length - 1; k >= 0; k--) {
      const lk = this.lakes[k];
      if (lk.s0 - 400 > s) continue;
      if (lk.s1 + 400 < s) break;
      if (lk.levelY === null || s < lk.s0 - 140 || s > lk.s1 + 140) continue;
      const L = sstep(lk.s0 - 120, lk.s0 + 40, s) * (1 - sstep(lk.s1 - 40, lk.s1 + 120, s)) * sstep(19.9, 25, a);
      h = lerp(h, lk.levelY - 3.5 + 1.5 * fbm(wx / 90, wz / 90, lk.seed), L);
    }
    return h;
  }
  isBridge(i) {
    if (i < 0) return false;
    let b = this.BR[i];
    if (b !== undefined) return b;
    b = false;
    const s = i * DS;
    let near = false;
    for (const rv of this.rivers) if (rv.levelY !== null && Math.abs(s - rv.sMid) < rv.reach + 140) near = true;
    for (const lk of this.lakes) if (lk.levelY !== null && s > lk.s0 - 200 && s < lk.s1 + 200) near = true;
    for (const lk of this.lakes) if (lk.levelY !== null && s > lk.s0 - 40 && s < lk.s1 + 40) b = true;
    // a city: the viaduct from end to end, and a deck wherever the ground has already dropped away on the way in and out
    for (const c of this.cities) if (c.groundY !== null && s > c.s0 - 230 && s < c.s1 + 230) { near = true; if (s >= c.s0 && s <= c.s1) b = true; }
    if (near && !b) {
      // a deck wherever the natural ground drops well below the road within a couple of samples
      for (let j = Math.max(0, i - 3); j <= i + 3 && j < this.X.length && !b; j++) {
        const { x, z } = this.point(j, 0);
        for (const side of [-1, 1]) {
          const R = this.right(j), wx = x + R[0] * side * 19.9, wz = z + R[1] * side * 19.9;
          if (this.natural(j, side, 19.9, wx, wz) < this.Y[j] - 3.2) { b = true; break; }
        }
      }
    }
    this.BR[i] = b;
    return b;
  }
  terrainY(i, side, a, wx, wz, bridge) {
    let h = this.natural(i, side, a, wx, wz);
    // over a tunnel the ground beside the road is the roof's height (the tube's wall stands where the verge would
    // be), up to where the cutting's own face climbs past it
    const lid = this.lidH(i);
    if (lid) return Math.max(h, this.Y[i] + lid);
    if (!bridge) {
      const y = this.Y[i] - 0.12, da = Math.max(0, a - 20.1);
      h = clamp(h, y - da / 1.6, y + da * 2.6);
      if (side > 0) { const rp = this.rampAt(i * DS, 58); if (rp) h = Math.min(h, rampCutY(i * DS, a, this.Y[i], rp)); }
    }
    return h;
  }
  right(i) { const th = this.T[i]; return [-Math.cos(th), Math.sin(th)]; }
  // the zones at a sample (the two the terrain blends between there)
  zonesAt(i) { return [this.zones[this.ZA[i]], this.zones[this.ZB[i]]]; }
  cityAt(s, pad = 0) { for (let k = this.cities.length - 1; k >= 0; k--) { const c = this.cities[k]; if (s > c.s1 + pad) break; if (s >= c.s0 - pad) return c; } return null; }
  // the road crossing over at s (within pad metres), or null
  overAt(s, pad = 0) { for (let k = this.cities.length - 1; k >= 0; k--) { const c = this.cities[k]; if (s > c.s1 + 300) break; for (const o of c.over) if (Math.abs(s - o.s) <= pad) return o; } return null; }
  // how much of the ground at a sample is city street (0..1), for the terrain's look
  urbanAt(i) {
    const s = i * DS, [za, zb] = this.zonesAt(i), t = this.ZT[i];
    const ua = za.city ? this.cityEnv(za, s) : 0, ub = zb.city ? this.cityEnv(zb, s) : 0;
    return lerp(ua, ub, zb !== za ? t : 0);
  }
  // metres of terrain a column `a` out really gets at a sample: on the inside of a bend the far columns stop short of the bend's centre
  reachA(i, side, a) { const k = this.K[i]; return a > 260 && k * side < 0 ? Math.max(260, Math.min(a, 0.8 / Math.abs(k))) : a; }
  point(i, u) { const th = this.T[i]; return { x: this.X[i] - Math.cos(th) * u, z: this.Z[i] + Math.sin(th) * u, y: this.Y[i] }; }
  // interpolated frame at a fractional sample
  frameAt(fi) {
    const i = clamp(Math.floor(fi), 0, this.X.length - 2), t = clamp(fi - i, 0, 1);
    return { x: lerp(this.X[i], this.X[i + 1], t), z: lerp(this.Z[i], this.Z[i + 1], t), y: lerp(this.Y[i], this.Y[i + 1], t), th: lerp(this.T[i], this.T[i + 1], t), g: lerp(this.G[i], this.G[i + 1], t), i: fi };
  }
}

// ---------------------------------------------------------------- textures
const HALF = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? '_h' : '';   // (v126) phones and tablets take the road scans at half size
function loadTex(url, { srgb = true, repeat = true, aniso = 8, mgr } = {}) {
  const t = new THREE.TextureLoader(mgr).load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
// small tiling value-noise texture (R: 4 cells, G: 16 cells, B: 32 cells) for puddles and grime
function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const oct = (x, y, cells, seed) => {
    const fx = x / size * cells, fy = y / size * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const h = (a, b) => hash2(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, seed);
    const A = h(ix, iy), B = h(ix + 1, iy), C = h(ix, iy + 1), D = h(ix + 1, iy + 1);
    return A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = (y * size + x) * 4;
    data[k] = 255 * (0.6 * oct(x, y, 4, 11) + 0.3 * oct(x, y, 8, 12) + 0.1 * oct(x, y, 16, 13));
    data[k + 1] = 255 * (0.6 * oct(x, y, 16, 21) + 0.4 * oct(x, y, 32, 22));
    data[k + 2] = 255 * oct(x, y, 64, 31);
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- shared shader bits
// Headlights for retroreflection: paint beads, raised markers, delineators and sign sheeting send light
// straight back to its source, so they glow for the driver when the headlights hit them.
export const SHARED = {
  uHeadPos: { value: new THREE.Vector3() }, uHeadDir: { value: new THREE.Vector3(0, 0, 1) }, uHeadOn: { value: 1 },
  uRefl: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
  uWaterRefl: { value: null }, uWaterReflMatrix: { value: new THREE.Matrix4() }, uWaterReflOn: { value: 0 },
  uTime: { value: 0 }, uNoise: { value: null }, uRain: { value: 0 },
  uPave: { value: 0 },   // (v98) the highway's surface: 0 asphalt, 1 concrete
  uRetroK: { value: 1 },  // (v98) how brightly the road's paint returns the headlights (more on the highways with no lamps)
};
const RETRO_GLSL = /* glsl */`
uniform vec3 uHeadPos; uniform vec3 uHeadDir; uniform float uHeadOn;
float retro(vec3 wp) {
  vec3 d = wp - uHeadPos; float dist = length(d);
  float c = dot(d / max(dist, 0.01), uHeadDir);
  return uHeadOn * smoothstep(0.86, 0.985, c) * 900.0 / (dist * dist + 60.0);
}`;
function addWorldPosVarying(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wp4 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    #endif
    vWP = (modelMatrix * wp4).xyz; }`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;');
}
// Signs, delineators and the like: base colour also glows when the headlights catch it.
function retroMaterial(params, gain = 1, base = 0) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uHeadPos: SHARED.uHeadPos, uHeadDir: SHARED.uHeadDir, uHeadOn: SHARED.uHeadOn });
    addWorldPosVarying(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + RETRO_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * (retro(vWP) * ${gain.toFixed(3)} + ${base.toFixed(3)});`);
  };
  m.customProgramCacheKey = () => `retro${gain}_${base}`;
  return m;
}

// The road: textures by road coordinates, painted lines and raised markers drawn in the shader, damp asphalt
// with puddles, and the planar reflection blended in as the specular environment.
function roadMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tAsphalt: { value: tex.asphalt }, tConcrete: { value: tex.concreteRoad }, tNoise: SHARED.uNoise,
      uRefl: SHARED.uRefl, uReflMatrix: SHARED.uReflMatrix, uReflOn: SHARED.uReflOn,
      uHeadPos: SHARED.uHeadPos, uHeadDir: SHARED.uHeadDir, uHeadOn: SHARED.uHeadOn, uRain: SHARED.uRain, uTime: SHARED.uTime, uPave: SHARED.uPave, uRetroK: SHARED.uRetroK,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aDeck; attribute float aNarrow; varying vec2 vRoad; varying float vDeck; varying float vNarrow; varying vec3 vWP; varying vec4 vReflC; uniform mat4 uReflMatrix;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vRoad = uv; vDeck = aDeck; vNarrow = aNarrow;
  { vec4 wp4 = modelMatrix * vec4(transformed, 1.0); vWP = wp4.xyz; vReflC = uReflMatrix * wp4; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vRoad; varying float vDeck; varying float vNarrow; varying vec3 vWP; varying vec4 vReflC;
uniform sampler2D tAsphalt; uniform sampler2D tConcrete; uniform sampler2D tNoise; uniform sampler2D uRefl; uniform float uReflOn;
uniform float uRain; uniform float uTime; uniform float uPave; uniform float uRetroK;
${RETRO_GLSL}
float rLine(float x, float c, float w, float aa) { return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(x - c)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  // (v100) vNarrow: how far the lanes are squeezed here (road works): the paint is laid out where the squeezed lanes are
  float ru = vRoad.x, rs = vRoad.y;
  if (ru > 0.0 && vNarrow > 0.0 && vDeck < 1.5) ru = 8.8 + (ru - 8.8) / (1.0 - vNarrow);
  float au = abs(ru);
  vec3 asp = texture2D(tAsphalt, vec2(ru, rs) / 8.0).rgb;
  vec3 con = texture2D(tConcrete, vec2(ru, rs) / 7.5).rgb;
  vec3 nzA = texture2D(tNoise, vec2(ru, rs) / 30.0).rgb, nzB = texture2D(tNoise, vec2(ru, rs) / 7.5 + 0.37).rgb;
  // aDeck: 0 asphalt, 1 concrete bridge deck, 2 the entrance ramp (its u is measured from the ramp lane's centre)
  float isRamp = step(1.5, vDeck), deckF = max(vDeck * (1.0 - isRamp), uPave);
  vec3 baseC = mix(asp * vec3(0.62, 0.62, 0.64), con * 0.78, deckF);
  // tyre-polished lane centres and darker oil strips between the wheel tracks
  float lanePos = mix(fract((au - 1.5) / 3.65), fract((ru + 1.825) / 3.65), isRamp);
  float track = smoothstep(0.12, 0.0, abs(lanePos - 0.27)) + smoothstep(0.12, 0.0, abs(lanePos - 0.73));
  float oil = smoothstep(0.1, 0.0, abs(lanePos - 0.5));
  baseC *= 1.0 - 0.1 * oil * mix(step(1.5, au) * step(au, 16.1), step(au, 1.8), isRamp);
  float wet = smoothstep(0.6, 0.8, nzA.r * 0.65 + nzB.g * 0.35 - track * 0.08);
  // rain: the whole surface goes dark and glossy, the low spots fill up
  wet = mix(wet, max(wet, 0.62 + 0.38 * smoothstep(0.35, 0.7, nzA.r * 0.65 + nzB.g * 0.35)), uRain);
  baseC *= mix(0.78, 0.55, wet) * mix(1.0, 0.8, uRain);
  float aa = fwidth(ru) * 0.8 + 0.003;
  float dash = step(fract(rs / 12.0), 0.25);
  float pW = rLine(au, 16.1, 0.16, aa);
  for (int k = 1; k <= 3; k++) pW += rLine(au, 1.5 + 3.65 * float(k), 0.15, aa) * dash;
  float pY = rLine(au, 1.42, 0.15, aa);
  // the ramp: a yellow line on its left edge and a white one on its right
  pW = mix(pW, rLine(ru, 1.825, 0.16, aa), isRamp);
  pY = mix(pY, rLine(ru, -1.825, 0.15, aa), isRamp);
  float wear = 0.6 + 0.4 * smoothstep(0.25, 0.6, nzB.b);
  pW *= wear; pY *= wear;
  // raised pavement markers between the dashes (white) and along the yellow line (amber), every 24 m
  float ms = abs(fract((rs - 7.5) / 24.0 + 0.5) - 0.5) * 24.0;
  float mW = 0.0;
  for (int k = 1; k <= 3; k++) mW = max(mW, 1.0 - smoothstep(0.05, 0.075, abs(au - (1.5 + 3.65 * float(k)))));
  mW *= (1.0 - smoothstep(0.05, 0.08, ms)) * (1.0 - isRamp);
  float mY = (1.0 - smoothstep(0.05, 0.075, abs(au - 1.42))) * (1.0 - smoothstep(0.05, 0.08, ms)) * (1.0 - isRamp);
  // rumble strip grooves on the outside shoulder
  float rumble = step(16.5, au) * step(au, 17.2) * smoothstep(0.35, 0.5, abs(fract(rs / 0.3) - 0.5) * 2.0) * (1.0 - isRamp);
  baseC *= 1.0 - 0.35 * rumble;
  vec3 paintC = mix(vec3(0.78), vec3(0.85, 0.55, 0.1), step(0.5, pY));
  float paint = clamp(pW + pY, 0.0, 1.0);
  diffuseColor.rgb = mix(baseC, paintC, paint);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), mW);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.62, 0.15), mY);
  float roadWet = wet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(mix(0.5, 0.36, track * 0.6), 0.06, roadWet);
  roughnessFactor = mix(roughnessFactor, 0.45, paint * (1.0 - roadWet));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float rr = retro(vWP);
    totalEmissiveRadiance += paintC * paint * rr * 0.05 * uRetroK + vec3(1.0) * mW * rr * 1.6 + vec3(1.0, 0.62, 0.12) * mY * rr * 1.6; }`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
  #if defined( RE_IndirectSpecular )
  if (uReflOn > 0.5) {
    vec2 ruv = vReflC.xy / vReflC.w;
    vec2 dis = (vec2(nzB.g, nzA.r) - 0.5) * mix(0.03, 0.006, roadWet);
    // raindrops ruffle the reflections
    if (uRain > 0.0) { vec2 rp = texture2D(tNoise, vec2(ru, rs) / 0.9 + vec2(uTime * 1.7, uTime * 1.1)).rg + texture2D(tNoise, vec2(rs, ru) / 0.6 - vec2(uTime * 1.3, uTime * 2.1)).gr; dis += (rp - 1.0) * 0.006 * uRain; }
    float lod = mix(5.0, 0.6, roadWet);
    vec3 refl = vec3(0.0); float wsum = 0.0;
    for (int k = 0; k < 6; k++) {
      float o = (float(k) - 1.5) * mix(0.016, 0.004, roadWet);
      float w = 1.0 - abs(float(k) - 1.5) * 0.15;
      refl += textureLod(uRefl, ruv + dis + vec2(0.0, o), lod).rgb * w; wsum += w;
    }
    radiance = mix(radiance, refl / wsum, 0.92);
  } else radiance *= 0.3;
  #endif`);
  };
  m.customProgramCacheKey = () => 'nr-road4';
  return m;
}

// The open area (v118): one level sheet of pale concrete out to the fog, like an airfield's apron, laid out by where it
// is in the world, not by a road: slab joints every 7.5 m and a worn white survey grid every 60 m (something to judge
// speed by), wet and mirrored in the rain the way the road was. Concrete, not tarmac: at night with nothing lit but
// the car's own lamps, black tarmac to the horizon simply could not be seen. uPadOff: the world's floating-origin offset, so the marks stay put when it moves.
function padMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, envMapIntensity: 0.35 });   // (v121: 0.35, was 1: by day the sky in the car's reflection cube lit the ground too, and turned every shadow bright blue)
  m.userData.off = { value: new THREE.Vector2() };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tConcrete: { value: tex.concreteRoad }, tNoise: SHARED.uNoise, uPadOff: m.userData.off,
      uRefl: SHARED.uRefl, uReflMatrix: SHARED.uReflMatrix, uReflOn: SHARED.uReflOn,
      uHeadPos: SHARED.uHeadPos, uHeadDir: SHARED.uHeadDir, uHeadOn: SHARED.uHeadOn, uRain: SHARED.uRain, uTime: SHARED.uTime, uRetroK: SHARED.uRetroK,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec4 vReflC; uniform mat4 uReflMatrix;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wp4 = modelMatrix * vec4(transformed, 1.0); vWP = wp4.xyz; vReflC = uReflMatrix * wp4; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec4 vReflC;
uniform sampler2D tConcrete; uniform sampler2D tNoise; uniform sampler2D uRefl; uniform float uReflOn;
uniform float uRain; uniform float uTime; uniform float uRetroK; uniform vec2 uPadOff;
${RETRO_GLSL}
// a line of width w every period metres; thinner than a pixel, it fades instead of sparkling
float gLine(float x, float period, float w, float aa) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  return (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, d)) * min(1.0, w / (1.6 * aa)) * (1.0 - smoothstep(0.5, 2.5, aa));
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 gp = vWP.xz + uPadOff;
  vec3 con = texture2D(tConcrete, gp / 7.5).rgb;
  vec3 nzA = texture2D(tNoise, gp / 30.0).rgb, nzB = texture2D(tNoise, gp / 7.5 + 0.37).rgb, nzC = texture2D(tNoise, gp / 120.0 + 0.11).rgb;
  vec3 baseC = con * 0.86 * (0.82 + 0.34 * nzC.r);   // broad lighter and darker patches: old slabs and newer ones
  baseC *= 0.9 + 0.2 * texture2D(tNoise, gp / 1.5).b;   // (v121) fine grain, so the concrete stays crisp right under the camera
  float aaX = fwidth(gp.x) * 0.8 + 0.003, aaY = fwidth(gp.y) * 0.8 + 0.003;
  float seam = max(gLine(gp.x, 7.5, 0.05, aaX), gLine(gp.y, 7.5, 0.05, aaY));
  baseC *= 1.0 - 0.55 * seam;
  float wet = smoothstep(0.6, 0.8, nzA.r * 0.65 + nzB.g * 0.35);
  wet = mix(wet, max(wet, 0.62 + 0.38 * smoothstep(0.35, 0.7, nzA.r * 0.65 + nzB.g * 0.35)), uRain);
  baseC *= mix(1.0, 0.62, wet * uRain) * mix(1.0, 0.85, uRain);   // dry concrete stays pale; rain darkens it and fills the low spots
  wet *= uRain;
  float paint = max(gLine(gp.x, 60.0, 0.15, aaX), gLine(gp.y, 60.0, 0.15, aaY)) * (0.5 + 0.5 * smoothstep(0.25, 0.6, nzB.b));
  vec3 paintC = vec3(0.9);
  diffuseColor.rgb = mix(baseC, paintC, paint);
  float roadWet = wet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.86, 0.07, roadWet);
  roughnessFactor = mix(roughnessFactor, 0.5, paint * (1.0 - roadWet));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += paintC * paint * retro(vWP) * 0.05 * uRetroK;`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
  #if defined( RE_IndirectSpecular )
  if (uReflOn > 0.5) {
    vec2 ruv = vReflC.xy / vReflC.w;
    vec2 dis = (vec2(nzB.g, nzA.r) - 0.5) * mix(0.03, 0.006, roadWet);
    vec3 rad0 = radiance * 0.3;   // (dry concrete mirrors nothing)
    if (uRain > 0.0) { vec2 rp = texture2D(tNoise, gp / 0.9 + vec2(uTime * 1.7, uTime * 1.1)).rg + texture2D(tNoise, gp.yx / 0.6 - vec2(uTime * 1.3, uTime * 2.1)).gr; dis += (rp - 1.0) * 0.006 * uRain; }
    float lod = mix(5.0, 0.6, roadWet);
    vec3 refl = vec3(0.0); float wsum = 0.0;
    for (int k = 0; k < 6; k++) {
      float o = (float(k) - 1.5) * mix(0.016, 0.004, roadWet);
      float w = 1.0 - abs(float(k) - 1.5) * 0.15;
      refl += textureLod(uRefl, ruv + dis + vec2(0.0, o), lod).rgb * w; wsum += w;
    }
    radiance = mix(rad0, mix(radiance, refl / wsum, 0.92), roadWet);
  } else radiance *= 0.3;
  #endif`);
  };
  m.customProgramCacheKey = () => 'nr-pad3';
  return m;
}

// ---- the mountain circuit's materials (v122)
// The mountain's own colours, shared by the land and by the grass beside the tarmac so the two run into each other:
// bright alpine grass (yellower on some slopes, deeper green on others), pale grey limestone where the ground is steep
// or high, and thin grey scree where rock gives way to grass.
const ALPINE_GLSL = /* glsl */`
uniform sampler2D tGrass; uniform sampler2D tRock; uniform sampler2D tNoise; uniform sampler2D tMeadow;
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 alpine(vec3 wp, vec3 nW, float forest, out float rough) {
  vec3 nA = texture2D(tNoise, wp.xz / 510.0).rgb, nB = texture2D(tNoise, wp.xz / 67.0 + 0.31).rgb, nC = texture2D(tNoise, wp.xz / 11.0 + 0.7).rgb, nD = texture2D(tNoise, wp.xz / 1.9 + 0.2).rgb;
  // grass (v124, the owner: "grass doesnt look realsitic"): a scan of a real meadow (grass, dead stalks, fallen
  // leaves, worn strips), laid twice at different angles and sizes and mixed by a slow noise so its rows never line
  // up; greener on some slopes and yellower on others, with dry patches. Its own colours, not a tint over a grey photo.
  // (v127, the owner: "the grass still doesnt look right": no more fallen leaves. The ground is the grass picture from
  // the owner's own grass model, close to and again much larger and turned, its own patchiness kept and its colour set
  // to living grass; the blades that stand on it near the track are that model's too, in the same greens.)
  vec3 mA = texture2D(tMeadow, rot2(wp.xz, 0.35) / 4.6).rgb / vec3(0.061, 0.054, 0.016), mB = texture2D(tMeadow, rot2(wp.xz, -1.05) / 21.0 + 0.37).rgb / vec3(0.061, 0.054, 0.016);
  vec3 mead = mA * (0.45 + 0.55 * mB);
  float hue = clamp(nA.r * 1.5 - 0.25 + (nB.g - 0.5) * 0.7, 0.0, 1.0);
  vec3 grass = mead * mix(vec3(0.034, 0.055, 0.015), vec3(0.068, 0.085, 0.025), hue) * (0.78 + 0.44 * nB.b) * (0.9 + 0.2 * nD.b);
  grass = mix(grass, mead * vec3(0.092, 0.086, 0.032), smoothstep(0.64, 0.82, nB.r) * 0.5);                 // drier, yellower patches
  vec3 an = abs(nW); an /= (an.x + an.y + an.z);
  float rl = dot(texture2D(tRock, wp.zy / 14.0).rgb * an.x + texture2D(tRock, wp.xy / 14.0).rgb * an.z + texture2D(tRock, wp.xz / 14.0).rgb * an.y, vec3(0.3, 0.6, 0.1));
  // limestone: pale grey, weathered darker in streaks
  vec3 rock = vec3(0.19, 0.19, 0.18) * (0.4 + rl / 0.05 * 0.6) * (0.6 + 0.8 * nB.r) * (0.8 + 0.4 * nC.g) * (0.8 + 0.4 * texture2D(tNoise, vec2(wp.x + wp.z, wp.y * 0.35) / 90.0).g);   // (the last: long streaks down the faces)
  float slope = 1.0 - nW.y;                                         // 0 level, 0.3 is 45 degrees
  float rk = smoothstep(0.40, 0.55, slope + (nB.g - 0.5) * 0.24 + (nC.r - 0.5) * 0.08);
  rk = max(rk, smoothstep(430.0, 700.0, wp.y + (nA.b - 0.5) * 260.0 + slope * 300.0));   // the high tops are bare
  float scree = smoothstep(0.27, 0.40, slope + (nB.b - 0.5) * 0.2) * (1.0 - rk) * smoothstep(0.42, 0.66, nA.g);
  vec3 col = mix(grass, vec3(0.25, 0.25, 0.23) * (0.6 + 0.8 * nC.g), scree * 0.7);
  // under the woods (and, far off, the woods themselves): dark, mottled green
  col = mix(col, vec3(0.016, 0.046, 0.013) * (0.55 + 0.9 * nC.b) * (0.7 + 0.6 * nD.g) * (0.8 + 0.4 * nB.r), clamp(forest, 0.0, 1.0) * 0.92);
  col = mix(col, rock, rk);
  rough = mix(0.97, 0.84, rk);
  return col;
}`;
function alpineMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tRock: { value: tex.rock }, tNoise: SHARED.uNoise, tMeadow: { value: tex.envGround } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aForest; varying vec3 vWP; varying vec3 vNW; varying float vForest;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = objectNormal; vForest = aForest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vNW; varying float vForest;\n${ALPINE_GLSL}\nfloat aRough;`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = alpine(vWP, normalize(vNW), vForest, aRough);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = aRough;');
  };
  m.customProgramCacheKey = () => 'nr-alpine9';
  return m;
}
// The circuit's surface, one strip rail to rail: tarmac with a darker, rubbered line down its middle, a white line
// along each edge, red-and-white kerbs on the inside of the corners, a chequered band at the start, and the mountain's
// grass from the tarmac's edge out to the rails. uv = (metres right of the centre line, metres round the lap).
// v126, the owner: "I have a project in blender with a couple models as to what i want the roads to look like in terms
// of texture and detail. I really want the roads to be extrmely high resolution and quality". The road is those scans:
//  - the tarmac is "Scan Broken road white": cracked and patched, tar and white filler in the cracks, stone showing
//    through. Laid by the track's own measure (metres across, metres round the lap) so its joints run with the road,
//    at its real size. One tile is 6 x 2.5 m, so a second copy of it, turned a quarter turn and a third larger, is
//    mixed in by a slow noise: no patch of road is the same as the next and no row of joints runs on for ever.
//  - the shoulders are "Scan Small rock road old": 1.6 m of loose stone beside the tarmac (beyond the kerb where there
//    is one), its grassy side outwards, running out raggedly into the meadow.
//  - both carry their own relief (normal maps baked from the scans' shapes), so the sun picks out every stone.
// Over the tarmac: worn white edge lines and a worn double yellow centre line (as on the road in the owner's project),
// thinnest where the scan is cracked; rubber on the racing line and through the corners; dust at the edges.
// Vertex attribute aFwd = the road's direction on the ground (sin, cos of its heading), for laying the relief.
function trackMaterial(tex, L = 3962) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.3 });
  const TW = 6.055, TH = 2.451, GW = 8.337, GH = 1.621, repA = Math.round(L / TW), repB = Math.round(L / (TH * 1.31)), repG = Math.round(L / GW);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tRock: { value: tex.rock }, tNoise: SHARED.uNoise, tMeadow: { value: tex.envGround }, tTar: { value: tex.trackTarmac }, tTarN: { value: tex.trackTarmacN }, tGrv: { value: tex.trackGravel }, tGrvN: { value: tex.trackGravelN } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKerb; attribute vec2 aFwd; varying vec3 vWP; varying vec2 vRoad; varying float vKerb; varying vec2 vFwd; varying vec3 vGN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoad = uv; vKerb = aKerb; vFwd = aFwd; vGN = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec2 vRoad; varying float vKerb; varying vec2 vFwd; varying vec3 vGN; uniform sampler2D tTar; uniform sampler2D tTarN; uniform sampler2D tGrv; uniform sampler2D tGrvN;\n${ALPINE_GLSL}\nfloat aRough; vec3 aWN; float aRelief;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float u = vRoad.x, s = vRoad.y, au = abs(u), aa = fwidth(u) * 0.8 + 0.004, sg = sign(u);
    const float HW = ${TRACK.HW.toFixed(2)};
    vec3 F = normalize(vec3(vFwd.x, 0.0, vFwd.y)), R = vec3(-F.z, 0.0, F.x);
    vec3 nzA = texture2D(tNoise, vWP.xz / 33.0).rgb, nzB = texture2D(tNoise, vWP.xz / 6.0 + 0.37).rgb, nzC = texture2D(tNoise, vWP.xz / 1.3 + 0.11).rgb;
    // the tarmac: two layers of the scan. A: its length along the road. B: turned a quarter turn, 1.31 times the size.
    vec2 uvA = vec2(s * ${(repA / L).toFixed(8)}, u / ${TH.toFixed(3)} + 0.5), uvB = vec2(u / ${(TW * 1.31).toFixed(3)} + 0.37, s * ${(repB / L).toFixed(8)} + 0.19);
    float mixB = smoothstep(0.46, 0.54, texture2D(tNoise, vec2(u, s) / 41.0 + 0.3).r * 0.7 + texture2D(tNoise, vec2(u, s) / 9.0).g * 0.3);
    vec3 cA = texture2D(tTar, uvA).rgb, cB = texture2D(tTar, uvB).rgb, nA = texture2D(tTarN, uvA).xyz * 2.0 - 1.0, nB = texture2D(tTarN, uvB).xyz * 2.0 - 1.0;
    vec3 asp = mix(cA, cB, mixB) * 0.86 * (0.84 + 0.32 * nzA.r);
    vec3 wnTar = mix(vec3(nA.x, nA.y, 0.0).x * F + nA.y * R, nB.x * R + nB.y * F, mixB);          // the relief's lean over the ground: image +U and +V are (F, R) for A and (R, F) for B
    float lum = dot(asp, vec3(0.333));
    float tarRough = mix(0.52, 0.9, smoothstep(0.03, 0.16, lum));                                   // tar and the dark of the cracks shine; dry stone does not
    // rubber, stains, dust
    asp *= 1.0 - 0.2 * smoothstep(5.6, 1.6, au) * (0.55 + 0.45 * nzA.g);
    float marks = smoothstep(0.52, 0.74, texture2D(tNoise, vec2(u / 1.15, s / 57.0)).g) * smoothstep(7.2, 3.5, au) * (0.3 + 0.7 * min(1.0, abs(vKerb)));
    asp *= 1.0 - 0.34 * marks;
    asp = mix(asp, vec3(0.19, 0.165, 0.13) * (0.6 + 0.8 * nzC.g), smoothstep(HW - 1.3, HW - 0.05, au) * 0.4 * nzB.g);
    // paint, worn: least where the scan is cracked (dark) or its stones stand proud (bright)
    float worn = (0.4 + 0.6 * smoothstep(0.3, 0.62, nzC.b)) * step(0.2, nzB.b + nzC.g * 0.3) * smoothstep(0.035, 0.085, lum) * (1.0 - 0.6 * smoothstep(0.2, 0.3, lum));
    float edgeLine = (1.0 - smoothstep(0.075 - aa, 0.075 + aa, abs(au - (HW - 0.42)))) * worn;
    float yel = (1.0 - smoothstep(0.05 - aa, 0.05 + aa, abs(au - 0.105))) * worn;
    vec3 road = mix(asp, vec3(0.70) * (0.72 + 0.28 * nzB.g), edgeLine * 0.92);
    road = mix(road, vec3(0.62, 0.40, 0.035) * (0.75 + 0.25 * nzB.g), yel * 0.9);
    float chk = step(0.0, s) * step(s, 2.4) * step(au, HW - 0.5);                                   // start and finish
    road = mix(road, mix(asp, mod(floor(u / 0.6) + floor(s / 0.6), 2.0) < 0.5 ? vec3(0.78) : vec3(0.03), worn), chk);
    float paint = max(max(edgeLine, yel), chk * worn);
    // the kerb (inside of the corners)
    float kerbSide = step(0.5, -sg * vKerb), onKerb = step(HW, au) * (1.0 - smoothstep(HW + 1.4 - aa, HW + 1.4 + aa, au)) * kerbSide;
    vec3 kerb = (fract(s / 3.0) < 0.5 ? vec3(0.40, 0.03, 0.024) : vec3(0.68)) * (0.72 + 0.36 * nzB.r);
    kerb = mix(kerb, vec3(0.2, 0.2, 0.19), smoothstep(0.7, 0.8, nzC.r) * 0.7);
    kerb = mix(kerb, vec3(0.02), smoothstep(0.5, 0.75, texture2D(tNoise, vec2(u / 0.8, s / 31.0)).g) * 0.55);
    // the gravel shoulder, from the tarmac's edge (or the kerb's) outwards
    float g0 = HW + 1.4 * kerbSide, gv = (au - g0) / ${GH.toFixed(3)};
    vec2 uvG = vec2(s * ${(repG / L).toFixed(8)} * (sg > 0.0 ? 1.0 : -1.0) + (sg > 0.0 ? 0.0 : 0.43), clamp(1.0 - gv, 0.004, 0.996));
    vec3 cG = texture2D(tGrv, uvG).rgb * 0.8 * (0.86 + 0.28 * nzA.b), nG = texture2D(tGrvN, uvG).xyz * 2.0 - 1.0;
    float onGrv = step(0.0, gv) * (1.0 - smoothstep(0.62, 1.0, gv + (nzB.r - 0.5) * 0.5 + (nzC.g - 0.5) * 0.25));
    vec3 wnGrv = nG.x * F * sg - nG.y * R * sg;                                                     // (its +V runs in towards the road)
    float gr; vec3 grass = alpine(vWP, vec3(0.0, 1.0, 0.0), 0.0, gr);
    float tar = 1.0 - smoothstep(HW - aa, HW + aa, au + (nzB.r - 0.5) * 0.12 + (nzC.g - 0.5) * 0.05);   // the edge wanders
    vec3 off = mix(mix(grass, cG, onGrv), kerb, onKerb);
    diffuseColor.rgb = mix(off, road, max(tar, chk));
    float tarW = max(tar, chk);
    aRough = mix(mix(mix(gr, 0.88, onGrv), 0.6, onKerb), mix(tarRough, 0.58, paint), tarW);
    // the surface's lean, in the world: the scan's own, eased where paint has filled it in; none on the grass or the kerb
    vec3 lean = mix(wnGrv * 1.25 * onGrv * (1.0 - onKerb), wnTar * 1.15 * (1.0 - 0.55 * paint), tarW);
    aRelief = max(tarW, onGrv * (1.0 - onKerb)) * (1.0 - smoothstep(0.02, 0.09, max(fwidth(vWP.x), fwidth(vWP.z))));   // (too far off to resolve: it would only sparkle)
    aWN = normalize(normalize(vGN) + lean * aRelief);
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = aRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(aWN, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'nr-track12';
  return m;
}

// Terrain: grass and dirt by world position, rock where it is steep, all dark and damp.
function terrainMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tDirt: { value: tex.dirt }, tRock: { value: tex.rock }, tNoise: SHARED.uNoise, tPaved: { value: tex.asphalt } });
    // aUrban (v91): 1 where the ground is a city's street level (worn tarmac and concrete, not grass)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aUrban; varying float vUrban; varying vec3 vWP; varying vec3 vNW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = normalize(objectNormal); vUrban = aUrban;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vNW; varying float vUrban; uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; uniform sampler2D tNoise; uniform sampler2D tPaved;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 nz = texture2D(tNoise, vWP.xz / 128.0).rgb;
  vec3 g = texture2D(tGrass, vWP.xz / 8.0).rgb;
  vec3 d = texture2D(tDirt, vWP.xz / 8.0).rgb;
  vec3 col = mix(g, d * 0.9, smoothstep(0.45, 0.7, nz.r));
  vec3 an = abs(vNW);
  vec3 rk = texture2D(tRock, vWP.zy / 8.0).rgb * an.x + texture2D(tRock, vWP.xy / 8.0).rgb * an.z + texture2D(tRock, vWP.xz / 8.0).rgb * an.y;
  rk /= (an.x + an.y + an.z);
  float steep = smoothstep(0.82, 0.62, vNW.y);
  col = mix(col, rk * 0.85, steep);
  if (vUrban > 0.001) { vec3 pv = texture2D(tPaved, vWP.xz / 7.0).rgb * (0.34 + 0.22 * nz.g); col = mix(col, pv, vUrban * (1.0 - steep)); }
  diffuseColor.rgb = col * 0.8;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.9, 0.6, steep);`);
  };
  m.customProgramCacheKey = () => 'nr-terrain2';
  return m;
}

// City buildings (v91). Every wall of every building in a chunk is one mesh; the windows are drawn by the shader
// from the wall's own measurements (uv = metres along the wall and up from the street), so no two buildings repeat
// and nothing has to be downloaded. aB = (the building's random number, its kind, how many of its windows are lit,
// 1 on a roof). Kinds: 0 glass office tower (narrow bays, whole floors lit or dark), 1 concrete office block,
// 2 brick apartments (few, warm windows), 3 apartment tower. Lit windows are brighter towards the ceiling, as a room
// seen from below is; unlit glass is dark and glossy and mirrors the sky. Far enough away for a window to be smaller
// than a pixel, the wall fades to the average of its windows, so distant towers do not sparkle as the car moves.
function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.9 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aB; varying vec4 vB; varying vec2 vFuv;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vB = aB; vFuv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vB; varying vec2 vFuv;
float bh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 bEmit = vec3(0.0); float bGlass = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float seed = vB.x, kind = vB.y, litF = vB.z;
    vec2 cs; vec4 win; vec3 wall;
    if (kind < 0.5) { cs = vec2(1.6, 3.9); win = vec4(0.05, 0.95, 0.14, 0.9); wall = vec3(0.03, 0.036, 0.045); }
    else if (kind < 1.5) { cs = vec2(3.2, 3.7); win = vec4(0.13, 0.87, 0.3, 0.8); wall = vec3(0.2, 0.19, 0.18); }
    else if (kind < 2.5) { cs = vec2(3.4, 3.05); win = vec4(0.3, 0.7, 0.28, 0.76); wall = vec3(0.15, 0.08, 0.058); }
    else { cs = vec2(4.2, 2.95); win = vec4(0.12, 0.88, 0.34, 0.84); wall = vec3(0.19, 0.18, 0.165); }
    wall *= 0.7 + 0.6 * bh(vec2(seed, 7.0));
    if (vB.w > 0.5) { diffuseColor.rgb = vec3(0.045, 0.045, 0.05) * (0.7 + 0.6 * bh(vec2(seed, 3.0))); }
    else {
      vec2 c = vFuv / cs, id = floor(c), f = fract(c), fw = fwidth(c);
      vec2 e = clamp(fw, vec2(0.012), vec2(0.5));
      float wm = smoothstep(win.x - e.x, win.x + e.x, f.x) * (1.0 - smoothstep(win.y - e.x, win.y + e.x, f.x))
               * smoothstep(win.z - e.y, win.z + e.y, f.y) * (1.0 - smoothstep(win.w - e.y, win.w + e.y, f.y));
      float r1 = bh(id + seed), r2 = bh(id * 1.7 + seed + 31.0), rf = bh(vec2(id.y, seed + 3.0));
      // offices light whole floors (cleaners, late workers), with the odd dark window; flats light one room at a time
      float prob = kind < 1.5 ? litF * mix(0.3, 2.3, step(0.64, rf)) : litF;
      float ground = step(id.y, 0.5);
      prob = mix(prob, 0.72, ground);                                   // shop fronts and lobbies at street level
      float lit = step(r1, prob);
      vec3 lc = kind < 1.5 ? mix(vec3(0.86, 0.93, 1.0), vec3(1.0, 0.88, 0.7), step(0.72, r2)) : mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.9, 0.76), step(0.6, r2));
      float fy = clamp((f.y - win.z) / (win.w - win.z), 0.0, 1.0), fx = clamp((f.x - win.x) / (win.y - win.x), 0.0, 1.0);
      // the room behind the glass: ceiling lights at the top, furniture and people breaking up the lower half,
      // a blind part way down some windows
      float room = mix(0.42, 1.0, smoothstep(0.15, 0.95, fy)) * (0.8 + 0.2 * sin(fx * 9.0 + r2 * 40.0));
      float blind = step(0.7, bh(id + seed + 9.0)) * step(0.35 + 0.5 * r2, fy);
      room *= 1.0 - 0.55 * blind;
      // flats: half of them have curtains drawn (an even, dimmer, warmer glow), and every window is two panes
      if (kind > 1.5 && ground < 0.5) {
        float curtain = step(0.5, bh(id + seed + 17.0));
        room = mix(room, 0.5, curtain); lc = mix(lc, vec3(1.0, 0.76, 0.5), curtain * 0.7);
        room *= 1.0 - smoothstep(0.05 + fw.x * 2.0, 0.02, abs(fx - 0.5)) * (1.0 - smoothstep(0.1, 0.3, fw.x));
      } else if (ground < 0.5) {
        // offices: rows of ceiling lights seen through the top of the glass, desks and partitions below
        room *= 0.82 + 0.18 * step(0.5, fract(fy * 2.0 + 0.25)) * (1.0 - smoothstep(0.08, 0.25, fw.y));
      }
      float level = (0.4 + 0.6 * r2) * mix(1.0, 1.3, ground);
      vec3 em = lc * lit * wm * room * level;
      // too far to see a window: the wall's average instead
      float area = (win.y - win.x) * (win.w - win.z), mean = min(1.0, kind < 1.5 ? litF * 1.02 : litF);
      float far = smoothstep(0.4, 1.0, max(fw.x, fw.y));
      em = mix(em, mix(vec3(0.93, 0.9, 0.85), vec3(1.0, 0.8, 0.56), step(1.5, kind)) * mean * area * 0.5, far);
      bGlass = mix(wm, area, far);
      // the street's sodium light washing up the bottom of the wall
      em += vec3(1.0, 0.58, 0.28) * 0.02 * exp(-vFuv.y * 0.14) * (1.0 - bGlass);
      bEmit = em;
      diffuseColor.rgb = mix(wall, vec3(0.012, 0.015, 0.02), bGlass);
    }
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.86, 0.1, bGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += bEmit * 1.15;`);
  };
  m.customProgramCacheKey = () => 'nr-building';
  return m;
}

// Trees: crossed cards from the I-95 model's tree sheet, one card picked per instance, with rounded normals.
const TREE_CARDS = [ // u0, v0 (trunk), u1, v1 in the flipped sheet; aspect = width / height
  [0, 0, 1021, 1024], [1024, 0, 2048, 1025], [772, 1014, 1063, 1535], [416, 1032, 746, 1892], [1230, 1061, 1705, 1496],
  [1729, 1283, 2018, 1775], [0, 1532, 362, 2048], [816, 1533, 1258, 2046], [1312, 1533, 1691, 2037],
].map(([x0, y0, x1, y1]) => ({ r: [x0 / 2048, y0 / 2048, x1 / 2048, y1 / 2048], aspect: (x1 - x0) / (y1 - y0) }));
const CARD_WEIGHT = [3, 3, 1, 1.4, 1.5, 1, 1.2, 1.6, 1.4];
const SHADOW_PX = HALF ? 1024 : 2048;
const SHADOW_R = 44;   // (v127) half the side of the square of ground the sun's shadows are worked out for, m
const RAIL_CUT = { value: new THREE.Vector4(0, 0, 0, 0) };   // (v124) x, z of the car and the radius inside which the plain far rail is not drawn (the modelled one is)
const TREE_FILL = { value: 0 };   // (v123) by day a tree's shaded side is lit by the leaves round it, not black: this much of its own colour is added back
function treeMaterial(tex) {
  const m = new THREE.MeshLambertMaterial({ map: tex.trees, alphaTest: 0.42, side: THREE.DoubleSide, alphaToCoverage: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeFill = TREE_FILL;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aCard; attribute vec3 aTint; varying vec3 vTint;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vMapUv = mix(aCard.xy, aCard.zw, uv); vTint = aTint;`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normalize(vec3(position.x * 1.6, position.y - 0.25, position.z * 1.6));
  #ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
  #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint; uniform float uTreeFill;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= vTint;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uTreeFill;');
  };
  m.customProgramCacheKey = () => 'nr-tree2';
  return m;
}
// (v127) what a photographed tree looks like to the sun: the same card, the same cut-out, so its shadow is a tree's
function treeDepthMaterial(tex) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex.trees, alphaTest: 0.42, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => { shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCard;').replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = mix(aCard.xy, aCard.zw, uv);'); };
  m.customProgramCacheKey = () => 'nr-treedepth';
  return m;
}
const NEAR_TREES = 46;
function treeGeometry() {
  const g = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  for (let q = 0; q < 2; q++) {
    const cx = q ? 0 : 0.5, cz = q ? 0.5 : 0, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Volumetric-looking light cones under the streetlights (additive, soft at the edges, fogged).
function coneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.034 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.001 } },
    vertexShader: /* glsl */`
      attribute vec3 aColor; varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vV; varying float vFog;
      void main() {
        vec4 wp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vH = position.y; vC = aColor;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
        nm = nm * mat3(instanceMatrix);
        #endif
        vN = normalize(nm * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vec4 mv = viewMatrix * wp; vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStrength; uniform float fogDensity; varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vV; varying float vFog;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = edge * smoothstep(0.0, 0.25, vH) * pow(clamp(vH, 0.0, 1.0), 1.1) * uStrength;
        float fog = exp(-fogDensity * fogDensity * vFog * vFog * 1.4);
        float nearFade = smoothstep(6.0, 30.0, vFog);
        gl_FragColor = vec4(vC * a * fog * nearFade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Water: dark, gently rippled, mirror-like from the planar reflection at the water level.
function waterMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tNormal: { value: tex.waterN }, uRefl: SHARED.uWaterRefl, uReflMatrix: SHARED.uWaterReflMatrix, uReflOn: SHARED.uWaterReflOn,
      uTime: SHARED.uTime, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.001 }, uDeep: { value: new THREE.Color(0x02050a) }, uDebug: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform mat4 uReflMatrix; varying vec3 vWP; varying vec4 vRC; varying float vFog;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vRC = uReflMatrix * wp; vec4 mv = viewMatrix * wp; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNormal; uniform sampler2D uRefl; uniform float uReflOn; uniform float uTime; uniform vec3 fogColor; uniform float fogDensity; uniform vec3 uDeep; uniform float uDebug;
      varying vec3 vWP; varying vec4 vRC; varying float vFog;
      void main() {
        vec2 p = vWP.xz;
        vec3 n1 = texture2D(tNormal, p / 32.0 + vec2(uTime * 0.012, uTime * 0.008)).rgb * 2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, p / 8.0 - vec2(uTime * 0.017, -uTime * 0.011)).rgb * 2.0 - 1.0;
        vec3 n = normalize(vec3(n1.x + n2.x, 6.0, n1.y + n2.y));
        vec3 v = normalize(cameraPosition - vWP);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 refl = vec3(0.004, 0.007, 0.012);
        if (uReflOn > 0.5) {
          vec2 uv = vRC.xy / vRC.w + n.xz * 0.035;
          refl = vec3(0.0);
          for (int k = 0; k < 4; k++) refl += textureLod(uRefl, uv + vec2(0.0, (float(k) - 1.5) * 0.006), 1.5).rgb;
          refl *= 0.25;
        }
        vec3 col = uDeep + refl * mix(0.5, 1.0, fres) * 1.35;
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
        gl_FragColor = vec4(mix(col, fogColor, fog), 1.0);
        if (uDebug > 0.5) gl_FragColor = vec4(uDebug > 1.5 ? vec3(fract(vRC.xy / vRC.w * 4.0), 0.0) : refl * 6.0, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- night sky
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uMoon: { value: new THREE.Vector3(-0.45, 0.42, 0.79).normalize() }, uTime: SHARED.uTime, uRain: SHARED.uRain, uDay: { value: 0 }, uHorizon: { value: new THREE.Color(0x121432) }, uZenith: { value: new THREE.Color(0x02020c) }, uGlow: { value: new THREE.Color(0x4a1e3a) } },
    vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uMoon; uniform float uTime; uniform float uRain; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uGlow; uniform float uDay; varying vec3 vDir;
      float h2s(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2s(i), h2s(i + vec2(1.0, 0.0)), f.x), mix(h2s(i + vec2(0.0, 1.0)), h2s(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // (v119) day: blue overhead paling to haze at the horizon (uHorizon is the fog's colour too, so the ground runs
        // into it without a line), the sun (uMoon is its direction) with its glare, and a few high, thin clouds drifting
        if (uDay > 0.5) {
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
          float sd = max(dot(d, uMoon), 0.0);
          col += vec3(1.0, 0.86, 0.66) * (pow(sd, 8.0) * 0.1 + pow(sd, 90.0) * 0.35 + pow(sd, 1400.0) * 1.6);
          col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99990, 0.99996, sd) * 30.0;
          if (h > 0.0) {
            vec2 cp = d.xz / (h + 0.12) * 1.5 + vec2(uTime * 0.004, uTime * 0.0015);
            float c = smoothstep(0.6, 0.92, fbm(cp) * 0.75 + fbm(cp * 3.1 + 7.0) * 0.25 + 0.06) * smoothstep(0.02, 0.22, h);
            col = mix(col, vec3(1.0, 1.0, 1.02) * (0.86 + 0.5 * pow(sd, 6.0)), c * 0.7);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
        // light pollution: a warm haze low on the horizon, strongest toward the city behind
        float az = atan(d.x, d.z);
        col += uGlow * exp(-max(h, 0.0) * 9.0) * (0.55 + 0.45 * cos(az - 2.6));
        // below the horizon there is only dark land (v91: seen from high on the mountain pass, looking down past the edge of the terrain)
        col = mix(col, uHorizon * 0.22, smoothstep(0.0, -0.05, h));
        // stars
        if (h > 0.0) {
          vec3 p = d * 420.0; vec3 c = floor(p); vec3 f = fract(p) - 0.5;
          float r = h3(c);
          if (r > 0.9965) {
            vec3 o = vec3(h3(c + 1.7), h3(c + 3.1), h3(c + 5.3)) - 0.5;
            float s = smoothstep(0.22, 0.0, length(f - o * 0.6));
            float tw = 0.75 + 0.25 * sin(uTime * (1.5 + r * 7.0) + r * 60.0);
            col += vec3(0.8, 0.86, 1.0) * s * tw * (r - 0.9965) * 900.0 * smoothstep(0.0, 0.25, h);
          }
        }
        // moon and its halo
        float md = dot(d, uMoon);
        col += vec3(0.9, 0.93, 1.0) * smoothstep(0.99985, 0.99991, md) * 6.0;
        col += vec3(0.25, 0.3, 0.42) * pow(max(md, 0.0), 900.0) * 0.5 + vec3(0.06, 0.08, 0.13) * pow(max(md, 0.0), 40.0) * 0.1;
        // overcast: a low ceiling lit orange by the city
        vec3 cloud = mix(vec3(0.05, 0.045, 0.045), vec3(0.012, 0.014, 0.02), smoothstep(0.0, 0.5, h)) + uGlow * 0.6 * exp(-max(h, 0.0) * 4.0);
        col = mix(col, cloud, uRain * 0.95);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

// ---------------------------------------------------------------- signs (drawn on canvases)
const SIGN_FONT = '"Barlow", "Arial Narrow", Arial, sans-serif';
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fitText(g, text, maxW, size, weight = 600) {
  let s = size; g.font = `${weight} ${s}px ${SIGN_FONT}`;
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${weight} ${s}px ${SIGN_FONT}`; }
  return s;
}
function shield(g, cx, cy, w, num, kind = 'interstate') {
  const h = w * 1.05;
  if (kind !== 'interstate') {
    // (v98) a US route (the white shield with a black number) or a state route (a white disc), each on its black plate
    g.save(); g.translate(cx - w / 2, cy - h / 2);
    roundRect(g, 0, 0, w, h, w * 0.08); g.fillStyle = '#0c0c0c'; g.fill();
    g.fillStyle = '#f6f6f2';
    if (kind === 'us') { g.beginPath(); g.moveTo(w * 0.12, h * 0.1); g.quadraticCurveTo(w * 0.3, h * 0.17, w * 0.5, h * 0.08); g.quadraticCurveTo(w * 0.7, h * 0.17, w * 0.88, h * 0.1); g.quadraticCurveTo(w * 0.98, h * 0.42, w * 0.84, h * 0.66); g.quadraticCurveTo(w * 0.7, h * 0.86, w * 0.5, h * 0.94); g.quadraticCurveTo(w * 0.3, h * 0.86, w * 0.16, h * 0.66); g.quadraticCurveTo(w * 0.02, h * 0.42, w * 0.12, h * 0.1); g.closePath(); g.fill(); }
    else { g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.44, h * 0.42, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#0c0c0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${w * (String(num).length > 2 ? 0.4 : 0.5)}px ${SIGN_FONT}`; g.fillText(String(num), w * 0.5, h * 0.51);
    g.restore(); return;
  }
  g.save(); g.translate(cx - w / 2, cy - h / 2);
  const path = () => { g.beginPath(); g.moveTo(w * 0.08, h * 0.02); g.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.92, h * 0.02); g.quadraticCurveTo(w * 1.02, h * 0.45, w * 0.86, h * 0.72); g.quadraticCurveTo(w * 0.7, h * 0.95, w * 0.5, h); g.quadraticCurveTo(w * 0.3, h * 0.95, w * 0.14, h * 0.72); g.quadraticCurveTo(-w * 0.02, h * 0.45, w * 0.08, h * 0.02); g.closePath(); };
  g.fillStyle = '#fff'; path(); g.fill();
  g.save(); g.scale(0.9, 0.9); g.translate(w * 0.055, h * 0.055); path(); g.clip();
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h * 0.27);
  g.fillStyle = '#003f87'; g.fillRect(0, h * 0.27 + 2, w, h);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${w * 0.11}px ${SIGN_FONT}`; g.fillText('INTERSTATE', w * 0.5, h * 0.155);
  g.font = `700 ${w * (String(num).length > 2 ? 0.38 : 0.46)}px ${SIGN_FONT}`; g.fillText(String(num), w * 0.5, h * 0.6);
  g.restore(); g.restore();
}
// Halo sprites. GPUs clamp point sizes (often to 255 or 511 px), so a halo that should be bigger than that
// suddenly shrinks as you drive under a lamp, which reads as a flicker. This shader fades the halo out before it
// reaches the cap instead, and does its own fog. uScale = half the drawing-buffer height, set every frame.
export const GLOW = { uScale: { value: 400 }, uMaxPx: { value: 240 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.00125 } };
export function glowMaterial(map, size, extra = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSize: { value: size }, uGain: { value: extra }, uScale: GLOW.uScale, uMaxPx: GLOW.uMaxPx, fogColor: GLOW.fogColor, fogDensity: GLOW.fogDensity },
    vertexShader: `
      attribute vec3 color; uniform float uScale, uMaxPx, uSize; varying vec3 vColor; varying float vFade, vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = uSize * uScale / max(-mv.z, 0.05);
        vFade = 1.0 - smoothstep(uMaxPx * 0.6, uMaxPx, px);
        // never smaller than a few pixels: a sub-pixel sprite twinkles from frame to frame; dim it instead
        float small = min(px / 3.0, 1.0); vFade *= small * small;
        gl_PointSize = clamp(px, 3.0, uMaxPx);
        vColor = color; vDepth = -mv.z;
        // draw the halo a couple of metres nearer the camera than its lamp, so the lamp's own head, arm or
        // bumper never slices through it as you move (anything truly in front still hides it)
        // a lamp right in front of the camera doesn't carry a big ball
        vFade *= smoothstep(2.5, 7.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 fogColor; uniform float fogDensity, uGain; varying vec3 vColor; varying float vFade, vDepth;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        float f = fogDensity * vDepth, fog = 1.0 - exp(-f * f);
        gl_FragColor = vec4(vColor * t.rgb * t.a * vFade * (1.0 - fog) * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
const signCache = new Map();
function signTexture(key, w, h, draw) {
  if (signCache.has(key)) return signCache.get(key);
  const c = canvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  signCache.set(key, t);
  return t;
}
const GREEN = '#006b45', AMBER = '#f3b31b', WORK = '#f47b20';
const SIGNS = {
  speed: (mph) => signTexture('speed' + mph, 256, 320, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h); roundRect(g, 6, 6, w - 12, h - 12, 14); g.fillStyle = '#f4f4f0'; g.fill();
    roundRect(g, 14, 14, w - 28, h - 28, 10); g.strokeStyle = '#111'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `600 52px ${SIGN_FONT}`; g.fillText('SPEED', w / 2, 76); g.fillText('LIMIT', w / 2, 130);
    g.font = `700 140px ${SIGN_FONT}`; g.fillText(String(mph), w / 2, 270);
  }),
  mile: (n, route = 95) => signTexture('mile' + route + '_' + n, 128, 384, (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 10); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.font = `600 34px ${SIGN_FONT}`; g.fillText(String(route), w / 2, 52); g.fillText('MILE', w / 2, 150);
    g.font = `700 ${n > 99 ? 64 : 84}px ${SIGN_FONT}`; g.fillText(String(n), w / 2, 260);
  }),
  diamond: (key, drawInner) => signTexture('dia' + key, 256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    roundRect(g, -88, -88, 176, 176, 12); g.fillStyle = AMBER; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6;
    roundRect(g, -80, -80, 160, 160, 9); g.stroke();
    g.rotate(-Math.PI / 4); drawInner(g);
  }),
  curve: (dir) => SIGNS.diamond('curve' + dir, (g) => {
    g.strokeStyle = '#111'; g.lineWidth = 16; g.lineCap = 'butt'; g.scale(dir > 0 ? -1 : 1, 1);
    g.beginPath(); g.moveTo(-18, 66); g.lineTo(-18, 6); g.quadraticCurveTo(-18, -30, 22, -42); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(52, -46); g.lineTo(12, -70); g.lineTo(18, -18); g.closePath(); g.fill();
  }),
  icy: () => SIGNS.diamond('icy', (g) => {
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `700 30px ${SIGN_FONT}`;
    g.fillText('BRIDGE', 0, -26); g.fillText('ICES BEFORE', 0, 8); g.fillText('ROAD', 0, 42);
  }),
  advisory: (mph) => signTexture('adv' + mph, 192, 192, (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 12); g.fillStyle = AMBER; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; roundRect(g, 12, 12, w - 24, h - 24, 8); g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `700 92px ${SIGN_FONT}`; g.fillText(String(mph), w / 2, 112); g.font = `700 40px ${SIGN_FONT}`; g.fillText('MPH', w / 2, 162);
  }),
  chevron: (dir) => signTexture('chev' + dir, 192, 256, (g, w, h) => {
    g.fillStyle = AMBER; g.fillRect(0, 0, w, h); g.fillStyle = '#111';
    g.save(); g.translate(w / 2, h / 2); g.scale(dir > 0 ? -1 : 1, 1);
    g.beginPath(); g.moveTo(-50, -90); g.lineTo(10, 0); g.lineTo(-50, 90); g.lineTo(-10, 90); g.lineTo(50, 0); g.lineTo(-10, -90); g.closePath(); g.fill(); g.restore();
  }),
  name: (text) => signTexture('name' + text, 768, 192, (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 18); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 7; roundRect(g, 14, 14, w - 28, h - 28, 12); g.stroke();
    g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, w - 80, 96, 600); g.fillText(text, w / 2, h / 2 + 4);
  }),
  // (v98) the board a mile before an exit: its number, the highway it leads to (shield and name), and the distance
  exitAdvance: (exit, dist, to) => signTexture('exa' + exit + (to ? to.id : ''), 640, 384, (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 18); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 7; roundRect(g, 14, 14, w - 28, h - 28, 12); g.stroke();
    g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!to) { g.font = `600 96px ${SIGN_FONT}`; g.fillText(`EXIT ${exit}`, w / 2, 122); g.font = `600 84px ${SIGN_FONT}`; g.fillText(dist, w / 2, 262); return; }
    g.font = `600 70px ${SIGN_FONT}`; g.fillText(`EXIT ${exit}`, w / 2, 74);
    shield(g, 112, 208, 132, to.route, to.shield);
    g.textAlign = 'left'; fitText(g, to.name, w - 240, 62, 600); g.fillText(to.name, 196, 208);
    g.textAlign = 'center'; g.font = `600 66px ${SIGN_FONT}`; g.fillText(dist, w / 2, 322);
  }),
  // (v98) road works: black on orange, a diamond like the yellow warnings. work: three short lines; workMerge: the
  // lane-ends picture (dir +1: the right lane ends, -1 the left)
  work: (text) => signTexture('work' + text.join('|'), 256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    roundRect(g, -88, -88, 176, 176, 12); g.fillStyle = WORK; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; roundRect(g, -80, -80, 160, 160, 9); g.stroke();
    g.rotate(-Math.PI / 4); g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    text.forEach((t, j) => { fitText(g, t, 150 - Math.abs(j - 1) * 46, 34, 700); g.fillText(t, 0, (j - 1) * 36 + 2); });
  }),
  workMerge: (dir) => signTexture('workmerge' + dir, 256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    roundRect(g, -88, -88, 176, 176, 12); g.fillStyle = WORK; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; roundRect(g, -80, -80, 160, 160, 9); g.stroke();
    g.rotate(-Math.PI / 4); g.scale(dir > 0 ? 1 : -1, 1); g.strokeStyle = '#111'; g.lineWidth = 11; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(-22, 62); g.lineTo(-22, -62); g.stroke();                                        // the lane that carries on
    g.beginPath(); g.moveTo(24, 62); g.lineTo(24, 14); g.quadraticCurveTo(24, -16, 2, -34); g.lineTo(2, -62); g.stroke();   // the one that ends, bending in
  }),
  // (v102) fuel: the blue services board, a pump on it and a line under it ("1 MILE", "NEXT RIGHT"; none in the gore)
  gas: (text) => signTexture('gas' + text, 256, 256, (g, w, h) => {
    roundRect(g, 6, 6, w - 12, h - 12, 18); g.fillStyle = '#0a4ea3'; g.fill(); g.strokeStyle = '#f4f4f0'; g.lineWidth = 7; roundRect(g, 16, 16, w - 32, h - 32, 12); g.stroke();
    g.fillStyle = '#f4f4f0'; const y0 = text ? 46 : 62;
    roundRect(g, 84, y0, 58, 96, 6); g.fill(); g.fillRect(74, y0 + 96, 78, 12);                                    // the pump and its plinth
    g.fillStyle = '#0a4ea3'; g.fillRect(94, y0 + 12, 38, 26);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(142, y0 + 30); g.lineTo(166, y0 + 44); g.lineTo(166, y0 + 84); g.stroke();   // the hose
    if (text) { g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, text, w - 60, 40, 700); g.fillText(text, w / 2, 206); }
  }),
  // (v100) road narrows: the two edge lines pinching in
  workNarrows: () => signTexture('worknarrows', 256, 256, (g, w, h) => {
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    roundRect(g, -88, -88, 176, 176, 12); g.fillStyle = WORK; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 6; roundRect(g, -80, -80, 160, 160, 9); g.stroke();
    g.rotate(-Math.PI / 4); g.strokeStyle = '#111'; g.lineWidth = 11; g.lineCap = 'butt';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 34, 62); g.lineTo(sx * 34, 22); g.lineTo(sx * 16, -14); g.lineTo(sx * 16, -62); g.stroke(); }
  }),
  // (v98) the sign in the gore where an exit leaves: EXIT, its number, and an arrow up and to the right
  gore: (exit) => signTexture('gore' + exit, 256, 320, (g, w, h) => {
    roundRect(g, 4, 4, w - 8, h - 8, 16); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 6; roundRect(g, 13, 13, w - 26, h - 26, 11); g.stroke();
    g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 78px ${SIGN_FONT}`; g.fillText('EXIT', w / 2, 70);
    g.font = `700 84px ${SIGN_FONT}`; g.fillText(String(exit), w / 2 - 40, 190);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 17; g.lineCap = 'butt'; g.beginPath(); g.moveTo(150, 250); g.lineTo(206, 172); g.stroke();
    g.beginPath(); g.moveTo(226, 144); g.lineTo(222, 214); g.lineTo(172, 178); g.closePath(); g.fill();
  }),
  guide: (key, lines, shieldNum, exitTab, shieldKind = 'interstate') => signTexture('guide' + key, 1024, 512, (g, w, h) => {
    const top = exitTab ? 92 : 0;
    if (exitTab) { roundRect(g, w - 420, 0, 410, 112, 14); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 6; roundRect(g, w - 410, 10, 390, 92, 10); g.stroke(); g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 64px ${SIGN_FONT}`; g.fillText(exitTab, w - 215, 60); }
    roundRect(g, 4, top + 4, w - 8, h - top - 8, 20); g.fillStyle = GREEN; g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 8; roundRect(g, 16, top + 16, w - 32, h - top - 32, 14); g.stroke();
    g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let y = top + 70;
    if (shieldNum) { shield(g, w / 2, top + 108, 150, shieldNum, shieldKind); y = top + 230; }
    for (const [text, size] of lines) { fitText(g, text, w - 90, size, 600); g.fillText(text, w / 2, y); y += size * 1.12; }
  }),
  closed: () => signTexture('closed', 512, 256, (g, w, h) => {
    for (let k = -2; k < 12; k++) { g.fillStyle = k % 2 ? '#f4f4f0' : '#e2401c'; g.beginPath(); g.moveTo(k * 48, 0); g.lineTo(k * 48 + 48, 0); g.lineTo(k * 48 + 48 - 100, h); g.lineTo(k * 48 - 100, h); g.closePath(); g.fill(); }
    g.fillStyle = '#111'; g.fillRect(w * 0.18, h * 0.3, w * 0.64, h * 0.4); g.fillStyle = '#f4f4f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 64px ${SIGN_FONT}`; g.fillText('ROAD CLOSED', w / 2, h / 2 + 3);
  }),
  reg: (k) => signTexture('reg' + k, 256, 320, (g, w, h) => {
    const lines = [['KEEP', 'RIGHT', 'EXCEPT', 'TO PASS'], ['SPEED', 'LIMIT', 'ENFORCED', 'BY AIRCRAFT'], ['TRUCKS', 'USE', 'RIGHT', 'LANE'], ['FINES', 'DOUBLED', 'IN WORK', 'ZONES']][k % 4];
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h); roundRect(g, 6, 6, w - 12, h - 12, 14); g.fillStyle = '#f4f4f0'; g.fill();
    roundRect(g, 14, 14, w - 28, h - 28, 10); g.strokeStyle = '#111'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((t, j) => { fitText(g, t, w - 50, 54, 600); g.fillText(t, w / 2, 62 + j * 66); });
  }),
  billboard: (k) => signTexture('bb' + k, 1024, 340, (g, w, h) => {
    const ads = [
      ['#0b0d12', '#ff3b30', 'NIGHT RUNNER', '#e9e9ee', 'THE ROAD NEVER ENDS'],
      ['#f2ead8', '#1d1d1d', "MAMA ROSA'S DINER", '#b0261c', 'OPEN 24 HRS · EXIT 22'],
      ['#06223f', '#ffd23f', 'SLOW DOWN.', '#ffffff', 'THEN DON’T.'],
      ['#111111', '#00e0ff', 'NEON MOTEL', '#ffffff', 'VACANCY · NEXT EXIT'],
      ['#e8e3d6', '#0f3d2e', 'DRIVE SAFE', '#333', 'SOMEONE IS WAITING UP'],
      ['#250b2e', '#ff6fd8', 'LATE NIGHT RADIO', '#ffffff', '98.7 FM · ALL NIGHT LONG'],
      ['#0d1a10', '#9cff57', 'TRUCK STOP', '#ffffff', 'DIESEL · COFFEE · 2 MILES'],
      ['#f5f0e6', '#c1121f', 'HOT COFFEE', '#222', 'NEXT EXIT · BEST IN THE STATE'],
    ];
    const [bg, c1, t1, c2, t2] = ads[k % ads.length];
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = c1; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, t1, w - 100, 150, 800); g.fillText(t1, w / 2, h * 0.42);
    g.fillStyle = c2; fitText(g, t2, w - 140, 62, 600); g.fillText(t2, w / 2, h * 0.8);
  }),
};

// ---------------------------------------------------------------- geometry helpers
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.extra = null; }
  get n() { return this.pos.length / 3; }
  v(x, y, z, nx, ny, nz, u, v) { this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); return this.n - 1; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.extra) for (const [k, arr, size] of this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
// Extrude a cross-section (list of [u, y] relative to the centreline point, applied on a given side) along samples.
// Each profile edge becomes its own strip with a flat normal, so concrete keeps crisp edges.
function extrudeProfile(gb, road, i0, i1, ox, oy, oz, prof, { uScale = 1 / 6, vMap = null, sKeep = null } = {}) {
  let perim = 0; const pl = [0];
  for (let k = 1; k < prof.length; k++) { perim += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]); pl.push(perim); }
  for (let k = 0; k < prof.length - 1; k++) {
    const [u0, y0] = prof[k], [u1, y1] = prof[k + 1];
    const du = u1 - u0, dy = y1 - y0, len = Math.hypot(du, dy) || 1;
    const nu = dy / len, ny = -du / len;   // profile normal in (u, y)
    const v0 = vMap ? vMap(pl[k] / perim, k) : pl[k] / perim, v1 = vMap ? vMap(pl[k + 1] / perim, k) : pl[k + 1] / perim;
    let prev = -1;
    for (let i = i0; i <= i1; i++) {
      if (sKeep && !sKeep(i)) { prev = -1; continue; }
      const th = road.T[i], rx = -Math.cos(th), rz = Math.sin(th), x = road.X[i], z = road.Z[i], y = road.Y[i], s = i * DS * uScale;
      const a = gb.v(x + rx * u0 - ox, y + y0 - oy, z + rz * u0 - oz, rx * nu, ny, rz * nu, s, v0);
      gb.v(x + rx * u1 - ox, y + y1 - oy, z + rz * u1 - oz, rx * nu, ny, rz * nu, s, v1);
      if (prev >= 0) gb.quad(prev, a, a + 1, prev + 1);
      prev = a;
    }
  }
}
// The same along a line whose offset changes from sample to sample (the ramp's rails): prof is [du, y] from uOf(i).
function extrudeOffset(gb, road, i0, i1, ox, oy, oz, prof, uOf, { uScale = 1 / 4, keep = null } = {}) {
  for (let k = 0; k < prof.length - 1; k++) {
    const [u0, y0] = prof[k], [u1, y1] = prof[k + 1];
    const du = u1 - u0, dy = y1 - y0, len = Math.hypot(du, dy) || 1, nu = dy / len, ny = -du / len;
    let prev = -1;
    for (let i = i0; i <= i1; i++) {
      if (keep && !keep(i)) { prev = -1; continue; }
      const th = road.T[i], rx = -Math.cos(th), rz = Math.sin(th), x = road.X[i], z = road.Z[i], y = road.Y[i], s = i * DS * uScale, b = uOf(i);
      const a = gb.v(x + rx * (b + u0) - ox, y + y0 - oy, z + rz * (b + u0) - oz, rx * nu, ny, rz * nu, s, k / (prof.length - 1));
      gb.v(x + rx * (b + u1) - ox, y + y1 - oy, z + rz * (b + u1) - oz, rx * nu, ny, rz * nu, s, (k + 1) / (prof.length - 1));
      if (prev >= 0) gb.quad(prev, a, a + 1, prev + 1);
      prev = a;
    }
  }
}
function boxInto(gb, cx, cy, cz, sx, sy, sz, rotY = 0, uvScale = 1) {
  const c = Math.cos(rotY), s = Math.sin(rotY), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
  const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
  const faces = [ // normal, tangent, bitangent (t x b = n), face width, face height
    [[1, 0, 0], [0, 0, -1], [0, 1, 0], sz, sy], [[-1, 0, 0], [0, 0, 1], [0, 1, 0], sz, sy],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1], sx, sz], [[0, -1, 0], [1, 0, 0], [0, 0, 1], sx, sz],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0], sx, sy], [[0, 0, -1], [-1, 0, 0], [0, 1, 0], sx, sy],
  ];
  for (const [n, t, b, w, h] of faces) {
    const ctr = [n[0] * hx, n[1] * hy, n[2] * hz], tv = [t[0] * hx, t[1] * hy, t[2] * hz], bv = [b[0] * hx, b[1] * hy, b[2] * hz];
    const nn = N(...n);
    const corner = (i, j) => P(ctr[0] + tv[0] * i + bv[0] * j, ctr[1] + tv[1] * i + bv[1] * j, ctr[2] + tv[2] * i + bv[2] * j);
    const k0 = gb.v(...corner(-1, -1), ...nn, 0, 0), k1 = gb.v(...corner(1, -1), ...nn, w * uvScale, 0);
    const k2 = gb.v(...corner(1, 1), ...nn, w * uvScale, h * uvScale), k3 = gb.v(...corner(-1, 1), ...nn, 0, h * uvScale);
    gb.quad(k0, k1, k2, k3);
  }
}

// ---------------------------------------------------------------- planar reflections and the car's reflection probe
class PlanarReflection {
  constructor(renderer, scale, layer) {
    this.renderer = renderer; this.scale = scale; this.layer = layer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(layer);
    this.matrix = new THREE.Matrix4();
    this._n = new THREE.Vector3(); this._p = new THREE.Vector3(); this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._la = new THREE.Vector3();
    this._rot = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clipList = [this._plane];
  }
  setSize(w, h) { const W = Math.max(4, Math.round(w * this.scale)), H = Math.max(4, Math.round(h * this.scale)); if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H); }
  render(scene, camera, point, normal) {
    const r = this.renderer, cam = this.cam;
    const camPos = this._v.setFromMatrixPosition(camera.matrixWorld);
    const view = this._t.subVectors(point, camPos);
    if (view.dot(normal) > 0) return false;
    view.reflect(normal).negate().add(point);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._la.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    const target = this._p.subVectors(point, look).reflect(normal).negate().add(point);
    cam.position.copy(view); cam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(normal); cam.lookAt(target);
    // the mirror only needs the near world: beyond a few hundred metres the reflection is a few hazy pixels
    cam.near = camera.near; cam.far = this.far ? Math.min(camera.far, this.far) : camera.far; cam.fov = camera.fov; cam.aspect = camera.aspect;
    if (camera.view && camera.view.enabled) { const v = camera.view; cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height); } else if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    if (!this.far) { cam.projectionMatrix.copy(camera.projectionMatrix); cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse); }
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // a clipping plane keeps everything below the mirror out (an oblique near plane would also skew the far
    // plane and the frustum culling with it, dropping distant objects from the reflection)
    this._plane.setFromNormalAndCoplanarPoint(normal, point);
    this._plane.constant += 0.05;   // keep what touches the mirror (tyres on the road)
    const prevRT = r.getRenderTarget(), prevShadow = r.shadowMap.autoUpdate, prevClip = r.clippingPlanes;
    r.shadowMap.autoUpdate = false; r.clippingPlanes = this._clipList;
    r.setRenderTarget(this.rt); r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prevRT); r.shadowMap.autoUpdate = prevShadow; r.clippingPlanes = prevClip;
    return true;
  }
}

// ---------------------------------------------------------------- the world
export class World {
  // (v98) seed: a different road every time unless one is asked for; highway: the id of one of HIGHWAYS (else one at random)
  constructor({ renderer, scene, camera, seed = (Math.random() * 2 ** 31) | 0, highway = null, base = './' }) {
    Object.assign(this, { renderer, scene, camera, base });
    this.road = new Road(seed, highway ? highwayById(highway) : HIGHWAYS[(Math.random() * HIGHWAYS.length) | 0]);
    this.flying = [];                   // drums knocked over at a lane closure, in flight
    this.shared = SHARED;
    this.offset = { x: 0, z: 0 };      // render coordinates = absolute - offset
    this.chunks = new Map();
    this.features = new Map();          // rivers and lakes: water planes and arch spans
    this.emitters = [];                 // streetlights currently built (absolute positions)
    this.hint = 0;
    this.quality = 2;
    this.onRebase = null;
    this.group = new THREE.Group(); this.group.name = 'world'; scene.add(this.group);
    this.tmp = new THREE.Vector3();
    this.initTextures();
    this.initMaterials();
    this.initSky();
    this.initLights();
    this.refl = new PlanarReflection(renderer, 0.5, 1); this.refl.far = 250;
    this.waterRefl = new PlanarReflection(renderer, 0.35, 1);
    SHARED.uRefl.value = this.refl.rt.texture; SHARED.uWaterRefl.value = this.waterRefl.rt.texture;
    this.initProbe();
    this.applyHighway();
    this.road.ensure(2200 / DS);
    // The city's and the valley's materials are first needed minutes into a run, and building a shader the first time
    // it is drawn froze the game for a third of a second as the skyline came into view. One speck of each, deep
    // under the start of the road, gets them built with everything else while the title screen is up (v91).
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0, 0.01], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.setAttribute('aB', new THREE.Float32BufferAttribute([1, 0, 0.2, 0, 1, 0, 0.2, 0, 1, 0, 0.2, 0], 4));
      g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
      for (const o of [new THREE.Mesh(g, this.mat.building), new THREE.Mesh(g, this.mat.pool), new THREE.Points(g, this.mat.townLights)]) {
        o.position.set(0, -400, 0); o.frustumCulled = false; if (o.isMesh) this.layer(o, true, true); this.scene.add(o);
      }
    }
  }
  initTextures() {
    const b = this.base + 'tex/', a = this.renderer.capabilities.getMaxAnisotropy();
    const mgr = new THREE.LoadingManager();
    this.loaded = new Promise((res) => { mgr.onLoad = res; mgr.onError = (u) => console.warn('texture failed', u); });
    const L = (f, o = {}) => loadTex(b + f, { mgr, ...o });
    this.tex = {
      asphalt: L('asphalt.jpg', { aniso: a }), concreteRoad: L('concrete_road.jpg', { aniso: a }), barrier: L('barrier.jpg'),
      concrete: L('concrete.jpg'), stone: L('stone.jpg'), rock: L('rock.jpg'), grass: L('grass.jpg'), dirt: L('dirt.jpg'),
      greenSteel: L('green_steel.jpg'), underside: L('underside.jpg'), beams: L('beams.jpg'), trees: L('trees.webp', { repeat: false }),
      waterN: L('water_n.jpg', { srgb: false }),
      // (v124) baked from two free scans of real ground (build/prep/trk-bake.mjs): worn tarmac 3.08 x 1.84 m, meadow about 3.3 x 1.1 m
      // (v127) from the owner's "game parts" collection: "Realtime Grass" by mfhscoobydoo, its ground picture and its three plates of blades
      envGround: L('env_ground.jpg', { aniso: a }), envBlades: L('env_blades.png', { repeat: false, aniso: 4 }),
      // (v126) the road scans from the owner's Blender project, baked flat (build/prep/bl-bake.py, trk-tile.mjs): the
      // tarmac is 6.06 x 2.45 m at 1.5 mm a pixel, the gravel 8.34 x 1.62 m at 2 mm; half that on touch screens
      trackTarmac: L(`track_tarmac${HALF}.jpg`, { aniso: a }), trackTarmacN: L(`track_tarmac_n${HALF}.jpg`, { aniso: a, srgb: false }),
      trackGravel: L(`track_gravel${HALF}.jpg`, { aniso: a }), trackGravelN: L(`track_gravel_n${HALF}.jpg`, { aniso: a, srgb: false }),
    };
    SHARED.uNoise.value = noiseTexture();
  }
  initMaterials() {
    const t = this.tex;
    this.mat = {
      road: roadMaterial(t), terrain: terrainMaterial(t), trees: treeMaterial(t), cone: coneMaterial(), water: waterMaterial(t),
      barrier: new THREE.MeshStandardMaterial({ map: t.barrier, roughness: 0.82, color: 0xb9b6ae }),
      concrete: new THREE.MeshStandardMaterial({ map: t.concrete, roughness: 0.88, color: 0xa8a49c }),
      stone: new THREE.MeshStandardMaterial({ map: t.stone, roughness: 0.92, color: 0xb8ad9c }),
      underside: new THREE.MeshStandardMaterial({ map: t.underside, roughness: 0.85, color: 0x9a9690 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x9da1a6, metalness: 0.85, roughness: 0.42, envMapIntensity: 0.35 }),
      pole: new THREE.MeshStandardMaterial({ color: 0x7c8187, metalness: 0.5, roughness: 0.6 }),
      green: new THREE.MeshStandardMaterial({ map: t.greenSteel, metalness: 0.55, roughness: 0.5, color: 0x9fb3a5 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x3c4146, metalness: 0.7, roughness: 0.5 }),
      archSteel: new THREE.MeshStandardMaterial({ map: t.greenSteel, metalness: 0.5, roughness: 0.5, color: 0xa9bcae, emissive: 0xffc890, emissiveMap: t.greenSteel, emissiveIntensity: 0.16 }),
      lampSodium: new THREE.MeshBasicMaterial({ color: SODIUM.clone().multiplyScalar(1.1) }),
      lampLantern: new THREE.MeshBasicMaterial({ color: LANTERN.clone().multiplyScalar(1.05) }),
      lampHead: new THREE.MeshBasicMaterial({ color: 0x3a3d42 }),
      navRed: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a12, emissiveIntensity: 4 }),
      signBack: new THREE.MeshStandardMaterial({ color: 0x7d8288, metalness: 0.6, roughness: 0.55 }),
      delinW: retroMaterial({ color: 0xf2f2f2, roughness: 0.4 }, 2.2, 0.0), delinY: retroMaterial({ color: 0xf2b21b, roughness: 0.4 }, 2.2, 0.0),
      floodBar: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff1d6, emissiveIntensity: 3 }),
      // the tunnel's walls, ceiling and portals (double-sided: seen from inside the tube and from the road outside), and its strip lights
      tunnel: new THREE.MeshStandardMaterial({ map: t.concrete, roughness: 0.9, color: 0x9a9892, side: THREE.DoubleSide }),
      tunnelLamp: new THREE.MeshBasicMaterial({ color: LED.clone().multiplyScalar(1.25) }),
      // v91, the city: its buildings, the pools of light under its street lamps, and the lights of the valley town
      building: buildingMaterial(),
      townLights: new THREE.PointsMaterial({ size: 2.3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
    };
    this.signMats = new Map();
    this.treeGeo = treeGeometry();
    this.coneGeo = new THREE.CylinderGeometry(0.35, 7.5, 1, 20, 1, true).translate(0, -0.5, 0);
    // flip the cone so y runs 0 (bottom) .. 1 (top) for the shader
    this.coneGeo.translate(0, 1, 0);
    this.poleGeo = this.buildPoleGeo();
    this.headGeo = mergeGeos([new THREE.BoxGeometry(0.95, 0.15, 0.44).translate(0, 0.02, 0), new THREE.CylinderGeometry(0.24, 0.18, 0.1, 10).scale(1.8, 1, 0.9).translate(0, 0.1, 0)]);
    // the lens is a flattened bulb, not a flat disc: a disc seen edge-on from the road is a one-pixel sliver whose
    // coverage changes every frame as you move, and that pulsing is what reads as a flickering lamp
    this.lensGeo = new THREE.SphereGeometry(0.21, 14, 10).scale(1.5, 0.42, 1.0).translate(0, -0.07, 0);
    this.glowTex = (() => {
      const c = canvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.mat.glow = glowMaterial(this.glowTex, 4.2, 0.9);
    this.mat.pool = new THREE.MeshBasicMaterial({ map: this.glowTex, color: SODIUM.clone().multiplyScalar(0.42), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    // the valley town's lights are soft round dots, not square pixels
    Object.assign(this.mat.townLights, { map: this.glowTex, size: 9, blending: THREE.AdditiveBlending, opacity: 1 });
    this.postGeo = new THREE.BoxGeometry(0.16, 1.05, 0.16).translate(0, 0.52, 0);
    this.delGeo = new THREE.BoxGeometry(0.05, 0.1, 0.12);
    this.lanternBulbGeo = new THREE.SphereGeometry(0.26, 12, 8).translate(0, 5.82, 0);
    this.navGeo = new THREE.SphereGeometry(0.18, 8, 6);
    this.lanternGeo = this.buildLanternGeo();
    this.sharedGeo = new Set([this.treeGeo, this.coneGeo, this.poleGeo, this.headGeo, this.lensGeo, this.postGeo, this.lanternGeo, this.delGeo, this.lanternBulbGeo, this.navGeo]);
  }
  // ---- a new road (v98): a new run, or the highway an exit leads to. Everything built for the old one is dropped.
  // seed: any whole number (a random one if left out); highway: one of HIGHWAYS, or its id (the same one again if left
  // out); opts.entry: the car is coming off another highway's exit, so the entrance ramp is open road behind it.
  // ---- the open area (v118, the owner: "remove all the roads and features and police and literally just make it so
  // that when u start u go to a completely open area"). With it on there is no road: nothing of one is built, the
  // ground is one level sheet of tarmac that rides along under the car (its marks stay where they are in the world),
  // nothing walls the car in, and "where on the road is this" always answers level ground. The sky, the far hills,
  // the weather, the mirror in the wet and the car's reflections carry on as before. The road code is all still here.
  setOpen(on = true) {
    this.open = !!on;
    if (on && !this.pad) {
      this.mat.pad = padMaterial(this.tex);
      this.pad = new THREE.Mesh(new THREE.PlaneGeometry(7200, 7200).rotateX(-Math.PI / 2), this.mat.pad);
      this.pad.frustumCulled = false; this.layer(this.pad, false, true); this.group.add(this.pad);
    }
    if (this.pad) this.pad.visible = this.open;
    if (on) {
      for (const [c, ch] of [...this.chunks]) this.disposeChunk(c, ch);
      for (const ft of this.features.values()) { this.group.remove(ft.group); ft.disposables.forEach((d) => d.dispose()); }
      this.features.clear(); this.emitters = []; this.pending = null; this.flying = [];
      this.onRamp = true; this.onExit = null; this.lastLoc = null;
      // no lamps out here: the brighter moon of the unlit highways, and paint that throws the headlights back
      this.nightHemi = 2.1; this.nightMoon = 1.0; this.hemi.intensity = this.nightHemi; this.moon.intensity = this.nightMoon; SHARED.uRetroK.value = 5; this.fogK = 1;
    }
  }
  // ---- the mountain circuit (v122, the owner: "I want to build a mountain racetrack through the green mountains").
  // Its line and the land come from track-core.js; this makes them solid. Four things are built, once: the strip of
  // tarmac, kerbs and verge from rail to rail; the hand-shaped ground from each rail out to SKIRT metres, which carries
  // the road's level out into the land's; the land itself, one grid of SIZE metres at CELL metres a square (sunk a
  // little under that hand-shaped strip, so the two never fight); and a steel rail on posts down each side.
  setTrack() {
    if (this.track) return;
    const tr = this.track = buildTrack(), gr = this.ground = buildGround(tr), { HW, WALL, SKIRT, SIZE, CELL } = TRACK, N = tr.N, E = WALL + 0.6;
    const G = this.trackGroup = new THREE.Group(); G.name = 'circuit'; this.group.add(G);
    if (this.pad) this.pad.visible = false;
    this.fogK = 0.3;   // thinner haze than the apron's: the mountains are the view
    this.mat.track = trackMaterial(this.tex, tr.L); this.mat.alpine = alpineMaterial(this.tex);
    const mesh = (pos, idx, mat, extra = {}, normals = null) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      for (const k in extra) g.setAttribute(k, new THREE.BufferAttribute(extra[k], k === 'uv' || k === 'aFwd' ? 2 : 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      if (normals) g.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); else g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; this.layer(m, false, true); G.add(m); return m;
    };
    const right = (k) => [-Math.cos(tr.T[k]), Math.sin(tr.T[k])];
    // 1. the strip
    {
      const US = [-E, -HW - 1.4, -HW, 0, HW, HW + 1.4, E], nu = US.length, pos = new Float32Array((N + 1) * nu * 3), nor = new Float32Array((N + 1) * nu * 3), uv = new Float32Array((N + 1) * nu * 2), fw = new Float32Array((N + 1) * nu * 2), kb = new Float32Array((N + 1) * nu), idx = new Uint32Array(N * (nu - 1) * 6);
      let q = 0;
      for (let i = 0; i <= N; i++) {
        const k = i % N, [rx, rz] = right(k), g = tr.G[k], nx = -g * Math.sin(tr.T[k]), nz = -g * Math.cos(tr.T[k]), nl = Math.hypot(nx, 1, nz);
        for (let j = 0; j < nu; j++) { const o = i * nu + j; pos[o * 3] = tr.X[k] + rx * US[j]; pos[o * 3 + 1] = tr.Y[k]; pos[o * 3 + 2] = tr.Z[k] + rz * US[j]; nor[o * 3] = nx / nl; nor[o * 3 + 1] = 1 / nl; nor[o * 3 + 2] = nz / nl; uv[o * 2] = US[j]; uv[o * 2 + 1] = i * tr.DS; kb[o] = tr.kerb[k]; fw[o * 2] = Math.sin(tr.T[k]); fw[o * 2 + 1] = Math.cos(tr.T[k]); }
        if (i < N) for (let j = 0; j < nu - 1; j++) { const a = i * nu + j, b = a + 1, c = a + nu, d = c + 1; idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
      }
      this.trackStrip = mesh(pos, idx, this.mat.track, { uv, aKerb: kb, aFwd: fw }, nor); this.trackStrip.receiveShadow = true;
    }
    // 2. the hand-shaped ground either side: level with the road at the rail, the land's own height (less a little, so the land covers its edge) at SKIRT
    {
      const DD = [E, E + 2.2, E + 5.5, E + 9.5, E + 13.5, SKIRT], nd = DD.length, pos = new Float32Array(2 * (N + 1) * nd * 3), fo = new Float32Array(2 * (N + 1) * nd), idx = new Uint32Array(2 * N * (nd - 1) * 6);
      let q = 0;
      for (let side = 0; side < 2; side++) for (let i = 0; i <= N; i++) {
        const k = i % N, sg = side ? 1 : -1, [rx, rz] = right(k), base = side * (N + 1) * nd;
        for (let j = 0; j < nd; j++) { const o = base + i * nd + j, x = tr.X[k] + rx * sg * DD[j], z = tr.Z[k] + rz * sg * DD[j], t = (DD[j] - E) / (SKIRT - E), f = t * t * (3 - 2 * t), y = j ? tr.Y[k] + (gr.H(x, z) - 0.8 * t - tr.Y[k]) * f : tr.Y[k]; pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z; fo[o] = gr.forest(x, z, y, 0.3, DD[j]); }
        if (i < N) for (let j = 0; j < nd - 1; j++) { const a = base + i * nd + j, b = a + 1, c = a + nd, d = c + 1; if (side) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; } else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; } }
      }
      mesh(pos, idx, this.mat.alpine, { aForest: fo }).receiveShadow = true;
    }
    // 3. the land, in two pieces: CELL-metre squares for a kilometre round the circuit, and squares four times the size
    // for the mountains beyond (they are a kilometre off and more: a third of the triangles for the same view). The
    // coarse piece carries on under the fine one, sunk a little, so no gap can open where they meet. Each corner of
    // each square also knows how wooded it is (aForest): the ground under the trees is dark, and beyond where trees
    // are stood that same dark green is the forest.
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < N; i++) { x0 = Math.min(x0, tr.X[i]); x1 = Math.max(x1, tr.X[i]); z0 = Math.min(z0, tr.Z[i]); z1 = Math.max(z1, tr.Z[i]); }
    const BIG = CELL * 4, IN = 1024, cx = Math.round((x0 + x1) / 2 / BIG) * BIG, cz = Math.round((z0 + z1) / 2 / BIG) * BIG;
    {
      const grid = (ox, oz, size, cell, sink) => {
        const n = size / cell + 1, hs = new Float32Array(n * n), pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), fo = new Float32Array(n * n), idx = new Uint32Array((n - 1) * (n - 1) * 6);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = gr.H(ox + i * cell, oz + j * cell, true);
        let q = 0;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const o = j * n + i, x = ox + i * cell, z = oz + j * cell, hx = hs[j * n + Math.min(n - 1, i + 1)] - hs[j * n + Math.max(0, i - 1)], hz = hs[Math.min(n - 1, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i], nx = -hx / (2 * cell), nz = -hz / (2 * cell), nl = Math.hypot(nx, 1, nz);
          pos[o * 3] = x; pos[o * 3 + 1] = hs[o] - (sink ? sink(x, z) : 0); pos[o * 3 + 2] = z; nor[o * 3] = nx / nl; nor[o * 3 + 1] = 1 / nl; nor[o * 3 + 2] = nz / nl;
          fo[o] = gr.forest(x, z, hs[o], Math.hypot(nx, nz), gr.dist(x, z));
          if (i < n - 1 && j < n - 1) { const a = o, b = o + 1, c = o + n, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
        }
        return mesh(pos, idx, this.mat.alpine, { aForest: fo }, nor);
      };
      this.land = grid(cx - IN, cz - IN, 2 * IN, CELL, null); this.land.receiveShadow = true;
      // (how far inside the fine piece's edge a point is: the coarse piece sinks from there, 6 m within two of its own squares)
      this.landFar = grid(-SIZE / 2, -SIZE / 2, SIZE, BIG, (x, z) => 6 * Math.min(1, Math.max(0, (IN - Math.max(Math.abs(x - cx), Math.abs(z - cz))) / (2 * BIG))));
    }
    // 4. the woods (v123): the game's own photographed trees, stood wherever the land says it is wooded, out to 900 m
    // from the middle of the circuit (past that the dark ground is the forest). Sixteen batches, so only the ones in
    // view are drawn.
    {
      const rnd = mulberry32(90210), cum = []; let tot = 0; for (const w of CARD_WEIGHT) { tot += w; cum.push(tot); }
      const TILE = 512, REACH = 900, STEP = 6.2, tiles = new Map();
      for (let z = cz - REACH; z < cz + REACH; z += STEP) for (let x = cx - REACH; x < cx + REACH; x += STEP) {
        const px = x + (rnd() - 0.5) * STEP * 0.9, pz = z + (rnd() - 0.5) * STEP * 0.9, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd();
        if (gr.forest(px, pz, 0, 0, 100) < 0.05) continue;                    // (the cheap part first: is this in a wood at all)
        const d = gr.dist(px, pz); if (d < NEAR_TREES) continue;   // (v127: within NEAR_TREES of the track the trees are the modelled ones, see dressEnv)
        const h = gr.surface(px, pz), slope = Math.hypot(gr.H(px + 3, pz) - gr.H(px - 3, pz), gr.H(px, pz + 3) - gr.H(px, pz - 3)) / 6;
        if (r1 > gr.forest(px, pz, h, slope, d) * 0.94) continue;
        const pick = r2 * tot, card = cum.findIndex((v) => pick <= v), key = Math.floor((px - cx + REACH) / TILE) + 8 * Math.floor((pz - cz + REACH) / TILE);
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push([px, h - 0.35, pz, (d < 60 ? 8 : 11) + r3 * 9, card, r4 * Math.PI, 0.62 + r5 * 0.3]);
      }
      const mtx = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      this.treeCount = 0;
      for (const inst of tiles.values()) {
        const im = new THREE.InstancedMesh(this.treeGeo.clone(), this.mat.trees, inst.length), aCard = new Float32Array(inst.length * 4), aTint = new Float32Array(inst.length * 3);
        inst.forEach(([x, y, z, Ht, card, rot, tint], k) => { const C = TREE_CARDS[card]; qn.setFromAxisAngle(up, rot); sc.set(Ht * C.aspect, Ht, Ht * C.aspect); pv.set(x, y, z); mtx.compose(pv, qn, sc); im.setMatrixAt(k, mtx); aCard.set(C.r, k * 4); aTint.set([tint * 0.95, tint, tint * 0.9], k * 3); });
        im.geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(aCard, 4)); im.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
        im.computeBoundingSphere(); this.layer(im, false, false); G.add(im); this.treeCount += inst.length;   // (no shadows from these: they stand 46 m and more from the road, and drawing thousands of cut-out cards into the shadow map cost more than everything else)
      }
    }
    // 5. the rails (v123, the owner: "the guardrails more detailed"): two corrugated beams one over the other each side,
    // as round a circuit, in 4 m panels with a lapped joint at each post; every post a steel channel with a spacer
    // block that holds the beams off it.
    {
      const PR = [[0, 0], [0.014, 0.02], [0.074, 0.07], [0.086, 0.105], [0.03, 0.155], [0.086, 0.205], [0.074, 0.24], [0.014, 0.29], [0, 0.31]], BEAMS = [0.31, 0.65], np = PR.length;
      const ks = []; for (let k = 0; k < N; k += 2) ks.push(k); ks.push(0);
      const ns = ks.length, per = BEAMS.length * np, pos = new Float32Array(2 * ns * per * 3), uv = new Float32Array(2 * ns * per * 2), idx = new Uint32Array(2 * (ns - 1) * BEAMS.length * (np - 1) * 6);
      let q = 0;
      for (let side = 0; side < 2; side++) for (let i = 0; i < ns; i++) {
        const k = ks[i], sg = side ? 1 : -1, [rx, rz] = right(k), base = side * ns * per;
        for (let b = 0; b < BEAMS.length; b++) for (let j = 0; j < np; j++) { const o = base + i * per + b * np + j, u = sg * (WALL - PR[j][0]); pos[o * 3] = tr.X[k] + rx * u; pos[o * 3 + 1] = tr.Y[k] + BEAMS[b] + PR[j][1]; pos[o * 3 + 2] = tr.Z[k] + rz * u; uv[o * 2] = i; uv[o * 2 + 1] = j / (np - 1); }
        if (i < ns - 1) for (let b = 0; b < BEAMS.length; b++) for (let j = 0; j < np - 1; j++) { const a = base + i * per + b * np + j, bb = a + 1, c = a + per, d = c + 1; idx[q++] = a; idx[q++] = bb; idx[q++] = c; idx[q++] = bb; idx[q++] = d; idx[q++] = c; }
      }
      const steel = new THREE.MeshStandardMaterial({ color: 0xc6cacd, metalness: 0, roughness: 0.55, envMapIntensity: 0.5, emissive: 0x2a2d30, side: THREE.DoubleSide });
      steel.onBeforeCompile = (shader) => {
        shader.uniforms.tNoise = SHARED.uNoise; shader.uniforms.uRailCut = RAIL_CUT;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRail; varying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\n  vRail = uv; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRail; varying vec3 vWP; uniform sampler2D tNoise; uniform vec4 uRailCut;')
          .replace('#include <map_fragment>', `#include <map_fragment>
  if (distance(vWP.xz, uRailCut.xy) < uRailCut.z) discard;   // (v124) near the car the modelled rail stands here instead
  { float f = fract(vRail.x), jn = min(f, 1.0 - f);                                   // 0 at a joint
    float lap = 1.0 - smoothstep(0.004, 0.012, abs(jn - 0.02));                         // the edge of the panel lapped over the next
    float bolt = (1.0 - smoothstep(0.008, 0.013, length(vec2((jn - 0.045) * 4.0, abs(vRail.y - 0.5) - 0.24)))) + (1.0 - smoothstep(0.008, 0.013, length(vec2((jn - 0.045) * 4.0, vRail.y - 0.5))));
    vec3 nz = texture2D(tNoise, vec2(vWP.x + vWP.z, vWP.y * 6.0) / 9.0).rgb;
    diffuseColor.rgb *= (0.84 + 0.3 * nz.r) * (1.0 - 0.45 * lap) * (1.0 - 0.55 * clamp(bolt, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.24, 0.17), smoothstep(0.7, 0.9, nz.g) * 0.25 * (1.0 - vRail.y)); }`);   // a little rust low down
      };
      steel.customProgramCacheKey = () => 'nr-rail2';
      this.railFar = mesh(pos, idx, steel, { uv }); this.railFar.castShadow = false; this.railKs = ks;
      const postGeo = mergeGeos([new THREE.BoxGeometry(0.075, 1.02, 0.12).translate(0.115, 0.51, 0), new THREE.BoxGeometry(0.03, 1.02, 0.05).translate(0.135, 0.51, 0.085), new THREE.BoxGeometry(0.03, 1.02, 0.05).translate(0.135, 0.51, -0.085), new THREE.BoxGeometry(0.075, 0.62, 0.14).translate(0.04, 0.63, 0)]);
      const postMat = new THREE.MeshStandardMaterial({ color: 0xa4a9ad, metalness: 0, roughness: 0.65, envMapIntensity: 0.4, emissive: 0x1e2022 });
      postMat.onBeforeCompile = (shader) => { shader.uniforms.uRailCut = RAIL_CUT; shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPp;').replace('#include <project_vertex>', '#include <project_vertex>\n  vWPp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;'); shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPp; uniform vec4 uRailCut;').replace('#include <map_fragment>', '#include <map_fragment>\n  if (distance(vWPp.xz, uRailCut.xy) < uRailCut.z) discard;'); };
      postMat.customProgramCacheKey = () => 'nr-post1';
      const cnt = 2 * (ns - 1), posts = new THREE.InstancedMesh(postGeo, postMat, cnt), M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
      let c = 0;
      for (let side = 0; side < 2; side++) for (let i = 0; i < ns - 1; i++) { const k = ks[i], sg = side ? 1 : -1, [rx, rz] = right(k), u = sg * WALL; P.set(tr.X[k] + rx * u, tr.Y[k] - 0.02, tr.Z[k] + rz * u); Qn.setFromAxisAngle(up, Math.atan2(-sg * rz, sg * rx)); M.compose(P, Qn, one); posts.setMatrixAt(c++, M); }
      posts.frustumCulled = false; this.layer(posts, false, false); G.add(posts);
    }
  }
  // ---- the circuit's downloaded props (v124, the owner: "look on sketchfab for models for these things and use free
  // ones"). Two free models, both CC BY 4.0, handed over by the game once it has loaded them:
  //  - "GuardRail and Terminal" by xplanepilot: its 4 m two-rail panel (weathered, with its own posts) stands in for
  //    the plain rail wherever the car is: RAILN panels each side, moved along with the car (a whole lap of it would be
  //    3.4 million triangles; this is 200 thousand). Each panel leans, sits and is stained a little differently.
  //  - "Dry grass" by Pixel-bit: seven clumps on crossed cards, stood along the foot of the rails (where no mower
  //    reaches), on the verges and in the meadow beside the track: 100 m batches, drawn only near the car.
  dressTrack(railScene, grassScene) {
    const tr = this.track, gr = this.ground, { WALL, HW, SKIRT } = TRACK, N = tr.N, G = this.trackGroup, E = WALL + 0.6;
    const right = (k) => [-Math.cos(tr.T[k]), Math.sin(tr.T[k])];
    const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    // rails
    let seg = null; railScene.updateMatrixWorld(true);
    railScene.traverse((o) => { if (o.isMesh && /GuardRail/i.test(o.name) && !/terminal/i.test(o.name) && !/terminal/i.test(o.parent?.name || '')) seg = o; });
    if (seg) {
      const geo = seg.geometry.clone().applyMatrix4(seg.matrixWorld); geo.computeBoundingBox();
      const bb = geo.boundingBox, len = bb.max.x - bb.min.x; geo.translate(-bb.min.x, -bb.min.y, 0);
      // (its metal map made the beams a black mirror under this game's lighting: galvanised steel is drawn here as a dull, pale surface with the model's own colour, dents and roughness)
      const mat = seg.material; mat.metalnessMap = null; mat.metalness = 0.12; mat.envMapIntensity = 0.5; mat.side = THREE.DoubleSide; mat.emissive = new THREE.Color(0x15171a); mat.needsUpdate = true;
      const RAILN = 58, im = new THREE.InstancedMesh(geo, mat, 2 * RAILN); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; this.layer(im, false, false); G.add(im);
      this.railNear = { im, RAILN, len, at: -1, ks: this.railKs, face: -1 };   // (face: the model's posts are on its -z side; they go on the side away from the track)
      this.updateDress(this.lastLoc || this.locate(0, 0), true);
    }
    // grass
    const clumps = []; if (grassScene) grassScene.updateMatrixWorld(true);   // (v127: no longer handed over: the blades of dressEnv took the dry clumps' place)
    if (grassScene) grassScene.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.computeBoundingBox(); const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, -b.min.y - 0.04, -(b.min.z + b.max.z) / 2); clumps.push({ g, map: o.material.map }); });
    if (clumps.length) {
      const gm = new THREE.MeshLambertMaterial({ map: clumps[0].map, alphaTest: 0.38, side: THREE.DoubleSide });
      gm.onBeforeCompile = (shader) => { shader.uniforms.uTreeFill = TREE_FILL; shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(position.x * 0.5, 1.0, position.z * 0.5));\n  #ifdef USE_TANGENT\n  vec3 objectTangent = vec3( tangent.xyz );\n  #endif'); shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTreeFill;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uTreeFill * 0.5;'); };
      gm.customProgramCacheKey = () => 'nr-tuft1';
      const rnd = mulberry32(4711), CH = 50, kinds = Math.min(3, clumps.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), Sc = new THREE.Vector3(), C = new THREE.Color();
      this.tufts = []; let total = 0;
      for (let c0 = 0; c0 < N; c0 += CH) {
        const lists = Array.from({ length: kinds }, () => []);
        const put = (k, u, big) => { const [rx, rz] = right(k), f = rnd() * tr.DS, x = tr.X[k] + rx * u + Math.sin(tr.T[k]) * f, z = tr.Z[k] + rz * u + Math.cos(tr.T[k]) * f, au = Math.abs(u); if (au > E && gr.forest(x, z, 0, 0, au) > 0.7 && rnd() < 0.7) return; lists[(rnd() * kinds) | 0].push([x, au < E ? tr.Y[k] : gr.surface(x, z), z, (big ? 0.85 : 0.55) + rnd() * 0.75, rnd() * 6.283, rnd(), rnd()]); };
        for (let k = c0; k < Math.min(N, c0 + CH); k++) for (const sg of [-1, 1]) {
          put(k, sg * (WALL + 0.15 + rnd() * 0.45), true); if (rnd() < 0.7) put(k, sg * (WALL - 0.25 + rnd() * 0.3), true);   // along the foot of the rail
          if (rnd() < 0.3) put(k, sg * (HW + 1.7 + rnd() * (WALL - HW - 2.2)), false);                                          // the odd one on the mown verge
          for (let j = 0; j < 6; j++) put(k, sg * (WALL + 0.8 + rnd() * rnd() * (SKIRT + 10 - WALL)), rnd() < 0.5);            // thicker just behind the rail, thinning out
        }
        const mid = Math.min(N - 1, c0 + (CH >> 1)), group = { x: tr.X[mid], z: tr.Z[mid], meshes: [] };
        lists.forEach((L, t) => { if (!L.length) return; const im = new THREE.InstancedMesh(clumps[t].g, gm, L.length);
          L.forEach(([x, y, z, sc, rot, r1, r2], i) => { P.set(x, y, z); Q.setFromAxisAngle(up, rot); Sc.set(sc, sc * (0.85 + 0.4 * r2), sc); M.compose(P, Q, Sc); im.setMatrixAt(i, M); if (r1 < 0.72) C.setRGB(0.42 + 0.2 * r2, 0.62 + 0.25 * r2, 0.26 + 0.12 * r2); else C.setRGB(0.95, 0.9 - 0.12 * r2, 0.66); im.setColorAt(i, C); });
          im.computeBoundingSphere(); im.castShadow = false; im.visible = false; this.layer(im, false, false); G.add(im); group.meshes.push(im); total += L.length; });
        this.tufts.push(group);
      }
      this.tuftCount = total;
    }
    this.updateDress(this.lastLoc || this.locate(0, 0), true);
  }
  // ---- the scenery from the owner's "game parts" collection (v127, the owner: "every part of the environment apart from
  // the shape of the track needs upgrading ... in my game parts folder on sketchfab there are tons of elements"). The
  // game hands over one file of models (build/prep/env-props.mjs) once it has loaded:
  //  - trees: "Low Poly Tree Scene Free" by Nicholas-3D. Every tree within NEAR_TREES m of the track is this model
  //    (a real trunk and leaves, turned and sized differently each time); from further than 230 m along the road it is
  //    swapped for a photographed card (135 m: a frame cost 22 ms with them modelled out to 230 m, v127). The woods beyond that band stay cards.
  //  - rocks: "40 Rocks" by FifthElement, twelve of its stones, scattered singly and in groups beyond the rails.
  //  - grass: the three plates of blades of "Realtime Grass" by mfhscoobydoo, about 210,000 of them along the whole
  //    track from the verge out to 40 m, swaying a little. They are worked out a few hundred at a time over the
  //    first seconds (nearest the car first), so nothing stalls.
  // Everything is kept in 100 m lengths of track and only the lengths near the car are drawn.
  dressEnv(envScene) {
    const tr = this.track, gr = this.ground, { WALL, HW } = TRACK, N = tr.N, G = this.trackGroup, E = WALL + 0.6, CH = 50;
    const geo = {}; envScene.updateMatrixWorld(true); envScene.traverse((o) => { if (o.isMesh) geo[o.name] = o; });
    const right = (k) => [-Math.cos(tr.T[k]), Math.sin(tr.T[k])], rnd = mulberry32(1127);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), Sc = new THREE.Vector3(), C = new THREE.Color(), Ev = new THREE.Euler();
    const bark = geo.tree_bark, leaves = geo.tree_leaves;
    if (bark) { bark.material.envMapIntensity = 0.3; }
    if (leaves) { const m = leaves.material; m.envMapIntensity = 0.3; m.emissive = new THREE.Color(0.055, 0.065, 0.045); m.emissiveMap = m.map; m.alphaTest = 0.45; m.transparent = false; m.side = THREE.DoubleSide; m.needsUpdate = true; }
    const rocks = []; for (let i = 0; i < 12; i++) if (geo['rock_' + i]) rocks.push(geo['rock_' + i].geometry);
    const rockMat = rocks.length ? geo.rock_0.material : null; if (rockMat) { rockMat.envMapIntensity = 0.3; rockMat.color.setRGB(2.3, 2.3, 2.2); /* the stones' picture is dark grey: this makes them the pale limestone of the mountains */ }
    // the blades: three quads crossed at 60 degrees, a metre wide and half a metre tall, its foot at the ground
    const bg = new THREE.BufferGeometry(), bp = [], buv = [], bi = [];
    for (let q = 0; q < 3; q++) { const a = q * Math.PI / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = bp.length / 3; bp.push(-cx, 0, -cz, cx, 0, cz, cx, 0.5, cz, -cx, 0.5, -cz); buv.push(0, 0, 1, 0, 1, 1, 0, 1); bi.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(bp.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); bg.setIndex(bi);
    const bladeMat = new THREE.MeshLambertMaterial({ map: this.tex.envBlades, alphaTest: 0.3, side: THREE.DoubleSide });
    bladeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = SHARED.uTime; shader.uniforms.uTreeFill = TREE_FILL;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPlate; uniform float uTime;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vec2(uv.x, 1.0 - (aPlate + 1.0 - uv.y * 0.985 - 0.008) / 3.0);')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n  #ifdef USE_TANGENT\n  vec3 objectTangent = vec3( tangent.xyz );\n  #endif')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  { vec3 ip = instanceMatrix[3].xyz; float w = uv.y * uv.y; transformed.x += sin(uTime * 1.9 + ip.x * 0.7 + ip.z * 0.4) * 0.05 * w; transformed.z += cos(uTime * 1.5 + ip.z * 0.6) * 0.04 * w; }');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTreeFill;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uTreeFill * 0.45;');
    };
    bladeMat.customProgramCacheKey = () => 'nr-blade1';
    this.envB = []; this.envQueue = []; let nTree = 0, nRock = 0;
    for (let c0 = 0; c0 < N; c0 += CH) {
      const c1 = Math.min(N, c0 + CH), mid = Math.min(N - 1, c0 + (CH >> 1)), B = { x: tr.X[mid], z: tr.Z[mid], near: [], far: [], grass: [], all: [], c0, c1 };
      // trees
      const T = [];
      for (let k = c0; k < c1; k += 3) for (const sg of [-1, 1]) for (let u = WALL + 4.5; u < NEAR_TREES; u += 6.2) {
        const [rx, rz] = right(k), uu = sg * (u + (rnd() - 0.5) * 5), f = (rnd() - 0.5) * 5, x = tr.X[k] + rx * uu + Math.sin(tr.T[k]) * f, z = tr.Z[k] + rz * uu + Math.cos(tr.T[k]) * f, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
        const d = gr.dist(x, z); if (d < WALL + 3.5 || d < Math.abs(uu) - 6) continue;                 // (clear of the rails, and of any other part of the track that comes by here)
        const h = gr.surface(x, z); if (r1 > gr.forest(x, z, h, 0.3, d) * 0.94) continue;
        T.push([x, h - 0.25, z, 1.05 + r2 * 0.85, r3 * 6.283, r4]);
      }
      if (T.length && bark && leaves) {
        const ib = new THREE.InstancedMesh(bark.geometry, bark.material, T.length), il = new THREE.InstancedMesh(leaves.geometry, leaves.material, T.length), ic = new THREE.InstancedMesh(this.treeGeo.clone(), this.mat.trees, T.length), aCard = new Float32Array(T.length * 4), aTint = new Float32Array(T.length * 3), card = TREE_CARDS[7];
        T.forEach(([x, y, z, sc, rot, r], i) => { P.set(x, y, z); Q.setFromAxisAngle(up, rot); Sc.set(sc, sc * (0.92 + 0.2 * r), sc); M.compose(P, Q, Sc); ib.setMatrixAt(i, M); il.setMatrixAt(i, M); C.setRGB(0.26 + 0.14 * r, 0.31 + 0.12 * r, 0.26 + 0.1 * r); il.setColorAt(i, C); C.setRGB(0.8, 0.76, 0.7); ib.setColorAt(i, C);   // (the leaf picture is a bright spring green: these bring it to a tree's)
          const Ht = 8.8 * sc; Sc.set(Ht * card.aspect, Ht, Ht * card.aspect); M.compose(P, Q, Sc); ic.setMatrixAt(i, M); aCard.set(card.r, i * 4); aTint.set([0.6 + 0.2 * r, 0.74 + 0.2 * r, 0.5], i * 3); });
        ic.geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(aCard, 4)); ic.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
        for (const m of [ib, il, ic]) { m.computeBoundingSphere(); m.castShadow = m !== ic; m.visible = false; this.layer(m, false, false); G.add(m); B.all.push(m); }   // (the far cards throw none: they are beyond the shadows' square)
        ib.receiveShadow = il.receiveShadow = true;
        B.near.push(ib, il); B.far.push(ic); nTree += T.length;
      }
      // rocks: one piece of geometry for the whole length
      if (rocks.length) {
        const pos = [], nor = [], uv = [], idx = [], v = new THREE.Vector3(), n3 = new THREE.Matrix3();
        const put = (x, z, sc) => { const g = rocks[(rnd() * rocks.length) | 0], y = gr.surface(x, z), b = pos.length / 3, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; Ev.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5); Q.setFromEuler(Ev); P.set(x, y, z); Sc.set(sc, sc * (0.7 + rnd() * 0.5), sc); M.compose(P, Q, Sc); n3.getNormalMatrix(M);
          for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z); uv.push(ua.getX(i), ua.getY(i)); }
          const ia = g.index; for (let i = 0; i < ia.count; i++) idx.push(b + ia.getX(i)); nRock++; };
        for (let k = c0; k < c1; k += 2) for (const sg of [-1, 1]) {
          if (rnd() > 0.2) continue;
          const [rx, rz] = right(k), u = sg * (WALL + 1.2 + rnd() * rnd() * 46), x = tr.X[k] + rx * u, z = tr.Z[k] + rz * u; if (gr.dist(x, z) < WALL + 1) continue;
          const big = rnd() < 0.25 ? 1.3 + rnd() * 2.2 : 0.35 + rnd() * 0.8; put(x, z, big);
          if (big > 1.2) for (let j = 0, m = 2 + (rnd() * 4 | 0); j < m; j++) { const a = rnd() * 6.283, r = big * (0.6 + rnd() * 0.9), x2 = x + Math.cos(a) * r, z2 = z + Math.sin(a) * r; if (gr.dist(x2, z2) > WALL + 1) put(x2, z2, 0.25 + rnd() * 0.7); }
        }
        if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
          const m = new THREE.Mesh(g, rockMat); m.castShadow = m.receiveShadow = true; m.visible = false; this.layer(m, false, false); G.add(m); B.near.push(m); B.far.push(m); B.all.push(m); }
      }
      this.envB.push(B);
    }
    // the blades of one length of track, a few hundred at a time
    const self = this;
    this.bladeJob = function* (B) {
      const L = [], r2 = mulberry32(B.c0 * 31 + 7);
      const put = (k, u, sc) => { const [rx, rz] = right(k), f = r2() * tr.DS, x = tr.X[k] + rx * u + Math.sin(tr.T[k]) * f, z = tr.Z[k] + rz * u + Math.cos(tr.T[k]) * f, au = Math.abs(u), a = r2(), b = r2(), c = r2(), d = r2(); if (au > E + 2 && gr.dist(x, z) < WALL + 0.3) return; L.push(x, au < E ? tr.Y[k] : gr.surface(x, z), z, sc * (0.75 + 0.5 * a), b * 6.283, c, d); };
      let n = 0;
      for (let k = B.c0; k < B.c1; k++) {
        for (const sg of [-1, 1]) {
          const kerbSide = tr.kerb[k] && -sg * tr.kerb[k] > 0.5, g0 = HW + (kerbSide ? 1.4 : 0) + 1.55;
          if (WALL - 0.2 > g0) for (let j = 0; j < 9; j++) put(k, sg * (g0 + r2() * (WALL - 0.2 - g0)), 0.45);                                // the verge: short
          for (let j = 0; j < 34; j++) put(k, sg * (WALL + 0.25 + r2() * 12), 1.0);                                                          // behind the rail
          for (let j = 0; j < 10; j++) put(k, sg * (WALL + 12 + r2() * 24), 1.6);                                                            // further out: fewer, larger
        }
        if (++n % 3 === 0) yield;
      }
      const cnt = L.length / 7, im = new THREE.InstancedMesh(bg, bladeMat, cnt), aPlate = new Float32Array(cnt);
      for (let i = 0; i < cnt; i++) { const o = i * 7, sc = L[o + 3], c = L[o + 5], d = L[o + 6]; P.set(L[o], L[o + 1] - 0.03, L[o + 2]); Q.setFromAxisAngle(up, L[o + 4]); Sc.set(sc * 1.15, sc * (0.8 + 0.5 * d), sc * 1.15); M.compose(P, Q, Sc); im.setMatrixAt(i, M); aPlate[i] = (c * 3) | 0;
        const dry = d > 0.9; C.setRGB(dry ? 0.72 : 0.40 + 0.14 * c, dry ? 0.66 : 0.56 + 0.16 * c, dry ? 0.42 : 0.44 + 0.1 * c); im.setColorAt(i, C); if (i % 4000 === 3999) yield; }
      im.geometry = bg.clone(); im.geometry.setAttribute('aPlate', new THREE.InstancedBufferAttribute(aPlate, 1));
      im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.visible = false; self.layer(im, false, false); G.add(im); B.grass.push(im); B.bladesDone = true; self.bladeCount = (self.bladeCount || 0) + cnt;
    };
    this.envCount = { trees: nTree, rocks: nRock };
    for (const B of this.envB) B.on = null;
    this.updateDress(this.lastLoc || this.locate(0, 0), true);
  }
  // where the modelled rail panels stand and which batches of grass are drawn: both follow the car
  updateDress(L, force = false) {
    const tr = this.track, rn = this.railNear; if (!tr) return;
    const fi = L ? L.fi : 0, k0 = Math.floor(fi), cxp = tr.X[k0 % tr.N], czp = tr.Z[k0 % tr.N];
    if (rn) {
      const ks = rn.ks, NP = ks.length - 1, p0 = Math.round(fi / 2) % NP;
      if (force || p0 !== rn.at) {
        rn.at = p0; RAIL_CUT.value.set(cxp, czp, 92, 0);
        const { WALL } = TRACK, M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Color(), hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
        let c = 0;
        for (let side = 0; side < 2; side++) for (let j = -(rn.RAILN >> 1); j < rn.RAILN - (rn.RAILN >> 1); j++) {
          const pi = ((p0 + j) % NP + NP) % NP, ka = ks[pi], kb = ks[pi + 1], sg = side ? 1 : -1, u = sg * (WALL + 0.02), h1 = hash(pi * 2 + side), h2 = hash(pi * 2 + side + 0.5);
          A.set(tr.X[ka] - Math.cos(tr.T[ka]) * u, tr.Y[ka], tr.Z[ka] + Math.sin(tr.T[ka]) * u); B.set(tr.X[kb] - Math.cos(tr.T[kb]) * u, tr.Y[kb], tr.Z[kb] + Math.sin(tr.T[kb]) * u);
          // the panel runs from A to B; its posts go on the side away from the track
          Z.set(-Math.cos(tr.T[ka]) * sg, 0, Math.sin(tr.T[ka]) * sg).multiplyScalar(rn.face); X.subVectors(B, A); const d = X.length(); X.multiplyScalar(1 / d);
          Y.set((h1 - 0.5) * 0.05 * Z.x, 1, (h1 - 0.5) * 0.05 * Z.z).normalize();   // each leans a degree or so in or out
          Z.crossVectors(X, Y).normalize(); if (Z.x * -Math.cos(tr.T[ka]) * sg * rn.face + Z.z * Math.sin(tr.T[ka]) * sg * rn.face < 0) { X.multiplyScalar(-1); A.copy(B); Z.crossVectors(X, Y).normalize(); }
          X.multiplyScalar(d / rn.len * 1.004); A.y += (h2 - 0.5) * 0.03 - 0.01;
          M.makeBasis(X, Y, Z); M.setPosition(A); rn.im.setMatrixAt(c, M);
          const st = hash(pi * 2 + side + 0.25); C.setRGB(0.86 + 0.2 * h1, (0.86 + 0.2 * h1) * (st > 0.85 ? 0.9 : 1), (0.86 + 0.2 * h1) * (st > 0.85 ? 0.78 : 1)); rn.im.setColorAt(c, C); c++;
        }
        rn.im.instanceMatrix.needsUpdate = true; if (rn.im.instanceColor) rn.im.instanceColor.needsUpdate = true;
      }
    }
    if (this.envB) {
      // each length of track: modelled trees and blades near, photographed trees further off, nothing past 900 m
      let best = null, bd = 1e18;
      for (const B of this.envB) { const d2 = (B.x - cxp) ** 2 + (B.z - czp) ** 2, st = d2 < 135 * 135 ? 2 : d2 < 900 * 900 ? 1 : 0;
        if (st !== B.on) { B.on = st; for (const m of B.all) m.visible = false; if (st === 2) for (const m of B.near) m.visible = true; else if (st === 1) for (const m of B.far) m.visible = true; }
        const gOn = d2 < 115 * 115; if (gOn !== B.gOn) { B.gOn = gOn; for (const m of B.grass) m.visible = gOn; }
        if (!B.bladesDone && !B.job && d2 < bd) { bd = d2; best = B; } }
      // blades still to be worked out: the nearest unfinished length, up to 3 ms of it a frame
      if (!this.bladeRun && best && this.bladeJob) { best.job = true; this.bladeRun = { it: this.bladeJob(best), B: best }; }
      if (this.bladeRun) { const t0 = performance.now(); let done = false; do { done = this.bladeRun.it.next().done; } while (!done && performance.now() - t0 < 3); if (done) { const B = this.bladeRun.B; for (const m of B.grass) m.visible = !!B.gOn; this.bladeRun = null; } }
    }
    if (this.tufts) for (const g of this.tufts) { const on = (g.x - cxp) ** 2 + (g.z - czp) ** 2 < 240 * 240; if (on !== g.on) { g.on = on; for (const m of g.meshes) m.visible = on; } }
  }
  // ---- daytime (v119, the owner: "make it daytime remove the rain"). The moon's light becomes the sun: higher, warm
  // white, strong, and the one light out here that throws a shadow (a tight box round the car, so its shadow is
  // sharp); the sky turns blue (skyMaterial's day branch), the haze pales, the far hills fade to blue and the town's
  // lights go out. The game takes its light levels and the sky light's colours from the values set here.
  setDay(on = true) {
    this.day = !!on;
    if (!on) return;
    this.moonDir.set(-0.55, 0.5, 0.62).normalize();   // (v127: 31 degrees up, was 48: a later afternoon, so the trees' shadows reach across the road)
    const U = this.sky.material.uniforms;
    U.uDay.value = 1; U.uMoon.value.copy(this.moonDir); U.uHorizon.value.set(0xb4cbe6); U.uZenith.value.set(0x1552c8);
    this.fogClear = new THREE.Color(0xb4cbe6); this.fogRain = new THREE.Color(0xa9b4c2); this.fogK = this.track ? 0.3 : 0.5;
    this.moon.color.set(0xfff1dc); this.nightMoon = 5.4; this.nightHemi = 1.05; this.hemiSky = 0xcfdbee; this.hemiGround = 0x8f897e;   // (v121: a paler sky light, so shadows are grey-blue, not blue paint)
    this.moon.intensity = this.nightMoon; this.hemi.intensity = this.nightHemi; this.hemi.color.set(this.hemiSky); this.hemi.groundColor.set(this.hemiGround);
    this.moon.castShadow = true;
    const sh = this.moon.shadow, c = sh.camera;
    // (v127, the owner: "everything needs realistic shadows": the shadow map is 96 m square now, was 14: the car, the
    // trees, the rails and their posts and the rocks all throw shadows on the road, the grass and each other)
    sh.mapSize.set(SHADOW_PX, SHADOW_PX); c.left = -SHADOW_R; c.right = SHADOW_R; c.top = SHADOW_R; c.bottom = -SHADOW_R; c.near = 20; c.far = 420; c.updateProjectionMatrix(); sh.bias = -0.0005; sh.normalBias = 0.06; sh.radius = 1.6;
    if (this.pad) this.pad.receiveShadow = true;
    const [far, near, lights] = this.horizon.children;
    far.material.color.set(0x91abcd); near.material.color.set(0x7b96b8); lights.visible = false;
    SHARED.uRetroK.value = 0;   // paint does not throw headlights back in daylight
    TREE_FILL.value = 0.55;
  }
  newRoad(seed = (Math.random() * 2 ** 31) | 0, highway = this.road.theme, opts = {}) {
    if (this.open) { this.offset.x = this.offset.z = 0; this.hint = 0; this.lastLoc = null; this.probeRebase = null; return this.road; }
    for (const [c, ch] of [...this.chunks]) this.disposeChunk(c, ch);
    for (const ft of this.features.values()) { this.group.remove(ft.group); ft.disposables.forEach((d) => d.dispose()); }
    this.features.clear(); this.emitters = []; this.pending = null; this.flying = [];
    this.offset.x = this.offset.z = 0; this.hint = 0; this.lastLoc = null; this.onRamp = true; this.onExit = null; this.probeRebase = null;
    this.road = new Road(seed, typeof highway === 'string' ? highwayById(highway) : highway, opts);
    this.applyHighway();
    this.road.ensure(2200 / DS);
    this.sweepSigns();
    return this.road;
  }
  // the highway's own look: the colour of its lamps, its surface, how thick the mist is, and a little more moonlight
  // on the roads that have no street lights at all
  applyHighway() {
    const hw = this.road.theme, c = hw.light ? hw.light.c : SODIUM;
    this.mat.lampSodium.color.copy(c).multiplyScalar(1.1);
    this.mat.pool.color.copy(c).multiplyScalar(0.42);
    SHARED.uPave.value = hw.pave;
    this.fogK = hw.fog;
    // (the game sets the two lights from these every frame: a road with no lamps gets a brighter moon, and its paint
    // throws more of the headlights back, or there is nothing to steer by)
    this.nightHemi = hw.light ? 0.6 : 1.5; this.nightMoon = hw.light ? 0.32 : 1.15;
    this.hemi.intensity = this.nightHemi; this.moon.intensity = this.nightMoon;
    SHARED.uRetroK.value = hw.light ? 1 : 5;
  }
  buildPoleGeo() {
    // davit pole on the median barrier with two arms reaching over the inside lanes
    const parts = [];
    const shaft = new THREE.CylinderGeometry(0.1, 0.17, POLE_H - MED_H, 10).translate(0, (POLE_H - MED_H) / 2 + MED_H, 0);
    parts.push(shaft);
    for (const sx of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, POLE_H - 1.6, 0), new THREE.Vector3(sx * 0.15, POLE_H + 0.15, 0), new THREE.Vector3(sx * ARM, POLE_H + 0.05, 0));
      parts.push(new THREE.TubeGeometry(curve, 10, 0.065, 6, false));
    }
    const base = new THREE.CylinderGeometry(0.26, 0.3, 0.3, 10).translate(0, MED_H + 0.15, 0);
    parts.push(base);
    const merged = mergeGeos(parts);
    return merged;
  }
  buildLanternGeo() {
    const post = new THREE.CylinderGeometry(0.07, 0.11, 4.6, 8).translate(0, 2.3 + 1.0, 0);
    const cap = new THREE.ConeGeometry(0.34, 0.3, 8).translate(0, 6.15, 0);
    return mergeGeos([post, cap]);
  }
  initSky() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), skyMaterial());
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.sky.layers.enableAll();
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0x0e1026, 0.00125);
    this.scene.background = new THREE.Color(0x02030a);
    // distant hills in silhouette, riding with the camera
    this.horizon = new THREE.Group(); this.scene.add(this.horizon);
    const ridge = (radius, base, amp, color, seed) => {
      const rnd = mulberry32(seed), N = 360, ph = Array.from({ length: 6 }, () => rnd() * Math.PI * 2), pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N * Math.PI * 2;
        let h = base + amp * (0.5 * Math.sin(t * 3 + ph[0]) + 0.3 * Math.sin(t * 7 + ph[1]) + 0.18 * Math.sin(t * 13 + ph[2]) + 0.1 * Math.sin(t * 29 + ph[3]) + 0.06 * Math.sin(t * 61 + ph[4]));
        h = Math.max(base * 0.3, h);
        pos.push(Math.sin(t) * radius, -600, Math.cos(t) * radius, Math.sin(t) * radius, h, Math.cos(t) * radius);
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
      m.layers.enableAll(); this.horizon.add(m);
    };
    ridge(4200, 110, 150, new THREE.Color(0x060a12), 21);
    ridge(3500, 50, 70, new THREE.Color(0x04070c), 37);
    // far town lights scattered along the horizon
    const pts = [], col = [], rnd = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      const t = rnd() * Math.PI * 2, r = 3000 + rnd() * 600, cluster = Math.pow(Math.sin(t * 5 + 1.3) * 0.5 + 0.5, 3);
      if (rnd() > 0.25 + cluster * 0.75) continue;
      pts.push(Math.sin(t) * r, 6 + rnd() * 60 * (0.3 + cluster), Math.cos(t) * r);
      const warm = rnd() < 0.75; col.push(warm ? 1 : 0.8, warm ? 0.7 : 0.85, warm ? 0.4 : 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lightsMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.85 });
    const townLights = new THREE.Points(g, lightsMat); townLights.layers.enableAll(); this.horizon.add(townLights);
  }
  initLights() {
    this.moon = new THREE.DirectionalLight(0x9db4ff, 0.32);   // too faint for visible shadows, so it casts none
    this.moonDir = new THREE.Vector3(-0.45, 0.42, 0.79).normalize();
    this.scene.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight(0x25245a, 0x0a0710, 0.6);
    this.scene.add(this.hemi);
    this.pool = [];
    this.setPool(16);
  }
  setPool(n) {
    for (const l of this.pool) this.scene.remove(l);
    this.pool = [];
    for (let k = 0; k < n; k++) { const l = new THREE.PointLight(0xffffff, 0, 64, 2); this.scene.add(l); this.pool.push(l); }
  }
  initProbe() {
    // two cubes: one is being captured (a few faces a frame, all from the same spot) while the car reflects the
    // other; when the capture is complete they swap. Faces from different moments never mix, so reflections
    // don't break up at the cube seams or step as each face catches up.
    const mk = () => new THREE.WebGLCubeRenderTarget(320, {   // (v121: 320, was 192: sharper sky and ground in the paint)
     type: THREE.HalfFloatType, generateMipmaps: false });
    this.probeRTs = [mk(), mk()];
    this.probeRT = this.probeRTs[0];
    this.probe = new THREE.CubeCamera(0.4, 280, this.probeRTs[1]);
    for (const c of this.probe.children) c.layers.set(2);
    this.probe.layers.set(2);
    this.scene.add(this.probe);
    this.probeFace = 0;
    this.scene.environment = this.probeRT.texture;   // until the static cube is captured on the first update
    this.onProbeSwap = null;                          // the game points the car's materials at the live probe here
  }
  // clear or rain: the road surface, sky and haze follow a smooth 0..1 amount
  setWeather(w) { this.weather = w; }
  updateWeather(dt) {
    const target = this.weather === 'rain' ? 1 : 0, r = SHARED.uRain;
    r.value += Math.sign(target - r.value) * Math.min(Math.abs(target - r.value), dt * 0.5);
    this.scene.fog.density = (0.00125 + 0.0011 * r.value) * (this.fogK ?? 1);   // (v98: fogK, the highway's own mist)
    (this.fogClear ||= new THREE.Color(0x0e1026)); (this.fogRain ||= new THREE.Color(0x15152a));
    this.scene.fog.color.copy(this.fogClear).lerp(this.fogRain, r.value);
    this.mat.cone.uniforms.uStrength.value = 0.034 * (1 + 1.4 * r.value);
    return r.value;
  }
  get rain() { return SHARED.uRain.value; }
  setQuality(q) {
    this.quality = q;
    this.refl.scale = q >= 2 ? 0.4 : 0.3;
    this.setPool(this.open ? 0 : q >= 2 ? 16 : q === 1 ? 12 : 8);   // (v121: no street lamps in the open area, so none of their lights: every pixel of every surface was working out 8 lights that were switched off)
    SHARED.uReflOn.value = q >= 1 ? 1 : 0;
    this.mat.cone.visible = true;   // the cones are the lamp's light now, on every quality level
  }

  // ---- coordinates
  abs(x, z) { return [x + this.offset.x, z + this.offset.z]; }
  // nearest point on the centreline: sample index (fractional), lateral offset u (+ right), road height and heading
  locate(x, z, hint = this.hint) {
    if (this.open && this.track) return locateOn(this.track, x + this.offset.x, z + this.offset.z, hint);   // (v122) on the circuit: s round the lap, u metres right of its centre line
    if (this.open) return { fi: OPEN_S / DS, s: OPEN_S, u: LANE_CENTERS[1], y: 0, th: 0, g: 0, k: 0 };   // level ground everywhere
    const R = this.road, [ax, az] = this.abs(x, z);
    let best = clamp(Math.round(hint), 0, R.length - 2), bd = Infinity;
    const lo = Math.max(0, best - 60), hi = Math.min(R.length - 2, best + 60);
    for (let i = lo; i <= hi; i++) { const d = (R.X[i] - ax) ** 2 + (R.Z[i] - az) ** 2; if (d < bd) { bd = d; best = i; } }
    if (bd > 900) {
      // lost (a teleport or a reset): coarse search over the whole road, then refine
      for (let i = 0; i < R.length - 1; i += 8) { const d = (R.X[i] - ax) ** 2 + (R.Z[i] - az) ** 2; if (d < bd) { bd = d; best = i; } }
      for (let i = Math.max(0, best - 8); i <= Math.min(R.length - 2, best + 8); i++) { const d = (R.X[i] - ax) ** 2 + (R.Z[i] - az) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    // project onto the segment either side
    let fi = best;
    for (const j of [best - 1, best]) {
      if (j < 0 || j >= R.length - 1) continue;
      const ex = R.X[j + 1] - R.X[j], ez = R.Z[j + 1] - R.Z[j], t = ((ax - R.X[j]) * ex + (az - R.Z[j]) * ez) / (ex * ex + ez * ez);
      if (t >= 0 && t <= 1) { fi = j + t; break; }
    }
    const f = R.frameAt(fi);
    const rx = -Math.cos(f.th), rz = Math.sin(f.th);
    const u = (ax - f.x) * rx + (az - f.z) * rz;
    // k: the road's curvature here (1/m, + = bending left), for the steering assist (v91)
    const ik = clamp(Math.floor(fi), 0, R.length - 2), k = lerp(R.K[ik], R.K[ik + 1], clamp(fi - ik, 0, 1));
    return { fi, s: fi * DS, u, y: f.y, th: f.th, g: f.g, k };
  }
  // road height under a render-space point (for skid marks, smoke and the like)
  heightAt(x, z) { return this.locate(x, z).y; }
  spawnPose(lane = 2, s = 90) {
    this.road.ensure(s / DS + 10);
    const i = Math.round(s / DS), u = LANE_CENTERS[lane];
    const p = this.road.point(i, u);
    this.hint = i;
    return { x: p.x - this.offset.x, z: p.z - this.offset.z, yaw: this.road.T[i], y: p.y };
  }
  laneReset(x, z) {
    if (this.open && this.track) { const L = locateOn(this.track, x, z, this.hint), f = trackFrame(this.track, L.fi); return { x: f.x, z: f.z, yaw: f.th }; }
    if (this.open) return { x, z, yaw: 0 };
    const L = this.locate(x, z), i = Math.round(L.fi);
    // back onto the ramp (the entrance, or an exit) if that is where the car is
    const rp = this.road.rampAt(L.s, 2);
    if (rp) {
      const e = rampEdges(L.s, rp);
      if ((rampApart(rp, L.s) && L.u > (19.78 + e.left) / 2) || (rampJoined(rp, L.s) && L.u > U_OUT + 0.6)) { const p = this.rampPose(clamp(L.s, Math.min(rp.sA, rp.sM) + 4, Math.max(rp.sA, rp.sM) - 2), rp); return { x: p.x, z: p.z, yaw: p.yaw }; }
    }
    const lane = LANE_CENTERS.reduce((b, c, k) => (Math.abs(c - L.u) < Math.abs(LANE_CENTERS[b] - L.u) ? k : b), 0);
    const p = this.road.point(i, LANE_CENTERS[lane]);
    return { x: p.x - this.offset.x, z: p.z - this.offset.z, yaw: this.road.T[i] };
  }

  // ---- keeping the car on the road: the median barrier and the outer barriers are walls
  constrain(car, dims, dt) {
    const L = this.locate(car.x, car.z);
    this.hint = L.fi; this.lastLoc = L;
    // the open area: no walls. (onRamp stays true: to the game that means "the run has not begun", which keeps the
    // workshop a key away and the road's steering assist off.)
    if (this.open) {
      this.onRamp = true; this.onExit = null;
      if (!this.track) return null;
      // (v122) the circuit: a rail each side, WALL metres from the centre line
      const th = L.th, rx = -Math.cos(th), rz = Math.sin(th), sy = Math.sin(car.yaw), cy = Math.cos(car.yaw), lim = TRACK.WALL - 0.12;
      let worst = 0, side = 0, cx = 0, cz = 0;
      for (const [lx, lz] of [[dims.hw, dims.front], [-dims.hw, dims.front], [dims.hw, -dims.rear], [-dims.hw, -dims.rear]]) {
        const ox = cy * lx + sy * lz, oz = -sy * lx + cy * lz, u = L.u + ox * rx + oz * rz;
        if (-lim - u > worst) { worst = -lim - u; side = 1; cx = ox; cz = oz; }
        if (u - lim > worst) { worst = u - lim; side = -1; cx = ox; cz = oz; }
      }
      return worst > 0 ? this.bounce(car, dims, L, worst, side, cx, cz) : null;
    }
    const th = L.th, rx = -Math.cos(th), rz = Math.sin(th);
    const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw), fs = Math.sin(th), fc = Math.cos(th);
    let worst = 0, side = 0, cx = 0, cz = 0;
    // on the ramp before the nose of the gore the car is between the ramp's own rails
    // (v98: any ramp, the entrance or an exit; onExit is the exit whose own road the car is on, for the game)
    const rp = this.road.rampAt(L.s, 10), nearRamp = !!rp;
    const onRamp = nearRamp && rampApart(rp, L.s) && L.u > (19.78 + rampEdges(L.s, rp).left) / 2;
    this.onRamp = onRamp; this.onExit = onRamp && rp.kind === 'off' ? rp : null;
    const wcl = this.road.closureAt(L.s, 8, 8), wnz = this.road.narrowAt(L.s, 8), works = wcl || wnz ? { cl: wcl, nz: wnz } : null;
    for (const [lx, lz] of [[dims.hw, dims.front], [-dims.hw, dims.front], [dims.hw, -dims.rear], [-dims.hw, -dims.rear]]) {
      const ox = cy * lx + sy * lz, oz = -sy * lx + cy * lz;
      const u = L.u + ox * rx + oz * rz;
      let lo = LIMITS.inner, hi = LIMITS.outer;
      if (nearRamp) {
        // each corner is judged where it is: on the ramp (between its rails), on the highway, or past the nose
        const sc = L.s + ox * fs + oz * fc, e = rampEdges(sc, rp);
        const cornerOnRamp = rampApart(rp, sc) && u > (19.78 + e.left) / 2;
        if (cornerOnRamp) { lo = e.left + 0.05; hi = e.right - 0.05; if (rp.svc && sc > rp.svc.s0 && sc < rp.svc.s1) hi += 6; }   // (v102: in a fuel stop's lot the car has 6 m more to its right, up to the pump island there; on its left the lane's rail and the other island stay the limit)
        else if (rampJoined(rp, sc)) hi = Math.max(hi, e.right - 0.05);
        // the closed end of the entrance behind the start, and the end of an exit's road (the game has moved the car
        // on to the next highway long before that)
        if (cornerOnRamp && rp.kind === 'on') { const back = Math.ceil(rp.lo / DS) * DS - sc; if (back > worst) { worst = back; side = 2; cx = ox; cz = oz; } }
        if (cornerOnRamp && rp.kind === 'off') { const fwd = sc - (rp.hi - 3); if (fwd > worst) { worst = fwd; side = -2; cx = ox; cz = oz; } }
      }
      // (v100) road works: the wall of a lane closure, and the two walls of a squeezed stretch, judged where each
      // corner is along the road (only for a car on the open side of the wall)
      if (works) {
        const sc = L.s + ox * fs + oz * fc;
        if (works.cl) { const w = this.road.closureWall(works.cl, sc); if (w !== null) { if (works.cl.side > 0 && L.u < w + 0.6) hi = Math.min(hi, w - 0.05); else if (works.cl.side < 0 && L.u > w - 0.6) lo = Math.max(lo, w + 0.05); } }
        if (works.nz) { const w = this.road.narrowWalls(sc); if (w) { lo = Math.max(lo, w[0] + 0.05); hi = Math.min(hi, w[1] - 0.05); } }
      }
      const pin = lo - u, pout = u - hi;
      if (pin > worst) { worst = pin; side = 1; cx = ox; cz = oz; }
      if (pout > worst) { worst = pout; side = -1; cx = ox; cz = oz; }
    }
    // the closed start of the road: a barrier across both carriageways at s = 0
    if (L.s < 3) {
      let back = 0;
      for (const [lx, lz] of [[dims.hw, dims.front], [-dims.hw, dims.front], [dims.hw, -dims.rear], [-dims.hw, -dims.rear]]) {
        const ox = cy * lx + sy * lz, oz = -sy * lx + cy * lz, along = L.s + ox * Math.sin(th) + oz * Math.cos(th);
        if (1.2 - along > back) { back = 1.2 - along; cx = ox; cz = oz; }
      }
      if (back > worst) { worst = back; side = 2; }
    }
    if (worst <= 0) return null;
    return this.bounce(car, dims, L, worst, side, cx, cz);
  }
  // a corner of the car `worst` metres into a wall: push the car out and turn its speed into the wall round
  bounce(car, dims, L, worst, side, cx, cz) {
    const th = L.th, rx = -Math.cos(th), rz = Math.sin(th), sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
    // push out along the road's right vector (or forward at the closed start), then an impulse at the contact corner
    const nx = side === 2 ? Math.sin(th) : side === -2 ? -Math.sin(th) : rx * side, nz = side === 2 ? Math.cos(th) : side === -2 ? -Math.cos(th) : rz * side;
    car.x += nx * worst; car.z += nz * worst;
    const m = dims.mass, I = dims.Iz;
    let Vx = sy * car.vx + cy * car.vy, Vz = cy * car.vx - sy * car.vy, w = car.r;
    const pvx = Vx + w * cz, pvz = Vz - w * cx;            // velocity of the contact point
    const vn = pvx * nx + pvz * nz;
    let impact = 0;
    if (vn < 0) {
      const lam = cz * nx - cx * nz;
      const e = 0.18, J = -(1 + e) * vn / (1 / m + lam * lam / I);
      Vx += J * nx / m; Vz += J * nz / m; w += lam * J / I;
      // scraping friction along the wall
      const tx = -nz, tz = nx, vt = (Vx + w * cz) * tx + (Vz - w * cx) * tz, lamT = cz * tx - cx * tz;
      const Jt = clamp(-vt / (1 / m + lamT * lamT / I), -0.32 * J, 0.32 * J);
      Vx += Jt * tx / m; Vz += Jt * tz / m; w += lamT * Jt / I;
      impact = J / m;
    }
    car.vx = Vx * sy + Vz * cy; car.vy = Vx * cy - Vz * sy; car.r = clamp(w, -4, 4);
    const tang = Math.abs((Vx * -nz) + (Vz * nx));
    const [ax, az] = [car.x + cx, car.z + cz];
    return { impact, scrape: tang, side, x: ax, z: az, y: L.y };
  }

  // ---- streaming
  update(dt, st) {
    SHARED.uTime.value += dt;
    const R = this.road, L = this.locate(st.x, st.z), sCar = L.s;
    this.hint = L.fi;
    this.car = { s: sCar, y: L.y, g: L.g, th: L.th, u: L.u };
    if (this.open && this.track) { if (this.railNear || this.tufts) this.updateDress(L); }   // (v122) the circuit is all there already; (v124) its modelled rail and grass follow the car
    else if (this.open) {
      // the sheet rides under the car; uPadOff keeps its marks where they are (240 m: a whole number of every pattern's period)
      this.pad.position.set(st.x, 0, st.z);
      this.mat.pad.userData.off.value.set(((this.offset.x % 240) + 240) % 240, ((this.offset.z % 240) + 240) % 240);
    } else {
    R.ensure(Math.ceil((sCar + 3200) / DS));
    if (R.events.length > 400) R.events = R.events.filter((e) => e.s > sCar - 1500);
    // chunks: nearest first; drop the ones far behind. All at once on a new run (burst); while driving, one at a
    // time over a few frames, ~3 ms a frame (the build distance leaves seconds of slack), except a chunk within
    // 300 m of the car, which is built straight away
    const c0 = Math.max(0, Math.floor((sCar - 260) / CH_LEN)), c1 = Math.floor((sCar + 1450) / CH_LEN);
    const want = [];
    for (let c = c0; c <= c1; c++) if (!this.chunks.has(c)) want.push(c);
    want.sort((a, b) => Math.abs(a * CH_LEN - sCar) - Math.abs(b * CH_LEN - sCar));
    if (this.pending && (st.burst || !want.includes(this.pending.c))) this.pending = null;
    if (st.burst) for (const c of want) this.buildChunk(c);
    else if (want.length) {
      const c = want[0], close = Math.abs((c + 0.5) * CH_LEN - sCar) < 300;
      if (close && this.pending?.c !== c) this.buildChunk(c);
      else {
        this.pending ||= { c, it: this.chunkSteps(c) };
        const t0 = performance.now();
        do { if (this.pending.it.next().done) { this.pending = null; break; } } while (close || performance.now() - t0 < 3);
      }
    }
    for (const [c, ch] of this.chunks) if (c < c0 - 3 || c > c1 + 4) this.disposeChunk(c, ch);
    this.updateFeatures(sCar);
    // (v98) road works: drums knocked flying, and the arrow boards flashing (on for 0.6 s of every 1.1)
    if (this.flying.length) this.updateDrums(dt);
    if (this.mat.arrowLamp) { const on = SHARED.uTime.value % 1.1 < 0.6; if (on !== this.arrowOn) { this.arrowOn = on; this.mat.arrowLamp.color.setRGB(on ? 2.6 : 0.05, on ? 1.5 : 0.028, on ? 0.2 : 0.004); } }
    }
    // floating origin is handled by the game calling maybeRebase()
    this.horizon.position.set(st.camX, 0, st.camZ);
    this.sky.position.set(st.camX, st.camY, st.camZ);
    // the sky over a city: its light in the haze, up to 2.4x the usual glow, fading over 2.5 km either side (v91)
    {
      let near = 0;
      for (let k = R.cities.length - 1; k >= 0; k--) { const c = R.cities[k]; if (sCar > c.s1 + 2600) break; const d = Math.max(0, c.s0 - sCar, sCar - c.s1); near = Math.max(near, 1 - sstep(0, 2500, d)); }
      const u = this.sky.material.uniforms.uGlow.value;
      this.skyGlow0 ||= u.clone();
      u.copy(this.skyGlow0).multiplyScalar(1 + 1.4 * near);
    }
    // moonlight shadows follow the car
    if (this.day) {   // the shadows' square sits ahead of the car, where the picture is (in steps of a few texels, so shadows do not swim)
      const q = 0.5, tx = Math.round((st.x + Math.sin(st.yaw) * SHADOW_R * 0.62) / q) * q, tz = Math.round((st.z + Math.cos(st.yaw) * SHADOW_R * 0.62) / q) * q, ty = Math.round(L.y / q) * q;
      this.moon.position.set(tx + this.moonDir.x * 220, ty + this.moonDir.y * 220, tz + this.moonDir.z * 220); this.moon.target.position.set(tx, ty, tz);
    } else {
    this.moon.position.set(st.x + this.moonDir.x * 60, L.y + this.moonDir.y * 60, st.z + this.moonDir.z * 60);
    this.moon.target.position.set(st.x, L.y, st.z);
    }
    this.updatePool(st);
    // headlights for the retroreflective shaders
    SHARED.uHeadPos.value.set(st.headX, st.headY, st.headZ);
    SHARED.uHeadDir.value.set(Math.sin(st.yaw), -0.02, Math.cos(st.yaw)).normalize();
    SHARED.uHeadOn.value = st.headOn ? 1 : 0;
    // fog colour into the custom shaders
    const fog = this.scene.fog;
    for (const m of [this.mat.cone, this.mat.water]) { m.uniforms.fogColor.value.copy(fog.color); m.uniforms.fogDensity.value = fog.density; }
    GLOW.fogColor.value.copy(fog.color); GLOW.fogDensity.value = fog.density;
    const db = this.renderer.getDrawingBufferSize(this.tmp2b ||= new THREE.Vector2());
    GLOW.uScale.value = db.y * 0.5;
    GLOW.uMaxPx.value = Math.min(this.maxPointPx ||= this.renderer.getContext().getParameter(this.renderer.getContext().ALIASED_POINT_SIZE_RANGE)[1], db.y * 0.3);
  }
  maybeRebase(x, z) {
    if (this.track) return null;   // (the circuit sits round the origin: nothing ever gets far enough away to need it)
    if (Math.abs(x) < 1600 && Math.abs(z) < 1600) return null;
    const dx = Math.round(x / 1024) * 1024, dz = Math.round(z / 1024) * 1024;
    this.offset.x += dx; this.offset.z += dz;
    for (const ch of this.chunks.values()) ch.group.position.set(ch.ox - this.offset.x, ch.oy, ch.oz - this.offset.z);
    for (const f of this.features.values()) f.group.position.set(f.ox - this.offset.x, f.oy, f.oz - this.offset.z);
    this.probeRebase = { dx, dz };
    return { dx, dz };
  }
  updatePool(st) {
    // Only a fixed number of real lights exist; they go to the lamps that matter most for the view: bright ones,
    // close to a point a little ahead of the camera. Each light's strength fades with how far its lamp's score is
    // above the best lamp left out, so a light is already at zero when its lamp drops out of the pool (or a new
    // one comes in) and nothing pops.
    const fx = st.camX + Math.sin(st.yaw) * 55 + this.offset.x, fz = st.camZ + Math.cos(st.yaw) * 55 + this.offset.z;
    const sc = this.poolScores ||= [];
    sc.length = 0;
    for (const e of this.emitters) {
      const d = Math.hypot(e.x - fx, e.z - fz);
      if (d > 420) continue;
      sc.push([e.I * (e.pri || 1) / (d * d + 900), e]);
    }
    sc.sort((a, b) => b[0] - a[0]);
    const n = this.pool.length, cut = sc.length > n ? sc[n][0] : 0;
    for (let k = 0; k < n; k++) {
      const l = this.pool[k], it = sc[k];
      if (!it) { l.intensity = 0; continue; }
      const [score, e] = it;
      const w = cut > 0 ? sstep(1, 2.2, score / cut) : 1;
      l.position.set(e.x - this.offset.x, e.y, e.z - this.offset.z);
      l.color.copy(e.c);
      l.intensity = e.I * w * (this.lightsDim ?? 1);
      l.distance = e.range;
    }
  }

  // ---- reflections (call before the main render)
  renderReflections(camera) {
    const q = this.quality, r = this.renderer;
    camera.updateMatrixWorld();   // the camera moved this frame; its matrices only refresh at render time otherwise
    const size = r.getDrawingBufferSize(this.tmp2 ||= new THREE.Vector2());
    // forceRefl: the garage floor wants the mirror whatever the quality level (the room is cheap to draw twice)
    // (v121: dry daylight in the open area mirrors nothing, so the mirror picture is not drawn at all)
    if ((q >= 1 || this.forceRefl) && this.car && !(this.open && this.day && !this.reflPlane && SHARED.uRain.value < 0.01)) {
      this.refl.setSize(size.x, size.y);
      // mirror plane: the road surface a little ahead of the camera, tilted to its grade; or one the game sets
      // (reflPlane: the garage's level floor)
      let p, n;
      if (this.reflPlane) { p = this.reflPlane.p; n = this.reflPlane.n; }
      else if (this.open) { p = new THREE.Vector3(camera.position.x, 0.01, camera.position.z); n = new THREE.Vector3(0, 1, 0); }
      else {
        const L = this.locate(camera.position.x, camera.position.z);
        const fa = this.road.frameAt(L.fi + 8);
        p = new THREE.Vector3(fa.x - this.offset.x, fa.y + 0.01, fa.z - this.offset.z);
        n = new THREE.Vector3(-Math.sin(fa.th) * fa.g, 1, -Math.cos(fa.th) * fa.g).normalize();
      }
      SHARED.uReflOn.value = this.refl.render(this.scene, camera, p, n) ? 1 : 0;
      SHARED.uReflMatrix.value.copy(this.refl.matrix);
    } else SHARED.uReflOn.value = 0;
    // water: only when a river or lake is close
    SHARED.uWaterReflOn.value = 0;
    if (q >= 1 && this.car) {
      let level = null, best = 1e9;
      for (const f of this.features.values()) { if (f.level == null) continue; const d = Math.abs(f.sMid - this.car.s); if (d < f.reachS + 700 && d < best) { best = d; level = f.level; } }
      if (level !== null) {
        this.waterRefl.setSize(size.x, size.y);
        const ok = this.waterRefl.render(this.scene, camera, new THREE.Vector3(camera.position.x, level, camera.position.z), new THREE.Vector3(0, 1, 0));
        SHARED.uWaterReflOn.value = ok ? 1 : 0;
        SHARED.uWaterReflMatrix.value.copy(this.waterRefl.matrix);
      }
    }
  }
  // the car's reflection probe: a cube of the world around it (without the car)
  updateProbe(x, y, z, full = false) {
    // Low skips the live probe (the static night cube stands in), except in the garage (forceRefl): there the car,
    // chrome above all, has to mirror the room and its lights, not the road it was captured on
    if (this.quality < 1 && !this.forceRefl && !full) return;
    const r = this.renderer, back = this.probe.renderTarget;
    if (full || !this.probeInit) {
      this.probe.position.set(x, y + 0.6, z); this.probe.updateMatrixWorld(true);
      this.probe.renderTarget = this.probeRT; this.probe.update(r, this.scene); this.probe.renderTarget = back;
      this.probeRT.texture.needsPMREMUpdate = true; this.probeInit = true; this.probeFace = 0;
      // The world's own reflections (rails, poles, lamp heads, the road's gloss) come from a cube captured once:
      // a live probe swapped in every few frames made every reflective surface step at a visible rate. Never in the
      // garage (forceRefl): opened from the title before the first drive, the room was what got captured, and the
      // wet road mirrored the garage for the rest of the session. It is taken on the first full update outside.
      if (!this.staticEnv && !this.forceRefl) {
        this.staticEnv = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
        this.probe.renderTarget = this.staticEnv; this.probe.update(r, this.scene); this.probe.renderTarget = back;
        this.staticEnv.texture.needsPMREMUpdate = true; this.scene.environment = this.staticEnv.texture;
      }
      if (this.onProbeSwap) this.onProbeSwap(this.probeRT.texture);
      return;
    }
    // the capture point is fixed for a whole cube, then moves to where the car is now
    if (this.probeFace === 0) { this.probe.position.set(x, y + 0.6, z); this.probe.updateMatrixWorld(true); }
    else {
      // the world moved under a floating-origin rebase: keep the capture point with it
      const d = this.probeRebase; if (d) { this.probe.position.x -= d.dx; this.probe.position.z -= d.dz; this.probe.updateMatrixWorld(true); this.probeRebase = null; }
    }
    // high quality completes a cube every 2 frames, medium every 6
    const prev = r.getRenderTarget(), cams = this.probe.children, n = this.quality >= 2 || this.forceRefl ? 2 : 1;
    const prevShadow = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    for (let k = 0; k < n && this.probeFace < 6; k++) { const f = this.probeFace++; r.setRenderTarget(back, f); r.render(this.scene, cams[f]); }
    r.setRenderTarget(prev); r.shadowMap.autoUpdate = prevShadow;
    if (this.probeFace >= 6) {
      this.probe.renderTarget = this.probeRT; this.probeRT = back;
      back.texture.needsPMREMUpdate = true;
      if (this.onProbeSwap) this.onProbeSwap(back.texture);
      this.probeFace = 0;
    }
  }

  // ---- chunk building
  // layers: 0 main view, 1 road/water mirrors, 2 the car's reflection probe, 3 headlight shadow casters (never the car)
  layer(obj, refl = true, probe = true) {
    obj.layers.set(0); if (refl) obj.layers.enable(1); if (probe) obj.layers.enable(2); obj.layers.enable(3);
    return obj;
  }
  // A chunk is built in steps (the road, the edges, the terrain, the trees...). buildChunk runs them all at once;
  // while you drive, update() runs them a few milliseconds a frame, so a new chunk doesn't cost one long frame
  // (a whole chunk took 13 ms on average, up to 33, in a headless test: a hitch every couple of seconds).
  buildChunk(c) { for (const _ of this.chunkSteps(c)); }
  *chunkSteps(c) {
    const R = this.road, i0 = c * CHUNK, i1 = i0 + CHUNK;
    R.ensure(i1 + 6);
    const ox = R.X[i0], oy = 0, oz = R.Z[i0];
    const group = new THREE.Group();
    group.position.set(ox - this.offset.x, oy, oz - this.offset.z);
    const ch = { group, ox, oy, oz, emitters: [], disposables: [] };
    const add = (mesh, refl = true, probe = true) => { this.layer(mesh, refl, probe); group.add(mesh); return mesh; };
    const bridge = []; for (let i = Math.max(0, i0 - 2); i <= i1 + 2; i++) bridge[i] = R.isBridge(i);
    const isB = (i) => bridge[i] ?? R.isBridge(i);

    // road surface: both carriageways, flat across, tilted with the grade
    {
      const gb = new GeoBuilder(), deck = [], narrow = [];
      const cols = [-U_PAVE - 0.3, -U_OUT - 1.5, -U_IN, 0, U_IN, U_OUT + 1.5, U_PAVE + 0.3];
      const sBase = Math.floor(i0 * DS / S_WRAP) * S_WRAP;
      for (let i = i0; i <= i1; i++) {
        const th = R.T[i], rx = -Math.cos(th), rz = Math.sin(th), g = R.G[i];
        const nl = Math.hypot(g, 1), nx = -Math.sin(th) * g / nl, ny = 1 / nl, nz = -Math.cos(th) * g / nl;
        const sq = R.squeezeAt(i * DS);
        for (const u of cols) { gb.v(R.X[i] + rx * u - ox, R.Y[i] - oy, R.Z[i] + rz * u - oz, nx, ny, nz, u, i * DS - sBase); deck.push(isB(i) ? 1 : 0); narrow.push(sq); }
      }
      const nc = cols.length;
      for (let i = 0; i < CHUNK; i++) for (let k = 0; k < nc - 1; k++) { const a = i * nc + k; gb.quad(a, a + 1, a + nc + 1, a + nc); }
      gb.extra = [['aDeck', deck, 1], ['aNarrow', narrow, 1]];
      const mesh = add(new THREE.Mesh(gb.build(), this.mat.road), false, true);
      mesh.receiveShadow = true;
    }
    // median barrier (New Jersey profile, both faces)
    {
      const gb = new GeoBuilder();
      const prof = [[MED_HALF, 0], [MED_HALF, 0.075], [0.23, 0.33], [0.076, MED_H], [-0.076, MED_H], [-0.23, 0.33], [-MED_HALF, 0.075], [-MED_HALF, 0]];
      extrudeProfile(gb, R, i0, i1, ox, oy, oz, prof, { uScale: 1 / 6, vMap: (t) => (t < 0.5 ? t * 2 : (1 - t) * 2) });
      const m = add(new THREE.Mesh(gb.build(), this.mat.barrier)); m.castShadow = true; m.receiveShadow = true;
    }
    yield;
    // outer edges: guardrail on land, concrete parapet with a green railing on bridges, a tall barrier in rock cuts
    this.buildEdges(ch, add, i0, i1, ox, oy, oz, isB);
    yield;
    // terrain both sides
    this.buildTerrain(ch, add, i0, i1, ox, oy, oz, isB);
    yield;
    // trees
    this.buildTrees(ch, add, c, i0, i1, ox, oy, oz, isB);
    yield;
    // streetlights on the median every 60 m (+ lanterns on bridge parapets)
    this.buildLights(ch, add, i0, i1, ox, oy, oz, isB);
    yield;
    // bridge decks, girders and piers
    if (bridge.slice(i0, i1 + 1).some(Boolean)) { this.buildBridge(ch, add, i0, i1, ox, oy, oz, isB); yield; }
    // a tunnel's tube, roof, portals and lights
    if (R.tunnelAt(i0 * DS, CH_LEN + 8)) { this.buildTunnel(ch, add, i0, i1, ox, oy, oz); yield; }
    // a city's buildings, street lamps and the roads crossing over (v91)
    for (const city of R.cities) if (i1 * DS > city.b0 - 20 && i0 * DS < city.s1 + 120) { this.buildCity(ch, add, city, i0, i1, ox, oy, oz); yield; }
    // signs
    this.buildSigns(ch, add, i0, i1, ox, oy, oz, isB);
    if (c === 0) this.buildRoadEnd(add, ox, oy, oz);
    for (const rp of R.ramps) if (i1 * DS > rp.lo - 10 && i0 * DS < rp.hi) this.buildRamp(rp, ch, add, i0, i1, ox, oy, oz);
    for (const cl of R.closures) if (i1 * DS > cl.s0 - 2 && i0 * DS < cl.s1 + 2) this.buildClosure(cl, ch, add, i0, i1, ox, oy, oz);
    for (const nz of R.narrows) if (i1 * DS > nz.s0 - 2 && i0 * DS < nz.s1 + 2) this.buildNarrow(nz, ch, add, i0, i1, ox, oy, oz);
    yield;
    // small and mid-size parts go under distance switches measured from the middle of the chunk
    const im = i0 + (CHUNK >> 1);
    this.splitDetail(ch, new THREE.Vector3(R.X[im] - ox, R.Y[im] - oy, R.Z[im] - oz));

    if (this.chunks.has(c)) return;   // built meanwhile, all at once (a new run)
    group.position.set(ox - this.offset.x, oy, oz - this.offset.z);   // the floating origin may have moved since
    this.group.add(group);
    this.chunks.set(c, ch);
    for (const e of ch.emitters) this.emitters.push(e);
    if (ch.drums) this.drumChunks = (this.drumChunks || 0) + 1;
  }
  // which distance tier (see DetailLOD) a chunk's top-level part belongs to: 0 small, 1 mid-size, -1 always drawn
  detailTier(o) {
    if (o.userData.detailTier !== undefined) return o.userData.detailTier;   // the sign groups
    const m = o.material, M = this.mat;
    if (!(o.isMesh || o.isInstancedMesh) || !m || Array.isArray(m)) return -1;
    if (m === M.delinW || m === M.delinY || m === M.lampHead || m === M.navRed || m === M.floodBar) return 0;
    if (m === M.drum || m === M.pole || m === M.concrete || m === M.steel || m === M.green || m === M.barrier || m === M.lampSodium || m === M.lampLantern || m === M.stone || m === M.underside || m === M.darkSteel || m === M.signBack) return 1;
    return -1;
  }
  splitDetail(ch, mid) {
    const tiers = [[], []];
    for (const o of ch.group.children) { const t = this.detailTier(o); if (t >= 0) tiers[t].push(o); }
    tiers.forEach((list, t) => {
      if (!list.length) return;
      const lod = new DetailLOD(DETAIL_CUT[t]); lod.position.copy(mid);
      const inner = new THREE.Group(); inner.position.copy(mid).negate();
      lod.add(inner); ch.group.add(lod);
      for (const o of list) inner.add(o);   // same chunk-local placement: inner undoes the LOD's offset
    });
  }
  disposeChunk(c, ch) {
    this.group.remove(ch.group);
    ch.group.traverse((o) => { if (o.geometry && !this.sharedGeo.has(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    if (ch.emitters.length) { const set = new Set(ch.emitters); this.emitters = this.emitters.filter((e) => !set.has(e)); }
    if (ch.drums) { this.drumChunks--; this.flying = this.flying.filter((f) => f.ch !== ch); }
    this.chunks.delete(c);
    if (signCache.size > 36) this.sweepSigns();
  }
  // Mile markers, exit numbers, river names and guide signs are one-offs: once their chunks are gone,
  // free the canvases, GPU textures and materials so a long run doesn't keep piling them up.
  sweepSigns() {
    const live = new Set();
    for (const ch of this.chunks.values()) ch.group.traverse((o) => { const m = o.material; if (m && !Array.isArray(m)) { if (m.map) live.add(m.map); if (m.alphaMap) live.add(m.alphaMap); } });
    for (const [k, t] of signCache) if (/^(mile|name|exa|guide|gore)/.test(k) && !live.has(t)) { t.dispose(); signCache.delete(k); }
    const kept = new Set(signCache.values());
    for (const [k, m] of this.signMats) { const t = m.map || m.alphaMap; if (t && !kept.has(t)) { m.dispose(); this.signMats.delete(k); } }
  }
  buildEdges(ch, add, i0, i1, ox, oy, oz, isB) {
    const R = this.road;
    const zoneAt = (i) => R.zones[R.ZA[i]];
    const kind = (i, side) => {
      if (side > 0) { const rp = R.rampAt(i * DS); if (rp && rampJoined(rp, i * DS) && i * DS !== rp.sN) return 'none'; }   // where a ramp joins or leaves
      if (isB(i)) return 'parapet';
      const z = zoneAt(i);
      if ((z.type === 'cut' || z.type === 'tunnel' || z.type === 'mountain') && (side > 0 ? z.cutR : z.cutL) > 0) return 'jersey';
      return 'rail';
    };
    // one mesh per material for both sides; posts and reflectors as one instanced mesh each
    const gRail = new GeoBuilder(), gPar = new GeoBuilder(), gJer = new GeoBuilder(), gGreen = new GeoBuilder();
    const posts = [], greens = [], delW = [], delY = [];
    for (const side of [-1, 1]) {
      // outlines are written clockwise for the right side: reverse them there, mirror them on the left
      const fix = (prof) => (side > 0 ? prof.slice().reverse() : prof.map(([u, y]) => [-u, y]));
      const rail = fix([[19.62, 0.52], [19.7, 0.6], [19.62, 0.68], [19.7, 0.76], [19.62, 0.84], [19.66, 0.84], [19.78, 0.78], [19.78, 0.56], [19.66, 0.52], [19.62, 0.52]]);
      const par = fix([[U_PAVE, 0], [U_PAVE, 0.08], [U_PAVE + 0.03, 0.86], [U_PAVE + 0.42, 0.86], [U_PAVE + 0.42, -0.2]]);
      const jer = fix([[U_PAVE, 0], [U_PAVE, 0.075], [U_PAVE + 0.075, 0.33], [U_PAVE + 0.23, 1.07], [U_PAVE + 0.38, 1.07], [U_PAVE + 0.5, 0]]);
      const run = (k) => (i) => kind(i, side) === k || (i > i0 && kind(i - 1, side) === k);
      extrudeProfile(gRail, R, i0, i1, ox, oy, oz, rail, { uScale: 1 / 4, sKeep: run('rail') });
      extrudeProfile(gPar, R, i0, i1, ox, oy, oz, par, { uScale: 1 / 6, sKeep: run('parapet') });
      extrudeProfile(gJer, R, i0, i1, ox, oy, oz, jer, { uScale: 1 / 6, sKeep: run('jersey'), vMap: (t) => t });
      for (const [h, t] of [[1.05, 0.06], [1.32, 0.075]]) {
        const c = U_PAVE + 0.22;
        extrudeProfile(gGreen, R, i0, i1, ox, oy, oz, fix([[c - t, h - t], [c - t, h + t], [c + t, h + t], [c + t, h - t], [c - t, h - t]]), { uScale: 1 / 2, sKeep: run('parapet') });
      }
      for (let i = i0; i < i1; i++) {
        const k = kind(i, side), s = i * DS;
        if (k === 'rail') { const p = R.point(i, side * 19.86); posts.push([p.x, p.y - 0.15, p.z, R.T[i]]); }
        if (k === 'parapet' && s % 2.4 < DS) { const p = R.point(i, side * (U_PAVE + 0.22)); greens.push([p.x, p.y + 0.86, p.z, R.T[i]]); }
        if (s % 24 === 0 && k !== 'none') { const u = k === 'rail' ? 19.7 : k === 'parapet' ? U_PAVE + 0.02 : U_PAVE + 0.15; const p = R.point(i, side * u); (side > 0 ? delW : delY).push([p.x, p.y + (k === 'rail' ? 0.92 : 0.7), p.z, R.T[i]]); }
      }
    }
    // amber reflectors on top of the median barrier
    for (let i = i0; i < i1; i++) if ((i * DS) % 24 === 12) { const p = R.point(i, 0); delY.push([p.x, p.y + MED_H + 0.05, p.z, R.T[i]]); }
    for (const [gb, mat] of [[gRail, this.mat.steel], [gPar, this.mat.concrete], [gJer, this.mat.barrier], [gGreen, this.mat.green]]) {
      const geo = gb.build(); if (!geo) continue;
      const m = add(new THREE.Mesh(geo, mat), true, mat !== this.mat.green); m.castShadow = true; m.receiveShadow = true;
    }
    this.instances(add, this.postGeo, this.mat.darkSteel, posts, ox, oy, oz, { cast: true, refl: false, probe: false });
    this.instances(add, this.postGeo, this.mat.green, greens, ox, oy, oz, { scale: [0.6, 0.5, 0.6], refl: false, probe: false });
    this.instances(add, this.delGeo, this.mat.delinW, delW, ox, oy, oz, { refl: false, probe: false });
    this.instances(add, this.delGeo, this.mat.delinY, delY, ox, oy, oz, { refl: false, probe: false });
  }
  // an instanced mesh from [x, y, z, heading] rows, culled by its real bounds
  instances(add, geo, mat, list, ox, oy, oz, { scale = null, cast = false, refl = true, probe = true } = {}) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    if (scale) sc.set(...scale);
    list.forEach(([x, y, z, th], k) => { q.setFromAxisAngle(up, th || 0); pv.set(x - ox, y - oy, z - oz); mtx.compose(pv, q, sc); im.setMatrixAt(k, mtx); });
    im.computeBoundingSphere();
    im.castShadow = cast;
    add(im, refl, probe);
    return im;
  }
  buildTerrain(ch, add, i0, i1, ox, oy, oz, isB) {
    const R = this.road;
    const gb = new GeoBuilder();
    // where the ramp cuts through, the right side gets dense columns so the cut follows the ramp's edges; rows at
    // the ends of that stretch take their extra columns from the coarse ones so they meet the next chunk exactly
    const rpT = R.ramps.find((rp) => i1 * DS > rp.lo - 36 && i0 * DS < rp.hi + 20), rampChunk = !!rpT;
    const urban = [], far = this.mtnChunk(i0, i1);
    for (const side of [-1, 1]) {
      const dense = side > 0 && rampChunk, A = dense ? TERRAIN_A_RAMP : far ? TERRAIN_A_FAR : TERRAIN_A, na = A.length;
      const H = []; // heights for rows i0-1 .. i1+1 so normals can use neighbours
      const P = [];
      for (let i2 = i0 - 1; i2 <= i1 + 1; i2++) {
        const i = Math.max(0, i2), th = R.T[i], rx = -Math.cos(th), rz = Math.sin(th), b = isB(i);
        const row = [], prow = [];
        const coarse = dense && (i * DS <= rpT.lo - 36 || i * DS >= rpT.hi + 20);
        for (const a0 of A) {
          const a = far ? R.reachA(i, side, a0) : a0;
          const wx = R.X[i] + rx * side * a, wz = R.Z[i] + rz * side * a;
          row.push(coarse && !TERRAIN_A.includes(a) ? NaN : R.terrainY(i, side, a, wx, wz, b)); prow.push([wx, wz]);
        }
        if (coarse) for (let k = 0; k < na; k++) if (Number.isNaN(row[k])) {
          let lo = k - 1, hi = k + 1; while (Number.isNaN(row[lo])) lo--; while (Number.isNaN(row[hi])) hi++;
          row[k] = lerp(row[lo], row[hi], (A[k] - A[lo]) / (A[hi] - A[lo]));
        }
        H.push(row); P.push(prow);
      }
      const base = gb.n;
      for (let r = 1; r <= CHUNK + 1; r++) {
        for (let k = 0; k < na; k++) {
          const [wx, wz] = P[r][k], y = H[r][k];
          // normal from neighbours (central differences across rows and columns)
          const kA = Math.max(0, k - 1), kB = Math.min(na - 1, k + 1);
          const ax = P[r][kB][0] - P[r][kA][0], ay = H[r][kB] - H[r][kA], az = P[r][kB][1] - P[r][kA][1];
          const bx = P[r + 1][k][0] - P[r - 1][k][0], by = H[r + 1][k] - H[r - 1][k], bz = P[r + 1][k][1] - P[r - 1][k][1];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
          if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const nl = Math.hypot(nx, ny, nz) || 1;
          gb.v(wx - ox, y - oy, wz - oz, nx / nl, ny / nl, nz / nl, 0, 0);
          urban.push(R.urbanAt(Math.max(0, i0 + r - 1)));
        }
        if (r > 1 && r <= CHUNK + 1) {
          const b0 = base + (r - 2) * na, b1 = base + (r - 1) * na;
          for (let k = 0; k < na - 1; k++) { if (side > 0) gb.quad(b0 + k, b0 + k + 1, b1 + k + 1, b1 + k); else gb.quad(b0 + k, b1 + k, b1 + k + 1, b0 + k + 1); }
        }
      }
    }
    gb.extra = [['aUrban', urban, 1]];
    const m = add(new THREE.Mesh(gb.build(), this.mat.terrain), true, true);
    m.receiveShadow = true;
  }
  // a chunk on (or next to) a mountain pass: its terrain and trees reach much further out
  mtnChunk(i0, i1) { const R = this.road; return !!(R.zones[R.ZA[Math.max(0, i0 - 1)]].mtn || R.zones[R.ZB[i1 + 1] ?? R.ZB[i1]].mtn); }
  terrainAt(i, side, a) {
    const R = this.road, th = R.T[i], wx = R.X[i] - Math.cos(th) * side * a, wz = R.Z[i] + Math.sin(th) * side * a;
    return { y: R.terrainY(i, side, a, wx, wz, R.isBridge(i)), wx, wz };
  }
  buildTrees(ch, add, c, i0, i1, ox, oy, oz, isB) {
    const R = this.road, rnd = mulberry32(c * 7919 + 13);
    const inst = [];
    const cum = []; let tot = 0; for (const w of CARD_WEIGHT) { tot += w; cum.push(tot); }
    const aMax = this.mtnChunk(i0, i1) ? MTN_TREES : 258;
    for (const side of [-1, 1]) {
      for (let s = i0 * DS; s < i1 * DS; s += 6.5) {
        for (let a = 27; a < aMax; a += 6.5 + a * 0.02) {
          const ss = s + (rnd() - 0.5) * 5.5, aa = a + (rnd() - 0.5) * 5;
          if (side > 0) { const rp = R.rampAt(ss, 26); if (rp) { const e = rampEdges(ss, rp); if (aa > (rampApart(rp, ss) ? e.left - 7 : 19) - (rp.svc ? rp.svc.wl : 0) && aa < e.right + 8 + (rp.svc && ss > rp.svc.s0 - 12 && ss < rp.svc.s1 + 12 ? rp.svc.w : 0)) continue; } }
          const fi = ss / DS, i = clamp(Math.round(fi), i0, i1);
          const z = R.zones[rnd() < R.ZT[i] ? R.ZB[i] : R.ZA[i]];
          let dens = { forest: 0.8, fields: 0.07, cut: 0.62, tunnel: 0.62, embank: 0.22, river: 0.55, lake: 0.35, city: 0.6, mountain: 0.74 }[z.type];
          if (aa > 258 && (!z.mtn || R.reachA(i, side, aa) < aa)) continue;      // the far trees are the mountain's alone, and stop short of a bend's centre
          if (z.city) { if (R.cityEnv(z, ss) > 0.12) continue; }                  // no woods in town
          if (z.mtn && side !== z.mtn.hill && z.mtn.towns.some((t) => Math.abs(ss - t.s) < t.r && Math.abs(aa - t.a) < t.r)) continue;   // nor on the valley town
          if (z.type === 'fields' && fbm(R.X[i] / 140, R.Z[i] / 140 + side, z.seed + 77) > 0.12) dens = 0.75;   // tree lines between fields
          if (z.type === 'cut' || z.type === 'tunnel' || z.type === 'mountain') { const H = side > 0 ? z.cutR : z.cutL; if (H > 0 && aa < 22.4 + 0.42 * H * 1.3 + 4) dens = 0; }
          if (aa > 150) dens = Math.max(dens, 0.55);   // the far edge is always a wall of trees
          // the valley side of a pass: few trees on the first of the drop, so the view over their tops is open (the
          // ones further down stand with their crowns below the road)
          if (z.mtn && side !== z.mtn.hill && aa < 78) dens *= lerp(1, 0.12, R.mtnEnv(z, ss));
          const { y, wx, wz } = this.terrainAt(i, side, aa);
          // clearings, and nothing in the water or on the steep river banks
          if (fbm(wx / 90, wz / 90, 4242) > 0.33) dens *= 0.2;
          let wet = false;
          for (const rv of R.rivers) if (rv.levelY !== null && y < rv.levelY + 1.6 && Math.abs(i * DS - rv.sMid) < rv.reach + 300) wet = true;
          for (const lk of R.lakes) if (lk.levelY !== null && y < lk.levelY + 1.2 && i * DS > lk.s0 - 300 && i * DS < lk.s1 + 300) wet = true;
          if (wet || rnd() > dens) continue;
          const pick = rnd() * tot, card = cum.findIndex((v) => pick <= v);
          const H = (aa > 258 ? 17 : aa > 120 ? 14 : 9) + rnd() * 10;
          const tint = 0.55 + rnd() * 0.35;
          inst.push([wx, y - 0.3, wz, H, card, rnd() * Math.PI, tint]);
        }
      }
    }
    if (!inst.length) return;
    const im = new THREE.InstancedMesh(this.treeGeo, this.mat.trees, inst.length);
    const aCard = new Float32Array(inst.length * 4), aTint = new Float32Array(inst.length * 3);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    inst.forEach(([x, y, z, H, card, rot, tint], k) => {
      const C = TREE_CARDS[card];
      q.setFromAxisAngle(up, rot); sc.set(H * C.aspect, H, H * C.aspect); pv.set(x - ox, y - oy, z - oz);
      mtx.compose(pv, q, sc); im.setMatrixAt(k, mtx);
      aCard.set(C.r, k * 4); aTint.set([tint * 0.9, tint, tint * 0.85], k * 3);
    });
    im.geometry = this.treeGeo.clone();
    im.geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(aCard, 4));
    im.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
    im.computeBoundingSphere();
    add(im, false, false);
  }
  buildLights(ch, add, i0, i1, ox, oy, oz, isB) {
    const R = this.road, hw = R.theme, poles = [], heads = [], lanterns = [], cones = [];
    for (let i = i0; i < i1; i++) {
      const s = i * DS;
      // (v98) each highway has its own lamps (hw.light: colour, spacing, strength). The two with none are dark but
      // for the stretch round an exit, which is lit like any junction.
      const lt = hw.light || (R.rampAt(s, 240) && s > 300 ? DARK_LAMPS : null);
      if (lt && s % lt.every === 0 && !R.tunnelAt(s, 8) && !R.overAt(s, 13)) {
        poles.push([R.X[i], R.Y[i], R.Z[i], R.T[i]]);
        for (const side of [-1, 1]) {
          const p = R.point(i, side * ARM);
          heads.push([p.x, p.y + POLE_H, p.z, R.T[i]]);
          ch.emitters.push({ x: p.x, y: p.y + POLE_H - 0.3, z: p.z, c: lt.c, I: lt.I, range: 58 });
          cones.push([p.x, p.y, p.z, POLE_H - 0.2, lt.c]);
        }
      }
      if (isB(i) && (s + 16) % 32 === 0 && !R.overAt(s, 11)) {
        for (const side of [-1, 1]) {
          const p = R.point(i, side * (U_PAVE + 0.22));
          lanterns.push([p.x, p.y, p.z, R.T[i]]);
          ch.emitters.push({ x: p.x, y: p.y + 5.9, z: p.z, c: LANTERN, I: 110, range: 30 });
        }
      }
    }
    this.instances(add, this.poleGeo, this.mat.pole, poles, ox, oy, oz, { cast: true });
    this.instances(add, this.headGeo, this.mat.lampHead, heads, ox, oy, oz);
    this.instances(add, this.lensGeo, this.mat.lampSodium, heads, ox, oy, oz);
    // halos in the damp air around every lamp
    {
      const pos = [], col = [];
      for (const [x, y, z] of heads) { pos.push(x - ox, y - 0.15 - oy, z - oz); col.push(SODIUM.r * 1.05, SODIUM.g * 1.05, SODIUM.b * 1.05); }
      for (const [x, y, z] of lanterns) { pos.push(x - ox, y + 5.82 - oy, z - oz); col.push(LANTERN.r * 0.45, LANTERN.g * 0.45, LANTERN.b * 0.45); }
      void pos; void col;   // no glow balls on the lamps: the lens is lit and the cone below carries the light
    }
    this.instances(add, this.lanternGeo, this.mat.lampHead, lanterns, ox, oy, oz, { cast: true, probe: false });   // unlit: its bulb's light is right there
    this.instances(add, this.lanternBulbGeo, this.mat.lampLantern, lanterns, ox, oy, oz);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    if (cones.length) {
      const im = new THREE.InstancedMesh(this.coneGeo, this.mat.cone, cones.length);
      const col = new Float32Array(cones.length * 3);
      cones.forEach(([x, y, z, h, c], k) => { pv.set(x - ox, y - oy, z - oz); sc.set(1, h, 1); mtx.compose(pv, q.identity(), sc); im.setMatrixAt(k, mtx); col.set([c.r, c.g, c.b], k * 3); });
      im.geometry = this.coneGeo.clone(); im.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
      im.computeBoundingSphere(); im.renderOrder = 5;
      add(im, false, false);
    }
  }
  // A tunnel (v44): two tubes side by side, one for each carriageway, with a wall between them on the median.
  // Walls, ceiling and the wall on the median are extruded along the road like the barriers; the ground on top is
  // a strip of terrain from wall to wall that the hillsides meet (Road.terrainY); each mouth is a concrete face
  // with the two openings in it; strip lights run down each tube's ceiling, every other pair a real light.
  buildTunnel(ch, add, i0, i1, ox, oy, oz) {
    const R = this.road, done = new Set();
    for (let i = i0; i <= i1; i++) {
      const t = R.tunnelAt(i * DS, DS);
      if (!t || done.has(t)) continue;
      done.add(t);
      const iA = Math.ceil(t.s0 / DS), iB = Math.floor(t.s1 / DS);            // first and last roofed samples
      const keep = (k) => k >= iA - 1 && k <= iB + 1;                          // the tube runs one sample past each, to the portal faces
      const a = Math.max(i0, iA - 1), b = Math.min(i1, iB + 1);
      if (a > b) continue;
      const gb = new GeoBuilder();
      // (each strip faces the way its outline turns: these are written to face into the tube)
      extrudeProfile(gb, R, a, b, ox, oy, oz, [[TUN_W, TUN_H], [TUN_W, 0.7]], { uScale: 1 / 6, sKeep: keep });
      extrudeProfile(gb, R, a, b, ox, oy, oz, [[-TUN_W, 0.7], [-TUN_W, TUN_H]], { uScale: 1 / 6, sKeep: keep });
      extrudeProfile(gb, R, a, b, ox, oy, oz, [[-TUN_W, TUN_H], [TUN_W, TUN_H]], { uScale: 1 / 6, sKeep: keep, vMap: (v) => v * 6 });
      extrudeProfile(gb, R, a, b, ox, oy, oz, [[0.17, MED_H - 0.1], [0.17, TUN_H]], { uScale: 1 / 6, sKeep: keep });
      extrudeProfile(gb, R, a, b, ox, oy, oz, [[-0.17, TUN_H], [-0.17, MED_H - 0.1]], { uScale: 1 / 6, sKeep: keep });
      // the portal faces: piers outside the tubes and on the median, a header across the top, a parapet above the roof
      const face = (k, dir) => {
        if (k < i0 || k >= i1) return;   // (a sample on a chunk's far edge belongs to the next chunk)
        const th = R.T[k], nx = Math.sin(th) * dir, nz = Math.cos(th) * dir, top = TUN_LID + 1.0;
        const quad = (u0, u1, y0, y1) => {
          const p0 = R.point(k, u0), p1 = R.point(k, u1);
          const q = [gb.v(p0.x - ox, p0.y + y0 - oy, p0.z - oz, nx, 0, nz, u0 / 6, y0 / 6), gb.v(p1.x - ox, p1.y + y0 - oy, p1.z - oz, nx, 0, nz, u1 / 6, y0 / 6),
            gb.v(p1.x - ox, p1.y + y1 - oy, p1.z - oz, nx, 0, nz, u1 / 6, y1 / 6), gb.v(p0.x - ox, p0.y + y1 - oy, p0.z - oz, nx, 0, nz, u0 / 6, y1 / 6)];
          gb.quad(...q);
        };
        quad(-TUN_FACE, -TUN_W, -0.6, top); quad(TUN_W, TUN_FACE, -0.6, top); quad(-0.17, 0.17, MED_H - 0.1, TUN_H); quad(-TUN_W, TUN_W, TUN_H, top);
      };
      face(iA - 1, -1); face(iB + 1, 1);
      { const geo = gb.build(); if (geo) { const m = add(new THREE.Mesh(geo, this.mat.tunnel), true, true); m.receiveShadow = true; } }
      // the ground on top, wall to wall (a little crowned), in the terrain's own material
      {
        const gl = new GeoBuilder(); let prev = -1;
        for (let k = a; k <= b; k++) {
          if (!keep(k)) { prev = -1; continue; }
          const h = R.lidH(clamp(k, iA, iB)), row = gl.n;
          for (const [u, dy] of [[-19.9, 0], [-10, 0.25], [0, 0.35], [10, 0.25], [19.9, 0]]) { const q = R.point(k, u); gl.v(q.x - ox, q.y + h + dy - oy, q.z - oz, 0, 1, 0, 0, 0); }
          if (prev >= 0) for (let c = 0; c < 4; c++) gl.quad(prev + c, row + c, row + c + 1, prev + c + 1);
          prev = row;
        }
        const geo = gl.build(); if (geo) { const m = add(new THREE.Mesh(geo, this.mat.terrain), false, true); m.receiveShadow = true; }
      }
      // strip lights: two rows a tube, a pair every 12 m; one real light a tube every 24 m
      {
        const gp = new GeoBuilder();
        for (let k = Math.max(a, iA); k <= Math.min(b, iB); k++) {
          const s = k * DS; if (s % 12 !== 0 || k >= i1) continue;
          for (const side of [-1, 1]) {
            for (const u of [U_IN + LANE, U_IN + LANE * 3]) { const q = R.point(k, side * u); boxInto(gp, q.x - ox, q.y + TUN_H - 0.07 - oy, q.z - oz, 0.3, 0.08, 1.7, R.T[k]); }
            if (s % 24 === 0) { const q = R.point(k, side * (U_IN + LANE * 2)); ch.emitters.push({ x: q.x, y: q.y + TUN_H - 0.5, z: q.z, c: LED, I: 420, range: 36 }); }
          }
        }
        const geo = gp.build(); if (geo) add(new THREE.Mesh(geo, this.mat.tunnelLamp), true, true);
      }
    }
  }
  // how far under a tunnel's roof a place along the road is: 0 in the open, 1 well inside (the rain stops with it)
  tunnelCover(s) {
    if (this.open) return 0;
    const t = this.road.tunnelAt(s);
    return t ? sstep(0, 14, Math.min(s - t.s0, t.s1 - s)) : 0;
  }
  buildBridge(ch, add, i0, i1, ox, oy, oz, isB) {
    const R = this.road;
    const keep = (i) => isB(i) || (i > i0 && isB(i - 1));
    // deck slab underside and fascias
    {
      const gb = new GeoBuilder();
      const W = U_PAVE + 0.45;
      extrudeProfile(gb, R, i0, i1, ox, oy, oz, [[-W, -0.2], [-W, -1.25], [W, -1.25], [W, -0.2]], { uScale: 1 / 8, sKeep: keep, vMap: (t) => t * 2 });
      add(new THREE.Mesh(gb.build(), this.mat.concrete));
    }
    // steel girders under the deck
    {
      const gb = new GeoBuilder();
      for (const u of [-17, -11, -5, 5, 11, 17]) extrudeProfile(gb, R, i0, i1, ox, oy, oz, [[u - 0.35, -1.25], [u - 0.35, -2.9], [u + 0.35, -2.9], [u + 0.35, -1.25]], { uScale: 1 / 6, sKeep: keep });
      const m = add(new THREE.Mesh(gb.build(), this.mat.green)); m.castShadow = false;
    }
    // piers every 48 m where the ground is well below (arch spans get their own piers)
    const gb = new GeoBuilder(), gbStone = new GeoBuilder();
    const navs = [];
    for (let i = i0; i < i1; i++) {
      if (!isB(i)) continue;
      const s = i * DS;
      const lake = R.lakes.find((l) => s > l.s0 - 200 && s < l.s1 + 200);
      const every = lake ? 30 : 48;
      if (s % every !== 0) continue;
      if (this.inArchSpan(s)) continue;
      const th = R.T[i], y = R.Y[i];
      let low = Infinity;
      for (const u of [-14, 0, 14]) { const t = this.terrainAt(i, Math.sign(u) || 1, Math.max(19.9, Math.abs(u))); low = Math.min(low, t.y); }
      // ground straight under the road (between the road edges) is the river bed or the valley floor
      const groundY = Math.min(low, this.groundUnder(i));
      const top = y - 2.9, bottom = groundY - 2;
      if (top - bottom < 1.5) continue;
      const c0 = R.point(i, 0);
      boxInto(gb, c0.x - ox, top - 0.8 - oy, c0.z - oz, 40, 1.6, 2.4, th, 0.25);
      for (const u of (lake ? [-15, -5, 5, 15] : [-13.5, 0, 13.5])) {
        const p = R.point(i, u), h = top - 1.6 - bottom;
        boxInto(gb, p.x - ox, bottom + h / 2 - oy, p.z - oz, lake ? 1.2 : 2.2, h, lake ? 1.2 : 2.2, th, 0.25);
      }
      const water = this.waterLevelAt(s);
      if (water !== null) { const p = R.point(i, 20.5); navs.push([p.x, water + 1.2, p.z]); const p2 = R.point(i, -20.5); navs.push([p2.x, water + 1.2, p2.z]); }
    }
    const pg = gb.build(); if (pg) { const m = add(new THREE.Mesh(pg, this.mat.concrete)); m.castShadow = true; m.receiveShadow = true; }
    const sg = gbStone.build(); if (sg) add(new THREE.Mesh(sg, this.mat.stone));
    if (navs.length) {
      const im = new THREE.InstancedMesh(this.navGeo, this.mat.navRed, navs.length);
      const mtx = new THREE.Matrix4();
      navs.forEach(([x, y, z], k) => { mtx.makeTranslation(x - ox, y - oy, z - oz); im.setMatrixAt(k, mtx); });
      im.computeBoundingSphere(); add(im);
    }
  }
  groundUnder(i) {
    const R = this.road, s = i * DS;
    let y = R.Y[i] - 3;
    for (const rv of R.rivers) {
      if (rv.levelY === null) continue;
      const d = Math.abs(s - rv.sMid);
      if (d > rv.reach + 20) continue;
      const v = sstep(rv.reach, rv.halfW + rv.bank, d), f = sstep(rv.halfW + rv.bank, rv.halfW, d);
      y = lerp(y, rv.levelY + 2.4, v); y = lerp(y, rv.levelY - rv.depth, f);
    }
    for (const lk of R.lakes) if (lk.levelY !== null && s > lk.s0 - 120 && s < lk.s1 + 120) y = Math.min(y, lerp(y, lk.levelY - 3.5, sstep(lk.s0 - 120, lk.s0 + 40, s) * (1 - sstep(lk.s1 - 40, lk.s1 + 120, s))));
    return y;
  }
  waterLevelAt(s) {
    const R = this.road;
    for (const rv of R.rivers) if (rv.levelY !== null && Math.abs(s - rv.sMid) < rv.halfW + rv.bank * 0.6) return rv.levelY;
    for (const lk of R.lakes) if (lk.levelY !== null && s > lk.s0 && s < lk.s1) return lk.levelY;
    return null;
  }
  inArchSpan(s) {
    for (const rv of this.road.rivers) if (rv.arch && rv.levelY !== null && Math.abs(s - rv.sMid) < rv.halfW + 14) return true;
    return false;
  }
  buildRoadEnd(add, ox, oy, oz) {
    const R = this.road, gb = new GeoBuilder(), th = R.T[0], p = R.point(0, 0);
    boxInto(gb, p.x + Math.sin(th) * 0.9 - ox, p.y + 0.55 - oy, p.z + Math.cos(th) * 0.9 - oz, 2 * (U_PAVE + 0.5), 1.1, 0.6, th, 0.5);
    const m = add(new THREE.Mesh(gb.build(), this.mat.barrier)); m.castShadow = true;
    const tex = SIGNS.closed();
    for (const u of [-10, 10]) {
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), this.signMaterial(tex, 1.2, 0.08));
      const q = R.point(0, u); sgn.position.set(q.x + Math.sin(th) * 1.25 - ox, q.y + 1.9 - oy, q.z + Math.cos(th) * 1.25 - oz); sgn.rotation.y = th; add(sgn);
    }
  }
  // ---- a ramp (the entrance, or an exit: v98): pavement, rails, lights, the closed end behind the start of a run, the
  // crash cushion at the nose and, on an exit, the EXIT sign in the gore
  buildRamp(rp, ch, add, i0, i1, ox, oy, oz) {
    const R = this.road, hw = R.theme, sBase = Math.floor(i0 * DS / S_WRAP) * S_WRAP;
    const iLo = Math.ceil(rp.lo / DS), iHi = Math.floor(rp.hi / DS), iN = Math.round(rp.sN / DS), iA = Math.ceil((RAMP.sA - 4) / DS);
    const j0 = Math.max(i0, iLo), j1 = Math.min(i1, iHi);
    if (j1 <= j0) return;
    const E = (i) => rampEdges(i * DS, rp), apart = (i) => rampApart(rp, i * DS);
    const sv = rp.svc || null, inLot = (i) => !!sv && i * DS > sv.s0 && i * DS < sv.s1;   // (v102) a fuel stop's forecourt
    const lampC = hw.light ? hw.light.c : SODIUM, lampI = hw.light ? hw.light.I : 620;
    // pavement: before the nose it is a road of its own, after it the pavement runs on from the highway's edge
    {
      const gb = new GeoBuilder(), deck = [], narrow = [], NC = 5;
      for (let i = j0; i <= j1; i++) {
        const s = i * DS, e = E(i), th = R.T[i], rx = -Math.cos(th), rz = Math.sin(th), g = R.G[i];
        const nl = Math.hypot(g, 1), nx = -Math.sin(th) * g / nl, ny = 1 / nl, nz = -Math.cos(th) * g / nl;
        const L = (apart(i) ? e.left - 0.3 : U_PAVE + 0.3) - (inLot(i) ? sv.wl : 0), Rr = Math.max(L, e.right + 0.3 + (inLot(i) ? sv.w : 0));
        for (let k = 0; k < NC; k++) { const u = lerp(L, Rr, k / (NC - 1)); gb.v(R.X[i] + rx * u - ox, R.Y[i] + 0.003 - oy, R.Z[i] + rz * u - oz, nx, ny, nz, u - e.c, s - sBase); deck.push(2); narrow.push(0); }
      }
      for (let r = 0; r < j1 - j0; r++) for (let k = 0; k < NC - 1; k++) { const a = r * NC + k; gb.quad(a, a + 1, a + NC + 1, a + NC); }
      gb.extra = [['aDeck', deck, 1], ['aNarrow', narrow, 1]];
      const m = add(new THREE.Mesh(gb.build(), this.mat.road), false, true); m.receiveShadow = true;
    }
    // guardrails both sides of the ramp (the left one ends at the nose of the gore)
    const railR = [[19.62, 0.52], [19.7, 0.6], [19.62, 0.68], [19.7, 0.76], [19.62, 0.84], [19.66, 0.84], [19.78, 0.78], [19.78, 0.56], [19.66, 0.52], [19.62, 0.52]];
    {
      const gb = new GeoBuilder();
      extrudeOffset(gb, R, j0, j1, ox, oy, oz, railR.slice().reverse().map(([u, y]) => [u - 19.62, y]), (i) => E(i).right, { keep: (i) => !inLot(i) });
      extrudeOffset(gb, R, j0, j1, ox, oy, oz, railR.map(([u, y]) => [19.62 - u, y]), (i) => E(i).left, { keep: (i) => (apart(i) || apart(i - rp.dir)) && !(sv && Math.abs(i * DS - sv.sc) < 11) });   // (the left rail gives way to the pump island under the canopy)
      const m = add(new THREE.Mesh(gb.build(), this.mat.steel)); m.castShadow = true; m.receiveShadow = true;
    }
    const posts = [], delW = [], delY = [], poles = [], heads = [], cones = [], sFar = Math.min(rp.sA, rp.sM);
    for (let i = j0; i < j1; i++) {
      const s = i * DS, e = E(i), th = R.T[i];
      if (inLot(i)) continue;
      const pr = R.point(i, e.right + 0.24); posts.push([pr.x, pr.y - 0.15, pr.z, th]);
      if (apart(i)) { const pl = R.point(i, e.left - 0.24); posts.push([pl.x, pl.y - 0.15, pl.z, th]); }
      if (s % 24 === 0) {
        const w = R.point(i, e.right + 0.08); delW.push([w.x, w.y + 0.92, w.z, th]);
        if (apart(i)) { const y = R.point(i, e.left - 0.08); delY.push([y.x, y.y + 0.92, y.z, th]); }
      }
      // ramp lights: davit poles behind the right rail, one lamp out over the lane
      if ((s - sFar) % 60 === 30 && apart(i) && Math.abs(s - rp.sN) > 20) {
        const p = R.point(i, e.right + 1.1), h = R.point(i, e.right + 1.1 - ARM), base = p.y - MED_H - 0.3;
        poles.push([p.x, base, p.z, th]);
        heads.push([h.x, base + POLE_H, h.z, th]);
        ch.emitters.push({ x: h.x, y: base + POLE_H - 0.3, z: h.z, c: lampC, I: lampI, range: 58 });
        cones.push([h.x, p.y, h.z, POLE_H - MED_H - 0.5]);
      }
    }
    this.instances(add, this.postGeo, this.mat.darkSteel, posts, ox, oy, oz, { cast: true, refl: false, probe: false });
    this.instances(add, this.delGeo, this.mat.delinW, delW, ox, oy, oz, { refl: false, probe: false });
    this.instances(add, this.delGeo, this.mat.delinY, delY, ox, oy, oz, { refl: false, probe: false });
    if (poles.length) {
      this.instances(add, this.poleGeo, this.mat.pole, poles, ox, oy, oz, { cast: true });
      this.instances(add, this.headGeo, this.mat.lampHead, heads, ox, oy, oz);
      this.instances(add, this.lensGeo, this.mat.lampSodium, heads, ox, oy, oz);
      const im = new THREE.InstancedMesh(this.coneGeo, this.mat.cone, cones.length), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
      const cc = new Float32Array(cones.length * 3);
      cones.forEach(([x, y, z, hh], k) => { pv.set(x - ox, y - oy, z - oz); sc.set(1, hh, 1); mtx.compose(pv, q, sc); im.setMatrixAt(k, mtx); cc.set([lampC.r, lampC.g, lampC.b], k * 3); });
      im.geometry = this.coneGeo.clone(); im.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(cc, 3));
      im.computeBoundingSphere(); im.renderOrder = 5; add(im, false, false);
    }
    const grp = new THREE.Group();
    // the entrance: the closed end behind the start with its "road closed" boards facing up the ramp (not when the
    // car has just come off another highway: the ramp is open road behind it then), and a guide sign a little way up
    if (rp.kind === 'on' && iA >= i0 && iA < i1 && !R.entry) {
      const i = iA, th = R.T[i], e = E(i), mid = (e.left + e.right) / 2, p = R.point(i, mid), gb = new GeoBuilder();
      boxInto(gb, p.x - Math.sin(th) * 0.3 - ox, p.y + 0.55 - oy, p.z - Math.cos(th) * 0.3 - oz, e.right - e.left + 0.8, 1.1, 0.6, th, 0.5);
      const wall = new THREE.Mesh(gb.build(), this.mat.barrier); wall.castShadow = true; grp.add(wall);
      const tex = SIGNS.closed();
      const sgn = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), this.signMaterial(tex, 1.2, 0.08));
      sgn.position.set(p.x + Math.sin(th) * 0.02 - ox, p.y + 1.9 - oy, p.z + Math.cos(th) * 0.02 - oz); sgn.rotation.y = th; grp.add(sgn);
    }
    if (rp.kind === 'on' && iA + 25 >= i0 && iA + 25 < i1) {
      const k = iA + 25, eg = E(k), q = R.point(k, eg.right + 1.7);
      const guide = this.postSign(SIGNS.guide('rampN' + hw.id, [['NORTH', 54], [hw.name, 70]], hw.route, null, hw.shield), 3.0, 1.5, 2.1, { posts: 2, postR: 0.06 });
      guide.position.set(q.x - ox, q.y - oy, q.z - oz); guide.rotation.y = R.T[k] + Math.PI; grp.add(guide);
    }
    // crash cushion at the nose of the gore (it stands on the ramp's side of the nose)
    const iC = iN - rp.dir;
    if (iC >= i0 && iC < i1) {
      const i = iC, th = R.T[i], e = E(i), mid = (19.78 + e.left - 0.16) / 2, p = R.point(i, mid), gb = new GeoBuilder();
      boxInto(gb, p.x - ox, p.y + 0.45 - oy, p.z - oz, Math.max(0.6, e.left - 0.16 - 19.78 - 0.1), 0.9, 3.4, th, 1);
      const tex = signTexture('cushion', 128, 128, (g2, w, h) => { g2.fillStyle = '#f3b31b'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#111'; for (let k2 = -2; k2 < 4; k2++) { g2.beginPath(); g2.moveTo(k2 * 64, 0); g2.lineTo(k2 * 64 + 32, 0); g2.lineTo(k2 * 64 + 32 + 128, h); g2.lineTo(k2 * 64 + 128, h); g2.closePath(); g2.fill(); } });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const cushion = new THREE.Mesh(gb.build(), this.mat.cushion ||= retroMaterial({ map: tex, roughness: 0.5 }, 1.3, 0.03));
      cushion.castShadow = true; grp.add(cushion);
    }
    // an exit: the EXIT board in the gore, a few metres behind the cushion
    const iG = iN + 5;
    if ((rp.kind === 'off' || rp.kind === 'svc') && iG >= i0 && iG < i1) {
      const e = E(iG), q = R.point(iG, (19.9 + e.left) / 2);
      const sg = this.postSign(rp.kind === 'svc' ? SIGNS.gas('') : SIGNS.gore(rp.no), 1.5, 1.88, 2.1, { posts: 2, postR: 0.06 });
      sg.position.set(q.x - ox, q.y - oy, q.z - oz); sg.rotation.y = R.T[iG] + Math.PI; grp.add(sg);
    }
    if (grp.children.length) { this.layer(grp); grp.traverse((o) => { o.layers.mask = grp.layers.mask; if (o.isMesh) o.receiveShadow = true; }); ch.group.add(grp); }
    // (v102) the gas station, over the lane in the middle of the lot, and the light under its canopy
    if (rp.kind === 'svc') { const iS = Math.round(sv.sc / DS); if (iS >= i0 && iS < i1) {
      const f = R.frameAt(iS), c = rampC(sv.sc, rp), x = f.x - Math.cos(f.th) * c, z = f.z + Math.sin(f.th) * c, fw = [Math.sin(f.th), Math.cos(f.th)], lf = [Math.cos(f.th), -Math.sin(f.th)];
      ch.station = { x: x - ox, y: f.y + 0.02 - oy, z: z - oz, th: f.th };
      // (first try: 640 each beside the pillars, four times a streetlight's light on the ground: the whole forecourt burned out white)
      for (const [lx, lz] of [[0, -5.5], [0, 5.5], [-21, 0]]) ch.emitters.push({ x: x + lf[0] * lx + fw[0] * lz, y: f.y + 5.6, z: z + lf[1] * lx + fw[1] * lz, c: LED, I: lx < -20 ? 100 : 170, range: 40, pri: 10 });   // pri: low lamps close overhead, which must win a real light over the taller, stronger streetlights
      this.attachStation(ch);
    } }
  }
  // the gas station's model, handed over by the game once it has loaded; a lot built before then gets it now
  setStation(obj) {
    this.stationModel = obj; obj.traverse((o) => { if (o.geometry) this.sharedGeo.add(o.geometry); });
    for (const ch of this.chunks.values()) this.attachStation(ch);
  }
  attachStation(ch) {
    if (!ch.station || ch.stationObj || !this.stationModel) return;
    const g = ch.stationObj = this.stationModel.clone(); g.position.set(ch.station.x, ch.station.y, ch.station.z); g.rotation.y = ch.station.th; g.userData.detailTier = -1;
    this.layer(g, true, true); g.traverse((o) => { o.layers.mask = g.layers.mask; });
    ch.group.add(g);
  }
  // ---- road works (v98): the drums of a lane closure that stand in this chunk, and its flashing arrow board.
  // The owner: "lanes should close down and narrow sometimes". Each drum is the real thing: an orange plastic barrel
  // 95 cm high on a black rubber base, with white and orange bands that shine back in the headlights. The game knocks
  // them over when the car runs into them (hitDrums); the arrow board is solid (the traffic module has its box).
  buildClosure(cl, ch, add, i0, i1, ox, oy, oz) {
    const R = this.road, sA = i0 * DS, sB = i1 * DS;
    if (!cl.drums) {
      // (v100, the owner: "the road closures for the lanes should prevent you from getting into those lanes": the line
      // is a concrete wall now; the drums stand in front of its taper, on the open side, where a real crew puts them)
      const list = [], T = cl.taper;
      for (let d = 9; d <= T; d += 11) list.push([cl.s0 + d, lerp(cl.uEdge, cl.uLine, d / T) - cl.side * 0.75]);
      cl.drums = list.map(([s, u]) => ({ s, u, hit: false }));
    }
    this.initWorks();
    {
      // the wall: a temporary concrete barrier from the road's edge across the taper, along the lane line, and back
      const gb = new GeoBuilder(), sd = cl.side, prof = [[-0.3, 0], [-0.3, 0.075], [-0.115, 0.33], [-0.075, 0.81], [0.075, 0.81], [0.115, 0.33], [0.3, 0.075], [0.3, 0]];
      const ja = Math.max(i0, Math.ceil(cl.s0 / DS)), jb = Math.min(i1, Math.floor(cl.s1 / DS));
      if (jb > ja) {
        extrudeOffset(gb, R, ja, jb, ox, oy, oz, prof.slice().reverse(), (i) => R.closureWall(cl, i * DS) + sd * 0.3, { uScale: 1 / 6 });   // (the outline runs right to left over the top, as the road's own barriers' do, so its faces point outwards)
        const m = add(new THREE.Mesh(gb.build(), this.mat.barrier)); m.castShadow = true; m.receiveShadow = true;
        // (reflectors every 6 m: on an unlit road the wall is hard to see without them)
        const del = []; for (let i = ja; i < jb; i++) if ((i * DS) % 6 === 0) { const p = R.point(i, R.closureWall(cl, i * DS) + sd * 0.3); del.push([p.x, p.y + 0.84, p.z, R.T[i]]); }
        this.instances(add, this.delGeo, this.mat.delinY, del, ox, oy, oz, { refl: false, probe: false });
      }
    }
    const mine = cl.drums.filter((d) => d.s >= sA && d.s < sB && !d.hit);
    if (mine.length) {
      const im = new THREE.InstancedMesh(this.drumGeo, this.mat.drum, mine.length), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      ch.drums = mine.map((d, k) => {
        const f = R.frameAt(d.s / DS), x = f.x - Math.cos(f.th) * d.u - ox, z = f.z + Math.sin(f.th) * d.u - oz, y = f.y - oy;
        q.setFromAxisAngle(up, f.th + k * 1.7); pv.set(x, y, z); mtx.compose(pv, q, one); im.setMatrixAt(k, mtx);
        return { d, im, k, x, y, z };
      });
      im.computeBoundingSphere(); im.castShadow = true; add(im, true, false);
    }
    if (cl.board.s >= sA && cl.board.s < sB) {
      // the arrow points across to the lanes that are open
      const f = R.frameAt(cl.board.s / DS), g = this.arrowBoard(-cl.side);
      g.position.set(f.x - Math.cos(f.th) * cl.board.u - ox, f.y - oy, f.z + Math.sin(f.th) * cl.board.u - oz); g.rotation.y = f.th + Math.PI;
      g.userData.detailTier = -1;
      this.layer(g, true, false); g.traverse((o) => { o.layers.mask = g.layers.mask; if (o.isMesh) o.castShadow = true; });
      ch.group.add(g);
    }
  }
  // a squeezed stretch (v100): a row of concrete barrier each side of the narrowed lanes, running in from the median
  // and the outer rail as the squeeze begins and back out as it ends, amber reflectors along their tops
  buildNarrow(nz, ch, add, i0, i1, ox, oy, oz) {
    const R = this.road, gb = new GeoBuilder(), prof = [[-0.3, 0], [-0.3, 0.075], [-0.115, 0.33], [-0.075, 0.81], [0.075, 0.81], [0.115, 0.33], [0.3, 0.075], [0.3, 0]];
    const ja = Math.max(i0, Math.ceil(nz.s0 / DS)), jb = Math.min(i1, Math.floor(nz.s1 / DS));
    if (jb <= ja) return;
    const keep = (i) => !!R.narrowWalls(i * DS), del = [];
    extrudeOffset(gb, R, ja, jb, ox, oy, oz, prof.slice().reverse(), (i) => (R.narrowWalls(i * DS) || [0, 0])[0] - 0.3, { uScale: 1 / 6, keep });
    extrudeOffset(gb, R, ja, jb, ox, oy, oz, prof.slice().reverse(), (i) => (R.narrowWalls(i * DS) || [0, 0])[1] + 0.3, { uScale: 1 / 6, keep });
    const geo = gb.build(); if (!geo) return;
    const m = add(new THREE.Mesh(geo, this.mat.barrier)); m.castShadow = true; m.receiveShadow = true;
    for (let i = ja; i < jb; i++) if ((i * DS) % 6 === 0) { const w = R.narrowWalls(i * DS); if (!w) continue; for (const [u, sd] of [[w[0] - 0.3, -1], [w[1] + 0.3, 1]]) { const p = R.point(i, u); del.push([p.x, p.y + 0.84, p.z, R.T[i]]); void sd; } }
    this.instances(add, this.delGeo, this.mat.delinY, del, ox, oy, oz, { refl: false, probe: false });
  }
  initWorks() {
    if (this.drumGeo) return;
    // the drum: v runs up the barrel (the picture's bands), the base ring takes the black at the picture's foot
    const body = new THREE.CylinderGeometry(0.225, 0.285, 0.9, 18, 1, false).translate(0, 0.52, 0);
    { const uv = body.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 0.1 + uv.getY(k) * 0.9); }
    const lid = new THREE.CylinderGeometry(0.12, 0.225, 0.05, 18, 1, false).translate(0, 0.995, 0);
    { const uv = lid.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 0.97); }
    const base = new THREE.CylinderGeometry(0.34, 0.37, 0.075, 18, 1, false).translate(0, 0.0375, 0);
    { const uv = base.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 0.02); }
    this.drumGeo = mergeGeos([body, lid, base]); this.drumGeo.computeBoundingSphere();
    this.sharedGeo.add(this.drumGeo);
    const tex = signTexture('drum', 32, 256, (g, w, h) => {
      // from the top down: orange, white, orange, white, orange (10 cm bands of sheeting), then the black base
      const bands = [['#f26a12', 0.12], ['#f4f4ee', 0.16], ['#f26a12', 0.16], ['#f4f4ee', 0.16], ['#e8650f', 0.31], ['#101010', 0.09]];
      let y = 0; for (const [c, f] of bands) { g.fillStyle = c; g.fillRect(0, Math.round(y * h), w, Math.ceil(f * h) + 1); y += f; }
    });
    this.mat.drum = retroMaterial({ map: tex, roughness: 0.62 }, 1.5, 0.02);
    // the arrow board's parts: a matt black panel, and lamps that all flash together (update() sets their colour)
    this.mat.boardPanel = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.85, metalness: 0.1 });
    this.mat.arrowLamp = new THREE.MeshBasicMaterial({ color: 0xffa21a });
  }
  // a trailer-mounted arrow board, as road crews stand at the head of a closed lane: a small two-wheel trailer, a
  // mast, and a 2.4 x 1.2 m black panel of amber lamps showing an arrow. dir +1: the arrow points to the driver's
  // right, -1 to the left. Built facing local +z (towards the traffic coming up to it).
  arrowBoard(dir) {
    const g = new THREE.Group(), steel = this.mat.darkSteel, box = (w, h, d, x, y, z, m = steel) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    box(1.5, 0.12, 2.2, 0, 0.5, 0); box(0.1, 0.1, 1.3, 0, 0.5, 1.7);                       // deck and drawbar
    for (const x of [-0.82, 0.82]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), this.mat.boardPanel); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, -0.2); g.add(w); }
    for (const [x, z] of [[-0.7, 1.0], [0.7, 1.0], [-0.7, -1.0], [0.7, -1.0]]) box(0.07, 0.5, 0.07, x, 0.25, z);   // the legs it stands on
    box(0.12, 2.0, 0.12, 0, 1.5, 0);                                                      // mast
    box(2.44, 1.24, 0.1, 0, 3.0, 0, this.mat.boardPanel);                                 // the panel
    box(2.52, 0.05, 0.14, 0, 3.64, 0); box(2.52, 0.05, 0.14, 0, 2.36, 0);                 // its frame
    // the arrow: a shaft of five lamps and a head of five, drawn for dir = +1 and mirrored
    const lamps = [[-0.9, 0], [-0.55, 0], [-0.2, 0], [0.15, 0], [0.5, 0], [0.9, 0], [0.6, 0.3], [0.6, -0.3], [0.3, 0.45], [0.3, -0.45]];
    const geos = lamps.map(([x, y]) => new THREE.CircleGeometry(0.075, 12).translate(-x * dir, 3.0 + y, 0.056));
    g.add(new THREE.Mesh(mergeGeos(geos), this.mat.arrowLamp)); for (const q of geos) q.dispose();
    return g;
  }
  // The car against the drums of a lane closure (v98). car: its place and heading in the picture's space, and its
  // speed along and across itself; dims: its box. A drum the car's box reaches is knocked away in the direction the
  // car is going, tumbles and comes to rest, and is gone from the road for the rest of the run. Returns how many
  // were hit this time.
  hitDrums(car, dims) {
    if (!this.drumChunks) return 0;
    let n = 0;
    const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw), Vx = sy * car.vx + cy * car.vy, Vz = cy * car.vx - sy * car.vy;
    for (const ch of this.chunks.values()) {
      if (!ch.drums) continue;
      const bx = ch.ox - this.offset.x - car.x, bz = ch.oz - this.offset.z - car.z;
      for (const r of ch.drums) {
        if (r.d.hit) continue;
        const wx = r.x + bx, wz = r.z + bz;
        if (Math.abs(wx) > 7 || Math.abs(wz) > 7) continue;
        const lx = cy * wx - sy * wz, lz = sy * wx + cy * wz;
        if (lz > dims.front + 0.28 || lz < -dims.rear - 0.28 || Math.abs(lx) > dims.hw + 0.28) continue;
        r.d.hit = true; n++;
        const side = Math.sign(lx) || 1, k = 0.75 + Math.random() * 0.3;
        this.flying.push({ ch, r, x: r.x, y: r.y, z: r.z, vx: Vx * k + cy * side * (2 + Math.random() * 3), vy: 2.5 + Math.random() * 3 + Math.hypot(Vx, Vz) * 0.05, vz: Vz * k - sy * side * (2 + Math.random() * 3),
          ax: Math.random() - 0.5, az: Math.random() - 0.5, rot: 0, spin: 5 + Math.random() * 9, t: 0, y0: r.y });
      }
    }
    return n;
  }
  // the drums in flight: thrown, bouncing once or twice, sliding to a stop on their sides
  updateDrums(dt) {
    const mtx = this._dm ||= new THREE.Matrix4(), q = this._dq ||= new THREE.Quaternion(), ax = this._da ||= new THREE.Vector3(), pv = this._dp ||= new THREE.Vector3(), one = this._d1 ||= new THREE.Vector3(1, 1, 1);
    for (const f of this.flying) {
      f.t += dt; f.vy -= 9.8 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.rot += f.spin * dt;
      if (f.y < f.y0 + 0.25) { f.y = f.y0 + 0.25; if (f.vy < 0) f.vy = -f.vy * 0.3; const k = Math.exp(-dt * 2.2); f.vx *= k; f.vz *= k; f.spin *= Math.exp(-dt * 1.5); f.down = true; }
      ax.set(f.ax, 0.15, f.az).normalize(); q.setFromAxisAngle(ax, f.down ? Math.PI / 2 + f.rot * 0.2 : f.rot);
      pv.set(f.x, f.y, f.z); mtx.compose(pv, q, one); f.r.im.setMatrixAt(f.r.k, mtx); f.r.im.instanceMatrix.needsUpdate = true;
      if (f.t < 0.1 || (f.t * 10 | 0) % 5 === 0) f.r.im.computeBoundingSphere();
    }
    if (this.flying.length > 40) this.flying.splice(0, this.flying.length - 40);
    this.flying = this.flying.filter((f) => f.t < 6);
  }
  // spawn pose on the ramp, s metres along the highway
  rampPose(s = RAMP.sA + 16, rp = this.road.onRamp) {
    if (this.open && this.track) { const f = trackFrame(this.track, this.track.N - 8); this.hint = this.track.N - 8; return { x: f.x, z: f.z, yaw: f.th, y: f.y, c: 0 }; }   // (v122) the grid: 16 m back from the line
    if (this.open) return { x: 0, z: 0, yaw: 0, y: 0, c: 0 };   // the start: the middle of the open area
    this.road.ensure(s / DS + 10);
    const fi = s / DS, f = this.road.frameAt(fi), c = rampC(s, rp), rx = -Math.cos(f.th), rz = Math.sin(f.th);
    this.hint = fi;
    return { x: f.x + rx * c - this.offset.x, z: f.z + rz * c - this.offset.z, yaw: f.th - Math.atan(rampSlope(s, rp)), y: f.y, c };
  }
  // ---- signs
  signMaterial(tex, gain = 1.4, base = 0.05) {
    const key = tex.uuid + gain + base;
    if (!this.signMats.has(key)) this.signMats.set(key, retroMaterial({ map: tex, roughness: 0.55, metalness: 0, alphaTest: 0.5 }, gain, base));
    return this.signMats.get(key);
  }
  signBackMaterial(tex) {
    const key = 'back' + tex.uuid;
    if (!this.signMats.has(key)) this.signMats.set(key, new THREE.MeshStandardMaterial({ color: 0x7d8288, metalness: 0.6, roughness: 0.55, alphaMap: tex, alphaTest: 0.5 }));
    return this.signMats.get(key);
  }
  buildSigns(ch, add, i0, i1, ox, oy, oz, isB) {
    const R = this.road, hw = R.theme, s0 = i0 * DS, s1 = i1 * DS;
    const events = R.events.filter((e) => e.s >= s0 && e.s < s1);
    if (!events.length) return;
    // three groups by size, so the small ones can stop being drawn sooner with distance (see DetailLOD):
    // post-mounted signs, the big name / exit boards, gantries and billboards
    const gs = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    const SIZE = { name: 1, exitAdvance: 1, work: 1, gas: 1, gantry: 2, billboard: 2 };
    for (const e of events) {
      const i = clamp(Math.round(e.s / DS), i0, i1), th = R.T[i], g = gs[SIZE[e.type] ?? 0];
      if (isB(i) && (e.type === 'billboard' || e.type === 'speed' || e.type === 'mile' || e.type === 'work' || e.type === 'exitAdvance' || e.type === 'gas')) continue;
      if (R.tunnelAt(e.s, 40)) continue;   // nothing in a tunnel or across its mouth
      // nothing on the right-hand verge where the ramp runs
      if (R.rampAt(e.s, 16) && !(e.type === 'chevron' && e.dir < 0) && !(e.type === 'billboard' && e.side < 0)) continue;
      const place = (obj, u, yOff = 0) => { const p = R.point(i, u); obj.position.set(p.x - ox, p.y + yOff - oy, p.z - oz); obj.rotation.y = th + Math.PI; g.add(obj); return obj; };
      switch (e.type) {
        case 'speed': place(this.postSign(SIGNS.speed(e.mph), 0.75, 0.94, 2.2), 21.3); break;
        case 'reg': place(this.postSign(SIGNS.reg(e.k), 0.9, 1.12, 2.1), 21.3); break;
        case 'mile': place(this.postSign(SIGNS.mile(e.n, hw.route), 0.3, 0.9, 1.0), 20.9); break;
        case 'curve':
          place(this.postSign(SIGNS.curve(e.dir), 1.75, 1.75, 2.0), 21.4);
          place(this.postSign(SIGNS.advisory(e.mph), 0.6, 0.6, 1.3, { posts: 0 }), 21.4);
          break;
        case 'icy': place(this.postSign(SIGNS.icy(), 1.75, 1.75, 2.0), 21.4); break;
        case 'chevron':
          // on the outside of the bend: left bends put them on the right shoulder, right bends on the median barrier
          if (e.dir > 0) place(this.postSign(SIGNS.chevron(1), 0.62, 0.82, 1.5), 21.0);
          else place(this.postSign(SIGNS.chevron(-1), 0.62, 0.82, 0.35, { postR: 0.05 }), 0.0, MED_H);
          break;
        case 'name': place(this.postSign(SIGNS.name(e.text), 4.2, 1.05, 2.3, { posts: 2, postR: 0.07 }), 21.8); break;
        case 'exitAdvance': place(this.postSign(SIGNS.exitAdvance(e.exit, e.dist, e.to), 3.4, 2.04, 2.6, { posts: 2, postR: 0.1 }), 22.2); break;
        case 'gas': place(this.postSign(SIGNS.gas(e.text), 2.2, 2.2, 2.2, { posts: 2, postR: 0.07 }), 21.9); break;
        case 'work': place(this.postSign(e.merge ? SIGNS.workMerge(e.merge) : e.narrows ? SIGNS.workNarrows() : SIGNS.work(e.text), 1.75, 1.75, 2.0), 21.4); break;
        case 'gantry': if (!isB(i)) this.buildGantry(g, e, i, ox, oy, oz); break;
        case 'billboard': if (!isB(i)) this.buildBillboard(g, e, i, ox, oy, oz); break;
      }
    }
    // one draw per material for each size group's signs instead of one per post, board and brace
    gs.forEach((g, k) => {
      if (!g.children.length) return;
      const merged = mergeByMaterial(g);
      merged.userData.detailTier = [0, 1, -1][k];
      this.layer(merged); merged.traverse((o) => { o.layers.mask = merged.layers.mask; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      ch.group.add(merged);
    });
  }
  // a sign on posts at the roadside: (w, h) board with its bottom edge `low` metres up; local +z faces traffic
  postSign(tex, w, h, low, { posts = 1, postR = 0.045 } = {}) {
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, h);
    const board = new THREE.Mesh(geo, this.signMaterial(tex));
    board.position.set(0, low + h / 2, 0.03);
    const back = new THREE.Mesh(geo, this.signBackMaterial(tex));
    back.position.set(0, low + h / 2, 0.01); back.rotation.y = Math.PI;
    grp.add(board, back);
    if (posts) {
      const xs = posts === 2 ? [-w * 0.3, w * 0.3] : [0];
      for (const x of xs) { const p = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, low + h * 0.6, 6), this.mat.darkSteel); p.position.set(x, (low + h * 0.6) / 2, -0.03); grp.add(p); }
    }
    return grp;
  }
  buildGantry(g, e, i, ox, oy, oz) {
    const R = this.road, th = R.T[i];
    const grp = new THREE.Group();
    const p0 = R.point(i, 0), pR = R.point(i, 21.2);
    grp.position.set(p0.x - ox, p0.y - oy, p0.z - oz); grp.rotation.y = th + Math.PI;
    // posts (one in the median barrier, one behind the guardrail) and a box truss across
    const steel = this.mat.pole;
    const span = 21.2, H = 7.0;
    for (const u of [0, span]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, H + 0.6, 10), steel); post.position.set(u, (H + 0.6) / 2, 0); grp.add(post); }
    void pR;
    for (const [dy, dz] of [[H, -0.45], [H, 0.45], [H + 0.9, -0.45], [H + 0.9, 0.45]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, span, 6), steel); c.rotation.z = Math.PI / 2; c.position.set(span / 2, dy, dz); grp.add(c); }
    for (let u = 0.8; u < span; u += 1.6) for (const dz of [-0.45, 0.45]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 4), steel); d.position.set(u, H + 0.45, dz); d.rotation.z = (u / 1.6) % 2 < 1 ? 0.65 : -0.65; grp.add(d); }
    // signs: left = through traffic (I-95 north, city), right = the exit
    // (v98) the exit's board names the highway it leads to, with that highway's own shield
    const hw = R.theme, to = e.to;
    const panels = [
      [SIGNS.guide('thru' + hw.id + e.city, [['NORTH', 54], [e.city, 76]], hw.route, null, hw.shield), 6.6, 3.3, 5.6],
      [SIGNS.guide('exit' + e.exit + to.id + (e.dist || 'now'), [[to.name, 66], [e.dist || 'NEXT RIGHT', 60]], to.route, `EXIT ${e.exit}`, to.shield), 6.6, 3.3, 14.6],
    ];
    for (const [tex, w, h, u] of panels) {
      const geo = new THREE.PlaneGeometry(w, h);
      const board = new THREE.Mesh(geo, this.signMaterial(tex, 0.9, 0.22));
      board.position.set(u, H - h / 2 + 1.0, 0.64); grp.add(board);
      const back = new THREE.Mesh(geo, this.signBackMaterial(tex)); back.position.set(u, H - h / 2 + 1.0, 0.62); back.rotation.y = Math.PI; grp.add(back);
      // sign lighting bar underneath
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.08, 0.12), this.mat.floodBar); bar.position.set(u, H - h + 0.85, 1.25); grp.add(bar);
    }
    g.add(grp);
  }
  buildBillboard(g, e, i, ox, oy, oz) {
    const R = this.road, th = R.T[i], side = e.side;
    const u = side * 34, p = R.point(i, u), t = this.terrainAt(i, side, 34);
    const grp = new THREE.Group();
    grp.position.set(p.x - ox, t.y - oy, p.z - oz); grp.rotation.y = th + Math.PI - side * 0.35;
    const H = 9, W = 14, Hb = 4.6;
    for (const x of [-W * 0.3, W * 0.3]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), this.mat.darkSteel); leg.position.set(x, H / 2, -0.4); grp.add(leg); }
    const tex = SIGNS.billboard(e.k);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, Hb), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 }));
    face.position.set(0, H + Hb / 2, 0.02); grp.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, Hb + 0.3, 0.3), this.mat.darkSteel); back.position.set(0, H + Hb / 2, -0.16); grp.add(back);
    for (const x of [-W * 0.33, 0, W * 0.33]) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.25), this.mat.floodBar); lamp.position.set(x, H - 0.25, 1.4); grp.add(lamp); }
    g.add(grp);
  }


  // ---- a city (v91): the blocks of buildings whose middles fall in this chunk, their street lamps, and a road crossing over
  buildCity(ch, add, c, i0, i1, ox, oy, oz) {
    const R = this.road, sA = i0 * DS, sB = i1 * DS, gY = c.groundY;
    if (gY === null) return;
    R.ensure(i1 + 90);
    const gb = new GeoBuilder(), aB = [], pools = new GeoBuilder();
    const lamps = [], posts = [], cones = [], navs = [];
    const FLOOR = [3.9, 3.7, 3.05, 2.95];
    // a wall from (x0, z0) to (x1, z1), facing away from (cx, cz); u runs on from uOff
    const wall = (x0, z0, x1, z1, y0, y1, cx, cz, uOff, v0, B) => {
      let tx = x1 - x0, tz = z1 - z0; const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
      let nx = -tz, nz = tx;
      if (nx * ((x0 + x1) / 2 - cx) + nz * ((z0 + z1) / 2 - cz) < 0) { [x0, x1] = [x1, x0]; [z0, z1] = [z1, z0]; nx = -nx; nz = -nz; }
      const k = gb.v(x0 - ox, y0 - oy, z0 - oz, nx, 0, nz, uOff, v0);
      gb.v(x1 - ox, y0 - oy, z1 - oz, nx, 0, nz, uOff + len, v0); gb.v(x1 - ox, y1 - oy, z1 - oz, nx, 0, nz, uOff + len, v0 + y1 - y0); gb.v(x0 - ox, y1 - oy, z0 - oz, nx, 0, nz, uOff, v0 + y1 - y0);
      gb.quad(k, k + 1, k + 2, k + 3);
      for (let q = 0; q < 4; q++) aB.push(...B);
      return len;
    };
    // a box of walls with a flat roof: centre (x, z), heading th, w along the road, d across it, from y0 up to y1
    const box = (x, z, th, w, d, y0, y1, B, v0 = 0, roofOnly = false) => {
      const fx = Math.sin(th), fz = Math.cos(th), rx = -Math.cos(th), rz = Math.sin(th), hw = w / 2, hd = d / 2;
      const P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([l, t]) => [x + fx * l + rx * t, z + fz * l + rz * t]);
      let u = B[0] * 3.7;
      const side = roofOnly ? [B[0], B[1], B[2], 1] : B;
      for (let q = 0; q < 4; q++) { const [x0, z0] = P[q], [x1, z1] = P[(q + 1) % 4]; u += wall(x0, z0, x1, z1, y0, y1, x, z, u, v0, side); }
      const up = (P[1][1] - P[0][1]) * (P[3][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[3][1] - P[0][1]) > 0, Q = up ? P : P.slice().reverse();
      const k = gb.n; for (const [px, pz] of Q) { gb.v(px - ox, y1 - oy, pz - oz, 0, 1, 0, 0, 0); aB.push(B[0], B[1], B[2], 1); }
      gb.quad(k, k + 1, k + 2, k + 3);
    };
    const lamp = (i, u) => {
      const p = R.point(clamp(i, 0, R.length - 1), u);
      lamps.push([p.x, gY + 8.4, p.z, 0]); posts.push([p.x, gY - 0.2, p.z, 0]); cones.push([p.x, gY, p.z, 8.3, SODIUM]);
      const k = pools.n, r = 11;
      pools.v(p.x - r - ox, gY + 0.22 - oy, p.z - r - oz, 0, 1, 0, 0, 0); pools.v(p.x - r - ox, gY + 0.22 - oy, p.z + r - oz, 0, 1, 0, 0, 1);
      pools.v(p.x + r - ox, gY + 0.22 - oy, p.z + r - oz, 0, 1, 0, 1, 1); pools.v(p.x + r - ox, gY + 0.22 - oy, p.z - r - oz, 0, 1, 0, 1, 0);
      pools.quad(k, k + 1, k + 2, k + 3);
    };
    // rows of buildings back from the viaduct: [where the row starts (m from the median), depth, floors, width of a lot, kinds]
    const ROWS = [
      [36, [20, 26], [3, 11], [18, 34], [2, 2, 1, 3]],
      [76, [28, 36], [6, 22], [24, 44], [1, 0, 3, 2]],
      [126, [34, 46], [10, 46], [30, 48], [0, 0, 1, 3]],
      [188, [36, 50], [8, 38], [30, 50], [0, 1, 3]],
    ];
    const nB = Math.ceil((c.s1 + 100 - c.b0) / CITY_PITCH);
    for (let k = 0; k < nB; k++) {
      const sb = c.b0 + k * CITY_PITCH, sc = sb + CITY_BLOCK / 2;
      if (sc < sA || sc >= sB) continue;
      const rnd = mulberry32((c.seed + k * 7919) | 0);
      const overPrev = c.over.some((o) => o.k === k), overNext = c.over.some((o) => o.k === k + 1);
      const lo = sb + (overPrev ? 7 : 0), hi = sb + CITY_BLOCK - (overNext ? 7 : 0);
      // the middle of town is tall; its edges are a few floors
      const core = sstep(c.s0 - 80, c.s0 + 650, sc) * (1 - sstep(c.s1 - 650, c.s1 + 80, sc));
      for (const side of [-1, 1]) {
        ROWS.forEach(([a0, dR, fR, wR, kinds], row) => {
          let x = lo + rnd() * 3;
          while (x < hi - 15) {
            let w = wR[0] + rnd() * (wR[1] - wR[0]);
            if (hi - (x + w) < 17) w = hi - x;
            const d = dR[0] + rnd() * (dR[1] - dR[0]), kind = kinds[(rnd() * kinds.length) | 0];
            const floors = Math.max(2, Math.round((fR[0] + Math.pow(rnd(), 1.7) * (fR[1] - fR[0])) * lerp(0.28, 1, core)));
            const lit = kind < 1.5 ? 0.1 + rnd() * 0.3 : 0.16 + rnd() * 0.26, seed = Math.floor(rnd() * 900) + 1;
            const gap = rnd() < 0.45 ? 0 : 2.5 + rnd() * 5;
            const ic = clamp(Math.round((x + w / 2) / DS), 0, R.length - 1), th = R.T[ic], aC = a0 + d / 2 + rnd() * 3;
            const p = R.point(ic, side * aC), wE = w * clamp(1 + R.K[ic] * side * aC, 0.6, 1.5) - 0.3;
            const H = floors * FLOOR[kind] + 1.1, B = [seed, kind, lit, 0], y0 = gY - 0.6;
            if (floors > 15 && rnd() < 0.62) {
              // a tower on a podium, and on the tallest a narrower top
              const pod = (3 + ((rnd() * 3) | 0)) * FLOOR[kind], inset = 0.72 + rnd() * 0.14;
              box(p.x, p.z, th, wE, d, y0, gY + pod, B, -0.6);
              const top = floors > 30 && rnd() < 0.6 ? H - (2 + ((rnd() * 4) | 0)) * FLOOR[kind] : H;
              box(p.x, p.z, th, wE * inset, d * inset, gY + pod, gY + top, B, pod);
              if (top < H) box(p.x, p.z, th, wE * inset * 0.7, d * inset * 0.7, gY + top, gY + H, B, top);
            } else box(p.x, p.z, th, wE, d, y0, gY + H, B, -0.6);
            // plant on the roof; a mast and a red light on anything tall enough to need one
            if (floors > 4 && rnd() < 0.75) { const fx = Math.sin(th), fz = Math.cos(th), o = (rnd() - 0.5) * wE * 0.3; box(p.x + fx * o, p.z + fz * o, th, wE * (0.2 + rnd() * 0.2), d * (0.25 + rnd() * 0.2), gY + H - 0.2, gY + H + 2.2 + rnd() * 2, B, 0, true); }
            if (H - c.H > 52) { box(p.x, p.z, th, 0.5, 0.5, gY + H, gY + H + 7, B, 0, true); navs.push([p.x, gY + H + 7.2, p.z]); }
            x += w + gap;
          }
        });
        // towers further back, some blocks
        if (rnd() < 0.3 + 0.45 * core) {
          const aC = 310 + rnd() * 190, ic = clamp(Math.round((sb + 20 + rnd() * 56) / DS), 0, R.length - 1), p = R.point(ic, side * aC);
          const kind = rnd() < 0.7 ? 0 : 1, floors = Math.round((22 + rnd() * 42) * lerp(0.4, 1, core)), H = floors * FLOOR[kind] + 1.1, w = 38 + rnd() * 16, B = [Math.floor(rnd() * 900) + 1, kind, 0.12 + rnd() * 0.28, 0];
          box(p.x, p.z, R.T[ic] + (rnd() - 0.5) * 0.5, w, w * (0.8 + rnd() * 0.3), gY - 0.6, gY + H, B, -0.6);
          if (H - c.H > 52) navs.push([p.x, gY + H + 1.2, p.z]);
        }
        // street lamps: the street along the viaduct, the streets between the rows, and the cross street before this block
        const iOf = (s) => Math.round(s / DS);
        for (const ds of [12, 48, 84]) lamp(iOf(sb + ds), side * 29);
        for (const a of [68.5, 119, 180.5]) for (const ds of [30, 66]) lamp(iOf(sb + ds), side * a);
        if (!overPrev) for (const a of [31, 62, 97, 132, 167, 202, 237]) lamp(iOf(sb - 6), side * a);
      }
    }
    const geo = gb.build();
    if (geo) { geo.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 4)); add(new THREE.Mesh(geo, this.mat.building), true, true); }
    // the street under the viaduct itself (the terrain either side stops at the deck's edges)
    {
      const g2 = new GeoBuilder(), urb = [];
      let prev = -1;
      for (let i = i0; i <= i1; i++) {
        if (!R.isBridge(i) || i * DS < c.s0 - 200 || i * DS > c.s1 + 200) { prev = -1; continue; }
        const a = R.point(i, -20.2), b = R.point(i, 20.2), k = g2.v(a.x - ox, gY - 0.05 - oy, a.z - oz, 0, 1, 0, 0, 0);
        g2.v(b.x - ox, gY - 0.05 - oy, b.z - oz, 0, 1, 0, 0, 0); urb.push(1, 1);
        if (prev >= 0) g2.quad(prev, prev + 1, k + 1, k);
        prev = k;
      }
      g2.extra = [['aUrban', urb, 1]];
      const under = g2.build(); if (under) add(new THREE.Mesh(under, this.mat.terrain), false, false);
    }
    const pg = pools.build();
    // the pools, lamps and their cones are only drawn within 700 m (tier 1 of DetailLOD): past that they are a pixel
    // each and there are hundreds of them. The lamp posts themselves are left out: black on black from above.
    if (pg) { const m = add(new THREE.Mesh(pg, this.mat.pool), false, false); m.renderOrder = 4; m.userData.detailTier = 1; }
    this.instances(add, this.lensGeo, this.mat.lampSodium, lamps, ox, oy, oz, { scale: [1.5, 1.5, 1.5], refl: false, probe: false });
    void posts;
    if (cones.length) {
      const im = new THREE.InstancedMesh(this.coneGeo, this.mat.cone, cones.length), col = new Float32Array(cones.length * 3);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
      cones.forEach(([x, y, z, h, cc], k) => { pv.set(x - ox, y - oy, z - oz); sc.set(1, h, 1); mtx.compose(pv, q, sc); im.setMatrixAt(k, mtx); col.set([cc.r, cc.g, cc.b], k * 3); });
      im.geometry = this.coneGeo.clone(); im.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
      im.computeBoundingSphere(); im.renderOrder = 5; im.userData.detailTier = 1; add(im, false, false);
    }
    if (navs.length) {
      const im = new THREE.InstancedMesh(this.navGeo, this.mat.navRed, navs.length), mtx = new THREE.Matrix4();
      navs.forEach(([x, y, z], k) => { mtx.makeScale(2.4, 2.4, 2.4).setPosition(x - ox, y - oy, z - oz); im.setMatrixAt(k, mtx); });
      im.computeBoundingSphere(); im.userData.detailTier = -1; add(im, false, false);
    }
    for (const o of c.over) if (o.s >= sA && o.s < sB) this.buildOverpass(ch, add, c, o, ox, oy, oz);
  }
  // A road crossing over the viaduct on its own bridge (v91): level over the highway, OVER.clear clear of it, then
  // coming down to the street either side along a cross street. A slab on five steel girders, concrete parapets,
  // two-column piers either side of the highway and every 36 m beyond, and its own lamps.
  buildOverpass(ch, add, c, o, ox, oy, oz) {
    const R = this.road, i = Math.round(o.s / DS), th = R.T[i], y = R.Y[i], gY = c.groundY;
    const p0 = R.point(i, 0), rx = -Math.cos(th), rz = Math.sin(th), fx = Math.sin(th), fz = Math.cos(th);
    const top = y + OVER.clear + OVER.girder + 0.45, flat = 130, end = flat + Math.max(120, (top - gY) / 0.105);
    const line = [[-end, gY + 0.25], [-flat, top], [flat, top], [end, gY + 0.25]];        // (metres right of the median, height of the road on top)
    const yAt = (u) => { const a = Math.abs(u); return a <= flat ? top : lerp(top, gY + 0.25, (a - flat) / (end - flat)); };
    // a length of the bridge between two lines along it (z0..z1 metres along the highway), from yb to yt below its top
    const run = (gb, z0, z1, yb, yt, uvS = 0.25) => {
      for (let q = 0; q < line.length - 1; q++) {
        const [u0, t0] = line[q], [u1, t1] = line[q + 1], len = Math.hypot(u1 - u0, t1 - t0), sl = (t1 - t0) / (u1 - u0), nl = Math.hypot(sl, 1);
        const P = (u, z, yy) => [p0.x + rx * u + fx * z - ox, yy - oy, p0.z + rz * u + fz * z - oz];
        const face = (A, B, C, D, n, w, h) => { const k = gb.v(...A, ...n, 0, 0); gb.v(...B, ...n, w * uvS, 0); gb.v(...C, ...n, w * uvS, h * uvS); gb.v(...D, ...n, 0, h * uvS); gb.quad(k, k + 1, k + 2, k + 3); };
        const up = [-rx * sl / nl, 1 / nl, -rz * sl / nl], dn = up.map((v) => -v);
        face(P(u0, z0, t0 + yt), P(u0, z1, t0 + yt), P(u1, z1, t1 + yt), P(u1, z0, t1 + yt), up, z1 - z0, len);
        face(P(u0, z1, t0 + yb), P(u0, z0, t0 + yb), P(u1, z0, t1 + yb), P(u1, z1, t1 + yb), dn, z1 - z0, len);
        face(P(u1, z0, t1 + yb), P(u0, z0, t0 + yb), P(u0, z0, t0 + yt), P(u1, z0, t1 + yt), [-fx, 0, -fz], len, yt - yb);
        face(P(u0, z1, t0 + yb), P(u1, z1, t1 + yb), P(u1, z1, t1 + yt), P(u0, z1, t0 + yt), [fx, 0, fz], len, yt - yb);
      }
    };
    const slab = new GeoBuilder(), steel = new GeoBuilder(), piers = new GeoBuilder();
    run(slab, -OVER.half, OVER.half, -0.45, 0);
    for (const z of [-OVER.half, OVER.half - 0.36]) run(slab, z, z + 0.36, 0, 0.92);
    for (const z of [-6, -3, 0, 3, 6]) run(steel, z - 0.26, z + 0.26, -0.45 - OVER.girder, -0.45, 1 / 6);
    const lamps = [], posts = [], cones = [];
    for (let u = -end + 12; u < end; u += 36) {
      // piers: none over the highway itself, the first pair just outside its parapets
      const a = Math.abs(u), uu = a < 24 ? null : u;
      if (uu !== null) {
        const under = yAt(uu) - 0.45 - OVER.girder, h = under - 1.3 - (gY - 1);
        if (h > 1.6) {
          const c0 = [p0.x + rx * uu, p0.z + rz * uu];
          boxInto(piers, c0[0] - ox, under - 0.65 - oy, c0[1] - oz, 1.7, 1.3, 13.6, th, 0.25);
          for (const z of [-4.4, 4.4]) boxInto(piers, c0[0] + fx * z - ox, gY - 1 + h / 2 - oy, c0[1] + fz * z - oz, 1.4, h, 1.4, th, 0.25);
        }
      }
    }
    for (const u of [-24.5, 24.5]) {
      const under = top - 0.45 - OVER.girder, h = under - 1.3 - (gY - 1), c0 = [p0.x + rx * u, p0.z + rz * u];
      boxInto(piers, c0[0] - ox, under - 0.65 - oy, c0[1] - oz, 1.7, 1.3, 13.6, th, 0.25);
      for (const z of [-4.4, 4.4]) boxInto(piers, c0[0] + fx * z - ox, gY - 1 + h / 2 - oy, c0[1] + fz * z - oz, 1.4, h, 1.4, th, 0.25);
    }
    // lamps along one parapet then the other, every 42 m
    for (let u = -end + 30, n = 0; u < end - 20; u += 42, n++) {
      const z = (n % 2 ? 1 : -1) * (OVER.half - 0.6), x = p0.x + rx * u + fx * z, zz = p0.z + rz * u + fz * z, yy = yAt(u);
      lamps.push([x, yy + 8.3, zz, 0]); posts.push([x, yy, zz, 0]); cones.push([x, yy, zz, 8.2, SODIUM]);
    }
    const m1 = slab.build(), m2 = steel.build(), m3 = piers.build();
    if (m1) { const m = add(new THREE.Mesh(m1, this.mat.concrete)); m.userData.detailTier = -1; }
    if (m2) { const m = add(new THREE.Mesh(m2, this.mat.green)); m.userData.detailTier = -1; }
    if (m3) { const m = add(new THREE.Mesh(m3, this.mat.concrete)); m.userData.detailTier = -1; }
    const a1 = this.instances(add, this.lensGeo, this.mat.lampSodium, lamps, ox, oy, oz, { scale: [1.5, 1.5, 1.5], refl: false, probe: false });
    const a2 = this.instances(add, this.postGeo, this.mat.darkSteel, posts, ox, oy, oz, { scale: [1, 7.9, 1], refl: false, probe: false });
    for (const a of [a1, a2]) if (a) a.userData.detailTier = -1;
    if (cones.length) {
      const im = new THREE.InstancedMesh(this.coneGeo, this.mat.cone, cones.length), col = new Float32Array(cones.length * 3);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
      cones.forEach(([x, yy, z, h, cc], k) => { pv.set(x - ox, yy - oy, z - oz); sc.set(1, h, 1); mtx.compose(pv, q, sc); im.setMatrixAt(k, mtx); col.set([cc.r, cc.g, cc.b], k * 3); });
      im.geometry = this.coneGeo.clone(); im.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
      im.computeBoundingSphere(); im.renderOrder = 5; add(im, false, false);
    }
  }
  // ---- a mountain pass's valley (v91): the lights of its towns on the valley floor and of the road that runs along it
  buildValley(key, m, sMid, reach) {
    const R = this.road;
    R.ensure(Math.ceil((m.s1 + 60) / DS));
    const i = Math.round(sMid / DS), ox = R.X[i], oz = R.Z[i], oy = 0, side = -m.hill, floor = m.baseY - 26;
    const group = new THREE.Group(); group.position.set(ox - this.offset.x, oy, oz - this.offset.z);
    const ft = { group, ox, oy, oz, disposables: [], sMid, reachS: reach, level: null };
    const pos = [], col = [];
    const light = (x, y, z, kind, b) => { pos.push(x - ox, y - oy, z - oz); const c = kind === 0 ? [1, 0.64, 0.34] : kind === 1 ? [0.92, 0.95, 1] : [1, 0.82, 0.58]; col.push(c[0] * b, c[1] * b, c[2] * b); };
    for (const t of m.towns) {
      // streets on a grid, lamps along them, thinning out towards the edge of town; a few lit windows and white lights among them
      const rnd = mulberry32(t.seed), it = clamp(Math.round(t.s / DS), 0, R.length - 1), c = R.point(it, side * t.a), ang = R.T[it] + (rnd() - 0.5) * 0.7, ca = Math.cos(ang), sa = Math.sin(ang), G = 44;
      for (let n = 0; n < t.n; n++) {
        const rr = t.r * Math.pow(rnd(), 0.75), aa = rnd() * Math.PI * 2;
        let gx = Math.cos(aa) * rr, gz = Math.sin(aa) * rr * 0.8;
        if (rnd() < 0.5) gx = Math.round(gx / G) * G + (rnd() - 0.5) * 3; else gz = Math.round(gz / G) * G + (rnd() - 0.5) * 3;
        const k = rnd(), kind = k < 0.72 ? 0 : k < 0.86 ? 1 : 2;
        light(c.x + gx * ca + gz * sa, floor + 6 + rnd() * 7, c.z - gx * sa + gz * ca, kind, 0.55 + rnd() * 0.45);
      }
    }
    // the valley road: a lamp every 60 m or so, wandering along the foot of the slope
    for (let s = m.s0 + 350; s < m.s1 - 350; s += 58) {
      const j = clamp(Math.round(s / DS), 0, R.length - 1), a = 300 + 55 * Math.sin(s / 430 + m.seed % 7) + (m.topY ?? m.baseY + 100) * 0;
      const depth = R.Y[j] - floor;                         // the road is this far above the valley floor here
      const aa = Math.max(a, 60 + depth / 0.52);            // keep it out on the flat, past the foot of the slope
      if (R.reachA(j, side, aa) < aa) continue;
      const p = R.point(j, side * aa);
      light(p.x, floor + 9, p.z, 0, 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const pts = new THREE.Points(g, this.mat.townLights); pts.layers.set(0); pts.renderOrder = 3;
    group.add(pts); ft.disposables.push(g);
    this.group.add(group);
    this.features.set(key, ft);
  }

  // ---- rivers and lakes: water planes and deck-arch spans, built when near
  updateFeatures(sCar) {
    const R = this.road;
    const list = [...R.rivers.map((r) => ['r', r]), ...R.lakes.map((l) => ['l', l]), ...R.mountains.map((m) => ['m', m])];
    for (const [k, f] of list) {
      if (k !== 'm' && f.levelY === null) continue;
      const sMid = k === 'r' ? f.sMid : (f.s0 + f.s1) / 2, reach = k === 'r' ? f.reach : (f.s1 - f.s0) / 2 + 150;
      const key = k + sMid;
      const near = sMid - reach < sCar + 2200 && sMid + reach > sCar - 600;
      if (near && !this.features.has(key)) this.buildFeature(key, k, f, sMid, reach);
      if (!near && this.features.has(key)) { const ft = this.features.get(key); this.group.remove(ft.group); ft.disposables.forEach((d) => d.dispose()); this.features.delete(key); }
    }
  }
  buildFeature(key, kind, f, sMid, reach) {
    if (kind === 'm') return this.buildValley(key, f, sMid, reach);
    const R = this.road, i = Math.round(sMid / DS);
    R.ensure(Math.ceil((sMid + reach + 400) / DS));
    const ox = R.X[i], oz = R.Z[i], oy = 0;
    const group = new THREE.Group(); group.position.set(ox - this.offset.x, oy, oz - this.offset.z);
    const ft = { group, ox, oy, oz, disposables: [], sMid, reachS: reach, level: f.levelY };
    const th = R.T[i], F = [Math.sin(th), Math.cos(th)], Rv = [-Math.cos(th), Math.sin(th)];
    // water plane
    {
      let len, wid, dirA, dirB;
      if (kind === 'r') { const D = [Rv[0] - f.skew * F[0], Rv[1] - f.skew * F[1]], dl = Math.hypot(...D); dirA = [D[0] / dl, D[1] / dl]; dirB = [-dirA[1], dirA[0]]; len = 5200; wid = 2 * (f.halfW + f.bank * 0.7) * Math.cos(Math.atan(f.skew)); }
      else { dirA = F; dirB = Rv; len = (f.s1 - f.s0) + 300; wid = 5200; }
      const g = new THREE.BufferGeometry(), y = f.levelY - oy, pos = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(dirA[0] * a * len / 2 + dirB[0] * b * wid / 2, y, dirA[1] * a * len / 2 + dirB[1] * b * wid / 2);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 2, 1, 0, 3, 2]);
      const w = new THREE.Mesh(g, this.mat.water); w.layers.set(0); w.layers.enable(2); w.frustumCulled = false;
      group.add(w); ft.disposables.push(g);
    }
    // deck arch: two or one steel spans springing from stone piers at the water
    if (kind === 'r' && f.arch) {
      const gb = new GeoBuilder(), gbS = new GeoBuilder(), cols = new GeoBuilder();
      const span = 2 * (f.halfW + 12), nSpan = span > 300 ? 2 : 1, each = span / nSpan;
      const springY = f.levelY + 2.5, crownY = f.deckY - 3.3;
      for (let k = 0; k <= nSpan; k++) {
        const s = sMid - span / 2 + k * each, ii = Math.round(s / DS), c = R.point(ii, 0), th2 = R.T[ii];
        const h = f.deckY - 1.25 - (f.levelY - 3);
        boxInto(gbS, c.x - ox, f.levelY - 3 + h / 2 - oy, c.z - oz, 44, h, k === 0 || k === nSpan ? 12 : 9, th2, 0.18);
      }
      for (let k = 0; k < nSpan; k++) {
        const sA = sMid - span / 2 + k * each + 4.5, sB = sA + each - 9;
        for (const u of [-15.5, -5.5, 5.5, 15.5]) {
          const N = 48, ptsTop = [], ptsBot = [];
          for (let j = 0; j <= N; j++) {
            const t = j / N, s = lerp(sA, sB, t), fr = R.frameAt(s / DS), c = R.point(Math.round(s / DS), u);
            const yC = lerp(springY, crownY, 1 - (2 * t - 1) ** 2), depth = lerp(2.6, 1.6, 1 - (2 * t - 1) ** 2);
            ptsTop.push([c.x, yC, c.z, fr.th]); ptsBot.push([c.x, yC - depth, c.z]);
          }
          // rib as a box section following the arch
          const base = gb.n, wid = 0.65;
          for (let j = 0; j <= N; j++) {
            const [x, yT, z, t2] = ptsTop[j], yB = ptsBot[j][1], rx = -Math.cos(t2) * wid, rz = Math.sin(t2) * wid;
            for (const [a, yy] of [[-1, yT], [1, yT], [1, yB], [-1, yB]]) gb.v(x + rx * a - ox, yy - oy, z + rz * a - oz, 0, 1, 0, j / 4, a > 0 ? 1 : 0);
          }
          for (let j = 0; j < N; j++) for (let f2 = 0; f2 < 4; f2++) { const a = base + j * 4 + f2, b = base + j * 4 + ((f2 + 1) % 4); gb.quad(a, b, b + 4, a + 4); }
          // spandrel columns up to the deck every ~9 m
          for (let j = 2; j < N - 1; j += 3) {
            const [x, yT, z, t2] = ptsTop[j], top = f.deckY - 2.9, h = top - yT;
            if (h > 0.8) boxInto(cols, x - ox, yT + h / 2 - oy, z - oz, 0.7, h, 0.7, t2, 0.3);
          }
        }
      }
      const ribGeo = gb.build(); ribGeo.computeVertexNormals();
      const ribs = new THREE.Mesh(ribGeo, this.mat.archSteel); this.layer(ribs); group.add(ribs); ft.disposables.push(ribGeo);
      const cg = cols.build(); if (cg) { const m = new THREE.Mesh(cg, this.mat.archSteel); this.layer(m); group.add(m); ft.disposables.push(cg); }
      const sg = gbS.build(); if (sg) { const m = new THREE.Mesh(sg, this.mat.stone); this.layer(m); group.add(m); ft.disposables.push(sg); }
      // the arches are washed with light from below
      const flood = new THREE.Group();
      for (let k = 0; k < nSpan; k++) {
        const s = sMid - span / 2 + (k + 0.5) * each, c = R.point(Math.round(s / DS), 0);
        const l = new THREE.SpotLight(0xffd7a8, 1600, 140, 0.9, 0.7, 2);
        l.position.set(c.x - ox, f.levelY + 1 - oy, c.z - oz); l.target.position.set(c.x - ox, f.deckY - oy, c.z - oz);
        flood.add(l, l.target);
      }
      ft.floods = flood; // added only on high quality (they cost a light each)
    }
    this.group.add(group);
    this.features.set(key, ft);
  }
  stats() {
    let tris = 0, meshes = 0;
    this.group.traverse((o) => { if (o.isMesh && o.geometry) { meshes++; const g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } });
    return { chunks: this.chunks.size, features: this.features.size, emitters: this.emitters.length, meshes, tris: Math.round(tris), samples: this.road.length };
  }
}

// Collapse a group of small meshes into one mesh per material (world transforms baked in). Geometries that
// are not shared stay owned by the result so chunk disposal frees them.
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(g); });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeos(geos), mat); out.add(m); for (const g of geos) g.dispose(); }
  return out;
}
function mergeGeos(list) {
  // minimal merge for non-indexed / indexed geometries with position + normal (+ uv)
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    for (let k = 0; k < p.count; k++) { pos.push(p.getX(k), p.getY(k), p.getZ(k)); nor.push(n.getX(k), n.getY(k), n.getZ(k)); uv.push(t ? t.getX(k) : 0, t ? t.getY(k) : 0); }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + base);
    else for (let k = 0; k < p.count; k++) idx.push(k + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
