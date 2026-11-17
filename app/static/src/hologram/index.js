/* Hologram core: public API. Orchestrates the scene, bot layer, post-processing, interaction and the adaptive quality manager. */
import { WebGLRenderer, PerspectiveCamera, MathUtils, ColorManagement, LinearSRGBColorSpace, Vector2 } from "three";
import { makeUniforms, buildScene, CYAN_HI, AMBER } from "./scene.js";
import { BotLayer } from "./bots.js";
import { createPost } from "./post.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const FOV = 32, TAN = Math.tan(MathUtils.degToRad(FOV / 2));

export function supported() {
  try {
    const c = document.createElement("canvas"), gl = c.getContext("webgl2");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    return true;
  } catch (e) { return false; }
}

export function create(host, opts = {}) {
  const o = Object.assign({ adapt: true, staticFrame: false, dprCap: 2, autoIntro: true, startLevel: 0, onHover() {}, onSelect() {}, onFallback() {}, onReady() {}, onDegrade() {} }, opts);
  ColorManagement.enabled = false;

  const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true"); host.insertBefore(canvas, host.firstChild);
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", stencil: false }); }
  catch (e) { canvas.remove(); throw e; }
  renderer.outputColorSpace = LinearSRGBColorSpace; renderer.setClearColor(0x000000, 0); renderer.info.autoReset = false;

  const U = makeUniforms(), S = buildScene(U), camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  const hiDpi = (window.devicePixelRatio || 1) >= 1.5, post = createPost(renderer, hiDpi ? 2 : 4);        // fewer MSAA samples where there are already many pixels
  const waves = []; let coreFlash = 0;
  const layer = new BotLayer(S.world, host, { arrive(pos) { waves.push({ dir: pos.clone().normalize(), t0: time }); coreFlash = 1; } });

  let W = 0, H = 0, dpr = 1, aspect = 1, camDist = 10, raf = 0, last = 0, lastDraw = 0, time = 0, disposed = false;
  let yaw = 0.6, yawVel = 0, pitchOff = 0, parX = 0, parY = 0, dragging = false, dragMoved = 0, lastX = 0, lastY = 0, lastMove = 0, lastInteract = -1e9;
  let pointerId = null, pointer = { x: null, y: null }, hoverId = null, extHoverId = null;
  let alertT = 0, alertTarget = 0, intro = o.staticFrame ? 1 : 0, introActive = false, introT0 = 0, introDur = 1.9;
  let paused = false, hiddenTab = document.hidden, inView = true, fpsCap = 60, staticFrame = !!o.staticFrame, dirty = true, readyFired = false;
  const quality = { bloom: true, dpr: o.dprCap, msaa: hiDpi ? 2 : 4 }, perf = { ema: 16, samples: 0, bad: 0, level: 0 };
  const ac = new AbortController(), sig = { signal: ac.signal };

  let zoom = 1;                                                    // <1 frames the scene tighter (the wall display uses it)
  function layoutCamera() { camDist = Math.max(3.95 / (TAN * aspect), 2.55 / TAN) * zoom; }
  function resize() {
    if (disposed) return;
    const r = host.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (w < 8 || h < 8) return;
    const nd = Math.min(window.devicePixelRatio || 1, quality.dpr);
    if (w === W && h === H && nd === dpr) return;
    W = w; H = h; dpr = nd;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    post.resize(bw, bh); aspect = W / H; camera.aspect = aspect; camera.updateProjectionMatrix(); layoutCamera(); U.uScale.value = bh / (2 * TAN);
    dirty = true;
  }

  /* ---------- interaction ---------- */
  host.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY; lastMove = performance.now(); yawVel = 0; lastInteract = time; pointerId = e.pointerId;
    try { host.setPointerCapture(e.pointerId); } catch (x) {}
  }, sig);
  host.addEventListener("pointermove", e => {
    const r = host.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    if (e.pointerType !== "touch") { parX = (pointer.x / r.width) * 2 - 1; parY = (pointer.y / r.height) * 2 - 1; }
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY, n = performance.now(), dt = Math.max(8, n - lastMove) / 1000;
      lastX = e.clientX; lastY = e.clientY; lastMove = n; dragMoved += Math.abs(dx) + Math.abs(dy);
      yaw += dx * 0.0072; pitchOff = clamp(pitchOff + dy * 0.0038, -0.26, 0.42); yawVel += ((dx * 0.0072) / dt - yawVel) * 0.5; lastInteract = time;
    }
    dirty = true;
  }, sig);
  const endDrag = e => { if (!dragging) return; dragging = false; try { host.releasePointerCapture(e.pointerId); } catch (x) {} if (dragMoved < 6 && hoverId) o.onSelect(hoverId); };
  host.addEventListener("pointerup", endDrag, sig); host.addEventListener("pointercancel", endDrag, sig);
  host.addEventListener("pointerleave", () => { pointer.x = pointer.y = null; parX = parY = 0; if (hoverId) { hoverId = null; o.onHover(null); } dirty = true; }, sig);
  host.addEventListener("dblclick", () => { yawVel = 0; pitchOff = 0; yaw = 0.6; lastInteract = -1e9; dirty = true; }, sig);
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); o.onFallback("context lost"); }, sig);

  /* ---------- per-frame ---------- */
  function step(dt) {
    if (!staticFrame) time += dt;
    if (introActive) { const k = clamp((time - introT0) / introDur, 0, 1); intro = 1 - Math.pow(1 - k, 3); if (k >= 1) introActive = false; }
    if (!dragging) {
      const idle = time - lastInteract > 5, target = staticFrame ? 0 : idle ? 0.075 : 0;
      yaw += yawVel * dt; yawVel += (target - yawVel) * Math.min(1, dt * (idle ? 0.7 : 2.2));
      if (idle) pitchOff += (0 - pitchOff) * Math.min(1, dt * 0.35);
    }
    alertT += (alertTarget - alertT) * Math.min(1, dt * 2.6);
    U.uTime.value = time; U.uIntro.value = intro; U.uAlert.value = alertT;
    const ph = (time * 0.3) % 1.5; U.uScanY.value = ph < 1 ? -1.25 + ph * 2.5 : 5;
    coreFlash = Math.max(0, coreFlash - dt * 2.0);
    U.uPulse.value = coreFlash * 0.75 + 0.06 * Math.sin(time * 2.3);
    S.core.scale.setScalar(1 + coreFlash * 0.14 + 0.02 * Math.sin(time * 2.1)); S.haloMat.uniforms.uSize.value = 4.5 * (1 + 0.04 * Math.sin(time * 1.4) + coreFlash * 0.14);
    if (!staticFrame) {
      S.rings.forEach(r => { r.spinner.rotation.z += r.spin * dt; });
      S.sweepG.rotation.y += 0.75 * dt; S.dust.rotation.y += 0.012 * dt;
    }
    S.beats.forEach((m, k) => {
      const p = ((time * 0.29) + k * 0.5) % 1; m.scale.setScalar(0.4 + p * 4.1); m.material.opacity = Math.pow(1 - p, 2) * 0.55 * intro * (staticFrame ? 0 : 1);
      m.material.color.copy(CYAN_HI).lerp(AMBER, alertT * 0.85);
    });
    for (let i = waves.length - 1; i >= 0; i--) if (time - waves[i].t0 > 2.4) waves.splice(i, 1);
    const wv = U.uWave.value, recent = waves.slice(-6);
    for (let i = 0; i < 6; i++) { const w = recent[i]; if (w) wv[i].set(w.dir.x, w.dir.y, w.dir.z, w.t0); else wv[i].set(0, 1, 0, -100); }
    const hb = layer.bots.find(b => b.id === (hoverId || extHoverId));
    U.uHover.value += ((hb ? 1 : 0) - U.uHover.value) * Math.min(1, dt * 8); if (hb) U.uHoverDir.value.copy(hb.pos).normalize();
    layer.update(time, dt, intro, !staticFrame, hoverId || extHoverId, S.sparkBuf);
  }

  const post_ = { bloom: true, bloomA: 0.95, bloomB: 0.85, exposure: 1.18, time: 0, aberration: 0.006, scan: 0.05, grain: 0.016 };
  function draw() {
    S.applyLook(intro, alertT);
    S.world.rotation.y = yaw - 1.8 * (1 - intro);
    const el = clamp(0.36 + pitchOff, 0.1, 0.78), mul = 1 + 0.32 * (1 - intro), d = camDist * mul;
    camera.position.set(parX * 0.34, Math.sin(el) * d + (-parY * 0.18), Math.cos(el) * d); camera.lookAt(0, 0.1, 0);
    camera.updateMatrixWorld(); S.world.updateMatrixWorld(true);
    const hit = layer.project(camera, W, H, dragging ? null : pointer.x, pointer.y, d), id = hit ? hit.id : null;
    if (id !== hoverId) { hoverId = id; o.onHover(id, hit ? hit.sx : 0, hit ? hit.sy : 0); }
    host.style.cursor = hoverId ? "pointer" : dragging ? "grabbing" : "grab";
    post_.bloom = quality.bloom; post_.time = time;
    renderer.info.reset(); post.render(S.scene, camera, post_);
  }

  /* Once the intro is done the core must be on screen. Some GPU/driver/format combinations produce a silently blank
     canvas (an incomplete half-float framebuffer, say): look at a few pixels at the centre once, and fall back to 2D if empty. */
  let verifyDone = false, verifyMax = -1, blankReads = 0, vFrames = 0;
  function verifyDrawing() {
    try {
      const gl = renderer.getContext(), w = canvas.width, h = canvas.height, px = new Uint8Array(4 * 36);
      gl.readPixels((w >> 1) - 3, (h >> 1) - 3, 6, 6, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let mx = 0; for (let i = 0; i < px.length; i++) mx = Math.max(mx, px[i]);
      verifyMax = Math.max(verifyMax, mx);
      if (mx >= 8) { verifyDone = true; return; }                 // the core is on screen
      if (++blankReads >= 3) { verifyDone = true; o.onFallback("the 3D canvas drew nothing"); }   // three empty readbacks in a row, seconds apart
    } catch (e) { verifyDone = true; /* cannot read back here: trust the render */ }
  }

  function frame(now) {
    raf = 0; if (disposed) return;
    if (!(paused || hiddenTab || !inView)) raf = requestAnimationFrame(frame);
    else return;
    const busy = !staticFrame || dragging || introActive || waves.length > 0 || layer.pulses.length > 0 || Math.abs(yawVel) > 0.002 || U.uHover.value > 0.01 || Math.abs(alertT - alertTarget) > 0.01 || coreFlash > 0.01;
    if (!busy && !dirty) { last = now; return; }
    const cap = document.hasFocus() ? fpsCap : Math.min(fpsCap, 24), minDt = 1000 / cap;
    if (now - lastDraw < minDt - 2) return;
    const dtms = last ? Math.min(100, Math.max(0, now - last)) || 16 : 16; last = now; lastDraw = now;     // never negative: a slow first frame must not run time backwards
    step(dtms / 1000); draw(); dirty = false;
    if (!readyFired) { readyFired = true; o.onReady(); }          // first frame is on screen: shaders are compiled, safe to reveal
    if (!verifyDone && intro >= 0.99 && (vFrames++ % 40) === 0) verifyDrawing();
    if (o.adapt && cap >= 50 && document.hasFocus()) {
      perf.ema += (dtms - perf.ema) * 0.08; perf.samples++;
      // slower than 25 fps for a sustained stretch (30 fps is fine: battery savers cap at 30)
      if (perf.samples > 90 && perf.ema > 40) { if (++perf.bad > 40) { degrade(); perf.bad = 0; perf.samples = 0; perf.ema = 16; } }
      else if (perf.ema < 30) perf.bad = Math.max(0, perf.bad - 1);
    }
  }
  /* The ladder, gentlest first. 1: the page drops its own heavy effects (blurred glass, drifting light), which is
     often the real cost. 2: no bloom. 3: pixel ratio 1. 4: no MSAA. 5: give up and use the flat core. */
  function applyLevel(l) {                                         // works in both directions (battery saver on, off)
    quality.bloom = l < 2;
    quality.dpr = l >= 3 ? 1 : o.dprCap; resize();
    quality.msaa = l >= 4 ? 0 : (hiDpi ? 2 : 4); post.setSamples(quality.msaa);
    dirty = true;
  }
  function degrade() {
    perf.level++;
    if (perf.level >= 5) { o.onFallback("too slow"); return; }
    applyLevel(perf.level); o.onDegrade(perf.level);
  }
  if (o.startLevel > 0) { perf.level = Math.min(4, o.startLevel); applyLevel(perf.level); }     // this device was slow before: start where it ended up
  function refreshLoop() {
    const run = !(paused || hiddenTab || !inView || disposed);
    if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  new ResizeObserver(() => resize()).observe(host);
  new IntersectionObserver(es => { inView = es[0].isIntersecting; refreshLoop(); }).observe(host);
  document.addEventListener("visibilitychange", () => { hiddenTab = document.hidden; refreshLoop(); }, sig);
  resize(); refreshLoop();
  if (o.autoIntro && !staticFrame) api_intro(1900);

  function api_intro(ms) { if (staticFrame) { intro = 1; dirty = true; return; } intro = 0; introActive = true; introT0 = time; introDur = (ms || 1900) / 1000; yawVel = 0; dirty = true; }

  return {
    setBots(list) { layer.sync(list, time); dirty = true; },
    pulse(id) { if (staticFrame) return; layer.pulse(id, time); dirty = true; },
    setAlert(a) { alertTarget = a ? 1 : 0; if (staticFrame) alertT = alertTarget; dirty = true; },
    setHover(id) { extHoverId = id || null; dirty = true; },
    intro: api_intro,
    resize,
    /* test hook: advance the simulation without waiting for real frames */
    advance(seconds) { const n = Math.max(1, Math.round(seconds / 0.05)); for (let i = 0; i < n; i++) step(0.05); dirty = true; draw(); dirty = false; },
    setPaused(p) { paused = !!p; refreshLoop(); dirty = true; },
    setStatic(b) { staticFrame = !!b; if (staticFrame) { intro = 1; introActive = false; alertT = alertTarget; yawVel = 0; } dirty = true; },
    forceDegrade() { degrade(); },
    setLevel(l) { perf.level = clamp(l | 0, 0, 4); perf.bad = 0; perf.samples = 0; applyLevel(perf.level); },
    setAdapt(b) { o.adapt = !!b; },                                // test hook
    setFpsCap(n) { fpsCap = clamp(+n || 60, 10, 120); },
    setZoom(z) { zoom = clamp(+z || 1, 0.6, 1.4); layoutCamera(); dirty = true; },
    getStats() { const i = renderer.info; return { fps: Math.round(1000 / perf.ema), level: perf.level, cap: fpsCap, bloom: quality.bloom, dpr, w: W, h: H, calls: i.render.calls, triangles: i.render.triangles, float: post.hasFloat, intro: +intro.toFixed(3), introActive, time: +time.toFixed(2), alpha: +alertT.toFixed(2), verified: verifyMax }; },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); ac.abort();
      layer.dispose(); S.dispose(); post.dispose(); renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {} canvas.remove();
    },
  };
}
