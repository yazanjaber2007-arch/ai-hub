"use strict";
/* ============================================================
   Command palette, executive briefing, keyboard shortcuts
   ============================================================ */
const goto = i => {
  if (MQ_PHONE.matches) $("screens").scrollTo({ left: $("screens").clientWidth * i, behavior: "smooth" });
  else $(["pNow", "pRos", "pFin", "pVit"][i]).scrollIntoView({ behavior: "smooth", block: "center" });
};
/* dialogs: focus moves in when one opens, stays inside while it is open, and returns to where it came from */
let _returnTo = null;
const rememberFocus = () => { const a = document.activeElement; _returnTo = a && a !== document.body ? a : null; };
function closeOverlays() {
  const was = $$(".ov.open").length; $$(".ov").forEach(o => o.classList.remove("open"));
  if (was && _returnTo && _returnTo.isConnected && !Ambient.active) { try { _returnTo.focus({ preventScroll: true }); } catch (e) {} }
  _returnTo = null;
}
function trapTab(e) {
  const box = document.querySelector(".ov.open .box"); if (!box) return false;
  const f = $$("button:not([disabled]),input,[tabindex]:not([tabindex='-1'])", box).filter(n => n.offsetParent !== null); if (!f.length) return false;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { f[0].focus(); e.preventDefault(); }
  return true;
}
function openBrief() {
  rememberFocus();
  const l = clear($("briefList")), priv = document.body.classList.contains("priv");
  (M && M.brief.length ? M.brief : [{ t: "Nothing to report yet." }]).forEach(x => l.append(el("li", "", x.sens && priv ? "(finance detail hidden: privacy is on)" : x.t)));
  $("brief").classList.add("open"); bus.emit("overlay:open"); setTimeout(() => $("briefClose").focus(), 30);
}

const Palette = (() => {
  let sel = 0, shown = [];
  const base = () => {
    const c = [
      { label: "Open executive briefing", tag: "brief", run: openBrief },
      { label: "Ambient mode (wall display)", tag: "display", run: () => Ambient.enter() },
      { label: "Toggle privacy blur", tag: "privacy", run: () => $("privBtn").click() },
      { label: "Toggle interface sounds", tag: "sound", run: () => $("sndBtn").click() },
      { label: "Core: 3D hologram", tag: "display", run: () => Core.setPref("3d") },
      { label: "Core: flat 2D", tag: "display", run: () => Core.setPref("2d") },
      { label: "Show brief", tag: "go", run: () => goto(0) }, { label: "Show bots", tag: "go", run: () => goto(1) },
      { label: "Show money", tag: "go", run: () => goto(2) }, { label: "Show body", tag: "go", run: () => goto(3) },
    ];
    /*DEMO-START*/ c.push({ label: "Toggle alert preview", tag: "demo", run: () => $("pvToggle").click() }, { label: "New task for chief-of-staff", tag: "demo", run: () => Actions.task() }); /*DEMO-END*/
    /*LIVE-START*/ c.push({ label: "Refresh now", tag: "sync", run: () => refresh() }, { label: "Sign out", tag: "account", run: async () => { await api("/logout", { method: "POST" }).catch(() => {}); refresh(); } }); /*LIVE-END*/
    return c;
  };
  /*LIVE-START*/
  function liveCmds(q) {
    const m = /^task\s+(\S+)\s+(.+)$/i.exec(q.trim());
    if (!m) return [{ label: "Tip: type  task <bot> <what to do>  to give a bot a task", tag: "tip", run: () => {} }];
    const key = m[1].toLowerCase(), bot = M.bots.find(b => b.id === key) || M.bots.find(b => b.id.startsWith(key));
    if (!bot) return [{ label: "No bot called “" + m[1] + "”. Bots: " + M.bots.map(b => b.id).join(", "), tag: "task", run: () => {} }];
    return [{ label: "Give " + bot.id + " a task: " + m[2], tag: "task", run: () => Actions.task(bot.id, m[2]) }];
  }
  /*LIVE-END*/
  function render() {
    const q = $("palIn").value, ql = q.toLowerCase(), list = clear($("palList"));
    shown = base().filter(c => c.label.toLowerCase().includes(ql));
    /*LIVE-START*/ shown = liveCmds(q).concat(q.trim() ? shown : shown.slice(0, 6)); /*LIVE-END*/
    sel = clamp(sel, 0, Math.max(0, shown.length - 1));
    shown.forEach((c, i) => {
      const d = el("div", "pi" + (i === sel ? " sel" : ""), c.label); d.setAttribute("role", "option"); d.append(el("span", "", c.tag));
      d.addEventListener("click", () => { closeOverlays(); c.run(); }); d.addEventListener("mousemove", () => { if (sel !== i) { sel = i; $$(".pi", list).forEach((n, k) => n.classList.toggle("sel", k === i)); } });
      list.append(d);
    });
    const s = list.querySelector(".sel"); if (s) s.scrollIntoView({ block: "nearest" });
  }
  return {
    open() { if (!this.isOpen) rememberFocus(); $("pal").classList.add("open"); $("palIn").value = ""; sel = 0; render(); bus.emit("overlay:open"); setTimeout(() => $("palIn").focus(), 30); },
    render, key(e) {
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, shown.length - 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); const c = shown[sel]; closeOverlays(); c.run(); }   // preventDefault: the Enter must not also "click" whatever the command focuses
    },
    get isOpen() { return $("pal").classList.contains("open"); },
  };
})();

function initPalette() {
  $("palBtn").addEventListener("click", () => Palette.open()); $("ask").addEventListener("click", () => Palette.open());
  $("exec").addEventListener("click", openBrief); $("briefClose").addEventListener("click", closeOverlays);
  $$(".ov").forEach(o => o.addEventListener("click", e => { if (e.target === o) closeOverlays(); }));
  $("palIn").addEventListener("input", () => { Palette.render(); });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); Palette.open(); return; }
    if (e.key === "Escape") { if (Ambient.active) return; closeOverlays(); return; }
    if (e.key === "Tab" && trapTab(e)) return;               // a dialog keeps Tab inside itself
    if (Palette.isOpen) { Palette.key(e); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    if (typing || e.ctrlKey || e.metaKey || e.altKey || Boot.running) return;
    const k = e.key.toLowerCase();
    if (k === "a") { Ambient.toggle(); return; }
    if (Ambient.active) return;                              // the wall display has no other shortcuts
    if (k === "p") $("privBtn").click(); else if (k === "s") $("sndBtn").click(); else if (k === "/") { e.preventDefault(); Palette.open(); }
  });
}
