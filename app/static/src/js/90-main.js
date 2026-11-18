"use strict";
/* ============================================================
   App wiring: model store, layout, clock, controls, start-up
   ============================================================ */
const App = {
  ready: false,
  setModel(m, { initial = false } = {}) {
    M = m; Names.set(m.bots); renderAll(m); Core.update(m); Ambient.update(m);
    if (!initial && !this.ready) { this.ready = true; bus.emit("app:ready"); }
  },
  offline(msg) {
    const now = Date.now(); if (now - (App._off || 0) > 60000) { App._off = now; toast("Connection problem: " + msg); }
    if (!this.ready) { setText($("headline"), "Can’t reach the hub right now. Retrying…"); setText($("sysTxt"), "offline"); }   // first load: say so instead of “Loading…” forever
    bus.emit("offline"); Boot.ready(false);
  },
};

/* ---------- layout: the same panels live in desktop columns or phone screens ---------- */
const DESK = { colL: ["pNeed", "pRos", "pMet", "pVit"], colC: ["pCore", "pNow", "pTl", "pHeat"], colR: ["pFeed", "pFin"] };
const PHONE = { "s-brief": ["pNow", "pNeed", "pFeed", "pTl"], "s-bots": ["pCore", "pRos", "pMet", "pHeat"], "s-money": ["pFin"], "s-body": ["pVit"] };
function layout() {
  const map = MQ_PHONE.matches ? PHONE : DESK;
  for (const [host, ids] of Object.entries(map)) ids.forEach(id => { const n = $(id); if (n.parentNode !== $(host)) $(host).append(n); });
  // keep DOM order = list order (append above only moves strays)
  for (const [host, ids] of Object.entries(map)) ids.forEach(id => $(host).append($(id)));
  measure(); Core.resize();
}
function measure() {
  const r = document.documentElement.style, f = document.querySelector(".status").offsetHeight, t = $("tabs").offsetHeight || 40;
  r.setProperty("--foot", f + "px");
  r.setProperty("--chrome", (document.querySelector(".top").offsetHeight + $("band").offsetHeight + f + t + 4) + "px");
}

/* ---------- clock ---------- */
function tick() {
  const n = new Date();
  setText($("clk"), n.toLocaleTimeString([], { hourCycle: "h23" }));
  setText($("dt"), n.toLocaleDateString([], MQ_PHONE.matches ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  if (!Boot.running) { const who = LIVE ? (M && M.owner) : GUEST; setText($("greet"), greeting(n) + (who ? ", " + who : "")); }   // the boot types it in itself
  tickNow();
}

/* ---------- controls ---------- */
function setIcon(btn, id) { btn.querySelector("use").setAttribute("href", "#i-" + id); }
function setPriv(on, { save = true } = {}) {
  document.body.classList.toggle("priv", on);
  const b = $("privBtn"); b.setAttribute("aria-pressed", String(on)); setIcon(b, on ? "eye-off" : "eye");
  $$(".sens.show").forEach(s => s.classList.remove("show")); if (save) store.set("priv", on); bus.emit("priv", on);
}
function setSoundUi(on) { const b = $("sndBtn"); b.setAttribute("aria-pressed", String(on)); setIcon(b, on ? "sound" : "mute"); }
function initControls() {
  setPriv(store.get("priv", false), { save: false });
  setSoundUi(Sound.enabled);
  $("privBtn").addEventListener("click", () => { setPriv(!document.body.classList.contains("priv")); Sound.play("click"); });
  $("sndBtn").addEventListener("click", () => { setSoundUi(Sound.toggle()); });
  $("ambBtn").addEventListener("click", () => Ambient.enter());
  document.addEventListener("click", e => {
    const s = e.target.closest("[data-rev]");
    if (s && document.body.classList.contains("priv")) { s.classList.add("show"); setTimeout(() => s.classList.remove("show"), 6000); }
  });
  const scr = $("screens"), tabs = $$("#tabs button");
  tabs.forEach(b => b.addEventListener("click", () => scr.scrollTo({ left: scr.clientWidth * +b.dataset.i, behavior: "smooth" })));
  scr.addEventListener("scroll", () => { const i = Math.round(scr.scrollLeft / scr.clientWidth); tabs.forEach((b, k) => b.classList.toggle("on", k === i)); }, { passive: true });
  // glass-wall parallax follows the pointer
  if (!reduced()) addEventListener("pointermove", e => {
    if (MQ_PHONE.matches || e.pointerType === "touch") return;
    const s = document.body.style; s.setProperty("--mx", ((e.clientX / innerWidth) * 2 - 1).toFixed(2)); s.setProperty("--my", ((e.clientY / innerHeight) * 2 - 1).toFixed(2));
  }, { passive: true });
  MQ_PHONE.addEventListener("change", () => layout()); addEventListener("resize", measure);
}

/* ---------- start-up ---------- */
function start() {
  Boot.begin();                                              // overlay animation starts at once; bots report in when the first data lands
  initPalette(); initControls(); layout();
  Core2D.start(); Core.sync();
  tick(); setInterval(tick, 1000); setInterval(tickTimes, 15000); setInterval(() => { if (M) renderTimeline(M); }, 30000);

  /*DEMO-START*/
  if (!LIVE) {
    if (MODE === "demo") { $("demoChip").hidden = false; $("hubSc").querySelector("b").textContent = "demo"; }
    const pv = $("pvToggle"), PV = MODE === "demo" ? "Try" : "Preview";
    const label = () => (pv.textContent = PV + (demoAlert ? ": clear alert" : ": trigger alert"));
    if (new URLSearchParams(location.search).has("alert")) demoAlert = true;
    label();
    pv.addEventListener("click", () => { demoAlert = !demoAlert; label(); App.setModel(demoModel()); });
    App.setModel(demoModel()); Boot.ready();
    setInterval(() => {
      if (document.hidden || !M || !M.bots.length) return;
      const ok = M.bots.filter(b => b.state !== "silent" && b.state !== "waiting");
      if (ok.length) bus.emit("bot:report", ok[Math.floor(Math.random() * ok.length)].id);
    }, 2600);
  }
  /*DEMO-END*/
  /*LIVE-START*/
  if (LIVE) {
    $("wx").hidden = true;
    $("loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/login", { method: "POST", body: JSON.stringify({ password: $("pw").value }) }); $("pw").value = ""; setText($("loginMsg"), ""); refresh(); }
      catch (x) { setText($("loginMsg"), x.message === "auth" ? "Wrong password" : x.message); }
    });
    $("signout").addEventListener("click", async () => { await api("/logout", { method: "POST" }).catch(() => {}); refresh(); });
    App.setModel(emptyModel(), { initial: true }); refresh();
    setInterval(() => { if (!document.hidden && !Palette.isOpen) refresh(); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }
  /*LIVE-END*/
  addEventListener("pagehide", () => {});
}
start();
if (IS_AUTOMATED) window.__hub = { Core, App, bus, Sound, Ambient, Boot, Perf, Detail, get M() { return M; } };   // test hook, only under automation
