/*DEMO-START*/
/* ============================================================
   Demo / preview data (sample content only; no network)
   ============================================================ */
const T0 = Date.now();                 // anchor: countdowns and ages keep moving between rebuilds
let demoAlert = false;
let DEMO_NEEDS = [
  { id: 1, bot: "social", title: "Post “Friday launch” to Instagram", meta: "social · scheduled 12:00" },
  { id: 2, bot: "finance", title: "Pay invoice to Hosting Co", meta: "finance · due in 2 days · ", amount: "$84.20", sens: true },
  { id: 3, bot: "inbox", title: "Send reply to Sam", meta: "inbox · draft ready" },
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
  const bots = raw.map((r, i) => ({ id: r[0], state: r[1], note: r[2], last: r[3], color: PALETTE[i], glyph: glyphFor(r[0]), sens: r[0] === "finance" }));
  const TILES = {
    "chief-of-staff": [["Meetings today", "3"], ["Conflicts", "1", "down"]],
    inbox: [["Unread", "12", "down"], ["Urgent", "2"], ["Awaiting reply", "5"]],
    social: [["Instagram views 7d", "6,448", "up"], ["TikTok views 7d", "2,544", "up"], ["Videos posted 7d", "4"], ["Top post", "Little angus"]],
    fitness: [["Workouts this week", "3"], ["Active streak", "6 days", "up"]],
    finance: [["Bills due 7d", "2"], ["Card balance owed", "$2,008.83"]],
  };
  const metrics = bots.map((b, i) => ({ bot: b.id, color: b.color, glyph: b.glyph, sens: b.sens, updated: raw[i][3], tiles: TILES[b.id].map(x => ({ label: x[0], value: x[1], trend: x[2] })) }));

  // seeded reporting grid
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280, rows = {}, dates = [];
  for (let d = 13; d >= 0; d--) dates.push(new Date(T0 - d * 864e5).toISOString().slice(0, 10));
  bots.forEach(b => { rows[b.id] = Array.from({ length: 14 }, (_, d) => { const v = rnd(); return (b.id === "finance" && d > 11) ? 0 : v < .1 ? 0 : v < .35 ? 1 : v < .7 ? 2 : 3; }); });

  const events = [
    [-200, "Morning briefing delivered", "chief-of-staff"], [-150, "Daily stand-up", "calendar"], [38, "Reply to Sam (deadline)", "inbox"],
    [132, "Investor call", "conflicts with dentist"], [380, "Evening run", "fitness"],
  ].map(e => ({ key: e[0] + e[1], t: t(e[0]), at: hhmm(t(e[0])), text: e[1], note: e[2] }));

  const feed = [
    ["URGENT", "2 urgent replies waiting", "Sam (noon deadline) and the landlord · inbox", at(32)],
    ["WARN", "Calendar conflict", "Dentist 2 pm overlaps the investor call · chief-of-staff", at(14)],
    ["INFO", "3 posts scheduled for tomorrow", "Reach up 18% week on week · social", at(95)],
    ["TIP", "Evening run suggested", "Recovery is 78%, weather clear at 18:00 · fitness", at(180)],
    ["INFO", "Invoice from Hosting Co", "$84.20 due in 2 days · finance", at(300)],
    ["LIVE", "All connectors healthy", "Gmail, Calendar, Drive, Buffer, Higgsfield", at(0)],
  ].map(f => ({ key: f[0] + f[1], tag: f[0], title: f[1], body: f[2], at: f[3], sens: /finance|invoice/i.test(f[1] + f[2]) }));

  const BRIEF = ["Priority 1: reply to Sam before noon (38 min).", "The 2 pm dentist clashes with the investor call. Suggest moving the dentist.",
    "3 posts go out tomorrow; 1 needs your approval.", "Finance: 2 bills due this week, cash flow on track.", "Fitness: 6 day streak, run suggested at 18:00."];

  return {
    owner: typeof GUEST === "string" ? GUEST : "", bots, metrics, events, feed, needs: DEMO_NEEDS,
    heat: { dates, rows },
    alert: demoAlert ? "Finance has been silent for 26 hours · last report 07:04 yesterday" : null,
    headline: demoAlert ? "Finance has gone quiet. Everything else is fine." : DEMO_NEEDS.length ? `${DEMO_NEEDS.length} things need you today. Everything else is handled.` : "All quiet. Everything is handled.",
    now: { lb: "Right now", title: "Reply to Sam before the noon deadline", due: t(38), acts: [
      { label: "Open draft", cls: "ok", fn: () => toast("Opening draft (demo)") }, { label: "Snooze 1h", cls: "", fn: () => toast("Snoozed 1h (demo)") } ] },
    next: { title: "Reply to Sam (deadline)", t: t(38) },
    priorities: [{ t: "Reply to Sam before the noon deadline" }, { t: "Move the dentist: it clashes with the investor call" }, { t: "Approve tomorrow’s 3 posts" }, { t: "Evening run at 18:00" }],
    finance: { balance: "$18,420.55", change_30d: "+$1,240.10", src: "finance bot · " + hhmm(t(-300)),
      series: [48, 44, 50, 38, 41, 30, 34, 26, 32, 22, 28, 18, 24, 14, 20, 10].map(v => 62 - v),
      categories: [{ name: "Rent", pct: 45 }, { name: "Business", pct: 25 }, { name: "Food", pct: 15 }, { name: "Other", pct: 15 }],
      bills: [{ name: "Hosting Co", amount: "$84.20", dueMs: t(2 * 1440) }, { name: "Card payment", amount: "$410.00", dueMs: t(5 * 1440) }, { name: "Rent", amount: "$1,800.00", dueMs: t(9 * 1440) }] },
    vitals: { steps: 8240, steps_goal: 10000, sleep_hours: 7.2, heart_rate: 62, recovery: 78, streak: 6, src: "fitness bot · 06:50" },
    brief: BRIEF.map(x => ({ t: x, sens: x.startsWith("Finance") })),
  };
}
/*DEMO-END*/
