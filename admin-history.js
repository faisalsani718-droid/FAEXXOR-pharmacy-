// @ts-nocheck
// FAEXXOR Pharmacy - Admin: History (completed orders and prescriptions)
// Needs <div id="historyAdmin"></div> in admin-dashboard.html.
// READ-ONLY: this file never writes, changes or deletes anything in Firestore.
(function () {
  "use strict";

  var host = document.getElementById("historyAdmin");
  if (!host) return;
  if (typeof firebase === "undefined" || !firebase.firestore || !firebase.auth) {
    host.textContent = "Firebase did not load. History is unavailable.";
    return;
  }
  var fdb = firebase.firestore();
  var section = document.getElementById("historySection");

  var PAGE = 30;
  var KINDS = {
    orders: { label: "Orders", col: "orders", statuses: ["delivered", "rejected", "cancelled"] },
    rx: { label: "Prescriptions", col: "prescriptions", statuses: ["delivered", "rejected", "cancelled", "customer_declined"] }
  };
  var RX_LABEL = { delivered: "Delivered", rejected: "Rejected (not available)", cancelled: "Cancelled", customer_declined: "Customer declined" };
  var ORDER_LABEL = { delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled" };

  function fresh() { return { items: [], last: null, done: false, loading: false, error: null, loaded: false }; }
  var state = { orders: fresh(), rx: fresh() };
  var kind = "orders";
  var started = false;
  var ui = {};

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function naira(n) { return "\u20A6" + Number(n || 0).toLocaleString(); }
  function when(ts) {
    try {
      return ts && ts.toDate
        ? ts.toDate().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "-";
    } catch (e) { return "-"; }
  }
  function row(parent, name, value) {
    var p = el("p");
    p.appendChild(el("strong", null, name + ": "));
    p.appendChild(document.createTextNode(value === undefined || value === null || value === "" ? "-" : String(value)));
    parent.appendChild(p);
  }
  function shortId(prefix, id) { return prefix + String(id).slice(-6).toUpperCase(); }

  function addStyles() {
    if (document.getElementById("fxhStyles")) return;
    var s = el("style");
    s.id = "fxhStyles";
    s.textContent =
      ".fxh-seg{display:flex;background:#e6eef9;border-radius:12px;padding:4px;margin-bottom:12px}" +
      ".fxh-seg button{flex:1;border:0;background:none;padding:11px 8px;border-radius:9px;font-weight:700;color:#0b4a9e;cursor:pointer;font-size:.95rem;font-family:inherit;width:auto!important;margin:0}" +
      ".fxh-seg button.on{background:#0b4a9e;color:#fff}" +
      ".fxh-search{width:100%;padding:13px 14px;border:0;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);font-size:1rem;margin-bottom:10px;font-family:inherit;background:#fff}" +
      ".fxh-search:focus{outline:2px solid #04a0e0}" +
      ".fxh-sum{font-size:.88rem;color:#55677a;margin:0 0 10px}" +
      ".fxh-grid{display:grid;grid-template-columns:1fr;gap:12px}" +
      "@media(min-width:760px){.fxh-grid{grid-template-columns:1fr 1fr}}" +
      ".fxh-card{background:#fff;border-radius:14px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.08)}" +
      ".fxh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px}" +
      ".fxh-top h3{margin:0;font-size:1rem;color:#0b4a9e;word-break:break-all}" +
      ".fxh-badge{border-radius:999px;padding:3px 10px;font-size:.76rem;font-weight:800;white-space:nowrap}" +
      ".fxh-badge.ok{background:#e3f6ea;color:#1b6b3d}.fxh-badge.bad{background:#fbe6e8;color:#a12a35}.fxh-badge.mid{background:#e4e8ee;color:#44546a}" +
      ".fxh-card p{margin:3px 0;font-size:.92rem}" +
      ".fxh-more{border:0;border-radius:10px;background:#e6eef9;color:#0b4a9e;font-weight:700;padding:10px 14px;margin-top:10px;cursor:pointer;font-family:inherit;width:auto!important}" +
      ".fxh-det{margin-top:8px;padding-top:8px;border-top:1px solid #eef2f7}" +
      ".fxh-det h4{margin:8px 0 4px;font-size:.9rem;color:#33475b}" +
      ".fxh-btn{display:block;width:100%!important;border:0;border-radius:12px;background:#0b4a9e;color:#fff;font-weight:700;padding:13px;margin-top:14px;cursor:pointer;font-size:1rem;font-family:inherit}" +
      ".fxh-btn.light{background:#e6eef9;color:#0b4a9e}.fxh-btn:disabled{opacity:.5;cursor:not-allowed}" +
      ".fxh-empty{background:#fff;border-radius:14px;padding:24px 16px;text-align:center;color:#55677a;box-shadow:0 2px 8px rgba(0,0,0,.05)}" +
      ".fxh-err{background:#fbe6e8;color:#a12a35;border-radius:12px;padding:14px;font-size:.92rem;line-height:1.5}" +
      ".fxh-err a{color:#0b4a9e;font-weight:700;word-break:break-all}";
    document.head.appendChild(s);
  }

  /* ---------- loading (read only) ---------- */
  async function load(k, reset) {
    var s = state[k];
    if (s.loading) return;
    if (reset) { s.items = []; s.last = null; s.done = false; s.error = null; }
    s.loading = true;
    render();
    try {
      var q = fdb.collection(KINDS[k].col).where("status", "in", KINDS[k].statuses).orderBy("createdAt", "desc");
      if (s.last) q = q.startAfter(s.last);
      var snap = await q.limit(PAGE).get();
      snap.docs.forEach(function (d) { s.items.push({ id: d.id, d: d.data() }); });
      if (snap.docs.length) s.last = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE) s.done = true;
      s.loaded = true;
    } catch (e) {
      console.error("History load failed:", e);
      s.error = e;
    }
    s.loading = false;
    render();
  }

  /* ---------- cards ---------- */
  function badge(text, tone) { return el("span", "fxh-badge " + tone, text); }

  function orderCard(r) {
    var o = r.d, st = String(o.status || "");
    var card = el("div", "fxh-card");
    var top = el("div", "fxh-top");
    top.appendChild(el("h3", null, shortId("FX-", r.id)));
    top.appendChild(badge(ORDER_LABEL[st] || st.toUpperCase(), st === "delivered" ? "ok" : (st === "rejected" ? "bad" : "mid")));
    card.appendChild(top);
    row(card, "Customer", o.name);
    row(card, "Phone", o.phone);
    row(card, "Total", naira(o.totalPrice));
    row(card, "Payment", o.paymentMethod);
    row(card, "Ordered", when(o.createdAt));
    var doneAt = st === "delivered" ? o.deliveredAt : (st === "rejected" ? o.rejectedAt : o.cancelledAt);
    if (doneAt) row(card, st === "delivered" ? "Delivered" : "Closed", when(doneAt));
    if (st === "delivered") row(card, "Customer confirmed", o.customerConfirmed ? "Yes - " + when(o.customerConfirmedAt) : "Not yet");

    var det = el("div", "fxh-det");
    det.hidden = true;
    row(det, "Order ID", r.id);
    row(det, "Delivery address", o.address || o.deliveryAddress);
    if (o.paymentStatus) row(det, "Payment status", o.paymentStatus);
    if (o.riderName) row(det, "Rider", o.riderName + (o.riderPhone ? " (" + o.riderPhone + ")" : ""));
    if (o.estimatedDelivery) row(det, "Estimated delivery", o.estimatedDelivery);
    det.appendChild(el("h4", null, "Items"));
    var groups = {}, order = [];
    (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
      var name = it.name || it.medicineName || it.title || it.productName || "Item";
      var q = Number(it.quantity !== undefined ? it.quantity : (it.qty !== undefined ? it.qty : 1)) || 1;
      if (!groups[name]) { groups[name] = { n: 0, price: Number(it.price) || 0 }; order.push(name); }
      groups[name].n += q;
    });
    if (!order.length) det.appendChild(el("p", null, "-"));
    order.forEach(function (n) {
      det.appendChild(el("p", null, n + " x" + groups[n].n + " - " + naira(groups[n].price * groups[n].n)));
    });
    card.appendChild(det);

    var more = el("button", "fxh-more", "Show details");
    more.type = "button";
    more.addEventListener("click", function () {
      det.hidden = !det.hidden;
      more.textContent = det.hidden ? "Show details" : "Hide details";
    });
    card.appendChild(more);
    return card;
  }

  function rxCard(r) {
    var d = r.d, st = String(d.status || "");
    var card = el("div", "fxh-card");
    var top = el("div", "fxh-top");
    top.appendChild(el("h3", null, shortId("RX-", r.id)));
    top.appendChild(badge(RX_LABEL[st] || st, st === "delivered" ? "ok" : (st === "rejected" || st === "customer_declined" ? "bad" : "mid")));
    card.appendChild(top);
    row(card, "Customer", d.customerDisplayName);
    row(card, "Phone", d.phone);
    row(card, "Submitted", when(d.createdAt));
    if (d.quotationAmount != null) row(card, "Quotation", naira(d.quotationAmount));
    if (d.acceptedAmount != null) row(card, "Customer agreed to pay", naira(d.acceptedAmount));
    row(card, "Last updated", when(d.updatedAt));

    var det = el("div", "fxh-det");
    det.hidden = true;
    row(det, "Prescription ID", r.id);
    row(det, "Delivery address", d.deliveryAddress);
    if (d.customerNotes) row(det, "Customer notes", d.customerNotes);
    if (d.customerReply) row(det, "Customer reply", d.customerReply);
    if (d.adminNote) row(det, "Your last note", d.adminNote);
    card.appendChild(det);

    var more = el("button", "fxh-more", "Show details");
    more.type = "button";
    more.addEventListener("click", function () {
      det.hidden = !det.hidden;
      more.textContent = det.hidden ? "Show details" : "Hide details";
    });
    card.appendChild(more);
    return card;
  }

  /* ---------- screen ---------- */
  function build() {
    host.innerHTML = "";
    addStyles();

    var seg = el("div", "fxh-seg");
    ui.segBtns = {};
    Object.keys(KINDS).forEach(function (k) {
      var b = el("button", null, KINDS[k].label);
      b.type = "button";
      b.addEventListener("click", function () {
        kind = k;
        if (!state[k].loaded && !state[k].loading) load(k, true); else render();
      });
      ui.segBtns[k] = b;
      seg.appendChild(b);
    });
    host.appendChild(seg);

    ui.search = el("input", "fxh-search");
    ui.search.type = "search";
    ui.search.placeholder = "Search name, phone or order number...";
    ui.search.addEventListener("input", render);
    host.appendChild(ui.search);

    ui.sum = el("p", "fxh-sum");
    host.appendChild(ui.sum);
    ui.list = el("div", "fxh-grid");
    host.appendChild(ui.list);
    ui.foot = el("div");
    host.appendChild(ui.foot);
  }

  function matches(r, term) {
    if (!term) return true;
    var o = r.d;
    var hay = [r.id, shortId("FX-", r.id), shortId("RX-", r.id), o.name, o.customerDisplayName, o.phone, o.status, o.address, o.deliveryAddress, o.paymentMethod]
      .map(function (x) { return String(x || "").toLowerCase(); }).join(" ");
    return hay.indexOf(term) !== -1;
  }

  function render() {
    if (!ui.list) return;
    var s = state[kind];
    Object.keys(ui.segBtns).forEach(function (k) { ui.segBtns[k].className = k === kind ? "on" : ""; });

    var term = ui.search.value.trim().toLowerCase();
    var shown = s.items.filter(function (r) { return matches(r, term); });

    ui.list.innerHTML = "";
    ui.foot.innerHTML = "";
    ui.sum.textContent = "";

    if (s.error) {
      var box = el("div", "fxh-err");
      var e = s.error;
      if (e && e.code === "failed-precondition") {
        box.appendChild(el("strong", null, "One-time setup needed. "));
        box.appendChild(document.createTextNode("Firebase needs an index for this list. Tap the link, press Create index, wait a few minutes until it is ready, then reload this page."));
        var m = /https:\/\/console\.firebase\.google\.com[^\s"')]*/.exec(String(e.message || ""));
        if (m) {
          box.appendChild(document.createElement("br"));
          var a = el("a", null, "Create the index");
          a.href = m[0]; a.target = "_blank"; a.rel = "noopener";
          box.appendChild(a);
        }
      } else if (e && e.code === "permission-denied") {
        box.textContent = "Permission denied. Make sure you are logged in as admin and the Firestore rules are published.";
      } else {
        box.textContent = "Could not load history. " + ((e && (e.code || e.message)) || "");
      }
      ui.list.appendChild(box);
      var retry = el("button", "fxh-btn light", "Try again");
      retry.type = "button";
      retry.addEventListener("click", function () { load(kind, true); });
      ui.foot.appendChild(retry);
      return;
    }

    if (s.loading && !s.items.length) { ui.list.appendChild(el("div", "fxh-empty", "Loading...")); return; }

    if (!s.items.length) {
      ui.list.appendChild(el("div", "fxh-empty", kind === "orders"
        ? "No completed orders yet. Delivered and rejected orders appear here."
        : "No completed prescriptions yet. Delivered, rejected, cancelled and declined ones appear here."));
    } else if (!shown.length) {
      ui.list.appendChild(el("div", "fxh-empty", "No records match your search."));
    } else {
      shown.forEach(function (r) { ui.list.appendChild(kind === "orders" ? orderCard(r) : rxCard(r)); });
    }

    if (s.items.length) {
      var txt = shown.length + " of " + s.items.length + " loaded";
      if (kind === "orders") {
        var del = shown.filter(function (r) { return r.d.status === "delivered"; });
        var sum = del.reduce(function (t, r) { return t + (Number(r.d.totalPrice) || 0); }, 0);
        txt += "  |  Delivered: " + del.length + " orders, " + naira(sum);
      }
      ui.sum.textContent = txt;
    }

    if (!s.done && s.items.length) {
      var more = el("button", "fxh-btn", s.loading ? "Loading..." : "Load more");
      more.type = "button";
      more.disabled = s.loading;
      more.addEventListener("click", function () { load(kind, false); });
      ui.foot.appendChild(more);
    }
    var rf = el("button", "fxh-btn light", "Refresh");
    rf.type = "button";
    rf.disabled = s.loading;
    rf.addEventListener("click", function () { load(kind, true); });
    ui.foot.appendChild(rf);
  }

  /* ---------- start (admins only) ---------- */
  function visible() { return !section || !section.hidden; }
  function start() {
    if (started) return;
    started = true;
    build();
    render();
    if (visible()) load(kind, true);
    // refresh every time the History tab is opened
    var tab = document.querySelector('.tab[data-tab="history"]');
    if (tab) tab.addEventListener("click", function () {
      state.orders.loaded = false;   // both lists are re-read the next time they are shown
      state.rx.loaded = false;
      load(kind, true);
    });
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) return;
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin") start();
    } catch (e) { console.error("History: admin check failed", e); }
  });
})();
