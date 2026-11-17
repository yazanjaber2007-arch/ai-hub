"use strict";
/* ============================================================
   Smoothness engine: change-gated panel renders, keyed list reconciliation,
   in-place time labels. Nothing is rebuilt unless its data really changed.
   ============================================================ */
const _sig = new Map();
function changed(name, value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (_sig.get(name) === s) return false;
  _sig.set(name, s); return true;
}

/* write only when different, so idle refreshes produce zero DOM mutations */
const setText = (n, t) => { t = String(t); if (n.textContent !== t) n.textContent = t; return n; };
const attr = (n, k, v) => { if (v == null || v === false) { if (n.hasAttribute(k)) n.removeAttribute(k); } else if (n.getAttribute(k) !== String(v)) n.setAttribute(k, v === true ? "" : v); return n; };
const css = (n, k, v) => { if (n.style.getPropertyValue(k) !== String(v)) n.style.setProperty(k, v); return n; };
const sensEl = (e, on) => { e.classList.toggle("sens", !!on); if (on) e.dataset.rev = ""; else delete e.dataset.rev; return e; };

function setEmpty(parent, text, show) {
  let e = parent.querySelector(":scope > .empty[data-empty]");
  if (show && !e) { e = el("div", "empty", text); e.dataset.empty = ""; parent.append(e); }
  else if (!show && e) e.remove();
  else if (show && e) setText(e, text);
}

/* rows leave with a height collapse instead of vanishing */
function removeRow(node) {
  if (reduced() || document.hidden || !node.isConnected) { node.remove(); return; }
  node.classList.add("leave");
  node.style.height = node.offsetHeight + "px";
  node.getBoundingClientRect();
  requestAnimationFrame(() => { node.style.height = "0px"; node.style.paddingTop = "0"; node.style.paddingBottom = "0"; node.style.borderWidth = "0"; });
  setTimeout(() => node.remove(), 380);
}

/* keyed list: reuse nodes by key, create what is new, move what changed place, animate what leaves */
function reconcile(parent, items, keyOf, make, patch) {
  const live = new Map();
  for (const c of Array.from(parent.children)) if (c.dataset.k != null && !c.classList.contains("leave")) live.set(c.dataset.k, c);
  const seen = new Set(); let cursor = null;
  const slot = () => { let n = cursor ? cursor.nextSibling : parent.firstChild; while (n && n.classList && n.classList.contains("leave")) n = n.nextSibling; return n; };
  items.forEach(it => {
    const k = String(keyOf(it)); seen.add(k);
    let node = live.get(k), fresh = false;
    if (!node) { node = make(it); node.dataset.k = k; fresh = true; }
    patch(node, it, fresh);
    const at = slot();
    if (at !== node) parent.insertBefore(node, at);
    if (fresh && App.ready && !reduced()) { node.classList.add("enter"); node.addEventListener("animationend", () => node.classList.remove("enter"), { once: true }); }
    cursor = node;
  });
  live.forEach((node, k) => { if (!seen.has(k)) removeRow(node); });
}

/* ---------- time labels that update in place ---------- */
function timeNode(n) {
  if (n.dataset.ago != null) {
    const iso = n.dataset.ago, pre = n.dataset.pre || "", t = pre + (n.dataset.mode === "t" ? agoT(iso) : ago(iso));
    if (n.textContent !== t) n.textContent = t;
  } else if (n.dataset.until != null) {
    const ms = +n.dataset.until - Date.now(), t = n.dataset.done === "1" ? "done" : ms > 30000 ? "in " + span(ms) : "now";
    if (n.textContent !== t) n.textContent = t;
  }
}
const tickTimes = () => $$("[data-ago],[data-until]").forEach(timeNode);
function agoEl(tag, cls, iso, { pre = "", mode = "plain" } = {}) {
  const e = el(tag, cls); setAgo(e, iso, { pre, mode }); return e;
}
function setAgo(e, iso, { pre = "", mode = "plain" } = {}) {
  attr(e, "data-ago", iso || ""); attr(e, "data-pre", pre || null); attr(e, "data-mode", mode); e.removeAttribute("data-until"); timeNode(e);
}
