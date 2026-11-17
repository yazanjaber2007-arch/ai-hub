// Ambient (wall display) mode, demo data. Run through run-all.sh, or: HUB=http://localhost:8801 node tests/e2e/ambient.js
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch();
  const mk = async (opts = {}) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...opts }); await ctx.addInitScript(() => { try { localStorage.setItem('hub.core', '"2d"'); } catch (e) {} }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text())); return p; };

  // enter / leave, keys, privacy
  let p = await mk(); await p.goto(HUB + '/demo?boot=0'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => !window.__hub.Ambient.active), 'ambient starts inactive');
  await p.keyboard.press('a'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__hub.Ambient.active && document.body.classList.contains('ambient')), '"a" enters ambient');
  ok(await p.evaluate(() => document.getElementById('cw').parentElement.id === 'ambCore'), 'core canvas moved into the ambient stage');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('app')).display === 'none'), 'dashboard hidden while ambient');
  const text = await p.evaluate(() => document.getElementById('ambient').innerText);
  ok(!/Hosting Co|84\.20|18,420|Rent|balance/i.test(text), 'no finance detail in ambient text');
  ok(/Private item/.test(text), 'sensitive approval shown as "Private item"');
  ok(/Reply to Sam/.test(text) && /\d\d:\d\d:\d\d/.test(text), 'next-up shows title and a countdown');
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  ok(await p.evaluate(() => !window.__hub.Ambient.active && !document.body.classList.contains('ambient')), 'Escape leaves ambient');
  ok(await p.evaluate(() => { const cw = document.getElementById('cw'); return cw.parentElement.id === 'pCore' && cw.nextElementSibling.classList.contains('hello'); }), 'core canvas returned to its panel, before the greeting');
  ok(await p.evaluate(() => document.getElementById('ambient').hidden), 'ambient layer hidden after the fade');
  ok(await p.evaluate(() => { const r = document.getElementById('cw').getBoundingClientRect(); return r.width > 300 && r.height > 250; }), 'core has its normal size back');
  await p.keyboard.press('a'); await p.waitForTimeout(300); await p.keyboard.press('a'); await p.waitForTimeout(700);
  ok(await p.evaluate(() => !window.__hub.Ambient.active), '"a" toggles ambient off again');
  ok(p.errs.length === 0, 'no page errors (' + p.errs.join('|') + ')');

  // palette command, URL options
  p = await mk(); await p.goto(HUB + '/demo?boot=0'); await p.waitForTimeout(800);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200); await p.keyboard.type('ambient'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.__hub.Ambient.active), 'palette command enters ambient');
  p = await mk(); await p.goto(HUB + '/demo?ambient'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__hub.Ambient.active), '?ambient enters ambient on load');
  ok(await p.evaluate(() => !document.documentElement.classList.contains('booting') && !window.__hub.Boot.running), '?ambient skips the boot');
  p = await mk(); await p.goto(HUB + '/demo?boot=0#ambient'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__hub.Ambient.active), '#ambient enters ambient on load');

  // night dimming from local time, 24h clock
  const at = async (h, m) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addInitScript(() => { try { localStorage.setItem('hub.core', '"2d"'); } catch (e) {} }); const q = await c.newPage(); await q.clock.install({ time: new Date(2026, 10, 17, h, m, 0) }); await q.goto(HUB + '/demo?boot=0'); await q.waitForTimeout(500); await q.evaluate(() => window.__hub.Ambient.enter()); await q.clock.runFor(2500); return q; };
  p = await at(23, 30); ok(await p.evaluate(() => document.body.classList.contains('night')), 'night class at 23:30'); ok((await p.textContent('#ambTime')) === '23:30', 'clock reads 23:30');
  p = await at(12, 0); ok(await p.evaluate(() => !document.body.classList.contains('night')), 'no night class at noon');
  p = await at(0, 5); ok((await p.textContent('#ambTime')) === '00:05', 'midnight reads 00:05, not 24:05');

  // carousel, stale pill, exit button
  p = await mk(); await p.goto(HUB + '/demo?boot=0'); await p.waitForTimeout(800); await p.evaluate(() => window.__hub.Ambient.enter());
  const idx = () => p.evaluate(() => [...document.querySelectorAll('.acar .acard')].findIndex(c => c.classList.contains('on')));
  const i0 = await idx(); await p.waitForTimeout(9400); const i1 = await idx();
  ok(i0 === 0 && i1 === 1, 'carousel advances after 9s (' + i0 + ' -> ' + i1 + ')');
  await p.evaluate(() => window.__hub.Ambient.stale('offline')); ok(await p.evaluate(() => !document.getElementById('ambStale').hidden && /Connection lost/.test(document.getElementById('ambStale').textContent)), 'offline pill shows');
  await p.evaluate(() => window.__hub.App.setModel(window.__hub.M)); ok(await p.evaluate(() => document.getElementById('ambStale').hidden), 'pill clears when fresh data arrives');
  await p.mouse.move(300, 300); await p.waitForTimeout(400); ok(await p.evaluate(() => document.getElementById('ambient').classList.contains('ui')), 'movement shows the exit button');
  await p.click('#ambExit'); await p.waitForTimeout(700); ok(await p.evaluate(() => !window.__hub.Ambient.active), 'exit button leaves ambient');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
