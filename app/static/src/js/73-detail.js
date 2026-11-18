"use strict";
/* ============================================================
   Bot detail drawer: click a bot (roster, 3D core, palette) to see everything it has sent.
   Latest state (numbers, vitals and macros, finance, events, priorities, free-form sections, activity log),
   30-day trends, every brief with its full text, tasks, approvals and 30 days of reporting.
   Source.bot(id) comes from the model files: the hub's per-bot endpoint when live, sample data in the demo.
   ============================================================ */
const Detail = (() => {
  let id = null, data = null, pushed = false, seq = 0, gid = 0, openBriefs = new Set();
  const isOpen = () => $("detail").classList.contains("open");
  const sens = n => sensEl(n, data && data.sensitive);                       // a sensitive bot's values blur with the privacy toggle
  const t = (tag, cls, text) => el(tag, cls, text == null ? "" : String(text));
  const sv = (tag, cls, text) => sens(t(tag, cls, text));
  const nf = n => (+n).toLocaleString(), fm = n => (+n).toLocaleString([], { maximumFractionDigits: 1 });

  function when(at) {                                                         // "14:00", "2026-11-17" or an ISO time, for people
    if (!at) return "";
    if (/^\d{1,2}:\d{2}$/.test(at)) return at;
    const ms = Date.parse(at); if (isNaN(ms)) return at;
    return /^\d{4}-\d{2}-\d{2}$/.test(at) ? new Date(ms + 12 * 36e5).toLocaleDateString([], { month: "short", day: "numeric" })
      : new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  const tagOf = b => (b.kind === "alert" ? "URGENT" : b.priority === "high" ? "WARN" : b.priority === "low" ? "TIP" : "INFO");

  function sec(title, meta) {
    const s = el("section", "panel dt-sec"), h = el("div", "ph"); h.append(el("h3", "", title));
    if (meta) h.append(el("span", "meta", meta)); s.append(h); return s;
  }
  const empty = (s, msg) => { s.append(el("div", "empty", msg)); return s; };

  /* ---------- sections ---------- */
  function summary(snap) {
    const s = sec("Right now", snap && snap.updated_at ? "sent " + agoT(snap.updated_at) : "");
    if (!snap) return empty(s, data.name + " has not sent structured data yet. Its briefs are below.");
    if (snap.note) s.append(sv("p", "dt-note", snap.note));
    if ((snap.tiles || []).length) {
      const g = el("div", "dt-tiles");
      snap.tiles.forEach(x => { const c = el("div", "dt-tile"); c.append(t("span", "l", x.label), sv("b", "v " + (x.trend || ""), x.value)); g.append(c); });
      s.append(g);
    } else if (!snap.note) s.append(el("div", "empty", "No numbers sent."));
    return s;
  }

  function vitals(v) {
    const s = sec("Body and health"), top = el("div", "dt-vit");
    if (v.steps != null) {
      const goal = v.steps_goal || 0, pct = goal ? Math.min(100, Math.round(v.steps / goal * 100)) : 100, ring = el("div", "dt-ring");
      ring.style.setProperty("--p", pct); const c = el("div", "in"); c.append(sv("b", "", nf(v.steps)), t("span", "", goal ? "of " + nf(goal) : "steps"), ...(goal ? [t("span", "", "steps")] : [])); ring.append(c); sens(ring); top.append(ring);
    }
    const rows = el("div", "dt-rows"), add = (l, val, note) => { const r = el("div", "r"); r.append(t("span", "", l), sv("b", "", val)); if (note) r.append(sv("em", "", note)); rows.append(r); };
    if (v.sleep_hours != null) add("Sleep", Math.floor(v.sleep_hours) + "h " + pad2(Math.round((v.sleep_hours % 1) * 60)) + "m");
    if (v.heart_rate != null) add("Heart rate", v.heart_rate + " bpm");
    if (v.recovery != null) add("Recovery", v.recovery + "%");
    if (v.weight_kg != null) add("Weight", v.weight_kg + " kg");
    if (v.water_ml != null) add("Water", (v.water_ml / 1000).toFixed(1) + " L");
    if (v.streak != null) add("Streak", v.streak + " days");
    if (rows.children.length) top.append(rows);
    if (top.children.length) s.append(top);
    if (v.calories != null || v.protein_g != null || v.carbs_g != null || v.fat_g != null) s.append(macros(v));
    return s;
  }
  function macros(v) {
    const box = el("div", "dt-macros"), head = el("div", "dt-mh");
    head.append(t("span", "", "Nutrition today"));
    if (v.calories != null) head.append(sv("b", "", nf(v.calories) + (v.calories_goal ? " / " + nf(v.calories_goal) + " kcal" : " kcal")));
    box.append(head);
    if (v.calories != null && v.calories_goal) { const bar = el("div", "dt-bar"), i = el("i"); i.style.width = Math.min(100, v.calories / v.calories_goal * 100) + "%"; bar.append(i); sens(bar); box.append(bar); }
    const parts = [["Protein", v.protein_g, 4, "p"], ["Carbs", v.carbs_g, 4, "c"], ["Fat", v.fat_g, 9, "f"]].filter(p => p[1] != null);
    const kc = parts.reduce((n, p) => n + p[1] * p[2], 0) || 1;
    if (parts.length) {
      const stack = el("div", "dt-stack"); parts.forEach(p => { const i = el("i", p[3]); i.style.flex = String(Math.max(0.02, p[1] * p[2] / kc)); stack.append(i); }); sens(stack); box.append(stack);
      const leg = el("div", "dt-leg"); parts.forEach(p => { const d = el("div"); d.append(el("i", p[3]), t("span", "", p[0]), sv("b", "", Math.round(p[1]) + " g"), sv("em", "", Math.round(p[1] * p[2] / kc * 100) + "%")); leg.append(d); }); box.append(leg);
    }
    return box;
  }

  function finance(f) {
    const s = sec("Money"), top = el("div", "dt-fin"), l = el("div");
    l.append(t("span", "cap", "Balance"), sv("div", "bal", f.balance || "—")); top.append(l);
    if (f.change_30d) { const r = el("div"); r.style.textAlign = "right"; r.append(t("span", "cap", "30 days"), sv("div", "chg " + (/^\s*[-−]/.test(f.change_30d) ? "dn" : "up"), f.change_30d)); top.append(r); }
    s.append(top);
    const ser = (f.series || []).map(Number).filter(isFinite);
    if (ser.length > 1) s.append(sens(spark(ser.map((v, i) => [i, v]), "dt-spark")));
    (f.categories || []).forEach(k => { const r = el("div", "dt-cat"), bar = el("div", "dt-bar"), i = el("i"); i.style.width = clamp(+k.pct || 0, 0, 100) + "%"; bar.append(i); r.append(t("span", "", k.name), bar, sv("b", "", k.pct + "%")); s.append(r); });
    if ((f.bills || []).length) {
      const rows = el("div", "dt-rows"); f.bills.forEach(b => { const r = el("div", "r"), due = Date.parse(b.due), days = isNaN(due) ? null : Math.ceil((due - Date.now()) / 864e5);
        r.append(t("span", "", b.name), sv("b", "", b.amount), sv("em", days != null && days < 0 ? "late" : "", days == null ? b.due : days < 0 ? "overdue " + (-days) + "d" : days === 0 ? "due today" : "due in " + days + "d")); rows.append(r); });
      s.append(t("div", "dt-sub", "Bills"), rows);
    }
    return s;
  }

  function spark(points, cls) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y0 = Math.min(...ys), y1 = Math.max(...ys), dy = (y1 - y0) || 1;
    const d = points.map((p, i) => (i ? "L" : "M") + ((p[0] - x0) / ((x1 - x0) || 1) * 100).toFixed(1) + " " + (26 - (p[1] - y0) / dy * 22).toFixed(1)).join(" ");
    const g = "dtg" + (++gid), w = el("div", cls);                              // each chart carries its own gradient, so it never depends on another panel's
    w.innerHTML = '<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + g + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#19d3ff" stop-opacity=".4"/><stop offset="1" stop-color="#19d3ff" stop-opacity="0"/></linearGradient></defs><path class="area" fill="url(#' + g + ')" d="' + d + ' L100 30 L0 30Z"/><path class="line" d="' + d + '"/></svg>'; return w;
  }

  function events(list) {
    const s = sec("Today", list.length + " item" + (list.length === 1 ? "" : "s")), ul = el("div", "dt-list");
    list.forEach(e => { const r = el("div", "li" + (e.done ? " done" : "")), b = el("div"); b.append(sv("div", "x", e.title)); if (e.note) b.append(sv("div", "n", e.note)); r.append(t("span", "tm", when(e.at)), b); ul.append(r); });
    s.append(ul); return s;
  }
  function priorities(list) {
    const s = sec("Priorities"), ol = el("ol", "dt-prio"); list.forEach((p, i) => { const li = el("li"); li.append(t("b", "", pad2(i + 1)), sv("span", "", p)); ol.append(li); }); s.append(ol); return s;
  }
  function tables(list) {
    return list.map(sc => { const s = sec(sc.title), rows = el("div", "dt-rows");
      sc.rows.forEach(r => { const row = el("div", "r"); row.append(t("span", "", r.label), sv("b", "", r.value)); if (r.note) row.append(sv("em", "", r.note)); rows.append(row); });
      return s.append(rows), s; });
  }
  function log(list) {
    const s = sec("Activity log", list.length + " entries"), ul = el("div", "dt-list");
    list.forEach(e => { const r = el("div", "li"), b = el("div"); b.append(sv("div", "x", e.title)); if (e.note) b.append(sv("div", "n", e.note)); r.append(t("span", "tm", when(e.at)), b); ul.append(r); });
    s.append(ul); return s;
  }

  function trends(tr) {
    const keys = Object.keys(tr).filter(k => { const v = tr[k].map(p => p[1]); return v.length > 2 && Math.min(...v) !== Math.max(...v); });   // a flat line says nothing
    if (!keys.length) return null;
    const s = sec("Last 30 days", keys.length + " trends"), g = el("div", "dt-trends");
    const label = k => ({ steps: "Steps", sleep_hours: "Sleep (h)", heart_rate: "Heart rate", recovery: "Recovery", streak: "Streak", calories: "Calories", protein_g: "Protein (g)", carbs_g: "Carbs (g)", fat_g: "Fat (g)", water_ml: "Water (ml)", weight_kg: "Weight (kg)" })[k] || k;
    keys.forEach(k => {
      const pts = tr[k].map((p, i) => [i, p[1]]), last = pts[pts.length - 1][1], delta = last - pts[0][1], c = el("div", "dt-trend");
      const h = el("div", "h"); h.append(t("span", "", label(k)), sv("b", "", fm(last)));
      const d = sv("em", "", (delta > 0 ? "+" : "") + fm(delta) + " since " + new Date(tr[k][0][0] + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" }));
      c.append(h, sens(spark(pts, "sp")), d); g.append(c);
    });
    s.append(g); return s;
  }

  function briefs(list) {
    const s = sec("Briefs", list.length ? list.length + " recent" : "");
    if (!list.length) return empty(s, "Nothing posted yet.");
    const ul = el("div", "dt-briefs");
    list.forEach(b => {
      const row = el("div", "dt-brief"), btn = el("button", "hd"); btn.type = "button"; const on = openBriefs.has(b.id);
      btn.setAttribute("aria-expanded", String(on));
      btn.append(t("span", "tag " + tagOf(b), tagOf(b)), sv("span", "ti", b.title), t("span", "ag", agoT(b.created_at)));
      const body = el("div", "bd"); body.hidden = !on; body.append(sv("p", "", b.body)); if ((b.items || []).length) { const ul2 = el("ul"); b.items.forEach(i => ul2.append(sv("li", "", i))); body.append(ul2); }
      btn.addEventListener("click", () => { const x = btn.getAttribute("aria-expanded") !== "true"; btn.setAttribute("aria-expanded", String(x)); body.hidden = !x; x ? openBriefs.add(b.id) : openBriefs.delete(b.id); });
      row.append(btn, body); ul.append(row);
    });
    s.append(ul); return s;
  }

  function tasks(list, approvals) {
    const s = sec("Tasks and approvals"), ul = el("div", "dt-list");
    if (!list.length && !approvals.length) return empty(s, "No tasks or approvals yet.");
    list.forEach(x => { const r = el("div", "li"), b = el("div"); b.append(sv("div", "x", x.title)); if (x.status === "done" && x.result) b.append(sv("div", "n", x.result)); else if (x.detail) b.append(sv("div", "n", x.detail));
      r.append(t("span", "st " + x.status, x.status), b, t("span", "ag", agoT(x.created_at))); ul.append(r); });
    approvals.forEach(x => { const r = el("div", "li"), b = el("div"); b.append(sv("div", "x", x.title + (x.amount ? " · " + x.amount : ""))); if (x.detail) b.append(sv("div", "n", x.detail));
      r.append(t("span", "st " + x.status, x.status), b, t("span", "ag", agoT(x.decided_at || x.created_at))); ul.append(r); });
    s.append(ul); return s;
  }

  function reporting(g) {
    const s = sec("Reporting", "30 days"), w = el("div", "dt-heat"), first = g.counts.findIndex(v => v > 0);
    w.setAttribute("role", "img"); w.setAttribute("aria-label", data.name + " reports over 30 days");
    g.counts.forEach((v, i) => { const c = el("i", first === -1 || i < first ? "b" : v === 0 ? "m" : v === 1 ? "l1" : v === 2 ? "l2" : "l3"); c.title = new Date(g.dates[i] + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + v + " report" + (v === 1 ? "" : "s"); w.append(c); });
    const ax = el("div", "dt-axis"); ax.append(t("span", "", new Date(g.dates[0] + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" })), t("span", "", "today")); ax.setAttribute("aria-hidden", "true");
    s.append(w, ax); return s;
  }

  function hints(snap) {
    const v = (snap && snap.vitals) || {}, miss = [];
    if (/fit|health|gym|vital|body/.test(data.bot)) {
      if (v.calories == null && v.protein_g == null) miss.push("macros and calories");
      if (!(snap && (snap.log || []).length)) miss.push("workout log");
      if (v.weight_kg == null) miss.push("weight");
    }
    if (!miss.length) return null;
    const s = sec("Not sent yet"); s.append(t("p", "dt-note", data.name + " can send " + miss.join(", ") + " and they will appear here. Add it to its routine (docs/DATA_CONTRACT.md has the exact fields).")); return s;
  }

  /* ---------- header, body ---------- */
  function head() {
    const b = (M && M.bots.find(x => x.id === id)) || {}, g = $("dtGlyph"); clear(g); g.append(glyphSvg(b.glyph || glyphFor(id))); g.style.setProperty("--c", b.color || "var(--cyan)");
    setText($("dtName"), (data && data.name) || b.name || id); setText($("dtRole"), (data && data.role) || b.role || "");
    const st = (data && data.state) || b.state || "idle"; setText($("dtState"), st === "silent" ? "silent" : st); $("dtState").dataset.state = st;
    const last = (data && data.last_report) || b.last; setText($("dtMeta"), last ? "Last report " + agoT(last) : "Has not reported yet");
  }
  function taskForm() {
    const f = el("form", "dt-task"), inp = el("input"), btn = el("button", "btn ok", "Send");
    inp.placeholder = "Give " + data.name + " a task…"; inp.setAttribute("aria-label", "Task for " + data.name); inp.maxLength = 200; inp.autocomplete = "off"; btn.type = "submit";
    f.addEventListener("submit", e => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; Actions.task(id, v); inp.value = ""; setTimeout(() => load(true), 1500); });
    f.append(inp, btn); return f;
  }
  function render() {
    const body = $("dtBody"), top = body.scrollTop, snap = data.snapshot, kids = [];
    head(); kids.push(taskForm(), summary(snap));
    if (snap) {
      if (snap.vitals && Object.keys(snap.vitals).length) kids.push(vitals(snap.vitals));
      if (snap.finance) kids.push(finance(snap.finance));
      if ((snap.events || []).length) kids.push(events(snap.events));
      if ((snap.priorities || []).length) kids.push(priorities(snap.priorities));
      kids.push(...tables(snap.sections || []));
      if ((snap.log || []).length) kids.push(log(snap.log));
    }
    const tr = trends(data.trends || {}); if (tr) kids.push(tr);
    kids.push(briefs(data.briefs || []), tasks(data.tasks || [], data.approvals || []), reporting(data.grid));
    const h = hints(snap); if (h) kids.push(h);
    body.replaceChildren(...kids); body.scrollTop = top; bus.emit("detail:render", id);
  }
  function skeleton(msg, retry) {
    const b = clear($("dtBody"));
    if (msg) { const d = el("div", "dt-err"); d.append(t("p", "", msg)); const r = el("button", "btn", "Try again"); r.type = "button"; r.addEventListener("click", () => { skeleton(); load(); }); d.append(r); b.append(d); return; }
    for (let i = 0; i < 3; i++) b.append(el("div", "dt-skel"));
  }
  function load(silent) {
    const my = ++seq;
    Source.bot(id).then(d => { if (my === seq && isOpen()) { data = d; render(); } })
      .catch(e => { if (my === seq && isOpen() && !silent) skeleton(e.message === "auth" ? "Please sign in again." : "Could not load this bot: " + e.message); });
  }

  function open(botId) {
    if (!M || !M.bots.some(b => b.id === botId)) return;
    if (!isOpen()) { closeOverlays(); rememberFocus(); }          // close a palette first, then remember where focus was
    id = botId; data = null; seq++; head(); skeleton();
    $("detail").classList.add("open"); bus.emit("overlay:open"); $("dtBody").scrollTop = 0; setTimeout(() => $("dtClose").focus(), 30);
    if (!pushed) { try { history.pushState({ detail: botId }, ""); pushed = true; } catch (e) {} }   // the phone's back gesture closes the drawer, not the page
    load();
  }

  $("dtClose").addEventListener("click", closeOverlays);
  bus.on("select", open);
  bus.on("overlay:close", () => { if (pushed && !isOpen()) { pushed = false; try { history.back(); } catch (e) {} } });
  addEventListener("popstate", () => { if (isOpen()) { pushed = false; closeOverlays(); } });
  setInterval(() => { if (isOpen() && !document.hidden) load(true); }, 30000);
  return { open, get isOpen() { return isOpen(); }, get id() { return id; } };
})();
