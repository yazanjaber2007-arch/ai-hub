"use strict";
/* ============================================================
   Core facade: chooses between the 3D hologram and the flat 2D canvas.
   3D is the default on desktop. The bundle loads lazily, the 2D canvas paints first, and any
   failure (no WebGL, context loss, too slow) quietly falls back to 2D.
   ============================================================ */
const Core = (() => {
  const cw = $("cw");
  let holo = null, loading = null, bots = [], alert = false, failed = tabStore.get("coreFail", null), active3d = false, firstFrame = false, zoomVal = 0.9, capVal = 60;       // 0.9: frame the scene a little tighter than "everything fits"

  const pref = () => store.get("core", "auto");
  const SLOW_PAUSE = 30 * 60 * 1000, slowNow = () => Date.now() < store.get("coreSlow", 0);     // after "too slow", stay flat for 30 minutes, then try again
  const want3d = () => { const p = pref(); return p === "2d" ? false : p === "3d" ? true : (!MQ_PHONE.matches && !failed && !slowNow()); };
  const level0 = store.get("coreLevel", 0);
  if (level0 >= 1) document.documentElement.classList.add("lite");                          // a slow device keeps the lighter page from the first frame

  function loadBundle() {
    return new Promise((resolve, reject) => {
      if (window.HubHolo) return resolve(window.HubHolo);
      const s = document.createElement("script");
      s.src = "{{asset:hologram.js}}"; s.async = true;
      s.onload = () => (window.HubHolo ? resolve(window.HubHolo) : reject(new Error("bundle missing")));
      s.onerror = () => reject(new Error("bundle failed to load"));
      document.head.append(s);
    });
  }
  function show3d() { active3d = true; cw.classList.add("core3d"); Core2D.stop(); setText($("coreHint"), "hover a bot · drag to rotate"); if (holo) holo.setPaused(false); }
  function hide3d() { active3d = false; cw.classList.remove("core3d"); if (holo) holo.setPaused(true); setText($("coreHint"), "hover a bot"); Core2D.start(); }

  function enable3d() {
    if (holo) { show3d(); return Promise.resolve(); }
    if (loading) return loading;
    loading = loadBundle().then(H => {
      if (!H.supported()) throw new Error("WebGL 2 unavailable");
      holo = H.create($("holo"), {
        adapt: !IS_AUTOMATED && Perf.mode !== "full", staticFrame: reduced(), dprCap: 1.5, startLevel: Perf.mode === "saver" ? 2 : Perf.mode === "full" ? 0 : level0, autoIntro: !(Boot.running && !Boot.revealed),   // during the boot, the reveal triggers the intro
        onHover: (id, x, y) => { bus.emit("hover", id); if (id) { const b = bots.find(q => q.id === id); Tip.show(x, y, Names.full(id) + " · " + safeNote(b || { note: "", state: "" })); } else Tip.hide(); },
        onSelect: id => bus.emit("select", id),
        onReady: () => { firstFrame = true; bus.emit("core:frame"); },
        onDegrade: lvl => { store.set("coreLevel", lvl); document.documentElement.classList.add("lite"); console.info("3D core: lighter settings, level", lvl); },
        onFallback: reason => {
          console.warn("3D core fallback:", reason); bus.emit("core:fallback", reason);
          if (reason === "too slow") store.set("coreSlow", Date.now() + SLOW_PAUSE); else { tabStore.set("coreFail", String(reason)); failed = String(reason); }
          hide3d(); toast("Core switched to the flat view (" + reason + "). Search or command, then “Core: 3D hologram”, to retry.", 6500);
        },
      });
      holo.setBots(bots); holo.setAlert(alert); holo.setZoom(zoomVal); holo.setFpsCap(capVal);
      show3d(); bus.emit("core:ready");
    }).catch(e => { console.warn("3D core unavailable:", e.message); tabStore.set("coreFail", e.message); failed = e.message; hide3d(); })
      .finally(() => { loading = null; });
    return loading;
  }
  function sync() { if (want3d()) enable3d(); else hide3d(); }

  const api = {
    get is3d() { return active3d; },
    get settled() { return !want3d() || firstFrame || !!failed; },     // 2D chosen, or the 3D core has drawn its first frame, or it failed
    get holo() { return holo; },
    sync, enable3d,
    update(m) {
      bots = m.bots.map(b => ({ id: b.id, name: b.name, color: b.color, state: b.state, note: b.note, last: b.last, glyph: b.glyph, sens: b.sens }));
      alert = !!m.alert;
      Core2D.setBots(bots); Core2D.setAlert(alert);
      if (holo) { holo.setBots(bots); holo.setAlert(alert); }
    },
    pulse(id) { Core2D.pulse(id); if (holo && active3d) holo.pulse(id); },
    intro() { if (holo && active3d) holo.intro(); },
    resize() { Core2D.resize(); if (holo) holo.resize(); },
    setPref(p) { store.set("core", p); if (p !== "2d") { failed = null; tabStore.set("coreFail", null); store.set("coreSlow", 0); store.set("coreLevel", 0); document.documentElement.classList.remove("lite"); } sync(); toast(p === "3d" ? "Core: 3D hologram" : p === "2d" ? "Core: flat 2D" : "Core: automatic"); },
    fpsCap(n) { capVal = n; Core2D.setFps(n); if (holo) holo.setFpsCap(n); },
    level(l) { if (holo) holo.setLevel(l); },
    adapt(b) { if (holo) holo.setAdapt(b); },
    zoom(z) { zoomVal = z; if (holo) holo.setZoom(z); },
  };

  bus.on("hover", id => { Core2D.setHover(id); if (holo) holo.setHover(id); $$("#rosList .rb").forEach(r => r.classList.toggle("lit", r.dataset.k === id)); });
  bus.on("bot:report", id => api.pulse(id));
  new ResizeObserver(() => api.resize()).observe(cw);
  MQ_PHONE.addEventListener("change", () => sync());
  MQ_REDUCE.addEventListener("change", () => { if (holo) holo.setStatic(reduced()); });
  return api;
})();
