"use strict";
/* ============================================================
   Performance governor: the dashboard keeps every effect, and spends only what it needs.

   active  you are using it: full frame rate.
   idle    nothing touched for a while (or the window is not focused): half rate. Looks identical on a slow drift.
   calm    nothing touched for a long time: lower still, and the looping decorative animations pause. They would
           otherwise force the browser to repaint the whole page 60 times a second for nothing.
   Any input wakes it instantly. The wall display never goes calm (it is meant to stay alive), only idle.

   Modes (palette): Auto (recommended), Battery saver (lighter 3D, lite page, lower rates), Full quality (no automatic step-down).
   ============================================================ */
const Perf = (() => {
  const RATES = { auto: { active: 60, idle: 30, calm: 20 }, saver: { active: 30, idle: 20, calm: 12 }, full: { active: 60, idle: 60, calm: 30 } };
  const AFTER = { auto: [30000, 120000], saver: [8000, 30000], full: [60000, 300000] };       // ms without input: idle, calm
  let mode = store.get("perf", "auto"), state = "active", last = Date.now(), paused = [];
  if (!RATES[mode]) mode = "auto";

  const rate = () => { const r = RATES[mode][state]; return Ambient.active ? Math.min(r, mode === "saver" ? 20 : 30) : r; };
  const lite = () => document.documentElement.classList.toggle("lite", mode === "saver" || store.get("coreLevel", 0) >= 1);

  function animations(run) {
    if (run) { paused.forEach(a => { try { a.play(); } catch (e) {} }); paused = []; return; }
    paused = document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations === Infinity);
    paused.forEach(a => { try { a.pause(); } catch (e) {} });
  }
  function apply() { Core.fpsCap(rate()); }
  function go(next) {
    if (next === state) return;
    const was = state; state = next;
    if (next === "calm" && !Ambient.active) animations(false); else if (was === "calm") animations(true);
    apply(); bus.emit("perf:state", state);
  }
  function tick() {
    const idle = Date.now() - last, [i, c] = AFTER[mode];
    let next = idle > c ? "calm" : (idle > i || !document.hasFocus()) ? "idle" : "active";
    if (Ambient.active && next === "calm") next = "idle";
    go(next);
  }
  function bump() { last = Date.now(); if (state !== "active") go("active"); }

  ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach(e => addEventListener(e, bump, { passive: true, capture: true }));
  addEventListener("focus", bump);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) bump(); });
  bus.on("ambient:enter", () => { if (state === "calm") animations(true); apply(); }); bus.on("ambient:exit", apply);
  setInterval(tick, 2000); lite(); apply();

  return {
    get mode() { return mode; }, get state() { return state; }, get rate() { return rate(); },
    set(m, { quiet = false } = {}) {
      if (!RATES[m]) return; mode = m; store.set("perf", m); lite();
      if (m === "saver") { Core.level(2); Core.adapt(true); }
      else if (m === "full") { store.set("coreLevel", 0); document.documentElement.classList.remove("lite"); Core.level(0); Core.adapt(false); }
      else { Core.adapt(true); }
      apply(); if (!quiet) toast(m === "saver" ? "Battery saver: lighter 3D, calmer page, lower frame rates" : m === "full" ? "Full quality: no automatic step-down" : "Performance: automatic");
    },
    idleNow() { last = 0; tick(); },                                    // test hook
  };
})();
