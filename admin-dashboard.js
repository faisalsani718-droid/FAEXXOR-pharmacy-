// @ts-nocheck
// FAEXXOR Pharmacy - Admin: Active Orders (rebuilt)
// Shows live orders, with View order / Accept / Reject and the next delivery steps.
// Uses the same status names as orders.html and admin-history.js:
//   pending -> accepted -> packaging -> out_for_delivery -> delivered   (or rejected)
// Needs <div id="pendingOrdersList"> and <div id="orderDetailsBox"> in admin-dashboard.html.
(function () {
  "use strict";

  var list = document.getElementById("pendingOrdersList");
  var box = document.getElementById("orderDetailsBox");
  if (!list || !box) return;

  function note(text) {
    list.innerHTML = "";
    var p = document.createElement("p");
    p.textContent = text;
    list.appendChild(p);
  }
  if (typeof firebase === "undefined" || !firebase.firestore || !firebase.auth) {
    note("Firebase did not load. Orders are unavailable.");
    return;
  }

  var fdb = firebase.firestore();
  var TS = firebase.firestore.FieldValue.serverTimestamp;

  var FINAL = { delivered: 1, rejected: 1, cancelled: 1 };
  var LABEL = { pending: "Pending", accepted: "Accepted", packaging: "Packaging",
    out_for_delivery: "Out for delivery", delivered: "Delivered", rejected: "Rejected", cancelled: "Cancelled" };
  var NEXT = {
    pending: { to: "accepted", label: "Accept" },
    accepted: { to: "packaging", label: "Start packing" },
    packaging: { to: "out_for_delivery", label: "Out for delivery" },
    out_for_delivery: { to: "delivered", label: "Mark delivered" }
  };
  var ALIAS = {
    pending: "pending", accept: "accepted", accepted: "accepted",
    packing: "packaging", packed: "packaging", packaging: "packaging",
    "out for delivery": "out_for_delivery", out_for_delivery: "out_for_delivery",
    "on delivery": "out_for_delivery", shipped: "out_for_delivery",
    delivered: "delivered", reject: "rejected", rejected: "rejected",
    cancelled: "cancelled", canceled: "cancelled"
  };

  var docs = [], unsub = null, started = false, firstLoad = true;
  var seenIds = {}, viewId = null, viewStatus = null, toast = null, toastTimer = null;

  /* ---------- helpers ---------- */
  function el(tag, text, css) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  }
  function norm(s) {
    if (s === undefined || s === null || String(s).trim() === "") return "pending";
    var k = String(s).trim().toLowerCase().replace(/[\s-]+/g, " ");
    return ALIAS[k] || ALIAS[k.replace(/ /g, "_")] || "pending";
  }
  function naira(n) { return "\u20A6" + Number(n || 0).toLocaleString(); }
  function when(ts) {
    try { return ts && ts.toDate ? ts.toDate().toLocaleString() : ""; } catch (e) { return ""; }
  }
  function shortId(id) { return "FX-" + String(id).slice(-6).toUpperCase(); }
  function say(text, ok) {
    if (!toast) { toast = el("div"); toast.setAttribute("role", "status"); document.body.appendChild(toast); }
    toast.hidden = false;
    toast.textContent = text;
    toast.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:92vw;z-index:3000;padding:12px 16px;border-radius:12px;font-weight:700;font-size:.92rem;box-shadow:0 6px 20px rgba(0,0,0,.25);color:#fff;background:" + (ok ? "#1b6b3d" : "#a12a35");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (toast) toast.hidden = true; }, ok ? 3500 : 9000);
  }
  function explain(e) {
    console.error("Order error:", e);
    if (e && e.code === "permission-denied") return "Not allowed (permission-denied). Check you are logged in as admin and the orders rules are published.";
    return "Could not complete this. " + ((e && (e.code || e.message)) || "");
  }
  function find(id) { for (var i = 0; i < docs.length; i++) if (docs[i].id === id) return docs[i]; return null; }

  /* ---------- actions ---------- */
  async function setStatus(btn, d, to, okText) {
    btn.disabled = true;
    var ch = { status: to };
    ch[to + "At"] = TS();
    try {
      await fdb.collection("orders").doc(d.id).update(ch);
      say(okText, true);
    } catch (e) {
      say(explain(e), false);
      btn.disabled = false;
    }
  }

  /* ---------- order details ---------- */
  function line(parent, a, b) {
    if (b === undefined || b === null || b === "") return;
    var p = el("p");
    p.appendChild(el("strong", a + ": "));
    p.appendChild(document.createTextNode(String(b)));
    parent.appendChild(p);
  }

  function openDetails(d, quiet) {
    var o = d.data, st = norm(o.status);
    viewId = d.id; viewStatus = st;
    box.innerHTML = "";
    var c = el("div", null, "background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.08)");
    c.appendChild(el("h3", "Order details - " + shortId(d.id), "margin:0 0 8px;font-size:1rem"));
    line(c, "Status", LABEL[st] || st);
    line(c, "Customer", o.name);
    line(c, "Phone", o.phone);
    line(c, "Address", o.address || o.deliveryAddress);
    line(c, "Payment", o.paymentMethod);
    line(c, "Ordered", when(o.createdAt));
    c.appendChild(el("h4", "Items", "margin:12px 0 6px"));
    var groups = {}, order = [];
    (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
      var name = it.name || it.medicineName || it.title || it.productName || "Item";
      var q = Number(it.quantity !== undefined ? it.quantity : (it.qty !== undefined ? it.qty : 1)) || 1;
      if (!groups[name]) { groups[name] = { n: 0, price: Number(it.price) || 0 }; order.push(name); }
      groups[name].n += q;
    });
    if (!order.length) c.appendChild(el("p", "-"));
    order.forEach(function (n) {
      c.appendChild(el("p", n + " x" + groups[n].n + " - " + naira(groups[n].price * groups[n].n)));
    });
    c.appendChild(el("p", "Total: " + naira(o.totalPrice), "font-weight:700;margin-top:8px"));

    if (st === "accepted" || st === "packaging" || st === "out_for_delivery") {
      c.appendChild(el("h4", "Delivery rider (shown to the customer)", "margin:14px 0 6px"));
      var f = {};
      [["riderName", "Rider name", 60], ["riderPhone", "Rider phone", 30], ["estimatedDelivery", "Estimated delivery (e.g. 30 minutes)", 60]].forEach(function (x) {
        var i = el("input", null, "width:100%;box-sizing:border-box;padding:11px;border:1px solid #c9d6e6;border-radius:10px;font-size:1rem;margin:4px 0");
        i.type = "text"; i.placeholder = x[1]; i.maxLength = x[2];
        i.value = typeof o[x[0]] === "string" ? o[x[0]] : "";
        f[x[0]] = i; c.appendChild(i);
      });
      var save = el("button", "Save rider details", "border:0;border-radius:8px;padding:10px 14px;margin:8px 8px 0 0;font-weight:600;cursor:pointer;background:#0b4a9e;color:#fff");
      save.type = "button";
      save.addEventListener("click", async function () {
        var ch = {};
        Object.keys(f).forEach(function (k) { var v = f[k].value.trim(); if (v) ch[k] = v; });
        if (!Object.keys(ch).length) { say("Type at least one detail first.", false); return; }
        save.disabled = true;
        try { await fdb.collection("orders").doc(d.id).update(ch); say("Rider details saved.", true); }
        catch (e) { say(explain(e), false); }
        save.disabled = false;
      });
      c.appendChild(save);
    }

    var close = el("button", "Close", "border:0;border-radius:8px;padding:10px 14px;margin:8px 0 0;font-weight:600;cursor:pointer;background:#e6eef9;color:#0b4a9e");
    close.type = "button";
    close.addEventListener("click", function () { box.innerHTML = ""; viewId = null; viewStatus = null; });
    c.appendChild(close);
    box.appendChild(c);
  }

  /* ---------- list ---------- */
  function card(d) {
    var o = d.data, st = norm(o.status);
    var c = el("div", "order-card");
    c.appendChild(el("h3", "Order " + shortId(d.id)));
    c.appendChild(el("p", "Status: " + (LABEL[st] || st)));
    c.appendChild(el("p", "Customer: " + (o.name || "-")));
    c.appendChild(el("p", "Phone: " + (o.phone || "-")));
    c.appendChild(el("p", "Total: " + naira(o.totalPrice) + "  \u2022  " + (o.paymentMethod || "-")));
    var w = when(o.createdAt);
    if (w) c.appendChild(el("p", "Ordered: " + w));

    var view = el("button", "View order"); view.type = "button";
    view.addEventListener("click", function () { var cur = find(d.id); if (cur) openDetails(cur); });
    c.appendChild(view);

    var nx = NEXT[st];
    if (nx) {
      var go = el("button", nx.label); go.type = "button";
      go.addEventListener("click", function () {
        if (nx.to === "delivered" && !confirm("Mark " + shortId(d.id) + " as delivered?")) return;
        setStatus(go, d, nx.to, shortId(d.id) + " is now: " + LABEL[nx.to] + ".");
      });
      c.appendChild(go);
    }
    if (st === "pending") {
      var rj = el("button", "Reject"); rj.type = "button";
      rj.addEventListener("click", function () {
        if (!confirm("Reject order " + shortId(d.id) + "? The customer will see it as rejected.")) return;
        setStatus(rj, d, "rejected", shortId(d.id) + " rejected.");
      });
      c.appendChild(rj);
    }
    return c;
  }

  function render() {
    var active = docs.filter(function (d) { return !FINAL[norm(d.data.status)]; });
    list.innerHTML = "";
    if (!active.length) { note("No active orders right now."); return; }
    active.forEach(function (d) {
      try { list.appendChild(card(d)); } catch (e) { console.error("Order card failed:", d.id, e); }
    });
  }

  function onData(snap) {
    docs = snap.docs.map(function (x) { return { id: x.id, data: x.data() || {} }; });
    // alert for orders that arrive while the page is open
    docs.forEach(function (d) {
      if (!firstLoad && !seenIds[d.id] && norm(d.data.status) === "pending") {
        say("New order " + shortId(d.id) + " from " + (d.data.name || "a customer"), true);
        try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
      }
      seenIds[d.id] = 1;
    });
    firstLoad = false;
    render();
    // keep an open details box in step with the order, without wiping typed text
    if (viewId) {
      var cur = find(viewId);
      if (!cur) { box.innerHTML = ""; viewId = null; viewStatus = null; }
      else if (norm(cur.data.status) !== viewStatus) openDetails(cur, true);
    }
  }

  /* ---------- start / stop (admins only) ---------- */
  function start() {
    if (started) return;
    started = true; firstLoad = true; seenIds = {};
    note("Loading orders...");
    try {
      unsub = fdb.collection("orders").orderBy("createdAt", "desc").limit(200).onSnapshot(onData, function (e) {
        console.error("Orders listener:", e);
        note(e && e.code === "permission-denied" ? "No permission to read orders. Log in as admin and publish the Firestore rules." : "Could not load orders. Refresh the page.");
      });
    } catch (e) { console.error(e); note("Could not load orders."); }
  }
  function stop() {
    if (unsub) { unsub(); unsub = null; }
    started = false; docs = []; viewId = null; viewStatus = null;
    list.innerHTML = ""; box.innerHTML = "";
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) { stop(); return; }
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin") start(); else stop();
    } catch (e) { console.error("Admin check failed:", e); stop(); }
  });
})();
