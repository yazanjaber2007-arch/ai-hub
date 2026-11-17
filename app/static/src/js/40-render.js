"use strict";
/* ============================================================
   Panel renderers: model in, minimal DOM changes out
   ============================================================ */
let M = null;   // current model (see models for shape)
const BASE_TITLE = document.title;
const emptyModel = () => ({ owner: "", bots: [], metrics: [], events: [], feed: [], needs: [], heat: null, finance: null, vitals: null, brief: [], headline: "Loading…", now: null, alert: null, next: null });

/* ---------- chrome, headline, footer ---------- */
function renderChrome(m) {
  const silent = m.bots.filter(b => b.state === "silent").length, waitAll = m.bots.length > 0 && m.bots.every(b => b.state === "waiting");
  const key = [silent, waitAll, m.alert, m.headline, m.next && m.next.t, m.next && m.next.title, m.bots.length, m.bots.filter(b => b.state !== "waiting" && b.state !== "silent").length].join("|");
  if (!changed("chrome", key)) return;
  const wasAlert = document.body.classList.contains("alert");
  document.body.classList.toggle("alert", !!m.alert); document.body.classList.toggle("wait", waitAll);
  setText($("sysTxt"), silent ? silent + " bot" + (silent > 1 ? "s" : "") + " silent" : waitAll ? "waiting for bots" : "optimal");
  setText($("bandTxt"), m.alert || "");
  setText($("headline"), m.headline);
  setText($("coreStat"), m.alert ? "ATTENTION" : waitAll ? "WAITING" : "ONLINE");
  const on = m.bots.filter(b => b.state === "working" || b.state === "idle").length;
  setText($("coreCount"), m.bots.length ? on + "/" + m.bots.length + " bots" : "");
  setText($("nextTxt"), m.next ? "Next: " + m.next.title : "Next: nothing scheduled");
  const cd = $("nextCd"); if (m.next && m.next.t) { cd.dataset.until = m.next.t; timeNode(cd); } else { delete cd.dataset.until; cd.textContent = ""; }
  if (m.alert && !wasAlert && App.ready) bus.emit("alert:new", m.alert);
}

/* ---------- bot roster ---------- */
function makeRosterRow(b) {
  const row = el("div", "rb"); row.tabIndex = 0; row.setAttribute("role", "button");
  const g = el("div", "gl"); g.append(glyphSvg(b.glyph));
  const mid = el("div"); mid.append(el("div", "n"), el("div", "s"));
  row.append(g, mid, el("div", "k"));
  const id = () => row.dataset.k;
  row.addEventListener("mouseenter", () => bus.emit("hover", id()));
  row.addEventListener("mouseleave", () => bus.emit("hover", null));
  row.addEventListener("focus", () => bus.emit("hover", id()));
  row.addEventListener("blur", () => bus.emit("hover", null));
  row.addEventListener("click", () => bus.emit("select", id()));
  row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bus.emit("select", id()); } });
  return row;
}
function patchRosterRow(row, b) {
  attr(row, "data-state", b.state); css(row, "--c", b.color);
  attr(row, "aria-label", b.id + ", " + b.state);
  const n = row.querySelector(".n"), s = row.querySelector(".s"), k = row.querySelector(".k");
  setText(n, b.id); setText(k, b.state);
  if (b.state === "silent") setAgo(s, b.last, { pre: "no report for " });
  else if (b.state === "waiting") { s.removeAttribute("data-ago"); setText(s, "waiting for first report"); }
  else if (b.note) { s.removeAttribute("data-ago"); setText(s, b.note); }
  else setAgo(s, b.last, { pre: "last report ", mode: "t" });
  const quiet = b.state === "silent" || b.state === "waiting";
  sensEl(s, b.sens && !quiet);
  if (b.sens && !quiet) s.removeAttribute("title"); else attr(s, "title", b.note || null);
}
function renderRoster(m) {
  if (!changed("roster", m.bots.map(b => [b.id, b.state, b.note, b.sens, b.color, b.state === "silent" || !b.note ? b.last : ""].join("|")))) return;
  const list = $("rosList");
  reconcile(list, m.bots, b => b.id, makeRosterRow, patchRosterRow);
  setEmpty(list, "No bots configured yet.", !m.bots.length);
  setText($("rosSub"), m.bots.filter(b => b.state === "working" || b.state === "idle").length + "/" + m.bots.length + " online");
}

/* ---------- needs you ---------- */
function makeNeedRow() {
  const d = el("div", "nd"), act = el("div", "a"), ok = el("button", "btn ok"), no = el("button", "btn no");
  ok.type = no.type = "button"; ok.append(icon("check"), document.createTextNode("Approve")); no.append(icon("x"), document.createTextNode("Decline"));
  ok.addEventListener("click", () => Actions.decide(d._a, "approve")); no.addEventListener("click", () => Actions.decide(d._a, "decline"));
  act.append(ok, no); d.append(el("div", "t"), el("div", "m"), act); return d;
}
function patchNeedRow(d, a) {
  d._a = a; setText(d.querySelector(".t"), a.title);
  const m = d.querySelector(".m"); m.textContent = a.meta;
  if (a.amount) { const s = sensEl(el("span", "", a.amount), a.sens); m.append(s); }
}
function renderNeeds(m) {
  if (!changed("needs", m.needs.map(a => [a.id, a.title, a.meta, a.amount, a.sens].join("|")))) return;
  const list = $("needList");
  reconcile(list, m.needs, a => a.id, makeNeedRow, patchNeedRow);
  setEmpty(list, "Nothing waiting. Nice.", !m.needs.length);
  const b = $("needN"), prev = b.textContent;
  setText(b, m.needs.length); if (prev !== String(m.needs.length) && App.ready && !reduced()) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  document.title = (m.needs.length ? "(" + m.needs.length + ") " : "") + BASE_TITLE;      // a pinned tab shows how many approvals wait (a count, never a title)
}

/* ---------- right now ---------- */
function renderNow(m) {
  const n = m.now, key = n ? [n.lb, n.title, n.sub, n.due, (n.acts || []).map(a => a.label).join(",")].join("|") : "none";
  if (!changed("now", key)) return;
  const card = $("nowLb").parentNode, acts = clear($("nowActs")), title = $("nowTitle");
  if (App.ready && !reduced()) { card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap"); }
  if (!n) { setText($("nowLb"), "Right now"); title.textContent = "Nothing needs you right now."; $("nowCd").dataset.due = ""; $("nowCd").textContent = ""; return; }
  setText($("nowLb"), n.lb); title.textContent = n.title;
  if (n.sub) title.append(el("div", "sub", n.sub));
  $("nowCd").dataset.due = n.due || "";
  (n.acts || []).forEach(a => { const b = el("button", "btn lg " + a.cls, a.label); b.type = "button"; b.addEventListener("click", a.fn); acts.append(b); });
  tickNow();
}
function tickNow() {
  const cd = $("nowCd"), due = +cd.dataset.due;
  if (!due) { if (cd.textContent) cd.textContent = ""; return; }
  const s = Math.max(0, Math.floor((due - Date.now()) / 1000));
  setText(cd, s ? hms(s) : "now");
}

/* ---------- feed ---------- */
function makeFeedRow() {
  const r = el("div", "it"), b = el("div"); b.append(el("div", "tt"), el("div", "bd"));
  r.append(el("span", "tag"), b, el("div", "ag")); return r;
}
function patchFeedRow(r, f, fresh) {
  const tag = r.querySelector(".tag"); setText(tag, f.tag); attr(tag, "class", "tag " + f.tag);
  sensEl(setText(r.querySelector(".tt"), f.title), f.sens); sensEl(setText(r.querySelector(".bd"), f.body), f.sens);
  setAgo(r.querySelector(".ag"), f.at);
  if (fresh && App.ready && !reduced()) { r.classList.add("flash"); r.addEventListener("animationend", () => r.classList.remove("flash"), { once: true }); }
}
function renderFeed(m) {
  if (!changed("feed", m.feed.map(f => [f.key, f.tag, f.title, f.body, f.sens].join("|")))) return;
  const list = $("feedList"), top = list.scrollTop;
  reconcile(list, m.feed, f => f.key, makeFeedRow, patchFeedRow);
  setEmpty(list, "Nothing in the last 24 hours.", !m.feed.length);
  list.scrollTop = top;
}

/* ---------- timeline (status derived from time at render) ---------- */
function timelineState(m) {
  const now = Date.now(); let nextSet = false;
  return m.events.map(e => {
    const done = !!e.done || (e.t != null && e.t < now);
    const next = !done && !nextSet && e.t != null; if (next) nextSet = true;
    return { ...e, done, next, progress: next ? clamp(1 - (e.t - now) / (180 * 6e4), .04, 1) : null };
  });
}
function makeEventRow() {
  const d = el("div", "ev"), r = el("div", "r1"); r.append(el("span", "x"), el("span", "in"));
  d.append(el("div", "tm"), r, el("div", "nt")); return d;
}
function patchEventRow(d, e) {
  setText(d.querySelector(".tm"), e.at); setText(d.querySelector(".x"), e.text);
  attr(d, "class", "ev" + (e.done ? " done" : e.next ? " next" : "") + (d.classList.contains("enter") ? " enter" : ""));
  const nt = d.querySelector(".nt"); setText(nt, e.note || ""); nt.hidden = !e.note;
  const inn = d.querySelector(".in");
  if (e.done) { inn.dataset.done = "1"; delete inn.dataset.until; setText(inn, "done"); }
  else if (e.t != null) { delete inn.dataset.done; inn.dataset.until = e.t; timeNode(inn); } else setText(inn, "");
  let pg = d.querySelector(".pg");
  if (e.next) {
    if (!pg) { pg = el("div", "pg"); pg.append(document.createElement("i")); d.append(pg); }
    pg.firstChild.style.transform = "scaleX(" + e.progress.toFixed(3) + ")";
  } else if (pg) pg.remove();
}
function renderTimeline(m) {
  const st = timelineState(m);
  if (!changed("timeline", st.map(e => [e.key, e.at, e.text, e.note, e.done, e.next, e.progress == null ? "" : Math.round(e.progress * 50)].join("|")))) return;
  const list = $("tlList");
  reconcile(list, st, e => e.key, makeEventRow, patchEventRow);
  setEmpty(list, "No events reported yet.", !st.length);
}

/* ---------- reporting grid ---------- */
function renderHeat(m) {
  const h = $("heat"), rows = m.heat ? m.heat.rows : {}, ids = Object.keys(rows), dates = m.heat ? m.heat.dates || [] : [];
  if (!changed("heat", [ids.map(i => i + rows[i].join("")), dates[0]].join("|"))) return;
  if (!ids.length) { clear(h); setEmpty(h, "Appears once bots start reporting.", true); return; }
  setEmpty(h, "", false);
  reconcile(h, ids.map(id => ({ id, counts: rows[id] })), r => r.id, () => {
    const r = el("div", "hr"), c = el("div", "hc"); c.setAttribute("role", "img"); r.append(el("span"), c);
    for (let i = 0; i < 14; i++) c.append(document.createElement("i")); return r;
  }, (r, o) => {
    setText(r.firstChild, o.id); const cells = r.querySelectorAll("i"), first = o.counts.findIndex(v => v > 0);
    attr(r.lastChild, "aria-label", o.id + " reports over 14 days");
    o.counts.forEach((v, i) => {
      const k = first === -1 || i < first ? "b" : v === 0 ? "m" : v === 1 ? "l1" : v === 2 ? "l2" : "l3";
      attr(cells[i], "class", k + (i === o.counts.length - 1 ? " td" : ""));
      const day = dates[i] ? new Date(dates[i] + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) : "";
      attr(cells[i], "title", o.id + " · " + day + (k === "b" ? " · before first report" : v === 0 ? " · missed" : " · " + v + " report" + (v > 1 ? "s" : "")));
    });
  });
}

/* ---------- metrics ---------- */
function renderMetrics(m) {
  const groups = m.metrics || [];
  if (!changed("metrics", groups.map(g => [g.bot, g.sens, g.tiles.map(t => t.label + "=" + t.value + (t.trend || "")).join(";")].join("|")))) {
    return;
  }
  const body = $("metBody");
  setText($("metSub"), groups.length ? groups.reduce((n, g) => n + g.tiles.length, 0) + " numbers" : "");
  setEmpty(body, "Appears when a bot sends numbers.", !groups.length);
  reconcile(body, groups, g => g.bot, () => {
    const d = el("div", "mg"), h = el("div", "mh"); h.append(el("span", "nm"), el("em")); d.append(h, el("div", "rows")); return d;
  }, (d, g) => {
    css(d, "--c", g.color);
    const h = d.firstChild; if (!h.querySelector("svg")) h.prepend(glyphSvg(g.glyph));
    setText(h.querySelector(".nm"), g.bot); setAgo(h.querySelector("em"), g.updated, { pre: "", mode: "t" });
    const rows = d.querySelector(".rows");
    reconcile(rows, g.tiles, t => t.label, () => { const r = el("div", "mr"); r.append(el("span"), el("b")); return r; }, (r, t) => {
      setText(r.firstChild, t.label); const b = r.lastChild; attr(b, "class", t.trend || ""); sensEl(b, g.sens);
      if (g.sens) setText(b, t.value); else setNumber(b, t.value);
    });
  });
}

/* ---------- finance ---------- */
const FIN = {};
function ensureFinance() {
  if (FIN.root) return;
  const root = el("div", "fin"), top = el("div", "fin-top"), l = el("div"), r = el("div"); r.style.textAlign = "right";
  FIN.bal = sensEl(el("div", "bal"), true); FIN.chg = sensEl(el("div", "chg"), true);
  l.append(el("div", "cap", "Balance"), FIN.bal); r.append(el("div", "cap", "30 days"), FIN.chg); top.append(l, r);
  FIN.spark = sensEl(el("div"), true);
  const ring = el("div", "ring"); FIN.dn = el("div", "dn2"); FIN.leg = el("div", "leg2"); ring.append(FIN.dn, FIN.leg);
  FIN.bills = el("div", "bills");
  root.append(top, FIN.spark, ring, FIN.bills); FIN.root = root; FIN.ring = ring;
}
const CAT_COLORS = ["#19d3ff", "#8a7dff", "#2ef2c8", "#ffb020", "#ff7ab6", "#7dff9a", "#ffd166", "#7b9db1"];
/* header hint of the Finance panel: where the numbers come from, or how to reveal them when the privacy blur is on */
function finHint() {
  const f = M && M.finance;
  setText($("finSub"), !f ? "" : document.body.classList.contains("priv") ? "tap numbers to reveal" : (f.src || ""));
}
bus.on("priv", finHint);
function renderFinance(m) {
  const f = m.finance, body = $("finBody");
  if (!changed("finance", f ? [f.balance, f.change_30d, f.src, (f.series || []).join(","), JSON.stringify(f.categories), (f.bills || []).map(b => b.name + b.amount + b.dueMs).join(",")].join("|") : "none")) return;
  finHint();
  if (!f) { clear(body); const e = el("div", "empty", "Waiting for the finance bot's first report."); body.append(e); FIN.root = null; return; }
  ensureFinance(); if (FIN.root.parentNode !== body) { clear(body); body.append(FIN.root); }
  setNumber(FIN.bal, f.balance || "—"); setText(FIN.chg, f.change_30d || ""); attr(FIN.chg, "class", "chg sens " + (/^\s*[-−]/.test(f.change_30d || "") ? "dn" : "up")); FIN.chg.dataset.rev = "";
  const ser = (f.series || []).map(Number).filter(isFinite);
  FIN.spark.style.display = ser.length > 1 ? "" : "none";
  if (ser.length > 1) {
    const mn = Math.min(...ser), mx = Math.max(...ser), pts = ser.map((v, i) => [i / (ser.length - 1) * 300, 60 - (v - mn) / ((mx - mn) || 1) * 52]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "), end = pts[pts.length - 1];
    FIN.spark.innerHTML = '<svg class="spark" viewBox="0 0 300 68" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#19d3ff" stop-opacity=".42"/><stop offset="1" stop-color="#19d3ff" stop-opacity="0"/></linearGradient></defs><path class="area" d="' + line + ' L300 68 L0 68Z"/><path class="line" d="' + line + '"/></svg>';
    FIN.spark.dataset.end = end[0] + "," + end[1];
  }
  const cats = f.categories || []; FIN.ring.style.display = cats.length ? "" : "none";
  if (cats.length) {
    let acc = 0; const stops = [];
    cats.forEach((k, i) => { const p = clamp(+k.pct || 0, 0, 100); stops.push(CAT_COLORS[i % 8] + " " + acc + "% " + (acc + p) + "%"); acc += p; });
    if (acc < 100) stops.push("rgba(25,211,255,.12) " + acc + "% 100%");
    FIN.dn.style.background = "conic-gradient(" + stops.join(",") + ")";
    reconcile(FIN.leg, cats, k => k.name, () => { const r = el("div"), sw = el("i"); r.append(sw, el("span", "nm"), sensEl(el("span", "v"), true)); return r; }, (r, k) => {
      const i = cats.indexOf(k); r.firstChild.style.background = CAT_COLORS[i % 8]; setText(r.querySelector(".nm"), k.name); setText(r.querySelector(".v"), k.pct + "%");
    });
  }
  const bills = f.bills || []; FIN.bills.style.display = bills.length ? "" : "none";
  reconcile(FIN.bills, bills, b => b.name + b.dueMs, () => { const r = el("div", "bill"), rt = el("div", "r"); rt.append(sensEl(el("span", "amt"), true), el("b")); r.append(el("span", "nm"), rt); return r; }, (r, b) => {
    setText(r.querySelector(".nm"), b.name); setText(r.querySelector(".amt"), b.amount);
    const days = isFinite(b.dueMs) ? Math.ceil((b.dueMs - Date.now()) / 864e5) : null, late = days != null && days < 0, d = r.querySelector("b");
    attr(d, "class", late ? "late" : ""); setText(d, days == null ? (b.dueText || "") : late ? "overdue " + (-days) + "d" : days === 0 ? "today" : "in " + days + "d");
  });
}

/* ---------- vitals ---------- */
const VIT = {};
function ensureVitals() {
  if (VIT.root) return;
  const w = el("div", "vit"), body = el("div", "body");
  body.innerHTML = '<svg viewBox="0 0 96 176" aria-hidden="true"><g stroke="#19d3ff" stroke-width="1.3" fill="rgba(25,211,255,.06)" stroke-linejoin="round"><circle cx="48" cy="17" r="11.5"/><path d="M30 35 Q48 29 66 35 L74 79 L66 81 L62 58 L60 104 L64 166 L52 166 L48 112 L44 166 L32 166 L36 104 L34 58 L30 81 L22 79 Z"/></g><circle cx="48" cy="54" r="3" fill="#ff5468"><animate attributeName="r" values="3;6;3" dur="1.2s" repeatCount="indefinite"/></circle><circle cx="48" cy="90" r="2.5" fill="#2ef2c8"/><circle cx="40" cy="134" r="2.5" fill="#7dff9a"/><circle cx="56" cy="134" r="2.5" fill="#7dff9a"/></svg><div class="scan"></div>';
  VIT.rows = el("div", "vs"); VIT.ecg = el("div");
  VIT.ecg.innerHTML = '<svg class="ecg" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path d="M0 15 H40 L46 15 L52 4 L58 26 L64 15 H110 L116 15 L122 4 L128 26 L134 15 H200"/></svg>';
  w.append(body, VIT.rows); VIT.root = w;
}
function renderVitals(m) {
  const v = m.vitals, body = $("vitBody");
  if (!changed("vitals", v ? JSON.stringify(v) : "none")) return;
  setText($("vitSub"), v ? v.src || "" : "");
  if (!v) { clear(body); body.append(el("div", "empty", "Waiting for the fitness bot's first report.")); VIT.root = null; return; }
  ensureVitals(); if (VIT.root.parentNode !== body) { clear(body); body.append(VIT.root); }
  const items = [];
  if (v.steps != null) items.push(["Steps", v.steps.toLocaleString() + (v.steps_goal ? " / " + v.steps_goal.toLocaleString() : ""), ""]);
  if (v.sleep_hours != null) items.push(["Sleep", Math.floor(v.sleep_hours) + "h " + pad2(Math.round((v.sleep_hours % 1) * 60)) + "m", ""]);
  if (v.heart_rate != null) items.push(["Heart rate", v.heart_rate + " bpm", "dn"]);
  if (v.recovery != null) items.push(["Recovery", v.recovery + "%", "up"]);
  if (v.streak != null) items.push(["Streak", v.streak + " days", ""]);
  reconcile(VIT.rows, items, i => i[0], () => { const r = el("div", "vr"); r.append(el("span"), el("b")); return r; }, (r, i) => {
    setText(r.firstChild, i[0]); attr(r.lastChild, "class", i[2]); setNumber(r.lastChild, i[1]);
  });
  if (v.heart_rate != null) { if (VIT.ecg.parentNode !== VIT.rows) VIT.rows.append(VIT.ecg); VIT.ecg.firstChild.style.setProperty("--beat", (120 / clamp(v.heart_rate, 40, 200)).toFixed(2) + "s"); }
  else if (VIT.ecg.parentNode) VIT.ecg.remove();
}

/* ---------- everything ---------- */
function renderAll(m) {
  renderChrome(m); renderRoster(m); renderNeeds(m); renderNow(m); renderFeed(m); renderTimeline(m); renderHeat(m); renderMetrics(m); renderFinance(m); renderVitals(m);
}
