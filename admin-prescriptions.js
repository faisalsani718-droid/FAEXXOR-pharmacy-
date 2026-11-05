// @ts-nocheck
// FAEXXOR Pharmacy - Admin: prescriptions (review, quote in NGN, follow customer reply, deliver).
// Needs the #prescriptionsSection / #rxAdminList elements in admin-dashboard.html.
// Does not touch admin-dashboard.js (orders).
(function () {
  "use strict";

  var fdb = firebase.firestore();
  var list = document.getElementById("rxAdminList");
  var cards = {};      // prescription id -> card element
  var started = false;

  var LABELS = {
    submitted: "New - waiting for review",
    reviewing: "Under review",
    quoted: "Quotation sent - waiting for customer",
    customer_accepted: "CUSTOMER ACCEPTED - proceed",
    customer_declined: "Customer declined",
    rejected: "Rejected (not available)",
    preparing: "Preparing order",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  var OPT = {
    reviewing: "Mark as under review",
    quoted: "Send quotation to customer",
    rejected: "Reject (medicine not available)",
    preparing: "Start preparing order",
    out_for_delivery: "Out for delivery",
    delivered: "Mark as delivered",
    cancelled: "Cancel order"
  };
  // Must match adminCanMove() in firestore.rules
  var NEXT = {
    submitted: ["reviewing", "quoted", "rejected"],
    reviewing: ["reviewing", "quoted", "rejected"],
    quoted: ["quoted", "rejected"],
    customer_accepted: ["preparing", "cancelled"],
    preparing: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered"]
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function line(parent, name, value) {
    var p = el("p");
    p.appendChild(el("strong", null, name + ": "));
    p.appendChild(document.createTextNode(value));
    parent.appendChild(p);
  }
  function naira(n) { return "\u20A6" + Number(n).toLocaleString(); }
  function fmt(ts) {
    if (!ts || !ts.toDate) return "just now";
    return ts.toDate().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function secs(ts) { return ts && ts.seconds ? ts.seconds : Date.now() / 1000; }
  var FIELD = "width:100%;padding:10px;border-radius:8px;border:1px solid #c9d6e6;margin-top:8px;box-sizing:border-box";

  function buildCard(id, d) {
    var card = el("div", "order-card");
    card.appendChild(el("h3", null, "RX-" + id.slice(-6).toUpperCase()));

    var st = el("p", null, LABELS[d.status] || d.status);
    var colour = d.status === "customer_accepted" ? "#1b6b3d"
      : (d.status === "customer_declined" || d.status === "rejected" || d.status === "cancelled") ? "#a12a35"
      : "#0b4a9e";
    st.style.cssText = "font-weight:700;color:" + colour;
    card.appendChild(st);

    line(card, "Customer", d.customerDisplayName || "-");
    line(card, "Phone", d.phone || "-");
    line(card, "Address", d.deliveryAddress || "-");
    if (d.customerNotes) line(card, "Customer notes", d.customerNotes);
    line(card, "Submitted", fmt(d.createdAt));
    if (d.quotationAmount != null) line(card, "Quotation", naira(d.quotationAmount));
    if (d.acceptedAmount != null) line(card, "Customer agreed to pay", naira(d.acceptedAmount));
    if (d.customerReply) line(card, "Customer reply", d.customerReply);
    if (d.adminNote) line(card, "Your last note", d.adminNote);

    // --- photo ---
    var photoBtn = el("button", null, "View photo");
    photoBtn.type = "button";
    var img = el("img");
    img.alt = "Prescription photo";
    img.style.cssText = "display:none;max-width:100%;margin-top:10px;border-radius:10px";
    photoBtn.addEventListener("click", async function () {
      if (img.style.display === "block") { img.style.display = "none"; photoBtn.textContent = "View photo"; return; }
      photoBtn.disabled = true;
      photoBtn.textContent = "Loading...";
      try {
        var s = await fdb.collection("prescriptions").doc(id).collection("files").doc("main").get();
        if (!s.exists) { photoBtn.textContent = "Photo not found"; photoBtn.disabled = false; return; }
        var f = s.data();
        img.src = "data:" + (f.fileType || "image/jpeg") + ";base64," + f.data;
        img.style.display = "block";
        photoBtn.textContent = "Hide photo";
      } catch (e) {
        console.error("Photo error:", e);
        photoBtn.textContent = "Could not load. Tap to retry";
      }
      photoBtn.disabled = false;
    });
    card.appendChild(photoBtn);
    card.appendChild(img);

    // --- action form (only for statuses where the pharmacist can act) ---
    var moves = NEXT[d.status];
    if (!moves) return card;   // finished: nothing more to do

    var box = el("div");
    box.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid #e3eaf3";

    if (d.status === "quoted") {
      box.appendChild(el("p", null, "Waiting for the customer to accept or reject your price. You can still change the price or reject."));
    }

    var sel = el("select");
    sel.style.cssText = FIELD;
    moves.forEach(function (m, i) {
      var o = el("option", null, OPT[m]);
      o.value = m;
      if (i === 0) o.selected = true;
      sel.appendChild(o);
    });

    var amount = el("input");
    amount.type = "number";
    amount.min = "1";
    amount.placeholder = "Total price in NGN (required for quotation)";
    if (d.quotationAmount != null) amount.value = d.quotationAmount;
    amount.style.cssText = FIELD;

    var note = el("input");
    note.type = "text";
    note.maxLength = 200;
    note.placeholder = "Message to the customer (optional)";
    note.style.cssText = FIELD;

    function syncAmount() { amount.style.display = sel.value === "quoted" ? "block" : "none"; }
    sel.addEventListener("change", syncAmount);
    syncAmount();

    var msg = el("p");
    msg.style.cssText = "font-size:.85rem;margin:8px 0 0";

    var save = el("button", null, "Update");
    save.type = "button";
    save.addEventListener("click", async function () {
      var status = sel.value;
      var n = note.value.trim().slice(0, 200);
      var amt = amount.value.trim();
      if (status === "quoted" && (amt === "" || isNaN(Number(amt)) || Number(amt) <= 0)) {
        msg.style.color = "#a12a35"; msg.textContent = "Enter the price in NGN for the quotation."; return;
      }
      if (status === "rejected" || status === "cancelled") {
        if (!confirm("Are you sure? The customer will see: " + LABELS[status] + ".")) return;
      }
      save.disabled = true;
      msg.style.color = "#0b4a9e"; msg.textContent = "Saving...";
      try {
        var ts = firebase.firestore.FieldValue.serverTimestamp();
        var upd = { status: status, updatedAt: ts };
        if (n) upd.adminNote = n;
        if (status === "quoted") upd.quotationAmount = Number(amt);

        var ref = fdb.collection("prescriptions").doc(id);
        var batch = fdb.batch();
        batch.update(ref, upd);
        batch.set(ref.collection("history").doc(), {
          status: status, at: ts, by: "admin", note: n
        });
        await batch.commit();
        msg.style.color = "#1b6b3d"; msg.textContent = "Saved. The customer can see it now.";
        note.value = "";
      } catch (e) {
        console.error("Update error:", e);
        msg.style.color = "#a12a35";
        msg.textContent = (e.code === "permission-denied")
          ? "Not allowed. Publish the newest firestore.rules, or the customer already changed this prescription."
          : "Could not save. Try again.";
      }
      save.disabled = false;
    });

    box.appendChild(sel);
    box.appendChild(amount);
    box.appendChild(note);
    box.appendChild(save);
    box.appendChild(msg);
    card.appendChild(box);
    return card;
  }

  function start() {
    if (started) return;
    started = true;
    list.appendChild(el("p", null, "Loading prescriptions..."));

    fdb.collection("prescriptions").onSnapshot(function (snap) {
      if (list.firstChild && list.firstChild.nodeName === "P" && !Object.keys(cards).length) list.innerHTML = "";

      snap.docChanges().forEach(function (ch) {
        var id = ch.doc.id;
        if (ch.type === "removed") {
          if (cards[id]) { cards[id].remove(); delete cards[id]; }
          return;
        }
        var fresh = buildCard(id, ch.doc.data());
        if (cards[id]) cards[id].replaceWith(fresh); else list.appendChild(fresh);
        cards[id] = fresh;
      });

      // customers waiting for you first, then newest first
      function rank(s) { return s === "customer_accepted" ? 0 : (s === "submitted" ? 1 : 2); }
      snap.docs.slice().sort(function (a, b) {
        var ra = rank(a.data().status), rb = rank(b.data().status);
        if (ra !== rb) return ra - rb;
        return secs(b.data().createdAt) - secs(a.data().createdAt);
      }).forEach(function (d) { if (cards[d.id]) list.appendChild(cards[d.id]); });

      if (!snap.size) list.innerHTML = "<p>No prescriptions yet.</p>";
    }, function (err) {
      console.error("Prescriptions error:", err);
      list.innerHTML = "";
      list.appendChild(el("p", null, err.code === "permission-denied"
        ? "Permission denied. Publish the newest firestore.rules and make sure your user role is admin."
        : "Could not load prescriptions."));
    });
  }

  // Start only when the signed-in user is confirmed admin
  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) return;
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin") start();
    } catch (e) { console.error("Admin check failed:", e); }
  });
})();
