// @ts-nocheck
// FAEXXOR Pharmacy - Admin alerts (works while the dashboard is open)
// New order, new prescription, customer accepted a quotation, new customer:
//   sound + vibration + red badge on the tab (+ pop-up for prescriptions and users).
// Does not change any other file. Add after admin-users.js in admin-dashboard.html:
//   <script src="admin-alerts.js"></script>
(function () {
  "use strict";
  if (typeof firebase === "undefined" || !firebase.firestore || !firebase.auth) return;

  var fdb = firebase.firestore();
  var started = false;
  var counts = { orders: 0, prescriptions: 0, users: 0 };
  var baseTitle = document.title;
  var audioCtx = null;
  var toastBox = null, toastTimer = null;

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".fx-badge{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;margin-left:6px;border-radius:999px;background:#d62839;color:#fff;font-size:.72rem;font-weight:800;line-height:1}" +
    ".fx-alert{position:fixed;left:12px;right:12px;top:12px;z-index:9999;max-width:520px;margin:0 auto;background:#0b4a9e;color:#fff;border-radius:14px;padding:14px 16px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.25)}" +
    ".fx-alert[hidden]{display:none}";
  document.head.appendChild(css);

  /* ---------- sound (browsers allow it only after the first tap on the page) ---------- */
  function unlock() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);

  function beep() {
    try {
      if (!audioCtx) return;
      var t = audioCtx.currentTime;
      [880, 1175].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.18);
      });
    } catch (e) {}
  }

  /* ---------- pop-up, badge, title ---------- */
  function popup(text) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "fx-alert";
      toastBox.setAttribute("role", "status");
      toastBox.hidden = true;
      document.body.appendChild(toastBox);
    }
    toastBox.textContent = text;
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.hidden = true; }, 6000);
  }

  function tabFor(name) { return document.querySelector('.tab[data-tab="' + name + '"]'); }

  function paint(name) {
    var tab = tabFor(name);
    if (!tab) return;
    var b = tab.querySelector(".fx-badge");
    if (!counts[name]) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "fx-badge"; tab.appendChild(b); }
    b.textContent = counts[name] > 99 ? "99+" : String(counts[name]);
  }

  function paintTitle() {
    var n = counts.orders + counts.prescriptions + counts.users;
    document.title = (n ? "(" + n + ") " : "") + baseTitle;
  }

  function clearTab(name) {
    counts[name] = 0;
    paint(name);
    paintTitle();
  }

  function alertNew(name, text, showPopup) {
    var tab = tabFor(name);
    var viewing = tab && tab.classList.contains("on") && !document.hidden;
    if (!viewing) { counts[name]++; paint(name); paintTitle(); }
    beep();
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    if (showPopup) popup(text);
  }

  ["orders", "prescriptions", "users"].forEach(function (name) {
    var tab = tabFor(name);
    if (tab) tab.addEventListener("click", function () { clearTab(name); });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    var active = document.querySelector(".tab.on");
    if (active) clearTab(active.getAttribute("data-tab"));
  });

  /* ---------- listeners (every one skips the first load, so old items never ring) ---------- */
  function watchOrders() {
    var first = true;
    fdb.collection("orders").orderBy("createdAt", "desc").limit(30).onSnapshot(function (snap) {
      if (!first) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type !== "added") return;
          var st = String(ch.doc.data().status || "pending").toLowerCase();
          if (st === "pending") alertNew("orders", "", false); // the orders page already shows its own pop-up
        });
      }
      first = false;
    }, function (e) { console.error("Alerts (orders):", e); });
  }

  function watchPrescriptions() {
    var first = true, last = {};
    fdb.collection("prescriptions").orderBy("createdAt", "desc").limit(30).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        var id = ch.doc.id, st = ch.doc.data().status;
        if (!first) {
          if (ch.type === "added" && st === "submitted") {
            alertNew("prescriptions", "New prescription received", true);
          } else if (ch.type === "modified" && st === "customer_accepted" && last[id] !== "customer_accepted") {
            alertNew("prescriptions", "A customer accepted a quotation", true);
          }
        }
        last[id] = st;
      });
      first = false;
    }, function (e) { console.error("Alerts (prescriptions):", e); });
  }

  function watchUsers() {
    var first = true;
    fdb.collection("users").orderBy("createdAt", "desc").limit(20).onSnapshot(function (snap) {
      if (!first) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type !== "added") return;
          var d = ch.doc.data();
          if (d.role === "admin") return;
          var who = d.name || d.fullName || d.displayName || d.customerName || "A new customer";
          alertNew("users", who + " just registered", true);
        });
      }
      first = false;
    }, function (e) { console.error("Alerts (users):", e); });
  }

  function start() {
    if (started) return;
    started = true;
    watchOrders();
    watchPrescriptions();
    watchUsers();
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) return;
    try {
      var s = await fdb.collection("users").doc(user.uid).get();
      if (s.exists && s.data().role === "admin") start();
    } catch (e) { console.error("Alerts admin check failed:", e); }
  });
})();
