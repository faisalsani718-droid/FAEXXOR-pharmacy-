/*!
 * FX PHARMARKET: checkout payment selector
 * Works with your existing Firebase COMPAT SDK (global `firebase`).
 * Needs these scripts on checkout.html (already loaded: app, auth, firestore):
 *   firebase-functions-compat.js   <-- add this one (same version as the others)
 *
 * What it does
 *  - Shows Cash on Delivery ONLY while the customer's COD is unused (users/{uid}.codUsed).
 *  - Always shows Bank Transfer and Pay with OPay.
 *  - COD order + COD claim + codUsed flag are written in ONE atomic batch;
 *    your Firestore rules enforce it, so the browser cannot cheat.
 *  - OPay: creates the order as "pending", then asks the Cloud Function for the
 *    official OPay checkout and sends the customer there.
 */
(function (global) {
  "use strict";

  var REGION = "us-central1";

  var CSS = [
    ".fxp{--deep:#0284C7;--sky:#38BDF8;--green:#A7E8C0;--fresh:#86D9A7;--text:#3b5b6e;font-family:Manrope,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:var(--text)}",
    ".fxp *{box-sizing:border-box}",
    ".fxp-title{margin:0 0 .25rem;font-size:1.25rem;font-weight:800;color:var(--deep)}",
    ".fxp-sub{margin:0 0 1rem;font-size:.92rem}",
    ".fxp-list{display:grid;gap:.8rem}",
    ".fxp-card{position:relative;display:flex;gap:.9rem;align-items:center;width:100%;text-align:left;padding:1rem 1.1rem;background:#fff;border:1.5px solid rgba(56,189,248,.35);border-radius:20px;cursor:pointer;font:inherit;color:inherit;box-shadow:0 8px 24px rgba(2,132,199,.08);transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s,border-color .35s}",
    ".fxp-card:hover{transform:translateY(-3px);box-shadow:0 16px 34px rgba(2,132,199,.16);border-color:var(--sky)}",
    ".fxp-card:focus-visible{outline:3px solid var(--sky);outline-offset:3px}",
    ".fxp-card[aria-checked=true]{border-color:var(--deep);background:linear-gradient(135deg,rgba(56,189,248,.10),rgba(167,232,192,.28));box-shadow:0 16px 34px rgba(2,132,199,.20)}",
    ".fxp-ico{flex:none;width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,var(--sky),var(--green))}",
    ".fxp-ico svg{width:24px;height:24px;stroke:#fff;fill:none;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}",
    ".fxp-ico img{max-width:34px;max-height:30px}",
    ".fxp-opay{background:#fff;border:1.5px solid var(--green);font-weight:800;font-size:.78rem;color:var(--deep);letter-spacing:.02em}",
    ".fxp-body{flex:1;min-width:0}",
    ".fxp-name{display:block;font-weight:800;font-size:1.02rem;color:var(--deep)}",
    ".fxp-desc{display:block;font-size:.86rem;margin-top:.1rem}",
    ".fxp-tick{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid var(--sky);display:grid;place-items:center;transition:all .3s}",
    ".fxp-card[aria-checked=true] .fxp-tick{background:var(--deep);border-color:var(--deep)}",
    ".fxp-tick svg{width:14px;height:14px;stroke:#fff;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .25s}",
    ".fxp-card[aria-checked=true] .fxp-tick svg{opacity:1}",
    ".fxp-badge{display:inline-block;margin-left:.4rem;padding:.1rem .55rem;border-radius:999px;font-size:.68rem;font-weight:800;background:var(--green);color:#2c5a46;vertical-align:middle}",
    ".fxp-note{margin:.9rem 0 0;padding:.75rem 1rem;border-radius:14px;font-size:.86rem;background:rgba(167,232,192,.28);border:1px solid var(--green)}",
    ".fxp-err{margin:.9rem 0 0;padding:.75rem 1rem;border-radius:14px;font-size:.88rem;font-weight:600;background:#fdf1f1;border:1px solid #efc3c3;color:#8f3b3b}",
    ".fxp-btn{margin-top:1.1rem;width:100%;padding:1rem 1.2rem;border:0;border-radius:16px;cursor:pointer;font:inherit;font-weight:800;font-size:1.02rem;color:#fff;background:var(--deep);box-shadow:0 12px 26px rgba(2,132,199,.32);transition:transform .3s,box-shadow .3s,background .3s}",
    ".fxp-btn:hover:not([disabled]){transform:translateY(-2px);box-shadow:0 18px 34px rgba(2,132,199,.42);background:#0276b3}",
    ".fxp-btn[disabled]{opacity:.55;cursor:not-allowed}",
    ".fxp-over{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;flex-direction:column;gap:1rem;padding:1.5rem;text-align:center;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}",
    ".fxp-over.on{display:flex}",
    ".fxp-ring{width:64px;height:64px;border-radius:50%;border:6px solid rgba(167,232,192,.6);border-top-color:var(--deep);animation:fxpspin 1s linear infinite}",
    ".fxp-over b{font-size:1.15rem;color:var(--deep)}",
    ".fxp-over span{max-width:30ch;font-size:.92rem}",
    "@keyframes fxpspin{to{transform:rotate(360deg)}}",
    "@media (prefers-reduced-motion:reduce){.fxp-card,.fxp-btn{transition:none}.fxp-ring{animation-duration:2.5s}}"
  ].join("\n");

  var ICONS = {
    cod: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/></svg>',
    bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>'
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /**
   * FXPayments.mount({
   *   container:   "#fx-payments",              // where the cards go
   *   buildOrder:  async function () {...},     // returns YOUR existing order object (see guide)
   *   hasPrescription: function () { return false; }, // true = hide COD for prescription orders
   *   getTotalLabel:   function () { return "₦12,500"; }, // optional, shown on the button
   *   opayLogo:    "images/opay-logo.png",      // optional: your downloaded official OPay logo
   *   onLoginRequired: function () { location.href = "login.html?next=checkout.html"; },
   *   onOrderCreated:  function (orderId, method) { ... }, // COD + bank transfer: your success screen
   *   paymentResultPage: "payment-result.html"  // not used here, the function sends OPay's return URL
   * });
   */
  function mount(opts) {
    var db = firebase.firestore();
    var auth = firebase.auth();
    var root = typeof opts.container === "string" ? document.querySelector(opts.container) : opts.container;
    if (!root) { console.error("FXPayments: container not found"); return; }

    if (!document.getElementById("fxp-style")) {
      var st = document.createElement("style");
      st.id = "fxp-style"; st.textContent = CSS; document.head.appendChild(st);
    }

    var state = { method: null, codUsed: false, codKnown: false, busy: false, pendingOrderId: null, unsub: null };

    root.classList.add("fxp");
    root.innerHTML =
      '<h3 class="fxp-title">Payment method</h3>' +
      '<p class="fxp-sub">Choose how you would like to pay for this order.</p>' +
      '<div class="fxp-list" role="radiogroup" aria-label="Payment method"></div>' +
      '<div class="fxp-msg" aria-live="polite"></div>' +
      '<button type="button" class="fxp-btn" disabled>Place order</button>';

    var overlay = document.createElement("div");
    overlay.className = "fxp-over";
    overlay.setAttribute("role", "status");
    overlay.innerHTML = '<div class="fxp-ring"></div><b></b><span></span>';
    document.body.appendChild(overlay);

    var list = root.querySelector(".fxp-list");
    var msg = root.querySelector(".fxp-msg");
    var btn = root.querySelector(".fxp-btn");

    function showOverlay(title, text) {
      overlay.querySelector("b").textContent = title;
      overlay.querySelector("span").textContent = text || "";
      overlay.classList.add("on");
    }
    function hideOverlay() { overlay.classList.remove("on"); }
    function showError(t) { msg.innerHTML = '<div class="fxp-err" role="alert">' + esc(t) + "</div>"; }
    function showNote(t) { msg.innerHTML = '<div class="fxp-note">' + esc(t) + "</div>"; }
    function clearMsg() { msg.innerHTML = ""; }

    function methods() {
      var rx = typeof opts.hasPrescription === "function" && opts.hasPrescription();
      var out = [];
      // COD only while unused AND only after we know the answer (never flash it for used accounts).
      if (state.codKnown && !state.codUsed && !rx) {
        out.push({ id: "cod", name: "Cash on Delivery", badge: "One-time",
          desc: "Pay in cash when your order arrives. Available once per account.", icon: ICONS.cod });
      }
      out.push({ id: "bank_transfer", name: "Bank Transfer",
        desc: "Transfer to our account and confirm. We approve it quickly.", icon: ICONS.bank });
      out.push({ id: "opay", name: "Pay with OPay",
        desc: "Pay securely online with OPay checkout (card, transfer, USSD or wallet).", opay: true });
      return out;
    }

    function render() {
      var ms = methods();
      if (state.method && !ms.some(function (m) { return m.id === state.method; })) state.method = null;
      list.innerHTML = ms.map(function (m) {
        var icon = m.opay
          ? (opts.opayLogo
              ? '<span class="fxp-ico fxp-opay"><img src="' + esc(opts.opayLogo) + '" alt="OPay"></span>'
              : '<span class="fxp-ico fxp-opay" aria-hidden="true">OPay</span>')
          : '<span class="fxp-ico">' + m.icon + "</span>";
        return '<button type="button" class="fxp-card" role="radio" data-m="' + m.id + '" aria-checked="' + (state.method === m.id) + '">' +
          icon +
          '<span class="fxp-body"><span class="fxp-name">' + esc(m.name) + (m.badge ? '<span class="fxp-badge">' + esc(m.badge) + "</span>" : "") +
          '</span><span class="fxp-desc">' + esc(m.desc) + "</span></span>" +
          '<span class="fxp-tick">' + ICONS.tick + "</span></button>";
      }).join("");
      btn.disabled = !state.method || state.busy;
      var total = typeof opts.getTotalLabel === "function" ? opts.getTotalLabel() : "";
      btn.textContent = state.method === "opay" ? "Pay with OPay" + (total ? " · " + total : "")
        : "Place order" + (total ? " · " + total : "");
    }

    list.addEventListener("click", function (e) {
      var card = e.target.closest(".fxp-card");
      if (!card || state.busy) return;
      state.method = card.getAttribute("data-m");
      clearMsg(); render();
    });

    /* Live COD eligibility, from the signed-in customer's own Firestore record. */
    function watchEligibility(user) {
      if (state.unsub) { state.unsub(); state.unsub = null; }
      state.codKnown = false; render();
      if (!user) return;
      state.unsub = db.collection("users").doc(user.uid).onSnapshot(function (snap) {
        state.codUsed = !!(snap.exists && snap.data().codUsed === true);
        state.codKnown = true; render();
      }, function () {
        // If we cannot read it, stay safe: do not offer COD (the rules would refuse it anyway).
        state.codUsed = true; state.codKnown = true; render();
      });
    }
    auth.onAuthStateChanged(watchEligibility);

    /* ---------- place order ---------- */

    function startOpay(orderId) {
      if (!firebase.functions) throw new Error("firebase-functions-compat.js is not loaded");
      showOverlay("Connecting to OPay…", "Please wait. You will be taken to OPay's secure page.");
      return firebase.app().functions(REGION).httpsCallable("startOpayPayment")({ orderId: orderId })
        .then(function (r) {
          var url = r && r.data && r.data.cashierUrl;
          if (!url || url.indexOf("https://") !== 0) throw new Error("bad url");
          window.location.href = url;
        });
    }

    function placeOrder() {
      var user = auth.currentUser;
      if (!user) { if (opts.onLoginRequired) opts.onLoginRequired(); return; }
      if (!state.method || state.busy) return;
      state.busy = true; btn.disabled = true; clearMsg();
      var method = state.method;

      // Retry of an OPay order that already exists: do not create a second order.
      if (method === "opay" && state.pendingOrderId) {
        startOpay(state.pendingOrderId).catch(function () {
          hideOverlay(); state.busy = false; render();
          showError("We could not open OPay. Your order is saved. Please tap Pay with OPay to try again.");
        });
        return;
      }

      showOverlay(method === "opay" ? "Preparing your order…" : "Placing your order…", "Please do not close this page.");

      Promise.resolve(opts.buildOrder(method)).then(function (data) {
        data = Object.assign({}, data);
        var orderRef = db.collection("orders").doc();
        data.orderId = orderRef.id;
        data.customerId = user.uid;
        data.paymentMethod = method;
        if (method === "opay") { data.paymentStatus = "pending"; data.paymentVerified = false; }

        var batch = db.batch();
        batch.set(orderRef, data);
        if (method === "cod") {
          var TS = firebase.firestore.FieldValue.serverTimestamp();
          batch.set(db.collection("codClaims").doc(user.uid), { orderId: orderRef.id, createdAt: TS });
          batch.set(db.collection("users").doc(user.uid),
            { codUsed: true, codUsedAt: TS, codFirstOrderId: orderRef.id }, { merge: true });
        }
        return batch.commit().then(function () { return orderRef.id; });
      }).then(function (orderId) {
        if (method === "opay") {
          state.pendingOrderId = orderId;
          return startOpay(orderId);
        }
        hideOverlay(); state.busy = false; render();
        if (opts.onOrderCreated) opts.onOrderCreated(orderId, method);
      }).catch(function (err) {
        hideOverlay(); state.busy = false;
        var code = err && err.code;
        if (method === "cod" && code === "permission-denied") {
          // Rules refused: COD was already used (maybe on another device). Nothing was saved.
          state.codUsed = true; state.codKnown = true; state.method = null; render();
          showError("Cash on Delivery has already been used on this account. Please choose Bank Transfer or Pay with OPay.");
          return;
        }
        render();
        if (method === "opay" && state.pendingOrderId) {
          showError("Your order is saved, but OPay could not be opened. Tap Pay with OPay to try again.");
        } else {
          console.error("FXPayments order error", err);
          showError("We could not place your order. Nothing was charged. Please try again.");
        }
      });
    }

    btn.addEventListener("click", placeOrder);
    render();
  }

  global.FXPayments = { mount: mount };
})(window);
