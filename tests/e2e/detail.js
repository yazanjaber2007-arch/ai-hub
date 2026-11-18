// The per-bot detail drawer: opens from the roster and the palette, shows everything a bot sent (macros, log, sections, finance),
// is keyboard- and phone-friendly, and fails gently. Needs the seeded test hub (run-all.sh starts it).
// HUB=http://localhost:8801 node tests/e2e/detail.js
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801', PASSWORD = process.env.HUB_PASSWORD || 'demo-pass';
const FITNESS_TOKEN = process.env.FITNESS_TOKEN || 'tok-fitness-0123456789abcdef0';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

async function login(ctx) { const r = await ctx.request.post(HUB + '/login', { data: { password: PASSWORD } }); return r.ok(); }
async function ready(p, url) {
  await p.goto(HUB + url); await p.waitForFunction(() => window.__hub && window.__hub.M && window.__hub.M.bots.length === 5, null, { timeout: 20000 });
  await p.waitForFunction(() => !window.__hub.Boot.running, null, { timeout: 15000 }).catch(() => {});
}
const open = p => p.evaluate(() => window.__hub.Detail.isOpen);

(async () => {
  const b = await chromium.launch();
  const d = new Date(), day = n => new Date(d - n * 864e5).toISOString().slice(0, 10);

  // what Atlas sends once its routine includes the extras: macros, a supplements table, a workout log
  const post = await fetch(HUB + '/ingest/snapshot', { method: 'POST', headers: { Authorization: 'Bearer ' + FITNESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({
    note: '8,240 steps · 6d streak', tiles: [{ label: 'Workouts this week', value: '3' }],
    vitals: { steps: 8240, steps_goal: 10000, sleep_hours: 7.2, heart_rate: 62, recovery: 78, streak: 6, calories: 1980, calories_goal: 2400, protein_g: 142, carbs_g: 196, fat_g: 58, water_ml: 2400, weight_kg: 81.2 },
    sections: [{ title: 'Supplements', rows: [{ label: 'Creatine', value: '5 g', note: 'taken 08:10' }, { label: 'Vitamin D', value: '2000 IU' }] }],
    log: [{ at: day(0) + 'T07:30', title: 'Upper body, 52 min', note: 'bench 4x6 @ 80 kg' }, { at: day(2), title: 'Legs, 58 min' }] }) });
  ok(post.ok, 'seed: the fitness bot accepts macros, a table and a workout log (HTTP ' + post.status + ')');
  await fetch(HUB + '/ingest/brief', { method: 'POST', headers: { Authorization: 'Bearer ' + FITNESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Evening run suggested', body: 'Recovery is 78%.\nWeather clear at 18:00.', kind: 'brief', priority: 'low', items: ['5 km easy', 'Stretch after'] }) });

  // ---------- desktop, live ----------
  let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.core', '"2d"'); } catch (e) {} });
  ok(await login(ctx), 'signed in');
  let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/40[13]|Failed to load resource/.test(m.text()) && errs.push('console ' + m.text()));
  await ready(p, '/command?boot=0');
  const row = p.locator('#rosList .rb', { hasText: 'Atlas' });
  await row.click(); await p.waitForSelector('#dtBody .dt-sec', { timeout: 8000 });
  ok(await open(p), 'clicking a bot in the roster opens its drawer');
  ok((await p.textContent('#dtName')) === 'Atlas' && /fitness/i.test(await p.textContent('#dtRole')), 'the header names the bot and its job');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'dtClose'), 'focus moves into the drawer (the close button)');
  const body = await p.textContent('#dtBody');
  ok(/Nutrition today/.test(body) && /1,980 \/ 2,400 kcal/.test(body) && /Protein/.test(body) && /142 g/.test(body), 'macros and calories are shown');
  ok(/Supplements/.test(body) && /Creatine/.test(body) && /taken 08:10/.test(body), 'a free-form table the bot sent is shown');
  ok(/Activity log/.test(body) && /Upper body, 52 min/.test(body) && /bench 4x6/.test(body), 'the workout log is shown');
  ok(/Weight/.test(body) && /81\.2 kg/.test(body) && /8,240/.test(body) && /of 10,000/.test(body), 'steps ring, weight and sleep are shown');
  ok(!/Not sent yet/.test(body), 'no "not sent yet" hint once the bot sends everything');
  ok(await p.evaluate(() => { const b = document.getElementById('dtBody'); return b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === 'auto'; }), 'the drawer body scrolls on its own');
  // briefs open to their full text
  const hd = p.locator('#dtBody .dt-brief .hd').first();
  ok((await hd.getAttribute('aria-expanded')) === 'false' && await p.locator('#dtBody .dt-brief .bd').first().isHidden(), 'a brief starts collapsed');
  await hd.click(); await p.waitForTimeout(150);
  ok((await hd.getAttribute('aria-expanded')) === 'true' && /Weather clear at 18:00/.test(await p.locator('#dtBody .dt-brief .bd').first().innerText()) && /5 km easy/.test(await p.locator('#dtBody .dt-brief .bd').first().innerText()), 'clicking a brief shows all of it, including its checklist');
  // Tab stays inside the dialog
  let inside = true; for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); inside = inside && await p.evaluate(() => !!document.activeElement.closest('#detail')); }
  ok(inside, 'Tab never leaves the drawer');
  // a task from the drawer
  await p.fill('.dt-task input', 'summarise my week'); await p.click('.dt-task button');
  await p.waitForFunction(() => /Sent to Atlas/.test(document.getElementById('toast').textContent), null, { timeout: 4000 }).catch(() => {});
  ok(/Sent to Atlas/.test(await p.textContent('#toast')), 'sending a task from the drawer confirms by name');
  await p.waitForFunction(() => /summarise my week/.test(document.getElementById('dtBody').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/summarise my week/.test(await p.textContent('#dtBody')), 'the new task appears in the drawer after a moment');
  // Escape closes and focus goes back to the roster row
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok(!(await open(p)) && await p.evaluate(() => document.activeElement && !!document.activeElement.closest('#rosList')), 'Esc closes the drawer and returns focus to the roster');
  // the browser back button closes it too, without leaving the page
  await row.click(); await p.waitForSelector('#dtBody .dt-sec'); await p.goBack(); await p.waitForTimeout(300);
  ok(!(await open(p)) && /\/command/.test(p.url()), 'the back button closes the drawer and stays on the dashboard');
  await row.click(); await p.waitForSelector('#dtBody .dt-sec'); await p.click('#dtClose'); await p.waitForTimeout(300);
  ok(!(await open(p)) && /\/command/.test(p.url()), 'closing with the X leaves no extra history entry behind');
  // palette
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200); await p.keyboard.type('Open Midas'); await p.waitForTimeout(200);
  ok(/Open Midas/.test(await p.textContent('#palList .pi.sel')), 'palette lists "Open Midas · Finance"');
  await p.keyboard.press('Enter'); await p.waitForSelector('#dtBody .dt-sec');
  ok(await open(p) && (await p.textContent('#dtName')) === 'Midas' && !(await p.evaluate(() => document.getElementById('pal').classList.contains('open'))), 'Enter in the palette opens Midas and closes the palette');
  const fin = await p.textContent('#dtBody');
  ok(/\$18,420\.55/.test(fin) && /Hosting Co/.test(fin) && /Rent/.test(fin), 'finance: balance, bills and categories');
  // privacy: a sensitive bot's numbers blur with the privacy toggle
  await p.evaluate(() => document.body.classList.add('priv')); await p.waitForTimeout(350);
  ok(await p.evaluate(() => { const n = document.querySelector('#dtBody .sens'); return !!n && /blur/.test(getComputedStyle(n).filter); }), 'privacy mode blurs a sensitive bot\'s numbers in the drawer');
  await p.evaluate(() => document.body.classList.remove('priv')); await p.waitForTimeout(450);   // the blur fades out over 280ms
  ok(await p.evaluate(() => { const a = document.querySelector('#dtBody .sens'); return !a || !/blur/.test(getComputedStyle(a).filter); }), '...and they come back with it off');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // a bot that sent nothing structured still opens
  ok(await p.evaluate(() => { window.__hub.Detail.open('inbox'); return true; }), 'another bot opens');
  await p.waitForSelector('#dtBody .dt-sec'); ok(/Unread/.test(await p.textContent('#dtBody')) && /Priorities/.test(await p.textContent('#dtBody')), 'inbox: its numbers and priorities');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);

  // a failing request shows a way forward, and "Try again" works once the hub is back
  await p.route('**/api/bots/**', r => r.abort());
  await p.evaluate(() => window.__hub.Detail.open('social')); await p.waitForSelector('#dtBody .dt-err', { timeout: 6000 }).catch(() => {});
  ok(await p.locator('#dtBody .dt-err').count() === 1 && /Could not load/.test(await p.textContent('#dtBody')), 'a failed load says so');
  await p.unroute('**/api/bots/**'); await p.click('#dtBody .dt-err button'); await p.waitForSelector('#dtBody .dt-sec', { timeout: 6000 }).catch(() => {});
  ok(await p.locator('#dtBody .dt-sec').count() > 1 && await p.locator('#dtBody .dt-err').count() === 0, '"Try again" loads it');
  await p.keyboard.press('Escape');
  ok(errs.length === 0, 'no console errors on desktop ' + JSON.stringify(errs));
  await ctx.close();

  // ---------- phone ----------
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.core', '"2d"'); } catch (e) {} });
  await login(ctx); p = await ctx.newPage(); const merrs = []; p.on('pageerror', e => merrs.push(e.message));
  await ready(p, '/command?boot=0');
  await p.evaluate(() => window.__hub.Detail.open('fitness')); await p.waitForSelector('#dtBody .dt-sec'); await p.waitForTimeout(600);
  const m = await p.evaluate(() => {
    const box = document.querySelector('#detail .box').getBoundingClientRect(), r = s => { const n = document.querySelector(s); return n ? Math.round(n.getBoundingClientRect().height) : 0; };
    const body = document.getElementById('dtBody');
    return { w: Math.round(box.width), h: Math.round(box.height), vw: innerWidth, vh: innerHeight, hs: document.documentElement.scrollWidth > innerWidth + 1 || body.scrollWidth > body.clientWidth + 1,
      close: r('#dtClose'), send: r('.dt-task button'), input: r('.dt-task input'), brief: r('.dt-brief .hd'), font: parseFloat(getComputedStyle(document.querySelector('.dt-task input')).fontSize) };
  });
  ok(m.w === m.vw && m.h === m.vh, 'phone: the drawer fills the screen (' + m.w + 'x' + m.h + ')');
  ok(!m.hs, 'phone: nothing scrolls sideways');
  ok(m.close >= 44 && m.send >= 44 && m.input >= 44 && m.brief >= 44, 'phone: touch targets are at least 44px (close ' + m.close + ', send ' + m.send + ', input ' + m.input + ', brief ' + m.brief + ')');
  ok(m.font >= 16, 'phone: the task field is 16px, so iOS does not zoom the page');
  ok(await p.evaluate(() => [...document.querySelectorAll('#dtBody *')].every(n => { const r = n.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= innerWidth + 1); })), 'phone: no element pokes past the screen edge');
  await p.goBack(); await p.waitForTimeout(300);
  ok(!(await open(p)), 'phone: the back gesture closes the drawer');
  ok(merrs.length === 0, 'no errors on the phone ' + JSON.stringify(merrs));
  await ctx.close();

  // ---------- demo: sample data, no network ----------
  ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); p = await ctx.newPage(); const derrs = [], reqs = [];
  p.on('pageerror', e => derrs.push(e.message)); p.on('request', r => /\/api\/|\/login/.test(r.url()) && reqs.push(r.url()));
  await p.goto(HUB + '/demo?boot=0'); await p.waitForFunction(() => window.__hub && window.__hub.M && window.__hub.M.bots.length === 5, null, { timeout: 20000 });
  for (const id of ['chief-of-staff', 'inbox', 'social', 'fitness', 'finance']) {
    await p.evaluate(i => window.__hub.Detail.open(i), id); await p.waitForSelector('#dtBody .dt-sec', { timeout: 5000 });
    ok(await p.locator('#dtBody .dt-sec').count() >= 4 && (await p.textContent('#dtName')).length > 2, 'demo: ' + id + ' has a full drawer');
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  }
  ok(reqs.length === 0 && derrs.length === 0, 'demo: no API calls, no errors ' + JSON.stringify([reqs, derrs]));
  await ctx.close();

  // ---------- the API itself is private ----------
  const anon = await fetch(HUB + '/api/bots/fitness'); ok(anon.status === 401, 'the detail endpoint needs a login (HTTP ' + anon.status + ')');
  const asBot = await fetch(HUB + '/api/bots/fitness', { headers: { Authorization: 'Bearer ' + FITNESS_TOKEN } }); ok(asBot.status === 401 || asBot.status === 403, 'a bot token cannot read it (HTTP ' + asBot.status + ')');

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
