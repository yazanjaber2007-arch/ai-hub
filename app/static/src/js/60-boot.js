"use strict";
/* ============================================================
   Boot sequence (~1.7 s, skippable). Once per tab session, never under reduced motion.

   begin()  the rings draw, the core ignites and the title types. Starts at once, so there is never a dead screen.
   ready()  the first data is in: each real bot reports in, then a radial reveal lifts the overlay while the
            panels cascade in and the 3D core spins up. Timings match the boot sound in 65-sound.js.
   ============================================================ */
const Boot = (() => {
  const html = document.documentElement;
  const wanted = html.classList.contains("booting");        // decided before first paint by the inline script in <head>
  const T = { lines: 450, bot: 620, step: 170, chime: 1550, coreWait: 3400, hold: 7500 };   // ms from begin()
  let running = false, revealed = false, done = false, dataIn = false, t0 = 0, timers = []; const marks = {};

  const later = (fn, ms) => { const id = setTimeout(fn, Math.max(0, ms)); timers.push(id); return id; };
  const stopTimers = () => { timers.forEach(id => { clearTimeout(id); clearInterval(id); }); timers = []; };

  /* typed text without layout shift: the part not typed yet stays in the flow, only invisible */
  function typeInto(node, text, per, { cursor = false, then } = {}) {
    const a = el("span"), b = el("span", "hid", text), c = cursor ? el("i", "cur") : null;
    node.replaceChildren(...(c ? [a, c, b] : [a, b]));
    let i = 0;
    const id = setInterval(() => {
      i++; a.textContent = text.slice(0, i); b.textContent = text.slice(i);
      if (i >= text.length) { clearInterval(id); if (!cursor) node.textContent = text; then && then(); }
    }, per);
    timers.push(id);
  }
  function line(txt, state, cls, role) {
    const d = el("div", "bl" + (cls ? " " + cls : "")); const lab = el("span", "", txt); if (role) lab.append(el("small", "", role)); d.append(lab, el("i"), el("b", "", state || ""));
    $("bootLines").append(d);
  }
  function botState(b) {
    return b.state === "silent" ? ["silent", "bad"] : b.state === "waiting" ? ["standby", "warn"] : b.state === "working" ? ["active", ""] : ["online", ""];
  }
  const greetText = () => { const who = LIVE ? (M && M.owner) : GUEST; return greeting() + (who ? ", " + who : ""); };

  function cleanup() {
    stopTimers();
    const b = $("boot"); b.classList.remove("go", "out", "fade");
    html.classList.remove("reveal", "booting");
    clear($("bootLines")); $("bootTitle").textContent = "";
    running = false; revealed = false; dataIn = false;
  }

  function begin() {
    if (!wanted || running || done || reduced()) return false;
    running = true; revealed = false; dataIn = false; t0 = performance.now(); timers = []; marks.begin = t0;
    html.classList.add("booting");
    const b = $("boot"); b.classList.remove("out", "fade", "go"); clear($("bootLines"));
    setText($("bootSkip"), matchMedia("(pointer:coarse)").matches ? "Tap to skip" : "Press any key to skip");
    void b.offsetWidth; b.classList.add("go");
    typeInto($("bootTitle"), "COMMAND CENTER", 34, { cursor: true });
    bus.emit("boot:start");
    later(() => { if (running && !dataIn) { dataIn = true; reveal(true); } }, T.hold);     // data never arrived: show the dashboard anyway
    return true;
  }

  /* data is in: bots report, then reveal */
  function ready(ok = true) {
    if (!running || dataIn) return; dataIn = true; marks.data = performance.now();
    if (!ok) { reveal(true); return; }
    $("greet").replaceChildren(el("span"), el("span", "hid", greetText()));     // laid out but invisible, so the stale placeholder never flashes
    const bots = (M && M.bots) || [], over = bots.length > 5, shown = over ? bots.slice(0, 4) : bots;
    const elapsed = performance.now() - t0; let n = 0, last = 0;
    const at = (off, fn) => { const when = Math.max(off - elapsed, n++ * 45); last = Math.max(last, when); later(fn, when); };
    at(T.lines, () => line("Uplink established", "ok"));
    shown.forEach((b, i) => { const [s, c] = botState(b); at(T.bot + i * T.step, () => line(b.name, s, c, b.role)); });
    if (over) at(T.bot + 4 * T.step, () => line("+" + (bots.length - 4) + " more", "online"));
    at(T.bot + Math.max(shown.length + (over ? 1 : 0), 1) * T.step, () => line("All systems nominal", "ok"));
    // reveal on the chime, but not before the 3D core has drawn its first frame (its shader compile would stutter the reveal)
    later(function go() { if (!running || revealed) return; if (Core.settled || performance.now() - t0 > T.coreWait) reveal(false); else later(go, 60); }, Math.max(T.chime - elapsed, last + 150));
  }

  function reveal(fast) {
    if (!running || revealed) return; revealed = true;
    const b = $("boot");
    html.classList.remove("booting");                       // #boot.go keeps the overlay up while it dissolves
    if (fast) b.classList.add("fade");
    else {
      // panels fade in as the light ring reaches them: each delay follows the panel's distance from the centre of the opening
      const cx = innerWidth * 0.5, cy = innerHeight * 0.46, D = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
      $$(".panel,.rn").forEach(n => { const r = n.getBoundingClientRect(); n.style.setProperty("--wd", clamp(Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy) / D, 0, 1.2).toFixed(3)); });
      b.classList.add("out"); html.classList.add("reveal");
    }
    marks.reveal = performance.now(); measure(); Core.resize(); Core.intro(); bus.emit("boot:reveal");
    if (!fast) later(() => typeInto($("greet"), greetText(), 24), 480);
    later(end, fast ? 440 : 1650);
  }

  function end() {
    if (!running) return;
    marks.end = performance.now(); cleanup(); done = true; tabStore.set("booted", true);
    $("greet").textContent = greetText();                   // a skip can leave the typed greeting half-finished
    tick(); bus.emit("boot:end");
  }
  /* auth wall appeared before the data did: hide the overlay now, play the boot once the user is in */
  function abort() { if (running) { cleanup(); Core.intro(); } }
  function skip() { if (!running) return; if (!revealed) { dataIn = true; reveal(true); } else end(); }

  addEventListener("keydown", e => {
    if (!running || e.ctrlKey || e.metaKey || e.altKey || e.key === "Tab" || e.key === "Shift" || /^F\d+$/.test(e.key)) return;
    e.stopImmediatePropagation(); skip();                   // the key that skips is not also a shortcut
  }, true);
  addEventListener("pointerdown", () => { if (running) skip(); }, true);
  bus.on("auth:ok", begin); bus.on("auth:required", abort);

  return {
    get wanted() { return wanted; }, get running() { return running; }, get revealed() { return revealed; }, get done() { return done; },
    begin, ready, skip, abort, get marks() { const o = {}; for (const k in marks) o[k] = Math.round(marks[k] - marks.begin); return o; },
  };
})();
