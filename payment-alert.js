// payment-alert.js - shows a "Payment successful" message at the top of the customer's screen
// as soon as the admin confirms a bank transfer. Works on checkout, home and My Orders pages.
// SAFETY: everything is inside try/catch. If anything fails, nothing happens and the website works as before.
(function () {
  "use strict";
  try {
    if (window.__fxPayAlert) return;
    window.__fxPayAlert = true;

    var KEY = "fx_watch_pay_v1";      // orders this phone is waiting to see paid
    var shown = {}, unsubs = {}, uid = null, hideTimer = null;

    function readList() {
      try {
        var a = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(a) ? a.filter(function (s) { return typeof s === "string" && /^[A-Za-z0-9]{10,40}$/.test(s); }).slice(-10) : [];
      } catch (e) { return []; }
    }
    function writeList(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-10))); } catch (e) {} }
    function money(n) { return "\u20A6" + Number(n || 0).toLocaleString("en-NG"); }
    function isPaid(o) {
      var ps = String(o && o.paymentStatus || "").toLowerCase();
      return ps === "paid" || ps === "success" || ps === "successful" || (o && o.paymentConfirmed === true);
    }
    function totalOf(o) {
      var t = 0;
      (Array.isArray(o.items) ? o.items : []).forEach(function (it) { t += (Number(it.price) || 0) * (Number(it.quantity !== undefined ? it.quantity : it.qty) || 1); });
      return t || Number(o.totalPrice) || 0;
    }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    /* ---------- the banner ---------- */
    function addStyles() {
      if (document.getElementById("fxPayAlertCss")) return;
      var s = document.createElement("style");
      s.id = "fxPayAlertCss";
      s.textContent =
        ".fxpa{position:fixed;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top,0px));max-width:480px;margin:0 auto;z-index:2500;" +
        "display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;color:#fff;" +
        "background:linear-gradient(90deg,#1f9d55,#2fbf71);box-shadow:0 10px 30px rgba(0,0,0,.28);" +
        "font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;transform:translateY(-140%);transition:transform .45s cubic-bezier(.2,.9,.3,1.1)}" +
        ".fxpa.in{transform:translateY(0)}" +
        ".fxpa .ic{flex:none;width:38px;height:38px;border-radius:50%;background:#fff;color:#1f9d55;display:grid;place-items:center;font-size:1.3rem;font-weight:800}" +
        ".fxpa .tx{flex:1;min-width:0;line-height:1.3}" +
        ".fxpa .tx b{display:block;font-size:1rem}" +
        ".fxpa .tx span{display:block;font-size:.84rem;opacity:.95;word-break:break-word}" +
        ".fxpa a{flex:none;background:#fff;color:#137a3d;text-decoration:none;font-weight:800;font-size:.82rem;padding:8px 11px;border-radius:10px}" +
        ".fxpa .x{flex:none;border:0;background:rgba(255,255,255,.22);color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:.9rem;padding:0}" +
        "@media (prefers-reduced-motion:reduce){.fxpa{transition:none}}";
      document.head.appendChild(s);
    }
    function banner(id, o) {
      if (shown[id]) return;
      shown[id] = true;
      addStyles();
      var old = document.querySelector(".fxpa"); if (old) old.remove();
      var b = el("div", "fxpa");
      b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite");
      b.appendChild(el("div", "ic", "\u2713"));
      var tx = el("div", "tx");
      tx.appendChild(el("b", null, "Payment successful"));
      tx.appendChild(el("span", null, "Order FX-" + String(id).slice(-6).toUpperCase() + " \u00B7 " + money(totalOf(o)) + " received. Thank you!"));
      b.appendChild(tx);
      var a = el("a", null, "Receipt"); a.href = "receipt.html?id=" + encodeURIComponent(id);
      b.appendChild(a);
      var x = el("button", "x", "\u2715"); x.type = "button"; x.setAttribute("aria-label", "Close");
      x.addEventListener("click", function () { b.classList.remove("in"); setTimeout(function () { b.remove(); }, 500); });
      b.appendChild(x);
      document.body.appendChild(b);
      void b.offsetWidth;
      b.classList.add("in");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { b.classList.remove("in"); setTimeout(function () { b.remove(); }, 500); }, 12000);
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
    }

    /* ---------- watching orders that are waiting for payment confirmation ---------- */
    function drop(id) {
      writeList(readList().filter(function (x) { return x !== id; }));
      if (unsubs[id]) { try { unsubs[id](); } catch (e) {} delete unsubs[id]; }
    }
    function watch(id) {
      if (!uid || unsubs[id]) return;
      unsubs[id] = firebase.firestore().collection("orders").doc(id).onSnapshot(function (s) {
        if (!s.exists) { drop(id); return; }
        var o = s.data() || {};
        if (o.customerId !== uid) { drop(id); return; }
        if (isPaid(o)) { banner(id, o); drop(id); return; }
        if (String(o.status || "").toLowerCase().indexOf("reject") === 0) drop(id);
      }, function () { drop(id); });
    }

    // used by checkout.html right after a transfer order is placed
    window.fxWatchPayment = function (id) {
      try {
        if (typeof id !== "string" || !id) return;
        var l = readList(); if (l.indexOf(id) < 0) { l.push(id); writeList(l); }
        watch(id);
      } catch (e) { console.error("Payment alert:", e); }
    };
    // used by orders.html when it sees an order turn paid
    window.fxShowPaid = function (id, o) { try { banner(id, o || {}); drop(id); } catch (e) { console.error("Payment alert:", e); } };

    function init() {
      if (typeof firebase === "undefined" || !firebase.auth || !firebase.apps || !firebase.apps.length) return;
      firebase.auth().onAuthStateChanged(function (u) {
        var now = u && !u.isAnonymous ? u.uid : null;
        if (now !== uid) {
          Object.keys(unsubs).forEach(function (k) { try { unsubs[k](); } catch (e) {} delete unsubs[k]; });
          uid = now;
        }
        if (uid) readList().forEach(watch);
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  } catch (e) {
    console.error("Payment alert could not start (website is unaffected):", e);
  }
})();
