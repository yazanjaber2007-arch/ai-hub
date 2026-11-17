"use strict";
/* ============================================================
   Ambient mode: a calm, always-on wall display.

   - Big clock, the 3D core, today's priorities, the next thing with a countdown, and a slow carousel of
     feed / approvals / numbers. Never anything from a sensitive bot (finance): it is left out, not blurred.
   - Safe to leave on for days: the layout drifts a few pixels over 12 minutes (no burn-in), dims at night,
     keeps the screen awake, frame rate capped, and says so quietly when data is old or the session ended.
   - Enter: button, palette, "A", /command?ambient or #ambient.  Leave: Esc, "A", or the button that appears on movement.
   ============================================================ */
const Ambient = (() => {
  const root = $("ambient"), DWELL = 9000, NIGHT = [22, 6.5];                 // night dimming window, local hours
  const auto = /[?&]ambient\b/.test(location.search) || location.hash === "#ambient";
  let active = false, fsPending = false, lock = null, uiT = 0, clockT = 0, carT = 0, hideT = 0, staleKind = null, lastUpdate = Date.now(), cur = 0, cards = [], autoDone = false;
  const ref = { next: null, cd: null, sync: null };

  /* ---------- what may be shown ---------- */
  function view(m) {
    const now = Date.now();
    const next = (m.events || []).filter(e => !e.sens && e.t != null && e.t >= now - 60000 && !e.done).sort((a, b) => a.t - b.t)[0] || null;
    const prios = (m.priorities || []).filter(p => !p.sens).slice(0, 4).map(p => p.t);
    const feed = (m.feed || []).filter(f => !f.sens).slice(0, 3);
    const needs = (m.needs || []).slice(0, 4).map(n => ({ title: n.sens ? "Private item" : n.title, bot: n.bot }));
    const metrics = (m.metrics || []).filter(g => !g.sens && g.tiles.length).sort((a, b) => b.tiles.length - a.tiles.length).slice(0, 2);
    return { next, prios, feed, needs, needN: (m.needs || []).length, metrics, bots: m.bots || [], headline: m.headline || "", owner: LIVE ? m.owner : GUEST };
  }
  const sig = v => JSON.stringify([v.next && [v.next.key, v.next.text, v.next.note], v.prios, v.feed.map(f => [f.key, f.tag, f.title, f.body]), v.needs, v.needN,
    v.metrics.map(g => [g.bot, g.tiles.map(t => t.label + t.value)]), v.bots.map(b => [b.id, b.state]), v.headline, v.owner]);

  /* ---------- building blocks ---------- */
  const card = (label, ...kids) => { const c = el("div", "acard"); c.append(el("div", "ak", label), ...kids); return c; };
  function nextCard(v) {
    const c = card("Next up"); ref.next = v.next; ref.cd = null;
    if (!v.next) { c.append(el("div", "abig dim", "Nothing scheduled")); return c; }
    ref.cd = el("div", "acd"); c.append(el("div", "abig", v.next.text), ref.cd, el("div", "asub", v.next.at + (v.next.note ? " · " + v.next.note : "")));
    return c;
  }
  function priosCard(v) {
    const ol = el("ol", "aprio"); v.prios.forEach((p, i) => { const li = el("li"); li.append(el("b", "", pad2(i + 1)), el("span", "", p)); ol.append(li); });
    return card("Priorities", ol);
  }
  function feedCard(v) {
    const box = el("div", "afeed");
    v.feed.forEach(f => { const r = el("div", "row"), b = el("div"); r.append(el("span", "tag " + f.tag, f.tag), b); b.append(el("div", "ttl", f.title), el("div", "bdy", f.body)); box.append(r); });
    return card("Live feed", box);
  }
  function needsCard(v) {
    const ol = el("ol", "aprio"); v.needs.forEach(n => { const li = el("li"); li.append(el("b", "", "›"), el("span", "", n.title)); ol.append(li); });
    if (v.needN > v.needs.length) { const li = el("li"); li.append(el("b", "", "+"), el("span", "", (v.needN - v.needs.length) + " more")); ol.append(li); }
    return card("Needs you", el("div", "abig", v.needN + (v.needN === 1 ? " approval waiting" : " approvals waiting")), ol);
  }
  function metricCard(g) {
    const box = el("div", "ametric"); g.tiles.slice(0, 5).forEach(t => { const r = el("div"); r.append(el("span", "", t.label), el("b", t.trend || "", t.value)); box.append(r); });
    return card(g.bot, box);
  }

  /* ---------- render (only when the visible content changed) ---------- */
  let lastSig = "";
  function render(m, force) {
    const v = view(m), s = sig(v);
    setText($("ambHead"), v.headline);
    if (!force && s === lastSig) return; lastSig = s;
    const left = clear($("ambLeft")); left.append(nextCard(v)); if (v.prios.length) left.append(priosCard(v));
    cards = [];
    if (v.needN) cards.push(needsCard(v));
    if (v.feed.length) cards.push(feedCard(v));
    v.metrics.forEach(g => cards.push(metricCard(g)));
    const right = clear($("ambRight")), car = el("div", "acar"); cards.forEach(c => car.append(c));
    if (cards.length) { right.append(car); cur = Math.min(cur, cards.length - 1); show(cur); }
    const bar = clear($("ambBar"));
    v.bots.forEach(b => { const d = el("span", "bd"); d.dataset.state = b.state; d.append(el("i"), document.createTextNode(b.id)); bar.append(d); });
    ref.sync = el("span", "sync"); bar.append(ref.sync); tickClock(true);
  }
  function show(i) {
    cur = i; cards.forEach((c, k) => c.classList.toggle("on", k === i));
    const car = cards[0] && cards[0].parentNode; if (!car) return;
    let bar = car.querySelector(".acar-bar"); if (bar) bar.remove();
    if (cards.length > 1) { bar = el("div", "acar-bar"); bar.append(document.createElement("i")); bar.style.setProperty("--dwell", DWELL + "ms"); car.append(bar); }
  }
  function rotate() { if (!active || document.hidden || cards.length < 2) return; show((cur + 1) % cards.length); }

  /* ---------- clock, countdown, night, staleness (once a second) ---------- */
  function tickClock(force) {
    if (!active) return; const n = new Date();
    setText($("ambTime"), n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
    setText($("ambSec"), pad2(n.getSeconds()));
    setText($("ambDate"), n.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }));
    if (force || n.getSeconds() === 0) setText($("ambGreet"), greeting(n) + ((LIVE ? (M && M.owner) : GUEST) ? ", " + (LIVE ? M.owner : GUEST) : ""));
    const h = n.getHours() + n.getMinutes() / 60; document.body.classList.toggle("night", h >= NIGHT[0] || h < NIGHT[1]);
    if (ref.cd && ref.next) {
      const s = Math.floor((ref.next.t - Date.now()) / 1000);
      setText(ref.cd, s <= 0 ? "now" : s >= 86400 ? "in " + Math.floor(s / 86400) + "d " + Math.floor(s % 86400 / 3600) + "h" : hms(s));
      ref.cd.classList.toggle("soon", s > 0 && s < 900);
    }
    const age = Date.now() - lastUpdate;
    if (ref.sync) setText(ref.sync, staleKind === "offline" ? "offline · retrying" : LIVE ? "synced " + (age < 45000 ? "just now" : span(age) + " ago") : "demo data");
    if (LIVE && (!staleKind || staleKind === "old") && age > 150000) paintStale("old"); else if (staleKind === "old") paintStale(null);
  }
  function paintStale(kind) {
    const p = $("ambStale"); if (staleKind === kind && kind !== "old") return; staleKind = kind;
    if (!kind) { p.hidden = true; return; }
    setText(p, kind === "auth" ? "Session ended · tap to sign in" : kind === "offline" ? "Connection lost · retrying" : "Data is " + span(Date.now() - lastUpdate) + " old");
    p.hidden = false;
  }
  function stale(kind) { if (active) paintStale(kind); }

  /* ---------- fullscreen, wake lock, idle UI ---------- */
  function fullscreen() {
    const de = document.documentElement, r = de.requestFullscreen || de.webkitRequestFullscreen;      // iPadOS Safari only has the webkit name
    try { if (r && !(document.fullscreenElement || document.webkitFullscreenElement)) { const p = r.call(de); if (p && p.then) p.then(() => (fsPending = false)).catch(() => { fsPending = true; }); else fsPending = false; } } catch (e) { fsPending = true; }
  }
  async function keepAwake() {
    try { if ("wakeLock" in navigator && !lock && document.visibilityState === "visible") { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } } catch (e) { lock = null; }
  }
  function showUi() { root.classList.add("ui"); clearTimeout(uiT); uiT = setTimeout(() => root.classList.remove("ui"), 3500); }

  /* ---------- enter / leave ---------- */
  function enter({ gesture = true } = {}) {
    if (active || (LIVE && Auth.needed && $("login").style.display === "grid")) return;
    active = true; closeOverlays(); lastUpdate = lastUpdate || Date.now();
    $("ambCore").append($("cw"));                                   // the same core, moved: one canvas, no second WebGL context
    document.body.classList.add("ambient"); root.hidden = false; void root.offsetWidth; root.classList.add("on");
    render(M || emptyModel(), true); tickClock(true);
    clockT = setInterval(tickClock, 1000); carT = setInterval(rotate, DWELL);
    requestAnimationFrame(() => { Core.resize(); Core.fpsCap(30); Core.zoom(0.78); });          // tighter framing: the core is the centrepiece
    if (gesture) fullscreen(); else fsPending = true;
    keepAwake(); showUi(); bus.emit("ambient:enter");
    $("ambExit").focus({ preventScroll: true });                    // keyboard users land on the way out (it only shows for keyboard focus)
  }
  function exit() {
    if (!active) return; active = false;
    clearInterval(clockT); clearInterval(carT); clearTimeout(hideT);
    if (lock) { lock.release().catch(() => {}); lock = null; }
    try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    const host = $("pCore"); host.insertBefore($("cw"), host.querySelector(".hello"));
    document.body.classList.remove("ambient", "night"); root.classList.remove("on", "ui");   // the dashboard is back underneath while this fades out
    hideT = setTimeout(() => { if (!active) root.hidden = true; }, 520);
    paintStale(null); Core.zoom(0.9); requestAnimationFrame(() => { Core.resize(); Core.fpsCap(60); measure(); });
    try { $("ambBtn").focus({ preventScroll: true }); } catch (e) {}   // back where the keyboard user left off
    bus.emit("ambient:exit");
  }

  root.addEventListener("pointerdown", () => { showUi(); if (fsPending) fullscreen(); });
  $("ambExit").addEventListener("click", exit);
  $("ambStale").addEventListener("click", () => { /*LIVE-START*/ if (staleKind === "auth") { exit(); Auth.show(); } /*LIVE-END*/ });
  ["pointermove", "touchstart", "keydown"].forEach(ev => addEventListener(ev, () => { if (active) showUi(); }, { passive: true }));
  addEventListener("keydown", e => { if (active && e.key === "Escape") { e.preventDefault(); exit(); } });
  document.addEventListener("visibilitychange", () => { if (active && document.visibilityState === "visible") { keepAwake(); tickClock(true); } });
  bus.on("offline", () => stale("offline"));
  bus.on("auth:ok", () => { if (staleKind === "auth") paintStale(null); });
  bus.on("app:ready", () => { if (auto && !autoDone) { autoDone = true; enter({ gesture: false }); } });

  return {
    get active() { return active; },
    enter, exit, toggle() { active ? exit() : enter(); }, stale,
    update(m) { lastUpdate = Date.now(); if (!active) return; if (staleKind === "offline" || staleKind === "old") paintStale(null); render(m); },
  };
})();
