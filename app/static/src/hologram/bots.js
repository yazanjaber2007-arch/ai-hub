/* Bots as satellites: orbit, node, halo, beam to the core, HTML label, comet pulses. */
import {
  Group, Mesh, Line, LineLoop, Color, Vector3, Quaternion, Euler, SphereGeometry, PlaneGeometry, BufferGeometry, Float32BufferAttribute, BufferAttribute,
  ShaderMaterial, LineBasicMaterial, AdditiveBlending,
} from "three";
import { SPRITE_VERT, SPRITE_FRAG, ATMO_VERT, NODE_FRAG } from "./shaders.js";

const additive = { transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending };
const RED = new Color(1.0, 0.33, 0.41), GREY = new Color(0.48, 0.62, 0.69);
const STATE = {
  working: { bright: 1.0, beam: 0.62, halo: 0.95, speed: 1.0 },
  idle: { bright: 0.74, beam: 0.34, halo: 0.55, speed: 0.8 },
  waiting: { bright: 0.3, beam: 0.1, halo: 0.2, speed: 0.5 },
  silent: { bright: 0.95, beam: 0.4, halo: 0.75, speed: 0.4 },
};
const INC = [0.12, -0.2, 0.3, -0.1, 0.24, -0.3, 0.17, -0.26], SPEED = [0.3, -0.22, 0.17, -0.13, 0.1, -0.085, 0.07, -0.06];
const radiusFor = (i, n) => (n <= 1 ? 2.2 : 1.75 + 1.3 * i / (n - 1));
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function orbitCircle() {
  const a = [], n = 180;
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push(Math.cos(t), 0, Math.sin(t)); }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(a, 3)); return g;
}
const ORBIT_GEO = orbitCircle();

export class BotLayer {
  constructor(world, host, hooks) {
    this.world = world; this.host = host; this.hooks = hooks; this.bots = []; this.pulses = [];
    this.group = new Group(); world.add(this.group);
    this.v = new Vector3(); this.w = new Vector3();
  }

  make(spec) {
    const color = new Color(spec.color), g = new Group(); this.group.add(g);
    const nodeMat = new ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: NODE_FRAG, uniforms: { uColor: { value: color.clone() }, uBright: { value: 0 } }, ...additive });
    const node = new Mesh(new SphereGeometry(0.075, 18, 14), nodeMat); g.add(node);
    const mkSprite = (size, mode) => new ShaderMaterial({ vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: { uSize: { value: size }, uColor: { value: color.clone() }, uAlpha: { value: 0 }, uMode: { value: mode }, uProg: { value: 0 } }, ...additive });
    const haloMat = mkSprite(0.78, 0), burstMat = mkSprite(1.5, 1);
    const halo = new Mesh(new PlaneGeometry(1, 1), haloMat), burst = new Mesh(new PlaneGeometry(1, 1), burstMat); g.add(halo, burst);
    const orbitMat = new LineBasicMaterial({ color: color.clone(), opacity: 0, ...additive });
    const orbit = new LineLoop(ORBIT_GEO, orbitMat); this.group.add(orbit);
    const bg = new BufferGeometry();
    bg.setAttribute("position", new BufferAttribute(new Float32Array(6), 3)); bg.setAttribute("color", new BufferAttribute(new Float32Array(6), 3));
    const beamMat = new LineBasicMaterial({ vertexColors: true, ...additive });
    const beam = new Line(bg, beamMat); beam.frustumCulled = false; this.group.add(beam);

    const label = document.createElement("div"); label.className = "hl";
    const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = spec.glyph || ""; label.appendChild(s);
    const name = document.createElement("span"); name.textContent = spec.name || spec.id; label.appendChild(name); this.host.appendChild(label);

    return {
      id: spec.id, g, node, nodeMat, halo, haloMat, burst, burstMat, orbit, orbitMat, beam, beamMat, label, color, eff: color.clone(),
      state: spec.state, note: spec.note, sens: spec.sens, glyph: spec.glyph, baseColor: spec.color,
      i: 0, n: 1, R: 2.4, targetR: 2.4, theta: Math.random() * 6.28, omega: 0, inc: 0, om: 0, q: new Quaternion(), pos: new Vector3(),
      vis: 0, bright: 0, phase: Math.random() * 6.28, hover: 0, born: -1, sx: -999, sy: -999, dist: 0,
    };
  }

  sync(list, t) {
    const by = new Map(this.bots.map(b => [b.id, b])), keep = [], n = list.length;
    list.forEach((spec, i) => {
      let b = by.get(spec.id);
      if (!b) { b = this.make(spec); b.theta = i * 2.1 + 0.6; b.born = t; b.R = b.targetR = radiusFor(i, n); }
      if (b.baseColor !== spec.color) { b.baseColor = spec.color; b.color.set(spec.color); }
      b.state = spec.state; b.note = spec.note; b.sens = spec.sens; b.i = i; b.n = n;
      b.targetR = radiusFor(i, n); b.inc = INC[i % 8]; b.om = i * 0.9; b.omega = SPEED[i % 8];
      b.q.setFromEuler(new Euler(b.inc, b.om, 0, "YXZ"));
      b.label.setAttribute("data-state", b.state); b.label.style.setProperty("--c", "#" + b.color.getHexString());
      keep.push(b);
    });
    this.bots.filter(b => !keep.includes(b)).forEach(b => this.drop(b));
    this.bots = keep;
  }

  drop(b) {
    this.group.remove(b.g, b.orbit, b.beam);
    [b.node.geometry, b.halo.geometry, b.burst.geometry, b.beam.geometry].forEach(g => g.dispose());
    [b.nodeMat, b.haloMat, b.burstMat, b.orbitMat, b.beamMat].forEach(m => m.dispose());
    b.label.remove();
  }

  pulse(id, t) { const b = this.bots.find(x => x.id === id); if (b && b.vis > 0.5) this.pulses.push({ b, t0: t, dur: 1.05, hit: false }); }

  update(t, dt, intro, animate, hoverId, spark) {
    const tmp = this.v;
    this.bots.forEach(b => {
      const st = STATE[b.state] || STATE.idle;
      b.R += (b.targetR - b.R) * Math.min(1, dt * 3);
      if (animate) b.theta += b.omega * st.speed * dt;
      const c = Math.cos(b.theta) * b.R, s = Math.sin(b.theta) * b.R;
      b.pos.set(c, 0, s).applyQuaternion(b.q);
      b.g.position.copy(b.pos);
      b.orbit.quaternion.copy(b.q); b.orbit.scale.setScalar(b.R);
      // effective colour follows state
      const target = b.state === "silent" ? RED : b.state === "waiting" ? GREY : b.color;
      b.eff.lerp(target, Math.min(1, dt * 5));
      const appear = Math.max(0, Math.min(1, (intro - (0.3 + b.i * 0.07)) * 3)), popped = b.born >= 0 ? Math.max(0, Math.min(1, (t - b.born) * 1.2)) : 1;
      b.vis = Math.max(0, Math.min(1, b.vis + ((Math.min(appear, popped)) - b.vis) * Math.min(1, dt * 6)));
      const isH = hoverId === b.id; b.hover += ((isH ? 1 : 0) - b.hover) * Math.min(1, dt * 10);
      const flick = b.state === "silent" ? (0.55 + 0.45 * Math.sin(t * 7 + b.phase) * Math.sin(t * 2.9 + b.phase)) : 1;
      b.bright += (st.bright - b.bright) * Math.min(1, dt * 4);
      const k = b.vis * (b.bright * flick * (1 + 0.55 * b.hover));
      b.nodeMat.uniforms.uColor.value.copy(b.eff); b.nodeMat.uniforms.uBright.value = k * 1.15;
      b.node.scale.setScalar(0.55 + 0.45 * b.vis + 0.35 * b.hover);
      const breathe = b.state === "working" ? 1 + 0.22 * Math.sin(t * 3 + b.phase) : 1 + 0.08 * Math.sin(t * 1.2 + b.phase);
      b.haloMat.uniforms.uColor.value.copy(b.eff); b.haloMat.uniforms.uAlpha.value = st.halo * b.vis * flick * (1 + 0.7 * b.hover) * 0.55; b.haloMat.uniforms.uSize.value = 0.78 * breathe * (1 + 0.25 * b.hover);
      b.burstMat.uniforms.uColor.value.copy(b.eff);
      const prog = (t * 0.42 + b.phase) % 1; b.burstMat.uniforms.uProg.value = prog;
      b.burstMat.uniforms.uAlpha.value = (b.state === "working" ? 0.85 : 0) * b.vis + b.hover * 0.7;
      b.orbitMat.color.copy(b.eff); b.orbitMat.opacity = (0.1 + 0.16 * b.hover + (b.state === "waiting" ? -0.04 : 0.04)) * b.vis * Math.min(1, intro * 1.5);
      // beam to the core: bright at the node, fading toward the centre
      const pa = b.beam.geometry.attributes.position.array, ca = b.beam.geometry.attributes.color.array, bb = st.beam * b.vis * flick * (1 + 0.8 * b.hover);
      pa[0] = b.pos.x; pa[1] = b.pos.y; pa[2] = b.pos.z; pa[3] = 0; pa[4] = 0; pa[5] = 0;
      ca[0] = b.eff.r * bb; ca[1] = b.eff.g * bb; ca[2] = b.eff.b * bb; ca[3] = b.eff.r * bb * 0.1; ca[4] = b.eff.g * bb * 0.1; ca[5] = b.eff.b * bb * 0.1;
      b.beam.geometry.attributes.position.needsUpdate = true; b.beam.geometry.attributes.color.needsUpdate = true;
      b.label.classList.toggle("on", isH);
    });

    // comet pulses along the beams
    const { sp, ssz, sal, sco, geo, N } = spark; let n = 0;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i], u = (t - p.t0) / p.dur;
      if (u >= 1) { if (!p.hit) { p.hit = true; this.hooks.arrive(p.b.pos); } this.pulses.splice(i, 1); continue; }
      for (let k = 0; k < 5 && n < N; k++) {
        const uu = Math.max(0, u - k * 0.045), e = ease(uu), f = 1 - e * 0.9;
        sp[n * 3] = p.b.pos.x * f; sp[n * 3 + 1] = p.b.pos.y * f; sp[n * 3 + 2] = p.b.pos.z * f;
        ssz[n] = (k === 0 ? 0.16 : 0.1 - k * 0.012) * (1 - 0.4 * u); sal[n] = k === 0 ? 1.15 : 0.55 / (k + 0.6);
        sco[n * 3] = k === 0 ? 1 : p.b.eff.r; sco[n * 3 + 1] = k === 0 ? 1 : p.b.eff.g; sco[n * 3 + 2] = k === 0 ? 1 : p.b.eff.b; n++;
      }
    }
    for (; n < N; n++) { sal[n] = 0; ssz[n] = 0; }
    geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aColor.needsUpdate = true;
    void tmp;
  }

  /* project nodes to the screen, place HTML labels (nudged apart so they never overlap), return the node under the pointer */
  project(camera, W, H, px, py, camDist) {
    let best = null, bestD = 30;
    this.bots.forEach(b => {
      const v = this.v.copy(b.pos).applyMatrix4(this.world.matrixWorld);
      const vz = this.w.copy(v).applyMatrix4(camera.matrixWorldInverse); b.dist = -vz.z;
      v.project(camera); b.sx = (v.x * 0.5 + 0.5) * W; b.sy = (-v.y * 0.5 + 0.5) * H;
      if (px != null && b.vis > 0.6) { const d = Math.hypot(b.sx - px, b.sy - py); if (d < bestD) { bestD = d; best = b; } }
    });
    // nearest labels get first pick of position; farther ones slide down to stay readable
    const placed = [];
    [...this.bots].sort((a, b) => a.dist - b.dist).forEach(b => {
      const w = (b.lw || (b.lw = b.label.offsetWidth || 80)), h = (b.lh || (b.lh = b.label.offsetHeight || 22));
      let dy = 0;
      for (let k = 0; k < 6; k++) {
        const x0 = b.sx - w / 2, y0 = b.sy + 13 + dy, hit = placed.some(r => x0 < r.x1 && x0 + w > r.x0 && y0 < r.y1 && y0 + h > r.y0);
        if (!hit) break; dy += h + 3 > 0 ? (k % 2 === 0 ? h + 3 : -(2 * h + 6)) : 0;
      }
      b.ly = b.sy + dy; placed.push({ x0: b.sx - w / 2, x1: b.sx + w / 2, y0: b.ly + 13, y1: b.ly + 13 + h });
      const depth = Math.max(0.4, Math.min(1, 1 - (b.dist - (camDist - 3.0)) / 6.5));
      b.label.style.opacity = (b.vis * depth).toFixed(3); b.label.style.zIndex = String(Math.round(2000 - b.dist * 100));
      b.label.style.transform = "translate3d(" + b.sx.toFixed(1) + "px," + b.ly.toFixed(1) + "px,0)";
    });
    return best;
  }

  dispose() { this.bots.forEach(b => this.drop(b)); this.bots = []; this.world.remove(this.group); }
}
