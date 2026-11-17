"use strict";
/* ============================================================
   Utilities shared by every module
   ============================================================ */
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad2 = v => String(v).padStart(2, "0");
const SVGNS = "http://www.w3.org/2000/svg";

const MODE = document.documentElement.dataset.mode || "preview";
const LIVE = MODE === "live";
const GUEST = MODE === "demo" ? (new URLSearchParams(location.search).get("name") || "").replace(/[^\p{L}\p{N} .'\-]/gu, "").trim().slice(0, 24) : "";
const MQ_REDUCE = matchMedia("(prefers-reduced-motion: reduce)");
const MQ_PHONE = matchMedia("(max-width:820px)");
const reduced = () => MQ_REDUCE.matches;
const IS_AUTOMATED = !!navigator.webdriver;   // headless test runs: no adaptive throttling, deterministic timing

const store = {
  get(k, d) { try { const v = localStorage.getItem("hub." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("hub." + k, JSON.stringify(v)); } catch (e) {} },
};
const tabStore = {
  get(k, d) { try { const v = sessionStorage.getItem("hub." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem("hub." + k, JSON.stringify(v)); } catch (e) {} },
};

/* tiny pub/sub so modules stay decoupled (sound listens to data events, the 3D core to hovers...) */
const bus = (() => {
  const m = new Map();
  return {
    on(e, f) { (m.get(e) || m.set(e, []).get(e)).push(f); },
    emit(e, d) { (m.get(e) || []).forEach(f => { try { f(d); } catch (x) { console.error("bus:" + e, x); } }); },
  };
})();

/* ---------- constants ---------- */
const PALETTE = ["#19d3ff", "#2ef2c8", "#8a7dff", "#7dff9a", "#ffb020", "#ff7ab6", "#ffd166"];
const GL = {
  hex: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8v8M8.5 10l7 4"/>',
  mail: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.6-.9-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.7 5 1.2 5 3.9 0 1.1-1.1 2-2.5 2-1.1 0-2-.4-2.6-1.3M12 6.5v11"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.6 3.4-5.4 7-5.4s6.4 1.8 7 5.4"/>',
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  dot: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>',
};
function glyphFor(name) {
  const n = String(name).toLowerCase();
  if (/chief|staff|exec|assist|stark/.test(n)) return GL.hex;
  if (/mail|inbox/.test(n)) return GL.mail;
  if (/social|growth|post|content|media/.test(n)) return GL.chat;
  if (/fit|health|gym|vital|body/.test(n)) return GL.pulse;
  if (/fin|money|bank|cash|budget/.test(n)) return GL.coin;
  if (/personal|home|life/.test(n)) return GL.user;
  if (/shop|store|commerce|orders/.test(n)) return GL.bag;
  return GL.dot;
}
const icon = (id, cls = "") => {
  const s = document.createElementNS(SVGNS, "svg"), u = document.createElementNS(SVGNS, "use");
  s.setAttribute("class", "ic " + cls); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#i-" + id); s.append(u); return s;
};
function glyphSvg(glyph, cls = "") {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); if (cls) s.setAttribute("class", cls);
  s.innerHTML = glyph;   // glyph strings are constants defined above, never data
  return s;
}

/* ---------- time + number formatting ---------- */
const ago = iso => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "now" : m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
};
const agoT = iso => { const a = ago(iso); return a === "now" ? "just now" : a === "never" ? "never" : a + " ago"; };
const span = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };
const hms = s => pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor(s % 3600 / 60)) + ":" + pad2(s % 60);
const hhmm = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });   // h23: midnight is 00:xx, not 24:xx
function parseWhen(at) {
  if (!at) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(at).trim());
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }
  const t = Date.parse(at); return isNaN(t) ? null : t;
}
const greeting = (d = new Date()) => { const h = d.getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

/* ---------- number tween: "$18,420.55" counts to "$18,512.00" without losing its format ---------- */
const NUM_RE = /^(\D*?)([+\-−]?)(\d[\d,]*)(\.\d+)?(.*)$/;
function parseNum(s) {
  const m = NUM_RE.exec(String(s)); if (!m) return null;
  const dec = m[4] ? m[4].length - 1 : 0;
  const val = parseFloat(m[3].replace(/,/g, "") + (m[4] || "")) * (m[2] === "-" || m[2] === "−" ? -1 : 1);
  return { pre: m[1], sign: m[2], val, dec, comma: m[3].indexOf(",") >= 0, post: m[5] };
}
function fmtNum(p, v) {
  let s = Math.abs(v).toFixed(p.dec);
  if (p.comma) { const [i, f] = s.split("."); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); }
  return p.pre + (v < 0 ? "-" : p.sign === "+" ? "+" : "") + s + p.post;
}
const _tweens = new WeakMap();
function setNumber(node, text, { ms = 760, from = null } = {}) {
  text = String(text);
  const prevText = node.dataset.v != null ? node.dataset.v : node.textContent;
  node.dataset.v = text;
  const old = _tweens.get(node); if (old) cancelAnimationFrame(old);
  if (prevText === text && node.textContent === text) return;
  const a = parseNum(from != null ? from : prevText), b = parseNum(text);
  const ok = a && b && a.pre === b.pre && a.post === b.post && a.dec === b.dec && a.val !== b.val && !reduced() && !document.hidden;
  if (!ok) { node.textContent = text; return; }
  const t0 = performance.now();
  const step = now => {
    const k = clamp((now - t0) / ms, 0, 1);
    node.textContent = k >= 1 ? text : fmtNum(b, lerp(a.val, b.val, ease.out(k)));
    if (k < 1) _tweens.set(node, requestAnimationFrame(step)); else _tweens.delete(node);
  };
  _tweens.set(node, requestAnimationFrame(step));
}

/* ---------- toast ---------- */
function toast(msg, ms = 2600) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), ms);
}
