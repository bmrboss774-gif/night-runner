// Colour-shifting ("chameleon") paint (v111). The owner: "add colour shifting chameleon wraps".
// A chameleon film (a wrap or a paint with interference flakes in it) shows one colour square-on and travels through others
// as the surface turns away: on a car the bonnet seen from above is one colour, the flanks another, and the edges, where the
// eye meets the surface at a glancing angle, a third. Here the paint's own colour is replaced, pixel by pixel, by a mix of
// three colours by that angle (the surface's normal against the direction to the eye), before the lights and the clear coat
// are worked out, so the reflections, the clear coat and the metal flake all sit on top of it as they do on any paint.
// Shared by the car in the game (index.html setPaint) and its copy in the collection (showroom.js setPaint).
import * as THREE from 'three';

// patch a MeshStandard/MeshPhysical material once; returns its uniforms. uCham 0 = the paint as it is (no cost to speak of).
export function chameleon(mat) {
  if (mat.userData.cham) return mat.userData.cham;
  const u = mat.userData.cham = { uCham: { value: 0 }, uChamA: { value: new THREE.Color() }, uChamB: { value: new THREE.Color() }, uChamC: { value: new THREE.Color() } };
  const prev = mat.onBeforeCompile, base = mat.customProgramCacheKey;
  const prevKey = base === THREE.Material.prototype.customProgramCacheKey ? prev.toString() : null;
  mat.onBeforeCompile = function (sh, ren) {
    prev.call(this, sh, ren);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCham;\nuniform vec3 uChamA, uChamB, uChamC;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	if (uCham > 0.5) {
		// 1 square-on, 0 at a glancing angle
		float chF = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), chT = 1.0 - chF;
		vec3 chC = mix(uChamA, uChamB, smoothstep(0.08, 0.5, chT));
		chC = mix(chC, uChamC, smoothstep(0.42, 0.86, chT));
		diffuseColor.rgb *= chC;
	}`);
  };
  mat.customProgramCacheKey = function () { return (prevKey ?? base.call(this)) + '|chameleon1'; };
  mat.needsUpdate = true;
  return u;
}
// switch it on with three colours ([a, b, c]: CSS colours, square-on to glancing), or off (null)
export function setChameleon(mat, cols) {
  const u = chameleon(mat);
  u.uCham.value = cols ? 1 : 0;
  if (cols) { u.uChamA.value.set(cols[0]); u.uChamB.value.set(cols[1]); u.uChamC.value.set(cols[2]); }
}
