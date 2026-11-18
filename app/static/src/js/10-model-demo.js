/*DEMO-START*/
/* ============================================================
   Demo / preview data (sample content only; no network)
   ============================================================ */
const T0 = Date.now();                 // anchor: countdowns and ages keep moving between rebuilds
let demoAlert = false;
let DEMO_NEEDS = [
  { id: 1, bot: "social", title: "Post “Friday launch” to Instagram", meta: "Apollo · scheduled 12:00" },
  { id: 2, bot: "finance", title: "Pay invoice to Hosting Co", meta: "Midas · due in 2 days · ", amount: "$84.20", sens: true },
  { id: 3, bot: "inbox", title: "Send reply to Sam", meta: "Hermes · draft ready" },
];

function demoModel() {
  const now = Date.now(), at = n => new Date(T0 - n * 60000).toISOString(), t = n => T0 + n * 60000;
  const raw = [
    ["chief-of-staff", "working", "3 meetings · 1 conflict", at(14)],
    ["inbox", "working", "12 unread · 2 urgent", at(32)],
    ["social", "idle", "3 posts queued", at(95)],
    ["fitness", "idle", "8,240 steps · 6d streak", at(400)],
    ["finance", demoAlert ? "silent" : "idle", "2 bills due soon", demoAlert ? at(1600) : at(300)],
  ];
  const PERSONA = { "chief-of-staff": ["Zeus", "Chief of staff"], inbox: ["Hermes", "Inbox"], social: ["Apollo", "Social growth"], fitness: ["Atlas", "Fitness"], finance: ["Midas", "Finance"] };
  const bots = raw.map((r, i) => ({ id: r[0], name: PERSONA[r[0]][0], role: PERSONA[r[0]][1], state: r[1], note: r[2], last: r[3], color: PALETTE[i], glyph: glyphFor(r[0]), sens: r[0] === "finance" }));
  const TILES = {
    "chief-of-staff": [["Meetings today", "3"], ["Conflicts", "1", "down"]],
    inbox: [["Unread", "12", "down"], ["Urgent", "2"], ["Awaiting reply", "5"]],
    social: [["Instagram views 7d", "6,448", "up"], ["TikTok views 7d", "2,544", "up"], ["Videos posted 7d", "4"], ["Top post", "Little angus"]],
    fitness: [["Workouts this week", "3"], ["Active streak", "6 days", "up"]],
    finance: [["Bills due 7d", "2"], ["Card balance owed", "$2,008.83"]],
  };
  const metrics = bots.map((b, i) => ({ bot: b.id, name: b.name, role: b.role, color: b.color, glyph: b.glyph, sens: b.sens, updated: raw[i][3], tiles: TILES[b.id].map(x => ({ label: x[0], value: x[1], trend: x[2] })) }));

  // seeded reporting grid
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280, rows = {}, dates = [];
  for (let d = 13; d >= 0; d--) dates.push(new Date(T0 - d * 864e5).toISOString().slice(0, 10));
  bots.forEach(b => { rows[b.id] = Array.from({ length: 14 }, (_, d) => { const v = rnd(); return (b.id === "finance" && d > 11) ? 0 : v < .1 ? 0 : v < .35 ? 1 : v < .7 ? 2 : 3; }); });

  const events = [
    [-200, "Morning briefing delivered", "Zeus"], [-150, "Daily stand-up", "calendar"], [38, "Reply to Sam (deadline)", "Hermes"],
    [132, "Investor call", "conflicts with dentist"], [380, "Evening run", "Atlas"],
  ].map(e => ({ key: e[0] + e[1], t: t(e[0]), at: hhmm(t(e[0])), text: e[1], note: e[2] }));

  const feed = [
    ["URGENT", "2 urgent replies waiting", "Sam (noon deadline) and the landlord · Hermes", at(32)],
    ["WARN", "Calendar conflict", "Dentist 2 pm overlaps the investor call · Zeus", at(14)],
    ["INFO", "3 posts scheduled for tomorrow", "Reach up 18% week on week · Apollo", at(95)],
    ["TIP", "Evening run suggested", "Recovery is 78%, weather clear at 18:00 · Atlas", at(180)],
    ["INFO", "Invoice from Hosting Co", "$84.20 due in 2 days · Midas", at(300)],
    ["LIVE", "All connectors healthy", "Gmail, Calendar, Drive, Buffer, Higgsfield", at(0)],
  ].map(f => ({ key: f[0] + f[1], tag: f[0], title: f[1], body: f[2], at: f[3], sens: /finance|invoice/i.test(f[1] + f[2]) }));

  const BRIEF = ["Priority 1: reply to Sam before noon (38 min).", "The 2 pm dentist clashes with the investor call. Suggest moving the dentist.",
    "3 posts go out tomorrow; 1 needs your approval.", "Midas: 2 bills due this week, cash flow on track.", "Atlas: 6 day streak, run suggested at 18:00."];

  return {
    owner: typeof GUEST === "string" ? GUEST : "", bots, metrics, events, feed, needs: DEMO_NEEDS,
    heat: { dates, rows },
    alert: demoAlert ? "Midas (finance) has been silent for 26 hours · last report 07:04 yesterday" : null,
    headline: demoAlert ? "Midas has gone quiet. Everything else is fine." : DEMO_NEEDS.length ? `${DEMO_NEEDS.length} things need you today. Everything else is handled.` : "All quiet. Everything is handled.",
    now: { lb: "Right now", title: "Reply to Sam before the noon deadline", due: t(38), acts: [
      { label: "Open draft", cls: "ok", fn: () => toast("Opening draft (demo)") }, { label: "Snooze 1h", cls: "", fn: () => toast("Snoozed 1h (demo)") } ] },
    next: { title: "Reply to Sam (deadline)", t: t(38) },
    priorities: [{ t: "Reply to Sam before the noon deadline" }, { t: "Move the dentist: it clashes with the investor call" }, { t: "Approve tomorrow’s 3 posts" }, { t: "Evening run at 18:00" }],
    finance: { balance: "$18,420.55", change_30d: "+$1,240.10", src: "Midas · " + hhmm(t(-300)),
      series: [48, 44, 50, 38, 41, 30, 34, 26, 32, 22, 28, 18, 24, 14, 20, 10].map(v => 62 - v),
      categories: [{ name: "Rent", pct: 45 }, { name: "Business", pct: 25 }, { name: "Food", pct: 15 }, { name: "Other", pct: 15 }],
      bills: [{ name: "Hosting Co", amount: "$84.20", dueMs: t(2 * 1440) }, { name: "Card payment", amount: "$410.00", dueMs: t(5 * 1440) }, { name: "Rent", amount: "$1,800.00", dueMs: t(9 * 1440) }] },
    vitals: { steps: 8240, steps_goal: 10000, sleep_hours: 7.2, heart_rate: 62, recovery: 78, streak: 6, src: "Atlas · 06:50" },
    brief: BRIEF.map(x => ({ t: x, sens: x.startsWith("Midas") })),
  };
}
/*DEMO-END*/

/*DEMO-START*/
/* Sample detail for each bot: the demo's stand-in for the hub's per-bot endpoint */
function demoDetail(id) {
  const m = demoModel(), b = m.bots.find(x => x.id === id), now = Date.now();
  const iso = ms => new Date(ms).toISOString(), ago = n => iso(now - n * 6e4), day = n => new Date(now - n * 864e5).toISOString().slice(0, 10);
  let s = 11; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const trend = (base, amp, step = 0, dp = 1, n = 30) => Array.from({ length: n }, (_, i) => [day(n - 1 - i), +(base + step * i + (rnd() - .5) * amp).toFixed(dp)]);
  const rows = (...r) => r.map(x => ({ label: x[0], value: x[1], note: x[2] || "" }));
  const brief = (n, kind, pr, title, body, items) => ({ id: id + n, bot: id, kind, priority: pr, title, body, items: items || [], created_at: ago(n * 90 + 12) });
  const D = {
    "chief-of-staff": {
      snap: { note: "3 meetings · 1 conflict", tiles: [{ label: "Meetings today", value: "3" }, { label: "Conflicts", value: "1", trend: "down" }, { label: "Focus time", value: "2h 30m" }],
        events: m.events.map(e => ({ at: e.at, title: e.text, note: e.note, done: e.t < now })), priorities: m.priorities.map(p => p.t),
        sections: [{ title: "This week", rows: rows(["Meetings", "14", "3 today"], ["Focus time", "9 h", "goal 12 h"], ["Conflicts", "1", "dentist vs investor call"], ["Declined invites", "2"]) }],
        log: [{ at: day(1), title: "Board prep sent to Sam", note: "slides + one-pager" }, { at: day(2), title: "Moved Thursday 1:1 to Friday" }, { at: day(3), title: "Booked flights for the Austin trip", note: "arrive Mon 09:40" }] },
      briefs: [brief(1, "brief", "high", "Calendar conflict", "Dentist at 2 pm overlaps the investor call. Suggest moving the dentist to Thursday 10:00, which is free.", ["Move dentist", "Keep investor call"]), brief(2, "brief", "normal", "Morning briefing", "Three meetings today: stand-up 09:30, investor call 14:00, 1:1 with Sam 16:30. Nothing else needs you before noon.", []), brief(5, "note", "low", "Weekly report ready", "The weekly report is drafted and waits for your review.", [])],
      tasks: [{ id: 1, bot: id, title: "Move dentist to Thursday", detail: "", status: "open", created_by: "owner", result: "", created_at: ago(40), completed_at: null }, { id: 2, bot: id, title: "Draft Friday agenda", detail: "", status: "done", created_by: "owner", result: "Agenda sent to the team.", created_at: ago(2000), completed_at: ago(1900) }],
      trends: { "Meetings today": trend(3, 3, 0, 0), "Focus time": trend(2.5, 2) } },
    inbox: {
      snap: { note: "12 unread · 2 urgent", tiles: [{ label: "Unread", value: "12", trend: "down" }, { label: "Urgent", value: "2" }, { label: "Awaiting reply", value: "5" }], priorities: ["Reply to Sam before noon", "Landlord asked for a receipt"],
        sections: [{ title: "Needs a reply", rows: rows(["Sam Rivera", "Re: contract terms", "noon deadline"], ["Landlord", "Rent receipt", "asked yesterday"], ["Hosting Co", "Invoice $84.20", "due in 2 days"]) }, { title: "Today by sender", rows: rows(["Sam Rivera", "4"], ["Newsletters", "6"], ["Calendar", "2"]) }],
        log: [{ at: "09:12", title: "Sam Rivera · Re: contract terms", note: "Can you confirm the termination clause before noon?" }, { at: "08:40", title: "Landlord · Rent receipt", note: "Could you send last month's receipt?" }, { at: "08:05", title: "Hosting Co · Invoice", note: "Your invoice for November is ready." }] },
      briefs: [brief(1, "alert", "high", "2 urgent replies waiting", "Sam (noon deadline) and the landlord both need an answer today.", ["Sam: confirm termination clause", "Landlord: send rent receipt"]), brief(4, "brief", "normal", "Inbox sweep", "Archived 31 newsletters, 12 left unread.", [])],
      tasks: [{ id: 3, bot: id, title: "Draft reply to Sam", detail: "", status: "done", created_by: "owner", result: "Draft ready in Needs you.", created_at: ago(300), completed_at: ago(280) }],
      trends: { Unread: trend(14, 8, 0, 0), Urgent: trend(2, 2, 0, 0) } },
    social: {
      snap: { note: "3 posts queued", tiles: [{ label: "Instagram views 7d", value: "6,448", trend: "up" }, { label: "TikTok views 7d", value: "2,544", trend: "up" }, { label: "Videos posted 7d", value: "4" }, { label: "Top post", value: "Little angus" }],
        sections: [{ title: "Top posts this week", rows: rows(["Little angus", "3,120 views", "Instagram reel"], ["Gym fit check", "1,840 views", "TikTok"], ["Launch teaser", "960 views", "Instagram story"]) }, { title: "Queue", rows: rows(["Fri 12:00", "Friday launch", "waiting for approval"], ["Sat 10:00", "Weekend reel"], ["Sun 18:00", "Recap carousel"]) }],
        log: [{ at: day(0), title: "Posted reel: Little angus", note: "caption + 5 hashtags" }, { at: day(1), title: "Replied to 14 comments" }, { at: day(2), title: "Scheduled 3 posts" }] },
      briefs: [brief(2, "brief", "normal", "3 posts scheduled for tomorrow", "Reach is up 18% week on week. One post needs your approval before it goes out.", []), brief(6, "brief", "low", "Weekly growth", "Instagram +312 followers, TikTok +180.", [])],
      tasks: [{ id: 4, bot: id, title: "Draft Friday launch caption", detail: "", status: "done", created_by: "owner", result: "Three options saved.", created_at: ago(900), completed_at: ago(860) }],
      trends: { "Instagram views 7d": trend(5200, 1400, 90, 0), "TikTok views 7d": trend(2000, 700, 40, 0) } },
    fitness: {
      snap: { note: "8,240 steps · 6d streak", tiles: [{ label: "Workouts this week", value: "3" }, { label: "Active streak", value: "6 days", trend: "up" }],
        vitals: { steps: 8240, steps_goal: 10000, sleep_hours: 7.2, heart_rate: 62, recovery: 78, streak: 6, calories: 1980, calories_goal: 2400, protein_g: 142, carbs_g: 196, fat_g: 58, water_ml: 2400, weight_kg: 81.2 },
        sections: [{ title: "Supplements", rows: rows(["Creatine", "5 g", "taken 08:10"], ["Vitamin D", "2000 IU", "taken 08:10"], ["Magnesium", "400 mg", "tonight"]) }, { title: "This week", rows: rows(["Workouts", "3 of 4"], ["Total steps", "41,320"], ["Average sleep", "7 h 04 m"]) }],
        log: [{ at: day(0) + "T07:30", title: "Upper body, 52 min", note: "bench 4x6 @ 80 kg · row 4x8 · 18 min zone 2" }, { at: day(2), title: "Legs, 58 min", note: "squat 5x5 @ 120 kg · RDL 3x8" }, { at: day(3), title: "Run, 5.2 km", note: "27:41 · avg HR 154" }, { at: day(5), title: "Pull day, 49 min" }] },
      briefs: [brief(3, "brief", "low", "Evening run suggested", "Recovery is 78% and the weather is clear at 18:00. A 5 km easy run fits.", []), brief(8, "brief", "normal", "Weekly fitness summary", "3 workouts, 6 day streak, average sleep 7h 04m, protein goal hit 5 of 7 days.", ["Protein goal: 5/7", "Steps goal: 3/7"])],
      tasks: [], trends: { steps: trend(8000, 3500, 0, 0), sleep_hours: trend(7, 1.2), recovery: trend(72, 20, 0, 0), weight_kg: trend(82, .6, -.07), protein_g: trend(140, 30, 0, 0) } },
    finance: {
      snap: { note: "2 bills due soon", tiles: [{ label: "Bills due 7d", value: "2" }, { label: "Card balance owed", value: "$2,008.83" }], finance: { ...m.finance, bills: m.finance.bills.map(x => ({ name: x.name, amount: x.amount, due: iso(x.dueMs) })) },
        sections: [{ title: "Accounts", rows: rows(["Checking", "$6,310.20"], ["Savings", "$12,110.35"], ["Credit card", "-$2,008.83", "due in 9 days"]) }],
        log: [{ at: day(0), title: "Coffee shop", note: "-$4.50" }, { at: day(0), title: "Grocery", note: "-$63.12" }, { at: day(1), title: "Client payment", note: "+$1,240.00" }, { at: day(2), title: "Gym membership", note: "-$39.00" }] },
      briefs: [brief(5, "brief", "normal", "Invoice from Hosting Co", "$84.20 due in 2 days. Nothing unusual compared with last month.", [])],
      tasks: [], trends: { "Card balance owed": trend(1900, 400, 0, 0), "Bills due 7d": trend(2, 2, 0, 0) } },
  }[id];
  const approvals = DEMO_NEEDS.filter(a => a.bot === id).map(a => ({ id: a.id, bot: id, title: a.title, detail: a.meta, amount: a.amount || "", status: "pending", created_at: ago(30), decided_at: null }))
    .concat(id === "social" ? [{ id: 90, bot: id, title: "Post teaser to TikTok", detail: "", amount: "", status: "approved", created_at: ago(2800), decided_at: ago(2790) }] : []);
  return { bot: id, name: b.name, role: b.role, sensitive: b.sens, state: b.state, last_report: b.last, last_seen: b.last, open_tasks: D.tasks.filter(t => t.status === "open").length,
    snapshot: { ...D.snap, updated_at: b.last }, briefs: D.briefs, tasks: D.tasks, approvals, trends: D.trends,
    grid: { dates: Array.from({ length: 30 }, (_, i) => day(29 - i)), counts: Array.from({ length: 30 }, () => { const v = rnd(); return v < .08 ? 0 : v < .4 ? 1 : v < .75 ? 2 : 3; }) } };
}
const Source = { bot: id => new Promise(r => setTimeout(() => r(demoDetail(id)), 220)) };
/*DEMO-END*/
