// The 3D core: it draws, it verifies itself, and it falls back to the flat 2D core when it cannot.
// HUB=http://localhost:8801 node tests/e2e/core.js   (headless Chromium with software WebGL; slow but real)
const { chromium } = require('playwright');
const HUB = process.env.HUB || 'http://localhost:8801';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // 1. healthy GPU: 3D runs, the first frame is reported, a readback at the centre finds the core, nothing falls back
  let ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(HUB + '/demo?boot=0'); await p.waitForFunction(() => window.__hub && window.__hub.Core.holo, null, { timeout: 30000 });
  await p.waitForFunction(() => window.__hub.Core.holo.getStats().verified >= 0, null, { timeout: 90000, polling: 250 });
  const st = await p.evaluate(() => ({ ...window.__hub.Core.holo.getStats(), is3d: window.__hub.Core.is3d, settled: window.__hub.Core.settled }));
  ok(st.is3d && st.settled, '3D core runs and reports its first frame');
  ok(st.verified > 100, 'a readback at the centre finds the lit core (max channel ' + st.verified + ')');
  ok(st.intro >= 0.99, 'the intro had run its course before the readback (' + st.intro + ')');
  // premultiplied alpha: black stays transparent (no dark box behind the core inside the glass panel)
  const px = await p.evaluate(() => { const c = document.querySelector('#holo canvas'), gl = c.getContext('webgl2'); return { alpha: !!(gl && gl.getContextAttributes().alpha) }; });
  ok(px.alpha, 'canvas has an alpha channel (no blend mode needed)');
  ok(errs.length === 0, 'no errors ' + JSON.stringify(errs));
  await ctx.close();

  // 2. a GPU whose canvas silently draws nothing: readback is all zeros -> automatic fallback to 2D, remembered for the tab
  ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { const o = WebGL2RenderingContext.prototype.readPixels; WebGL2RenderingContext.prototype.readPixels = function (...a) { const r = o.apply(this, a); if (a[6] && a[6].fill) a[6].fill(0); return r; }; });
  p = await ctx.newPage(); await p.goto(HUB + '/demo?boot=0');
  await p.waitForFunction(() => window.__hub && window.__hub.Core.holo, null, { timeout: 30000 });
  await p.waitForFunction(() => !window.__hub.Core.is3d, null, { timeout: 90000, polling: 250 }).catch(() => {});
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !window.__hub.Core.is3d && !document.getElementById('cw').classList.contains('core3d')), 'blank 3D canvas: fell back to the 2D core');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('orbit')).opacity === '1'), 'blank 3D canvas: the 2D core is visible');
  ok(await p.evaluate(() => /drew nothing/.test(sessionStorage.getItem('hub.coreFail') || '')), 'the failure is remembered, so the next load goes straight to 2D');
  await ctx.close();

  // 3. phones keep the 2D core and never download the 3D bundle
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  p = await ctx.newPage(); const reqs = []; p.on('request', r => reqs.push(r.url())); await p.goto(HUB + '/demo?boot=0'); await p.waitForTimeout(2500);
  ok(!reqs.some(u => u.includes('hologram.js')), 'phone: the 3D bundle is never requested');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
