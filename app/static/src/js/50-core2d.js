"use strict";
/* ============================================================
   Core, 2D version: the flat orbit canvas. Used on phones, when WebGL is unavailable,
   and as the instant first paint while the 3D bundle loads.
   ============================================================ */
const Tip = {
  show(x, y, text) {
    const t = $("tip"); t.textContent = text; t.classList.add("on");
    const w = t.offsetWidth, cw = $("cw").clientWidth;
    t.style.left = clamp(x + 14, 6, cw - w - 6) + "px"; t.style.top = Math.max(6, y - 34) + "px";
  },
  hide() { $("tip").classList.remove("on"); },
};
const safeNote = b => (b.sens && document.body.classList.contains("priv")) ? "hidden (privacy on)" : (b.note || b.state);

const Core2D = (() => {
  const cv = $("orbit"), c = cv.getContext("2d");
  let W = 600, H = 380, DPR = 1, bots = [], hover = -1, hoverId = null, alert = false, running = false;
  const pulses = [], ripples = [], pos = [], SPD = [.16, -.12, .09, -.07, .05, -.045, .04];

  function resize() {
    const box = $("cw"), w = box.clientWidth || 600, h = box.clientHeight || Math.round(w * .66);
    DPR = Math.min(devicePixelRatio || 1, 2); W = w; H = h;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (!running) draw(performance.now());
  }
  function setBots(list) {
    const old = new Map(bots.map(b => [b.id, b])), n = list.length;
    bots = list.map((b, i) => { const o = old.get(b.id); return { ...b, rf: n <= 1 ? .62 : .34 + .66 * i / (n - 1), spd: o ? o.spd : SPD[i % 7], a: o ? o.a : i * 2.4 + .4 }; });
    if (!running) draw(performance.now());
  }
  const colorOf = b => b.state === "silent" ? "#ff5468" : b.state === "waiting" ? "#7b9db1" : b.color;

  function draw(ts) {
    const t = ts / 1000;
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
    const S = clamp(Math.min(W, H) / 400, 1, 2.2);                 // everything scales up on a big canvas (the wall display)
    const cx = W / 2, cy = H / 2, RX = W / 2 - 54 * S, RY = H / 2 - 40 * S;
    c.lineWidth = 1;
    bots.forEach(b => { c.strokeStyle = "rgba(25,211,255,.14)"; c.beginPath(); c.ellipse(cx, cy, RX * b.rf, RY * b.rf, 0, 0, 7); c.stroke(); });
    const items = bots.map((b, i) => { const an = b.a + b.spd * t; return { b, i, x: cx + Math.cos(an) * RX * b.rf, y: cy + Math.sin(an) * RY * b.rf, z: (Math.sin(an) + 1) / 2 }; });
    items.sort((a, b) => a.z - b.z); pos.length = 0;
    const lab = [];                                                  // labels are drawn last, on top of the glow, nudged apart
    const drawBot = it => {
      const silent = it.b.state === "silent", col = colorOf(it.b), r = (5 + 4 * it.z + (hoverId === it.b.id ? 3 : 0)) * S;
      c.strokeStyle = col; c.globalAlpha = (silent ? .5 + .3 * Math.sin(t * 6) : .3) * .6; c.lineWidth = 1; c.beginPath(); c.moveTo(it.x, it.y); c.lineTo(cx, cy); c.stroke(); c.globalAlpha = 1;
      const g = c.createRadialGradient(it.x, it.y, 0, it.x, it.y, r * 3.2); g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00"); c.fillStyle = g; c.beginPath(); c.arc(it.x, it.y, r * 3.2, 0, 7); c.fill();
      c.fillStyle = "#031018"; c.strokeStyle = col; c.lineWidth = 2 * Math.sqrt(S); c.beginPath(); c.arc(it.x, it.y, r, 0, 7); c.fill(); c.stroke();
      lab.push({ it, r });
      pos[it.i] = { x: it.x, y: it.y, r: r + 9, id: it.b.id };
    };
    items.filter(i => i.z < .5).forEach(drawBot);
    const cr = Math.min(W, H) * .12 * (1 + .04 * Math.sin(t * 1.6));
    ripples.forEach(r => { r.t += .016; c.strokeStyle = "rgba(25,211,255," + (.5 * (1 - r.t)) + ")"; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, cr + r.t * cr * 1.6, 0, 7); c.stroke(); });
    for (let k = ripples.length - 1; k >= 0; k--) if (ripples[k].t >= 1) ripples.splice(k, 1);
    const cg = c.createRadialGradient(cx - cr * .3, cy - cr * .3, 0, cx, cy, cr * 2.2);
    cg.addColorStop(0, "#d9f8ff"); cg.addColorStop(.25, alert ? "#ffb020" : "#19d3ff"); cg.addColorStop(.6, alert ? "#7a4a00" : "#0a5b86"); cg.addColorStop(1, "rgba(5,20,34,0)");
    c.fillStyle = cg; c.beginPath(); c.arc(cx, cy, cr * 2.2, 0, 7); c.fill();
    c.strokeStyle = "rgba(25,211,255,.5)"; c.lineWidth = 1; c.setLineDash([3, 5]); c.beginPath(); c.ellipse(cx, cy, cr * 1.5, cr * 1.5 * .48, t * .5, 0, 7); c.stroke(); c.setLineDash([]);
    items.filter(i => i.z >= .5).forEach(drawBot);
    pulses.forEach(p => {
      p.t += .014; const it = items.find(i => i.b.id === p.id); if (!it) { p.t = 2; return; }
      const x = it.x + (cx - it.x) * p.t, y = it.y + (cy - it.y) * p.t;
      c.fillStyle = "#fff"; c.shadowColor = it.b.color; c.shadowBlur = 14 * S; c.beginPath(); c.arc(x, y, 3 * S, 0, 7); c.fill(); c.shadowBlur = 0;
      if (p.t >= 1 && !p.done) { p.done = true; ripples.push({ t: 0 }); }
    });
    for (let k = pulses.length - 1; k >= 0; k--) if (pulses[k].t >= 1) pulses.splice(k, 1);
    // labels: nearest bots choose first; a label that would overlap another slides down instead; a dark halo keeps it readable over the glow
    c.textAlign = "center"; c.lineJoin = "round"; const placed = [];
    lab.sort((a, b) => b.it.z - a.it.z).forEach(({ it, r }) => {
      const fs = (10 + 2 * it.z) * S, text = it.b.id; c.font = "600 " + fs.toFixed(1) + "px 'JetBrains Mono',ui-monospace,Menlo,monospace";
      const w = c.measureText(text).width + 8 * S, h = fs * 1.2; let y = it.y + r + 15 * S;
      for (let k = 0; k < 5; k++) { const x0 = it.x - w / 2, y0 = y - fs, hit = placed.some(p => x0 < p.x1 && x0 + w > p.x0 && y0 < p.y1 && y0 + h > p.y0); if (!hit) break; y += h + 2 * S; }
      placed.push({ x0: it.x - w / 2, x1: it.x + w / 2, y0: y - fs, y1: y - fs + h });
      c.lineWidth = 3 * S; c.strokeStyle = "rgba(3,10,18,.85)"; c.strokeText(text, it.x, y);
      c.fillStyle = hoverId === it.b.id ? "#fff" : "rgba(219,244,255,.9)"; c.fillText(text, it.x, y);
    });
  }
  const loop = ts => { if (running) { draw(ts); requestAnimationFrame(loop); } };
  const api = {
    resize, setBots,
    pulse(id) { if (reduced()) return; pulses.push({ id, t: 0 }); },
    setAlert(a) { alert = !!a; if (!running) draw(performance.now()); },
    setHover(id) { hoverId = id; if (!running) draw(performance.now()); },
    start() { if (running || reduced()) { if (reduced()) draw(performance.now()); return; } running = true; requestAnimationFrame(loop); },
    stop() { running = false; },
  };
  const hit = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return { x, y, p: pos.find(p => p && Math.hypot(p.x - x, p.y - y) < p.r) }; };
  cv.addEventListener("pointermove", e => {
    const { x, y, p } = hit(e), id = p ? p.id : null;
    if (id !== hoverId) { hoverId = id; bus.emit("hover", id); }
    cv.style.cursor = p ? "pointer" : "default";
    if (p) { const b = bots.find(b => b.id === id); Tip.show(x, y, id + " · " + safeNote(b)); } else Tip.hide();
  });
  cv.addEventListener("pointerleave", () => { hoverId = null; bus.emit("hover", null); Tip.hide(); });
  cv.addEventListener("click", e => { const { p } = hit(e); if (p) bus.emit("select", p.id); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (running) { api._was = true; running = false; } } else if (api._was) { api._was = false; api.start(); } });
  return api;
})();
