// Rain for Night Runner, all on the GPU:
//  - streaks: a few thousand drops in a box that travels with the camera (positions wrap around it), falling with a
//    little wind; each drop is a short line from its position back along its motion relative to the camera, so
//    at speed they stretch into the streaks you see through a windscreen. Drops in your headlights glint.
// (The rings that popped on the road where drops landed were taken out in v27.2 at the user's request.)
import * as THREE from 'three';
import { SHARED } from './world.js?b=c20ede232b';

const BOX = new THREE.Vector3(70, 34, 70);
// the drops drift along with the camera by this share of its speed (sideways and forwards, not up and down), so at
// 100 mph they come at the screen at about half the rate; the user found the full rush too much
const CARRY = 0.5;

export class Rain {
  constructor(scene, count = 9000) {
    this.amount = 0;
    this.offset = new THREE.Vector3();
    this.fall = new THREE.Vector3(1.6, -9.5, 0.6);   // m/s, with a light wind
    this.uniforms = {
      uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uOff: { value: this.offset },
      uStreak: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uFade: { value: 1 }, uRoadY: { value: 0 }, uTime: SHARED.uTime,
      uHeadPos: SHARED.uHeadPos, uHeadDir: SHARED.uHeadDir, uHeadOn: SHARED.uHeadOn,
    };
    // streaks: two vertices per drop sharing one random seed; aEnd says which end
    {
      const seed = new Float32Array(count * 6), end = new Float32Array(count * 2), bright = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const s = [Math.random(), Math.random(), Math.random()], b = 0.55 + Math.random() * 0.45;
        seed.set(s, i * 6); seed.set(s, i * 6 + 3); end[i * 2] = 0; end[i * 2 + 1] = 1; bright[i * 2] = bright[i * 2 + 1] = b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
      g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */`
          uniform vec3 uCam, uBox, uOff, uStreak, uHeadPos, uHeadDir; uniform float uHeadOn;
          attribute float aEnd, aBright; varying float vA;
          void main() {
            vec3 p = position * uBox + uOff;
            vec3 wp = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
            // headlights catch the drops in front of the car
            vec3 d = wp - uHeadPos; float dist = length(d);
            float lit = uHeadOn * smoothstep(0.82, 0.97, dot(d / max(dist, 0.01), uHeadDir)) * 80.0 / (dist * dist + 80.0);
            wp -= uStreak * aEnd;
            float dc = length(wp - uCam);
            vA = aBright * (1.0 - smoothstep(14.0, 34.0, dc)) * smoothstep(0.8, 2.5, dc) * (1.0 + min(lit * 2.5, 1.8));
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform float uAmount, uFade; varying float vA;
          void main() { float a = vA * uAmount * uFade * 0.32; if (!(a > 0.001) || !(a <= 8.0)) discard; gl_FragColor = vec4(vec3(0.62, 0.66, 0.72) * a, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.streaks = new THREE.LineSegments(g, m);
      this.streaks.frustumCulled = false; this.streaks.renderOrder = 9;
      scene.add(this.streaks);
    }
  }
  setDensity(q) { this.streaks.geometry.setDrawRange(0, (q >= 2 ? 9000 : q === 1 ? 6000 : 3000) * 2); }
  // cam: camera position; vel: the camera's velocity (m/s, world); roadY: road height under the camera
  update(dt, amount, cam, vel, roadY) {
    this.amount = amount;
    const vis = amount > 0.01;
    this.streaks.visible = vis;
    if (!vis) return;
    this.offset.addScaledVector(this.fall, dt);
    this.offset.x += vel.x * CARRY * dt; this.offset.z += vel.z * CARRY * dt;
    this.offset.set(((this.offset.x % BOX.x) + BOX.x) % BOX.x, ((this.offset.y % BOX.y) + BOX.y) % BOX.y, ((this.offset.z % BOX.z) + BOX.z) % BOX.z);
    // streak = how far a drop moves relative to the camera while the "shutter" is open; a shorter shutter than
    // before and a cap on the length, so at speed the drops are short dashes, not lines flying at the screen
    const exp = 0.016, st = this.uniforms.uStreak.value;
    st.set((this.fall.x - vel.x * (1 - CARRY)) * exp, (this.fall.y - vel.y) * exp, (this.fall.z - vel.z * (1 - CARRY)) * exp);
    const len = st.length(); if (len > 1.1) st.multiplyScalar(1.1 / len);
    this.uniforms.uCam.value.copy(cam);
    this.uniforms.uAmount.value = amount;
    // and they thin out a little at speed, so the screen isn't a wall of dashes
    const sp = Math.hypot(vel.x, vel.z); this.uniforms.uFade.value = 1 - 0.3 * Math.min(1, Math.max(0, (sp - 15) / 40));
    this.uniforms.uRoadY.value = roadY;
  }
  // after a floating-origin shift the drops keep their place relative to the world
  shift(dx, dz) { this.offset.x -= dx; this.offset.z -= dz; }
}
