// admin-store.js - the "Store" tab of the admin dashboard
//   1) Payments: confirm bank transfers (and cash collected) so the customer sees "Payment successful"
//   2) Banners: add, replace, reorder, hide and remove the sliding adverts on the home page
// It only touches the new Store tab. Orders, prescriptions, medicines and users are not changed.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("payList") || !$("banList")) return;

  var db = null, uid = null, started = false;

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function money(n) { return "\u20A6" + Number(n || 0).toLocaleString("en-NG"); }
  function sid(id) { return "FX-" + String(id).slice(-6).toUpperCase(); }
  function stamp(ts) {
    try { var d = ts && ts.toDate ? ts.toDate() : null; return d ? d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : ""; } catch (e) { return ""; }
  }
  function isPaid(o) {
    var ps = String(o.paymentStatus || "").toLowerCase();
    return ps === "paid" || ps === "success" || ps === "successful" || o.paymentConfirmed === true;
  }
  function itemsTotal(o) {
    var t = 0;
    (Array.isArray(o.items) ? o.items : []).forEach(function (it) { t += (Number(it.price) || 0) * (Number(it.quantity !== undefined ? it.quantity : it.qty) || 1); });
    return t || Number(o.totalPrice) || 0;
  }
  function note(box, text) { box.innerHTML = '<div class="fb-msg">' + esc(text) + "</div>"; }
  function errText(e, what) {
    return e && e.code === "permission-denied"
      ? "No permission for " + what + ". Publish the Firestore rules for the admin (see the rules I gave you)."
      : "Could not load " + what + ". Check your internet and refresh.";
  }

  /* =============================== PAYMENTS =============================== */
  var orders = [];

  function method(o) { return String(o.paymentMethod || ""); }
  function status(o) { return String(o.status || "pending").toLowerCase(); }
  function needsConfirm(o) {
    if (isPaid(o) || status(o).indexOf("reject") === 0) return false;
    if (/transfer/i.test(method(o))) return true;
    if (/delivery/i.test(method(o)) && status(o) === "delivered") return true;   // cash collected after delivery
    return false;
  }

  function payCard(id, o, paid) {
    var c = document.createElement("div");
    c.className = "pay-card";
    var cod = /delivery/i.test(method(o));
    c.innerHTML =
      '<div class="pay-top"><b>' + esc(sid(id)) + '</b><span class="pay-chip ' + (paid ? "ok" : "wait") + '">' + (paid ? "Paid" : (cod ? "Cash to confirm" : "Awaiting payment")) + "</span></div>" +
      '<div class="pay-m">' + esc(o.name || "Customer") + (o.phone ? " \u00B7 " + esc(o.phone) : "") + "</div>" +
      '<div class="pay-m">' + esc(method(o) || "-") + " \u00B7 <b>" + esc(money(itemsTotal(o))) + "</b> (delivery fee extra)</div>" +
      '<div class="pay-m">' + esc(stamp(o.createdAt)) + (paid && o.paymentConfirmedAt ? " \u00B7 confirmed " + esc(stamp(o.paymentConfirmedAt)) : "") + "</div>";
    var b = document.createElement("button");
    b.type = "button";
    if (paid) {
      b.className = "pay-btn undo"; b.textContent = "Undo (not paid)";
      b.addEventListener("click", function () {
        if (!confirm("Mark " + sid(id) + " as NOT paid again?")) return;
        b.disabled = true;
        db.collection("orders").doc(id).update({ paymentStatus: "pending", paymentConfirmedAt: firebase.firestore.FieldValue.delete(), paymentConfirmedBy: firebase.firestore.FieldValue.delete() })
          .catch(function (e) { b.disabled = false; alert("Could not undo: " + (e.code || e.message)); });
      });
    } else {
      b.className = "pay-btn"; b.textContent = cod ? "Confirm cash received" : "Confirm payment received";
      b.addEventListener("click", function () {
        if (!confirm("Confirm that " + money(itemsTotal(o)) + " for " + sid(id) + " has really arrived in your account (check your bank app first)?")) return;
        b.disabled = true; b.textContent = "Saving...";
        db.collection("orders").doc(id).update({
          paymentStatus: "paid",
          paymentConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
          paymentConfirmedBy: uid
        }).catch(function (e) { b.disabled = false; b.textContent = "Confirm payment received"; alert("Could not confirm: " + (e.code || e.message)); });
      });
    }
    c.appendChild(b);
    return c;
  }

  function drawPayments() {
    var list = $("payList");
    var wait = [], paid = [];
    orders.forEach(function (x) {
      if (needsConfirm(x.o)) wait.push(x);
      else if (isPaid(x.o)) paid.push(x);
    });
    ["payBadge", "payDot"].forEach(function (id) { var b = $(id); if (b) { b.textContent = wait.length; b.hidden = !wait.length; } });
    list.innerHTML = "";

    var h1 = document.createElement("h3"); h1.className = "sub-h"; h1.textContent = "Waiting for your confirmation (" + wait.length + ")";
    list.appendChild(h1);
    if (!wait.length) { var e = document.createElement("div"); e.className = "fb-msg"; e.textContent = "No payments waiting. New transfer orders appear here."; list.appendChild(e); }
    else {
      var tip = document.createElement("p"); tip.className = "pay-tip";
      tip.textContent = "Open your bank app first. Tap Confirm only when the money has really arrived and the amount matches.";
      list.appendChild(tip);
      wait.forEach(function (x) { list.appendChild(payCard(x.id, x.o, false)); });
    }

    var h2 = document.createElement("h3"); h2.className = "sub-h"; h2.textContent = "Recently paid";
    list.appendChild(h2);
    paid.sort(function (a, b) {
      var x = a.o.paymentConfirmedAt && a.o.paymentConfirmedAt.toMillis ? a.o.paymentConfirmedAt.toMillis() : 0;
      var y = b.o.paymentConfirmedAt && b.o.paymentConfirmedAt.toMillis ? b.o.paymentConfirmedAt.toMillis() : 0;
      return y - x;
    });
    if (!paid.length) { var e2 = document.createElement("div"); e2.className = "fb-msg"; e2.textContent = "Nothing confirmed yet."; list.appendChild(e2); }
    paid.slice(0, 15).forEach(function (x) { list.appendChild(payCard(x.id, x.o, true)); });
  }

  function startPayments() {
    note($("payList"), "Loading payments...");
    db.collection("orders").orderBy("createdAt", "desc").limit(150).onSnapshot(function (snap) {
      orders = snap.docs.map(function (d) { return { id: d.id, o: d.data() || {} }; });
      drawPayments();
    }, function (e) { console.error(e); note($("payList"), errText(e, "orders")); });
  }

  /* =============================== BANNERS =============================== */
  var MAXB = 8, banners = [], newImage = "";

  function safeLink(l) {
    l = String(l || "").trim();
    if (!l) return "";
    return /^(https?:\/\/\S+|#[\w-]*|[\w\-.\/]+\.html(\?\S*)?(#\S*)?)$/i.test(l) ? l : null;   // null = not allowed
  }

  // shrink the chosen picture to a banner shape (960x420) so it is light and never stretched
  function shrink(file) {
    return new Promise(function (ok, bad) {
      if (!file || !/^image\//.test(file.type)) { bad(new Error("Please choose a picture file.")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var W = 960, H = 420, c = document.createElement("canvas"); c.width = W; c.height = H;
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
        var s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
        x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        var q = 0.8, d = c.toDataURL("image/jpeg", q);
        while (d.length > 180000 && q > 0.4) { q -= 0.08; d = c.toDataURL("image/jpeg", q); }
        ok(d);
      };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("This picture could not be read. Try another one.")); };
      img.src = url;
    });
  }
  function bmsg(t, bad) { var m = $("banMsg"); m.textContent = t || ""; m.style.color = bad ? "#b3261e" : "#137a3d"; }

  function reorder(list) {      // save the order 1..n in one go
    var batch = db.batch();
    list.forEach(function (b, i) { batch.update(db.collection("banners").doc(b.id), { order: i + 1 }); });
    return batch.commit();
  }

  function drawBanners() {
    var box = $("banList");
    box.innerHTML = "";
    if (!banners.length) {
      var e = document.createElement("div"); e.className = "fb-msg";
      e.textContent = "No banners yet. The home page shows 3 placeholder adverts until you add your own.";
      box.appendChild(e); return;
    }
    banners.forEach(function (b, i) {
      var c = document.createElement("div"); c.className = "ban-card" + (b.active === false ? " off" : "");
      var im = document.createElement("img"); im.alt = "Banner " + (i + 1);
      if (/^(data:image\/|https:\/\/)/.test(String(b.image || ""))) im.src = b.image;
      c.appendChild(im);
      var meta = document.createElement("div"); meta.className = "pay-m";
      meta.textContent = "Slide " + (i + 1) + (b.active === false ? " \u00B7 hidden" : " \u00B7 showing") + (b.link ? " \u00B7 opens " + b.link : " \u00B7 no link");
      c.appendChild(meta);

      var row = document.createElement("div"); row.className = "ban-row";
      function btn(label, cls, fn) {
        var x = document.createElement("button"); x.type = "button"; x.className = "ban-btn " + (cls || ""); x.textContent = label;
        x.addEventListener("click", function () { x.disabled = true; Promise.resolve(fn(x)).catch(function (er) { alert("Could not save: " + (er && (er.code || er.message))); }).then(function () { x.disabled = false; }); });
        row.appendChild(x); return x;
      }
      if (i > 0) btn("\u2191 Up", "", function () { var l = banners.slice(); l.splice(i - 1, 0, l.splice(i, 1)[0]); return reorder(l); });
      if (i < banners.length - 1) btn("\u2193 Down", "", function () { var l = banners.slice(); l.splice(i + 1, 0, l.splice(i, 1)[0]); return reorder(l); });
      btn(b.active === false ? "Show" : "Hide", "", function () { return db.collection("banners").doc(b.id).update({ active: b.active === false }); });
      btn("Link", "", function () {
        var v = prompt("Where should this banner open when tapped?\nExamples: #products   or   upload-prescription.html\nLeave empty for no link.", b.link || "");
        if (v === null) return;
        var s = safeLink(v);
        if (s === null) { alert("That link is not allowed. Use #products, a page like upload-prescription.html, or a full https:// address."); return; }
        return db.collection("banners").doc(b.id).update({ link: s });
      });
      // replace the picture
      var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*"; fi.hidden = true;
      fi.addEventListener("change", function () {
        var f = fi.files && fi.files[0]; if (!f) return;
        shrink(f).then(function (d) { return db.collection("banners").doc(b.id).update({ image: d, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); })
          .catch(function (er) { alert(er.message || "Could not replace the picture."); });
        fi.value = "";
      });
      c.appendChild(fi);
      btn("Replace picture", "", function () { fi.click(); });
      btn("Remove", "del", function () {
        if (!confirm("Remove this banner for good?")) return;
        return db.collection("banners").doc(b.id).delete();
      });
      c.appendChild(row);
      box.appendChild(c);
    });
  }

  function startBanners() {
    note($("banList"), "Loading banners...");
    db.collection("banners").onSnapshot(function (snap) {
      banners = snap.docs.map(function (d) { var o = d.data() || {}; o.id = d.id; return o; })
        .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
      drawBanners();
    }, function (e) { console.error(e); note($("banList"), errText(e, "banners")); });

    $("banFile").addEventListener("change", function () {
      var f = this.files && this.files[0];
      newImage = ""; $("banPrev").hidden = true; $("banSave").disabled = true; bmsg("");
      if (!f) return;
      bmsg("Preparing picture...");
      shrink(f).then(function (d) {
        newImage = d; $("banPrev").src = d; $("banPrev").hidden = false; $("banSave").disabled = false;
        bmsg("Picture ready. Tap Save banner.");
      }).catch(function (er) { bmsg(er.message || "Could not use this picture.", true); });
    });
    $("banSave").addEventListener("click", function () {
      if (!newImage) { bmsg("Choose a picture first.", true); return; }
      if (banners.length >= MAXB) { bmsg("You already have " + MAXB + " banners. Remove one first.", true); return; }
      var link = safeLink($("banLink").value);
      if (link === null) { bmsg("That link is not allowed. Use #products, a page like upload-prescription.html, or a full https:// address.", true); return; }
      var btn = this; btn.disabled = true; bmsg("Saving...");
      var last = banners.length ? Math.max.apply(null, banners.map(function (b) { return Number(b.order) || 0; })) : 0;
      db.collection("banners").add({
        image: newImage, link: link, active: true, order: last + 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: uid
      }).then(function () {
        newImage = ""; $("banFile").value = ""; $("banLink").value = ""; $("banPrev").hidden = true;
        bmsg("Banner added. It shows on the home page now.");
      }).catch(function (er) { btn.disabled = false; bmsg("Could not save: " + (er.code || er.message), true); });
    });
  }

  /* =============================== SWITCH + START =============================== */
  function pick(pay) {
    $("segPay").classList.toggle("on", pay); $("segBan").classList.toggle("on", !pay);
    $("payPanel").hidden = !pay; $("banPanel").hidden = pay;
  }
  $("segPay").addEventListener("click", function () { pick(true); });
  $("segBan").addEventListener("click", function () { pick(false); });

  function begin(user) {
    if (started) return;
    started = true; uid = user.uid;
    try { db = firebase.firestore(); startPayments(); startBanners(); }
    catch (e) { console.error(e); note($("payList"), "Could not start the Store tab."); }
  }
  try { firebase.auth().onAuthStateChanged(function (u) { if (u) begin(u); }); } catch (e) { console.error(e); }
})();
