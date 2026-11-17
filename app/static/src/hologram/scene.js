/* Static parts of the hologram: energy core, geodesic shell, gyroscope rings, holo table, dust, spark pool. */
import {
  Scene, Group, Color, Vector3, Vector4, Mesh, Points, Line, LineLoop, LineSegments, BufferGeometry, BufferAttribute, Float32BufferAttribute, ShaderMaterial,
  LineBasicMaterial, MeshBasicMaterial, SphereGeometry, IcosahedronGeometry, EdgesGeometry, PlaneGeometry, RingGeometry, CircleGeometry, CylinderGeometry,
  AdditiveBlending, FrontSide, DoubleSide,
} from "three";
import {
  CORE_VERT, CORE_FRAG, SPRITE_VERT, SPRITE_FRAG, SHELL_VERT, SHELL_FRAG, NODES_VERT, NODES_FRAG, ATMO_VERT, ATMO_FRAG, POINTS_VERT, POINTS_FRAG,
  PLANE_VERT, SWEEP_FRAG, BEAM_FRAG,
} from "./shaders.js";

export const CYAN = new Color(0.1, 0.83, 1.0), CYAN_HI = new Color(0.55, 0.92, 1.0), TEAL = new Color(0.18, 0.95, 0.78), AMBER = new Color(1.0, 0.69, 0.13);
const additive = { transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending };

export function makeUniforms() {
  return {
    uTime: { value: 0 }, uIntro: { value: 0 }, uAlert: { value: 0 }, uPulse: { value: 0 }, uScale: { value: 800 },
    uWave: { value: Array.from({ length: 6 }, () => new Vector4(0, 1, 0, -100)) }, uScanY: { value: -2 }, uHover: { value: 0 }, uHoverDir: { value: new Vector3(0, 1, 0) },
    uColor: { value: CYAN.clone() }, uColA: { value: new Color(0.05, 0.55, 1.0) }, uColB: { value: new Color(0.62, 0.95, 1.0) },
    uAlertCol: { value: AMBER.clone() }, uAlertA: { value: new Color(1.0, 0.45, 0.08) }, uAlertB: { value: new Color(1.0, 0.93, 0.72) },
  };
}

const circleXY = (r, n) => { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push(Math.cos(t) * r, Math.sin(t) * r, 0); } return a; };
const circleXZ = (r, n) => { const a = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; a.push(Math.cos(t) * r, 0, Math.sin(t) * r); } return a; };
const geo = pts => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pts, 3)); return g; };
const lineMat = (color, opacity) => new LineBasicMaterial({ color, opacity, ...additive });
const meshMat = (color, opacity, side = DoubleSide) => new MeshBasicMaterial({ color, opacity, side, ...additive });

function ticks(plane, r, n, len, longEvery, longLen) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), l = (longEvery && i % longEvery === 0) ? longLen : len;
    if (plane === "xy") a.push(c * r, s * r, 0, c * (r + l), s * (r + l), 0); else a.push(c * r, 0, s * r, c * (r + l), 0, s * (r + l));
  }
  return geo(a);
}

export function buildScene(U) {
  const scene = new Scene(), world = new Group(); scene.add(world);
  const fade = [];       // { mat, base, color } materials that follow intro + alert
  const track = (mat, base, tintable = true) => { fade.push({ mat, base, tintable }); return mat; };

  /* ----- energy core + halo ----- */
  const coreMat = new ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: { uTime: U.uTime, uPulse: U.uPulse, uAlert: U.uAlert, uIntro: U.uIntro, uColA: U.uColA, uColB: U.uColB, uAlertA: U.uAlertA, uAlertB: U.uAlertB }, ...additive });
  const core = new Mesh(new SphereGeometry(0.4, 48, 32), coreMat); world.add(core);
  const haloMat = new ShaderMaterial({ vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: { uSize: { value: 4.6 }, uColor: { value: CYAN.clone() }, uAlpha: { value: 0 }, uMode: { value: 0 }, uProg: { value: 0 } }, ...additive });
  const halo = new Mesh(new PlaneGeometry(1, 1), haloMat); world.add(halo);

  /* ----- atmosphere + geodesic shell ----- */
  const atmoMat = new ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: { uColor: { value: CYAN.clone() }, uIntro: U.uIntro, uAlpha: { value: 0.95 } }, ...additive, side: FrontSide });
  const atmo = new Mesh(new SphereGeometry(1.07, 48, 32), atmoMat); world.add(atmo);

  const ico = new IcosahedronGeometry(1, 3);
  const edges = new EdgesGeometry(ico, 1);
  const shellMat = new ShaderMaterial({ vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, uniforms: { uTime: U.uTime, uIntro: U.uIntro, uAlert: U.uAlert, uScanY: U.uScanY, uHover: U.uHover, uHoverDir: U.uHoverDir, uColor: U.uColor, uAlertCol: U.uAlertCol, uWave: U.uWave }, ...additive });
  const shell = new LineSegments(edges, shellMat); world.add(shell);

  const seen = new Set(), pts = [], seeds = [], sizes = [], p = ico.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 500) + "," + Math.round(y * 500) + "," + Math.round(z * 500);
    if (seen.has(k)) continue; seen.add(k); pts.push(x, y, z); seeds.push(Math.random()); sizes.push(0.034 + Math.random() * 0.03);
  }
  const ng = geo(pts); ng.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1)); ng.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  const nodesMat = new ShaderMaterial({ vertexShader: NODES_VERT, fragmentShader: NODES_FRAG, uniforms: { uTime: U.uTime, uScale: U.uScale, uIntro: U.uIntro, uAlert: U.uAlert, uColor: U.uColor, uAlertCol: U.uAlertCol, uWave: U.uWave }, ...additive });
  const shellPts = new Points(ng, nodesMat); world.add(shellPts);

  /* ----- gyroscope rings ----- */
  const rings = [];
  const ringSpecs = [
    { r: 1.38, tilt: [0.75, 0.25], spin: 0.42, arcs: [[0.0, 1.1], [2.5, 0.55], [4.2, 0.8]], w: 0.012 },
    { r: 1.58, tilt: [-0.55, 0.9], spin: -0.27, arcs: [[0.6, 0.7], [3.2, 1.3]], w: 0.014 },
    { r: 1.8, tilt: [0.25, -1.0], spin: 0.17, arcs: [[1.4, 0.45], [3.9, 0.9], [5.4, 0.35]], w: 0.016 },
  ];
  ringSpecs.forEach((s, i) => {
    const g = new Group(); g.rotation.set(s.tilt[0], s.tilt[1], 0); const spinner = new Group(); g.add(spinner);
    spinner.add(new LineLoop(geo(circleXY(s.r, 160)), track(lineMat(CYAN.clone(), 0.26), 0.26)));
    spinner.add(new LineSegments(ticks("xy", s.r, 90, 0.035, 6, 0.075), track(lineMat(CYAN_HI.clone(), 0.38), 0.38)));
    s.arcs.forEach(([st, ln]) => spinner.add(new Mesh(new RingGeometry(s.r - s.w, s.r + s.w, Math.max(8, Math.round(ln * 24)), 1, st, ln), track(meshMat(CYAN_HI.clone(), 0.85), 0.85))));
    world.add(g); rings.push({ spinner, spin: s.spin, group: g, phase: i * 1.9 });
  });

  /* ----- holo table ----- */
  const table = new Group(); table.position.y = -1.95; world.add(table);
  [[1.4, 0.34], [2.2, 0.24], [3.0, 0.17], [3.7, 0.12]].forEach(([r, o]) => table.add(new LineLoop(geo(circleXZ(r, 160)), track(lineMat(CYAN.clone(), o), o))));
  table.add(new LineSegments(ticks("xz", 3.7, 120, 0.06, 5, 0.14), track(lineMat(CYAN_HI.clone(), 0.3), 0.3)));
  table.add(new LineSegments(ticks("xz", 3.0, 72, 0.045, 6, 0.1), track(lineMat(CYAN.clone(), 0.22), 0.22)));
  const sweepMat = new ShaderMaterial({ vertexShader: PLANE_VERT, fragmentShader: SWEEP_FRAG, uniforms: { uColor: { value: CYAN.clone() }, uAlpha: { value: 0.15 }, uSpan: { value: 0.55 } }, ...additive, side: DoubleSide });
  const sweep = new Mesh(new CircleGeometry(3.7, 72, 0, 0.55), sweepMat); sweep.rotation.x = -Math.PI / 2;
  const sweepG = new Group(); sweepG.add(sweep); table.add(sweepG);          // spin the sector around the table's own vertical axis
  const beats = [0, 1].map(() => { const m = new Mesh(new RingGeometry(0.985, 1.0, 128), meshMat(CYAN_HI.clone(), 0)); m.rotation.x = -Math.PI / 2; table.add(m); return m; });
  const emitter = new Mesh(new CircleGeometry(0.42, 48), track(meshMat(CYAN_HI.clone(), 0.55), 0.55)); emitter.rotation.x = -Math.PI / 2; table.add(emitter);
  const beamMat = new ShaderMaterial({ vertexShader: PLANE_VERT, fragmentShader: BEAM_FRAG, uniforms: { uColor: { value: CYAN.clone() }, uAlpha: { value: 0.075 }, uIntro: U.uIntro }, ...additive, side: DoubleSide });
  const beam = new Mesh(new CylinderGeometry(0.62, 0.22, 1.95, 48, 1, true), beamMat); beam.position.y = 0.98; table.add(beam);

  /* ----- dust ----- */
  const N = 240, dp = [], dsz = [], dal = [], dco = [];
  for (let i = 0; i < N; i++) {
    const r = 2.3 + Math.random() * 3.4, a = Math.random() * 6.283, y = (Math.random() - 0.5) * 4.2;
    dp.push(Math.cos(a) * r, y, Math.sin(a) * r); dsz.push(0.018 + Math.random() * 0.04); dal.push(0.12 + Math.random() * 0.4);
    const tint = Math.random(); dco.push(0.3 + tint * 0.3, 0.75 + tint * 0.2, 1.0);
  }
  const dg = geo(dp); dg.setAttribute("aSize", new Float32BufferAttribute(dsz, 1)); dg.setAttribute("aAlpha", new Float32BufferAttribute(dal, 1)); dg.setAttribute("aColor", new Float32BufferAttribute(dco, 3));
  const pointsMat = new ShaderMaterial({ vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, uniforms: { uScale: U.uScale }, ...additive });
  const dust = new Points(dg, pointsMat); world.add(dust);

  /* ----- spark pool (pulse comets) ----- */
  const NS = 40, sp = new Float32Array(NS * 3), ssz = new Float32Array(NS), sal = new Float32Array(NS), sco = new Float32Array(NS * 3);
  const sg = new BufferGeometry();
  sg.setAttribute("position", new BufferAttribute(sp, 3)); sg.setAttribute("aSize", new BufferAttribute(ssz, 1)); sg.setAttribute("aAlpha", new BufferAttribute(sal, 1)); sg.setAttribute("aColor", new BufferAttribute(sco, 3));
  const sparks = new Points(sg, pointsMat); sparks.frustumCulled = false; world.add(sparks);

  /* following intro + alert: called every frame by the orchestrator */
  const tint = new Color();
  function applyLook(intro, alert) {
    fade.forEach(f => {
      f.mat.opacity = f.base * intro;
      if (f.tintable) { tint.copy(f.mat.userData.base || (f.mat.userData.base = f.mat.color.clone())); tint.lerp(AMBER, alert * 0.85); f.mat.color.copy(tint); }
    });
    haloMat.uniforms.uAlpha.value = 0.5 * intro;
    haloMat.uniforms.uColor.value.copy(CYAN).lerp(AMBER, alert * 0.9);
    atmoMat.uniforms.uColor.value.copy(CYAN).lerp(AMBER, alert * 0.9);
    beamMat.uniforms.uColor.value.copy(CYAN).lerp(AMBER, alert * 0.9);
    sweepMat.uniforms.uColor.value.copy(CYAN).lerp(AMBER, alert * 0.9);
  }

  const baseOpacity = new Map(); // (kept for symmetry with tint logic)
  function dispose() {
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
    baseOpacity.clear();
  }

  return { scene, world, core, halo, haloMat, shell, shellPts, atmo, rings, table, sweepG, beats, dust, sparks, sparkBuf: { sp, ssz, sal, sco, geo: sg, N: NS }, applyLook, dispose };
}
