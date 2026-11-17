// Keyboard, focus, reduced motion and tap targets. HUB=http://localhost:8801 node tests/e2e/a11y.js
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (opts, url) => { const ctx = await b.newContext(opts); await ctx.addInitScript(() => { try { if (!/reduce/.test(location.hash)) localStorage.setItem('hub.core', '"2d"'); } catch (e) {} }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text())); await p.goto(url); await p.waitForTimeout(1000); return p; };

  // dialogs: focus moves in, stays in, returns
  let p = await open({ viewport: { width: 1440, height: 900 } }, HUB + '/demo?boot=0');
  const active = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName + '.' + a.className) : 'none'; });
  await p.focus('#exec'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  ok((await active()) === 'briefClose', 'briefing: focus moves to Close');
  await p.keyboard.press('Tab'); ok((await active()) === 'briefClose', 'briefing: Tab stays inside the dialog');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150); ok((await active()) === 'exec', 'briefing: Escape returns focus to the opener');
  await p.focus('#palBtn'); await p.keyboard.press('Enter'); await p.waitForTimeout(250); ok((await active()) === 'palIn', 'palette: focus is in the input');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150); ok((await active()) === 'palBtn', 'palette: Escape returns focus to the opener');
  await p.focus('#ambBtn'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  ok((await active()) === 'ambExit' && await p.evaluate(() => getComputedStyle(document.getElementById('ambExit')).opacity === '1'), 'ambient: focus lands on a visible Exit button');
  await p.keyboard.press('Enter'); await p.waitForTimeout(700); ok((await active()) === 'ambBtn', 'ambient: leaving returns focus to the ambient button');
  ok(p.errs.length === 0, 'no errors (' + p.errs.join('|') + ')');

  // every control reachable, named and visibly focusable; text >= 12px
  const audit = await p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const bad = { noname: [], nofocus: [], small: [] };
    for (const e of document.querySelectorAll('button, input, [tabindex="0"]')) {
      if (!vis(e) || e.closest('#boot, #ambient, #pool, #login')) continue;
      if (!(e.getAttribute('aria-label') || e.textContent.trim() || e.getAttribute('placeholder'))) bad.noname.push(e.id || e.className);
      e.focus({ focusVisible: true }); const cs = getComputedStyle(e); if (!((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'))) bad.nofocus.push(e.id || e.className); e.blur();
    }
    for (const e of document.querySelectorAll('body *')) { if (!vis(e) || e.closest('#boot, #ambient, #pool, #login, svg')) continue; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (own && parseFloat(getComputedStyle(e).fontSize) < 11.9) bad.small.push(e.id || e.className); }
    return bad;
  });
  ok(audit.noname.length === 0, 'every control has an accessible name ' + JSON.stringify(audit.noname));
  ok(audit.nofocus.length === 0, 'every control shows a focus indicator ' + JSON.stringify(audit.nofocus));
  ok(audit.small.length === 0, 'no visible text under 12px ' + JSON.stringify(audit.small.slice(0, 5)));

  await p.context().close();
  // phone: 44px targets, no horizontal scroll
  p = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, HUB + '/demo?boot=0');
  const phone = await p.evaluate(() => { const small = []; for (const e of document.querySelectorAll('button, input')) { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || cs.display === 'none' || e.closest('#boot, #ambient, #pool, #login')) continue; if (r.width < 43.5 || r.height < 43.5) small.push((e.id || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return { small, hscroll: document.documentElement.scrollWidth > innerWidth }; });
  ok(phone.small.length === 0, 'phone: every control is at least 44px ' + JSON.stringify(phone.small));
  ok(!phone.hscroll, 'phone: no horizontal scroll');
  await p.context().close();

  // overflow sweep across widths
  for (const w of [320, 390, 768, 821, 1024, 1180, 1440, 1920]) {
    p = await open({ viewport: { width: w, height: 800 }, hasTouch: w <= 1100, isMobile: w <= 820 }, HUB + '/demo?boot=0');
    const r = await p.evaluate(() => { const W = innerWidth, bad = []; document.querySelectorAll('.top > *, .tools > *, .status > *, #tabs button').forEach(e => { const cs = getComputedStyle(e); if (cs.display === 'none') return; const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) bad.push(e.id || e.className); }); return { bad, h: document.documentElement.scrollWidth > W + 1 }; });
    ok(!r.h && r.bad.length === 0, 'no overflow at ' + w + 'px ' + JSON.stringify(r.bad));
    await p.context().close();
  }

  // reduced motion
  const rc = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const rp = await rc.newPage(); rp.errs = []; rp.on('pageerror', e => rp.errs.push(e.message));
  await rp.goto(HUB + '/demo'); await rp.waitForFunction(() => window.__hub && window.__hub.Core.holo, null, { timeout: 25000 }).catch(() => {}); await rp.waitForTimeout(1500);
  ok(await rp.evaluate(() => !document.documentElement.classList.contains('booting') && !window.__hub.Boot.running), 'reduced motion: no boot sequence');
  const st = await rp.evaluate(() => { const H = window.__hub.Core.holo; return H ? H.getStats() : null; });
  ok(st && st.intro === 1 && !st.introActive, 'reduced motion: the 3D core is fully formed at once');
  ok(await rp.evaluate(() => document.getAnimations().filter(x => x.playState === 'running' && x.effect && x.effect.getComputedTiming().iterations === Infinity).length === 0), 'reduced motion: no looping CSS animation runs');
  ok(rp.errs.length === 0, 'reduced motion: no errors');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
