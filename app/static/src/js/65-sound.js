"use strict";
/* ============================================================
   Interface sounds: synthesised with WebAudio (no files), off by default, unlocked by a click.
   Every sound is a pure function (ctx, out, t, opts), so it can run live or in an OfflineAudioContext
   (that is how the levels, decay and silence of each sound are verified).
   ============================================================ */
const Sound = (() => {
  const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];     // A minor pentatonic-ish: bots never clash
  let ctx = null, chain = null, enabled = store.get("sound", false), lastReport = 0, unlockBound = false;

  /* ---------- building blocks ---------- */
  function buildChain(c) {
    const input = c.createGain(), master = c.createGain(), comp = c.createDynamicsCompressor(), wet = c.createGain(), conv = c.createConvolver();
    master.gain.value = 0.85; comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.22;
    // small generated room: exponentially decaying stereo noise, 1.3 s
    const len = Math.floor(c.sampleRate * 1.3), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    conv.buffer = ir; wet.gain.value = 0.2;
    input.connect(master); input.connect(conv); conv.connect(wet); wet.connect(master); master.connect(comp); comp.connect(c.destination);
    return { input };
  }
  function env(g, t, a, d, peak) {
    g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(c, out, { t, f, f2 = null, type = "sine", a = 0.004, d = 0.3, peak = 0.2, pan = 0, lp = 0, detune = 0 }) {
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d * 0.8); if (detune) o.detune.value = detune;
    env(g.gain, t, a, d, peak); let n = g; o.connect(g);
    if (lp) { const l = c.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = lp; g.connect(l); n = l; }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(out); o.start(t); o.stop(t + a + d + 0.05);
  }
  function noise(c, secs) { const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

  /* ---------- the sounds ---------- */
  const SOUNDS = {
    click(c, out, t) { tone(c, out, { t, f: 1900, f2: 1250, a: 0.002, d: 0.05, peak: 0.17 }); },
    on(c, out, t) { tone(c, out, { t, f: 659.25, d: 0.3, peak: 0.18 }); tone(c, out, { t: t + 0.09, f: 987.77, d: 0.42, peak: 0.16 }); },
    report(c, out, t, { i = 0, pan = 0 } = {}) {
      const f = SCALE[i % SCALE.length];
      tone(c, out, { t, f, a: 0.005, d: 0.46, peak: 0.3, pan, lp: 3600 });
      tone(c, out, { t, f: f * 2, type: "triangle", a: 0.004, d: 0.22, peak: 0.07, pan, lp: 5200 });
    },
    approve(c, out, t) {
      tone(c, out, { t, f: 659.25, a: 0.005, d: 0.34, peak: 0.2 }); tone(c, out, { t: t + 0.095, f: 987.77, a: 0.005, d: 0.55, peak: 0.2 });
      tone(c, out, { t: t + 0.095, f: 1318.5, a: 0.01, d: 0.7, peak: 0.055, lp: 4200 });
    },
    decline(c, out, t) {
      tone(c, out, { t, f: 190, f2: 82, a: 0.004, d: 0.2, peak: 0.3 });
      const n = c.createBufferSource(), g = c.createGain(), bp = c.createBiquadFilter(); n.buffer = noise(c, 0.1); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.1;
      env(g.gain, t, 0.002, 0.06, 0.07); n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t + 0.1);
    },
    alert(c, out, t) {
      tone(c, out, { t, f: 880, type: "triangle", a: 0.004, d: 0.17, peak: 0.19, lp: 3000 }); tone(c, out, { t: t + 0.21, f: 659.25, type: "triangle", a: 0.004, d: 0.26, peak: 0.19, lp: 3000 });
      tone(c, out, { t, f: 220, a: 0.02, d: 0.55, peak: 0.09, lp: 600 });
    },
    boot(c, out, t) {
      tone(c, out, { t, f: 46, f2: 98, a: 0.28, d: 1.1, peak: 0.3, lp: 220 });                       // low rise
      const n = c.createBufferSource(), g = c.createGain(), bp = c.createBiquadFilter(); n.buffer = noise(c, 1.8); bp.type = "bandpass"; bp.Q.value = 1.3;
      bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 1.4); env(g.gain, t, 1.2, 0.45, 0.1);  // air sweep
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t); n.stop(t + 1.8);
      [1568, 1760, 2093, 2349, 2637].forEach((f, k) => tone(c, out, { t: t + 0.62 + k * 0.17, f, a: 0.003, d: 0.14, peak: 0.07, pan: (k - 2) * 0.25, lp: 6000 }));   // bots coming online
      [[880, 0.17, 1.7], [1320, 0.08, 1.5], [1760, 0.05, 1.3]].forEach(([f, p, d]) => tone(c, out, { t: t + 1.55, f, a: 0.01, d, peak: p }));  // arrival chime
    },
    swell(c, out, t) { [110, 164.81, 220, 329.63].forEach((f, k) => tone(c, out, { t, f, a: 1.3, d: 2.4, peak: 0.05 - k * 0.006, lp: 900, detune: k * 3 })); },
  };

  /* ---------- live engine ---------- */
  function ensure() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); chain = buildChain(ctx); } catch (e) { ctx = null; return null; } }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  function bindUnlock() {
    if (unlockBound) return; unlockBound = true;
    const go = () => { if (enabled) ensure(); ["pointerdown", "keydown", "touchstart"].forEach(e => removeEventListener(e, go, true)); };
    ["pointerdown", "keydown", "touchstart"].forEach(e => addEventListener(e, go, true));
  }
  const api = {
    get enabled() { return enabled; },
    play(name, opts) {
      if (!enabled || document.hidden || !SOUNDS[name]) return;
      const now = performance.now();
      if (name === "report") { if (now - lastReport < 650) return; lastReport = now; }
      const c = ensure(); if (!c || c.state !== "running") return;
      try { SOUNDS[name](c, chain.input, c.currentTime + 0.012, opts || {}); } catch (e) { console.warn("sound", name, e); }
    },
    toggle() {
      enabled = !enabled; store.set("sound", enabled);
      if (enabled) { ensure(); const c = ctx; if (c) { const go = () => this.play("on"); c.state === "running" ? go() : c.resume().then(go).catch(() => {}); } toast("Interface sounds on"); } else toast("Interface sounds off");
      return enabled;
    },
    /* verification: render each sound offline and report level, tail silence and NaNs */
    async analyze() {
      const out = {}, SR = 44100;
      for (const name of Object.keys(SOUNDS)) {
        const secs = name === "boot" ? 4.2 : name === "swell" ? 4.4 : 1.8, oc = new OfflineAudioContext(2, Math.floor(SR * secs), SR), ch = buildChain(oc);
        SOUNDS[name](oc, ch.input, 0.01, { i: 2, pan: 0.2 }); const buf = await oc.startRendering();
        let peak = 0, sum = 0, n = 0, bad = 0, tail = 0; const tailStart = buf.length - Math.floor(SR * 0.1), L = buf.getChannelData(0), R = buf.getChannelData(1);
        for (let i = 0; i < buf.length; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (!isFinite(v)) bad++; if (v > peak) peak = v; sum += L[i] * L[i]; n++; if (i >= tailStart && v > tail) tail = v; }
        out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), tail: +tail.toFixed(5), nan: bad, secs };
      }
      return out;
    },
  };
  bindUnlock();
  bus.on("bot:report", id => { const i = M ? Math.max(0, M.bots.findIndex(b => b.id === id)) : 0; api.play("report", { i, pan: ((i % 5) - 2) * 0.18 }); });
  bus.on("approved", () => api.play("approve")); bus.on("declined", () => api.play("decline"));
  bus.on("alert:new", () => api.play("alert")); bus.on("boot:start", () => api.play("boot")); bus.on("ambient:enter", () => api.play("swell"));
  return api;
})();
