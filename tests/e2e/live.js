// The live dashboard end to end: login gate, boot after login, ambient privacy, offline and expired-session handling.
// Needs the seeded test hub (run-all.sh starts it). HUB=http://localhost:8801 HUB_PASSWORD=... node tests/e2e/live.js
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801', PASSWORD = process.env.HUB_PASSWORD || 'demo-pass';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.core', '"2d"'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/40[13]|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errs.push('console ' + m.text()));

  await p.goto(HUB + '/command'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('login')).display === 'grid'), 'login shown when signed out');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('boot')).display === 'none' && !document.documentElement.classList.contains('booting')), 'boot overlay is not covering the login');
  await p.fill('#pw', 'wrong'); await p.click('#loginForm button'); await p.waitForTimeout(500);
  ok(/Wrong password/.test(await p.textContent('#loginMsg')), 'wrong password message');
  await p.fill('#pw', PASSWORD); await p.click('#loginForm button');
  await p.waitForFunction(() => window.__hub && (window.__hub.Boot.running || window.__hub.Boot.done), null, { timeout: 8000, polling: 20 }).catch(() => {});
  ok(await p.evaluate(() => window.__hub.Boot.running || window.__hub.Boot.done), 'boot plays after login');
  await p.waitForFunction(() => window.__hub.Boot.done, null, { timeout: 12000, polling: 50 }).catch(() => {});
  const marks = await p.evaluate(() => window.__hub.Boot.marks);
  ok(marks.reveal >= 1500 && marks.reveal < 3500 && marks.end > marks.reveal, 'boot timeline sane (reveal ' + marks.reveal + 'ms, end ' + marks.end + 'ms)');
  ok(await p.evaluate(() => !document.documentElement.classList.contains('booting') && !document.documentElement.classList.contains('reveal') && getComputedStyle(document.getElementById('boot')).display === 'none'), 'boot fully cleaned up');
  ok(/Good (morning|afternoon|evening), Mr\. Stark/.test(await p.textContent('#greet')), 'greeting names the owner');
  ok((await p.$$('#rosList .rb')).length === 5, '5 bots in the roster');
  const nm = await p.$$eval('#rosList .rb .nm', n => n.map(x => x.textContent).sort());
  ok(JSON.stringify(nm) === JSON.stringify(['Apollo', 'Atlas', 'Hermes', 'Midas', 'Zeus']), 'roster uses the god names ' + JSON.stringify(nm));
  await p.keyboard.press('Control+k'); await p.waitForTimeout(250); await p.keyboard.type('task zeus check the calendar'); await p.waitForTimeout(200);
  ok(/Give Zeus \(Chief of staff\) a task/.test(await p.textContent('#palList .pi.sel')), 'palette: "task zeus ..." finds the chief of staff by god name');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok((await p.textContent('#needN')) === '3', '3 approvals waiting');

  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !window.__hub.Boot.running && !document.documentElement.classList.contains('booting')), 'reload in the same tab skips the boot');

  // ambient: nothing from the sensitive (finance) bot
  await p.keyboard.press('a'); await p.waitForTimeout(800);
  const t = await p.evaluate(() => document.getElementById('ambient').innerText);
  ok(!/Hosting|84\.20|18,420|2,008|Pay the hosting/i.test(t), 'no finance detail anywhere in ambient');
  ok(/Private item/.test(t), 'finance approval shown as Private item');
  ok(/Reply to Sam \(deadline\)/.test(t), 'next up is the non-sensitive event (the sooner finance event is excluded)');
  ok(!/Pay the hosting invoice/.test(t) && /Reply to Sam before the noon deadline/.test(t), 'priorities exclude the finance bot, include the others');
  ok(/synced/i.test(t), 'sync status shown');

  await ctx.setOffline(true); await p.evaluate(() => refresh()); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !document.getElementById('ambStale').hidden && /Connection lost/.test(document.getElementById('ambStale').textContent)), 'offline pill in ambient');
  await ctx.setOffline(false); await p.evaluate(() => refresh()); await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.getElementById('ambStale').hidden), 'offline pill clears after reconnect');

  await ctx.clearCookies(); await p.evaluate(() => refresh()); await p.waitForTimeout(700);
  ok(await p.evaluate(() => /Session ended/.test(document.getElementById('ambStale').textContent) && getComputedStyle(document.getElementById('login')).display !== 'grid'), 'session-ended pill shown, no password box over the wall display');
  await p.click('#ambStale'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !window.__hub.Ambient.active && getComputedStyle(document.getElementById('login')).display === 'grid'), 'tapping the pill leaves ambient and shows sign-in');
  await p.fill('#pw', PASSWORD); await p.click('#loginForm button'); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('login')).display === 'none' && window.__hub.M.bots.length === 5), 'signed back in, data restored');
  ok(await p.evaluate(() => !window.__hub.Boot.running), 'no second boot after re-login in the same tab');

  // smoothness: idle refreshes must not touch the panels' DOM
  const counts = await p.evaluate(async () => {
    const c = {}; const mo = new MutationObserver(l => { for (const m of l) { const e = m.target.nodeType === 3 ? m.target.parentElement : m.target, box = e && e.closest && e.closest('.panel'); if (box) c[box.id] = (c[box.id] || 0) + 1; } });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'data-ago', 'data-until', 'title', 'aria-label', 'data-state'] });
    for (let i = 0; i < 3; i++) { await refresh(); await new Promise(r => setTimeout(r, 1200)); } mo.disconnect(); return c;
  });
  ok(Object.keys(counts).length === 0, 'idle refreshes cause no panel DOM mutations ' + JSON.stringify(counts));
  console.log('   errors:', JSON.stringify(errs)); ok(errs.length === 0, 'no console/page errors');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
