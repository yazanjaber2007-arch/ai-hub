// The performance governor: full rate while you use it, half when idle, lower and quiet when left alone; modes; no always-on page costs.
// HUB=http://localhost:8801 node tests/e2e/perf.js
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(HUB + '/demo?boot=0'); await p.waitForFunction(() => window.__hub && window.__hub.Core.holo, null, { timeout: 30000 });
  const st = () => p.evaluate(() => ({ state: window.__hub.Perf.state, mode: window.__hub.Perf.mode, ...window.__hub.Core.holo.getStats(), lite: document.documentElement.classList.contains('lite'),
    loops: document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity).length }));

  await p.mouse.move(400, 400); await p.waitForTimeout(300);
  let s = await st(); ok(s.state === 'active' && s.cap === 60 && s.loops > 0, 'in use: full rate (cap ' + s.cap + '), decorative animations running (' + s.loops + ')');
  await p.evaluate(() => window.__hub.Perf.idleNow()); s = await st();
  ok(s.state === 'calm' && s.cap === 20 && s.loops === 0, 'left alone: calm, cap ' + s.cap + ', looping animations paused (' + s.loops + ' running)');
  await p.mouse.move(500, 450); await p.waitForTimeout(300); s = await st();
  ok(s.state === 'active' && s.cap === 60 && s.loops > 0, 'any movement wakes it at once (cap ' + s.cap + ', animations back: ' + s.loops + ')');

  await p.evaluate(() => window.__hub.Ambient.enter()); await p.waitForTimeout(600); await p.evaluate(() => window.__hub.Perf.idleNow()); s = await st();
  ok(s.state === 'idle' && s.cap <= 30 && s.loops > 0, 'wall display: never goes calm (state ' + s.state + ', cap ' + s.cap + ', animations still running)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);

  await p.evaluate(() => window.__hub.Perf.set('saver')); s = await st();
  ok(s.mode === 'saver' && s.lite && s.level === 2 && s.bloom === false, 'battery saver: lite page, bloom off, lower rates (cap ' + s.cap + ')');
  await p.evaluate(() => window.__hub.Perf.set('full')); await p.waitForTimeout(300); s = await st();
  ok(s.mode === 'full' && !s.lite && s.level === 0 && s.bloom === true, 'full quality: nothing stepped down');
  await p.evaluate(() => window.__hub.Perf.set('auto')); await p.waitForTimeout(200);
  ok((await st()).mode === 'auto', 'back to automatic');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(250); await p.keyboard.type('performance'); await p.waitForTimeout(200);
  ok((await p.$$('#palList .pi')).length === 3, 'palette offers the three performance modes');
  await p.keyboard.press('Escape');

  // nothing animates forever without a reason; the core's edge fade lives in the shader, not in a CSS mask
  const css = await p.evaluate(() => ({ drift: getComputedStyle(document.getElementById('bg'), '::after').animationName, mask: getComputedStyle(document.querySelector('#holo canvas')).maskImage, waveLayout: getComputedStyle(document.querySelector('.wave i')).animationName }));
  ok(css.drift === 'none', 'the background light no longer drifts forever (it forced every blurred panel to repaint each frame)');
  ok(css.mask === 'none', 'the 3D canvas has no CSS mask (a mask costs an extra pass every frame)');
  ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
