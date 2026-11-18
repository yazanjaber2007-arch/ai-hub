/*LIVE-START*/
/* ============================================================
   Live data: API, model builder, refresh loop, approvals
   ============================================================ */
async function api(path, opt = {}) {
  const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opt });
  if (r.status === 401) throw new Error("auth");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.detail || r.statusText);
  return j;
}

function liveModel(d) {
  const now = Date.now(), snaps = d.snapshots || {}, order = d.bots.map(b => b.bot);
  const note = b => { const s = snaps[b]; if (!s) return ""; return s.note || ((s.tiles && s.tiles.length) ? s.tiles[0].label + " " + s.tiles[0].value : ""); };
  const bots = d.bots.map((b, i) => ({
    id: b.bot, name: b.name || b.bot, role: b.role || "", state: b.last_report ? b.state : "waiting", note: note(b.bot), last: b.last_report, color: PALETTE[i % PALETTE.length], glyph: glyphFor(b.bot),
    sens: !!b.sensitive || !!(snaps[b.bot] && snaps[b.bot].finance),
  }));
  const sensBots = new Set(bots.filter(b => b.sens).map(b => b.id)), nameOf = id => (bots.find(b => b.id === id) || {}).name || id;
  const metrics = bots.filter(b => snaps[b.id] && (snaps[b.id].tiles || []).length)
    .map(b => ({ bot: b.id, name: b.name, role: b.role, color: b.color, glyph: b.glyph, sens: b.sens, tiles: snaps[b.id].tiles, updated: snaps[b.id].updated_at }));
  const feed = d.briefs.map(b => ({
    key: b.id, sens: sensBots.has(b.bot), tag: b.kind === "alert" ? "URGENT" : b.priority === "high" ? "WARN" : b.priority === "low" ? "TIP" : "INFO",
    title: b.title, body: (b.body.length > 160 ? b.body.slice(0, 160) + "…" : b.body) + " · " + nameOf(b.bot), at: b.created_at,
  }));
  const needs = d.approvals.map(a => ({ id: a.id, title: a.title, meta: nameOf(a.bot) + (a.detail ? " · " + a.detail.slice(0, 80) : ""), amount: a.amount, bot: a.bot, sens: sensBots.has(a.bot) }));

  const ev = [];
  order.forEach(b => (snaps[b] && snaps[b].events || []).forEach(e => ev.push({ ...e, bot: b, t: parseWhen(e.at) })));
  ev.sort((a, b) => (a.t ?? 9e15) - (b.t ?? 9e15));
  const events = ev.slice(0, 14).map(e => ({ key: (e.t ?? e.at) + e.title, t: e.t, at: e.t != null ? hhmm(e.t) : e.at, text: e.title, note: e.note || nameOf(e.bot), done: !!e.done, sens: sensBots.has(e.bot) }));
  const nextEv = ev.find(e => e.t != null && e.t >= now && !e.done);

  const pr = [], prm = [];   // prm keeps where each priority came from, for displays that must leave out sensitive bots
  order.forEach(b => (snaps[b] && snaps[b].priorities || []).forEach(p => { if (!pr.includes(p)) pr.push(p); if (!prm.some(x => x.t === p)) prm.push({ t: p, sens: sensBots.has(b) }); }));
  const hot = feed.filter(f => f.tag === "URGENT" || f.tag === "WARN");
  const silent = bots.filter(b => b.state === "silent"), waiting = bots.filter(b => b.state === "waiting");

  let rn = null;
  const decide = (a, dec) => () => Actions.decide(a, dec);
  if (nextEv && nextEv.t - now < 60 * 6e4) rn = { lb: "Coming up", title: nextEv.title, due: nextEv.t, acts: [] };
  else if (needs.length) rn = { lb: "Needs you", title: needs[0].title, sub: needs[0].meta, acts: [{ label: "Approve", cls: "ok", fn: decide(needs[0], "approve") }, { label: "Decline", cls: "no", fn: decide(needs[0], "decline") }] };
  else if (nextEv && nextEv.t - now < 12 * 36e5) rn = { lb: "Coming up", title: nextEv.title, due: nextEv.t, acts: [] };
  else if (hot.length) rn = { lb: "Heads up", title: hot[0].title, sub: hot[0].body, acts: [] };

  const parts = [];
  if (needs.length) parts.push(needs.length + " approval" + (needs.length > 1 ? "s" : "") + " waiting");
  if (hot.length) parts.push(hot.length + " alert" + (hot.length > 1 ? "s" : ""));
  if (silent.length) parts.push(silent.length + " bot" + (silent.length > 1 ? "s" : "") + " silent");
  const headline = !bots.some(b => b.last) ? "Waiting for your bots' first reports." : parts.length ? parts.join(" · ") + "." : "All quiet. Everything is handled.";

  const fb = order.find(b => snaps[b] && snaps[b].finance), vb = order.find(b => snaps[b] && snaps[b].vitals);
  const fin = fb ? { ...snaps[fb].finance, src: fb + " · " + agoT(snaps[fb].updated_at), bills: (snaps[fb].finance.bills || []).map(x => ({ name: x.name, amount: x.amount, dueMs: Date.parse(x.due), dueText: x.due })) } : null;
  const vit = vb ? { ...snaps[vb].vitals, src: vb + " · " + agoT(snaps[vb].updated_at) } : null;

  const brief = [{ t: headline }];
  pr.slice(0, 3).forEach(p => brief.push({ t: "Priority: " + p }));
  needs.forEach(n => brief.push({ t: "Waiting for your approval: " + n.title, sens: n.sens }));
  silent.forEach(b => brief.push({ t: b.name + " has stopped reporting (last: " + agoT(b.last) + ")." }));
  if (fin) fin.bills.filter(x => !isNaN(x.dueMs) && x.dueMs - now < 3 * 864e5).forEach(x => brief.push({ t: "Bill due soon: " + x.name + " " + x.amount, sens: true }));
  if (vit && vit.streak) brief.push({ t: "Streak: " + vit.streak + " days." });

  return {
    owner: d.owner, bots, metrics, events, feed, needs, heat: d.grid, finance: fin, vitals: vit, brief, headline, now: rn, priorities: prm.slice(0, 6),
    alert: silent.length ? silent.map(b => b.name).join(", ") + (silent.length > 1 ? " have" : " has") + " stopped reporting · last report " + agoT(silent[0].last) : null,
    next: nextEv ? { title: nextEv.title, t: nextEv.t } : null, waitingAll: bots.length > 0 && waiting.length === bots.length,
  };
}

let _prevLast = {}, _lastOk = 0;
async function refresh() {
  try {
    const d = await api("/api/dashboard");
    _lastOk = Date.now(); Auth.ok();
    const m = liveModel(d);
    m.bots.forEach(b => { if (_prevLast[b.id] && b.last && b.last !== _prevLast[b.id]) bus.emit("bot:report", b.id); _prevLast[b.id] = b.last; });
    App.setModel(m); Boot.ready();
  } catch (e) {
    if (e.message === "auth") Auth.required(); else { App.offline(e.message); }
  }
}

const Auth = {
  needed: false,
  required() {
    this.needed = true; document.documentElement.classList.remove("booting"); bus.emit("auth:required");
    if (Ambient.active) { Ambient.stale("auth"); return; }        // a wall display shows a quiet pill, not a password box
    this.show();
  },
  show() { $("login").style.display = "grid"; setTimeout(() => $("pw").focus(), 60); },
  ok() { const was = this.needed; this.needed = false; $("login").style.display = "none"; if (was) bus.emit("auth:ok"); },
};

const Source = {
  bot: id => api("/api/bots/" + encodeURIComponent(id)).catch(e => { if (e.message === "auth") Auth.required(); throw e; }),
};
const Actions = {
  async decide(a, decision) {
    const verb = decision === "approve" ? "Approved" : "Declined";
    const row = document.querySelector('#needList .nd[data-k="' + a.id + '"]');
    if (row) row.querySelectorAll("button").forEach(b => (b.disabled = true));
    try {
      const r = await api("/api/approvals/" + a.id + "/decide", { method: "POST", body: JSON.stringify({ decision }) });
      toast(verb + " · " + Names.name(a.bot) + " notified (" + r.task.wake_status + ")"); bus.emit(decision === "approve" ? "approved" : "declined", a);
    } catch (e) { toast(e.message === "auth" ? "Please sign in again" : e.message); }
    refresh();
  },
  async task(bot, title) {
    try { const r = await api("/api/tasks", { method: "POST", body: JSON.stringify({ bot, title: title.slice(0, 200) }) }); toast("Sent to " + Names.name(bot) + " (" + r.wake_status + ")"); refresh(); }
    catch (e) { toast(e.message); }
  },
};
/*LIVE-END*/
/*DEMO-START*/
const Actions = {
  decide(a, decision) {
    DEMO_NEEDS = DEMO_NEEDS.filter(x => x.id !== a.id);
    toast((decision === "approve" ? "Approved" : "Declined") + " (demo)"); bus.emit(decision === "approve" ? "approved" : "declined", a);
    App.setModel(demoModel());
  },
  task() { toast("Would create a task (demo)"); },
};
/*DEMO-END*/
