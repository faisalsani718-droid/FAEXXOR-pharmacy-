// @ts-nocheck
// FX PHARMARKET - fixed bottom navigation (Home | Products | Cart | Orders | Account)
// Shared by index.html and orders.html. Shows on phones and tablets (screens up to 900px wide).
// SAFETY: everything runs inside try/catch. If anything goes wrong, this file does nothing
// and the website keeps working exactly as before.
(function () {
  "use strict";
  try {
    if (window.__fxBottomNav) return;
    window.__fxBottomNav = true;

    // Light / Dark theme for the whole website (one shared file). Loaded here too so pages that already
    // use this bottom bar get dark mode without any other change.
    if (!window.FXTheme && !document.querySelector('script[src*="theme.js"]')) {
      var ts = document.createElement("script");
      ts.src = "theme.js";
      ts.async = false;
      (document.head || document.documentElement).appendChild(ts);
    }

    var CART_KEY = "fx_cart_v1";
    var CART_TTL = 3 * 24 * 60 * 60 * 1000; // saved cart is forgotten after 3 days
    var isShop = !!document.getElementById("catalogHost"); // true only on index.html
    var isOrdersPage = /\/orders(\.html)?\/?$/i.test(location.pathname);
    var isAccountPage = /\/account(\.html)?\/?$/i.test(location.pathname);
    var user = null;      // signed-in (non-guest) customer
    var ui = {};          // elements
    var active = "";

    function safe(fn) {
      return function () {
        try { return fn.apply(this, arguments); }
        catch (e) { console.error("Bottom navigation:", e); }
      };
    }
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    /* ---------- saved cart (so navigating between pages never empties it) ---------- */
    function validItem(i) {
      return i && typeof i.name === "string" && i.name.length > 0 && i.name.length <= 200 &&
        typeof i.price === "number" && isFinite(i.price) && i.price >= 0 && i.price <= 100000000;
    }
    function readSaved() {
      try {
        var raw = localStorage.getItem(CART_KEY);
        if (!raw) return [];
        var o = JSON.parse(raw);
        if (!o || !Array.isArray(o.items) || !(Date.now() - Number(o.t) < CART_TTL)) return [];
        return o.items.filter(validItem).slice(0, 300).map(function (i) {
          var c = { name: i.name, price: i.price };
          if (typeof i.productId === "string" && i.productId) c.productId = i.productId;
          return c;
        });
      } catch (e) { return []; }
    }
    function cartCount() {
      if (typeof cartItems !== "undefined" && Array.isArray(cartItems)) return cartItems.length;
      return readSaved().length;
    }
    function saveCart() {
      try {
        if (typeof cartItems === "undefined" || !Array.isArray(cartItems)) return;
        localStorage.setItem(CART_KEY, JSON.stringify({
          t: Date.now(),
          items: cartItems.map(function (i) { return { name: i.name, price: i.price, productId: i.productId }; })
        }));
      } catch (e) { /* storage full or blocked: cart still works in memory */ }
    }

    /* ---------- styles ---------- */
    function addStyles() {
      var s = el("style");
      s.id = "fxBottomNavCss";
      s.textContent =
        ".fxbn,.fxbn *,.fxbn-sheet,.fxbn-sheet *{box-sizing:border-box;font-family:Manrope,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
        ".fxbn-toast{position:fixed;left:12px;right:12px;bottom:16px;max-width:460px;margin:0 auto;z-index:1800;background:#0284C7;color:#fff;" +
        "padding:13px 15px;border-radius:16px;font-weight:700;font-size:.9rem;box-shadow:0 12px 30px rgba(2,132,199,.35);display:none}" +
        ".fxbn,.fxbn-sp,.fxbn-ov,.fxbn-sheet{display:none}" +
        "@media (max-width:900px){" +
        /* glass bar with softly rounded top corners */
        ".fxbn{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:1500;background:rgba(255,255,255,.88);" +
        "-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);" +
        "border-top:1px solid rgba(56,189,248,.30);border-radius:24px 24px 0 0;box-shadow:0 -10px 34px rgba(2,132,199,.16);" +
        "padding:0 6px env(safe-area-inset-bottom,0px);margin:0;width:100%}" +
        ".fxbn .fxbn-i{flex:1 1 0;min-width:0;width:auto!important;height:64px;margin:0;padding:8px 2px 6px;border:0;border-radius:18px;background:none;" +
        "color:#6b8799;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:.7rem;font-weight:700;" +
        "text-decoration:none;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;line-height:1.1;transition:color .25s,transform .25s}" +
        ".fxbn .fxbn-i svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s cubic-bezier(.2,.8,.2,1)}" +
        ".fxbn .fxbn-i:active{transform:scale(.94)}" +
        ".fxbn .fxbn-i.on{color:#0284C7;font-weight:800}" +
        ".fxbn .fxbn-i.on svg{transform:translateY(-2px) scale(1.1);filter:drop-shadow(0 5px 7px rgba(56,189,248,.45))}" +
        ".fxbn .fxbn-i.on::before{content:'';position:absolute;top:0;left:30%;right:30%;height:4px;border-radius:0 0 6px 6px;background:linear-gradient(90deg,#0284C7,#38BDF8,#86D9A7)}" +
        ".fxbn .fxbn-i.on::after{content:'';position:absolute;inset:6px 8px;border-radius:16px;background:linear-gradient(135deg,rgba(56,189,248,.14),rgba(167,232,192,.30));z-index:-1}" +
        ".fxbn .fxbn-i:focus-visible,.fxbn-sheet button:focus-visible,.fxbn-sheet a:focus-visible{outline:3px solid #38BDF8;outline-offset:-3px}" +
        ".fxbn .fxbn-b{position:absolute;top:4px;left:calc(50% + 6px);min-width:19px;height:19px;padding:0 5px;border-radius:999px;" +
        "background:linear-gradient(135deg,#0284C7,#38BDF8);color:#fff;font-size:.68rem;font-weight:800;display:none;place-items:center;border:2px solid #fff;line-height:1;box-shadow:0 4px 10px rgba(2,132,199,.4)}" +
        ".fxbn-sp{display:block;height:calc(64px + env(safe-area-inset-bottom,0px));width:100%}" +
        "#products{scroll-margin-top:70px}" +
        "body.fxbn-on .cart-float{display:none!important}" +
        "body.fxbn-on .whatsapp-float{bottom:calc(78px + env(safe-area-inset-bottom,0px))!important}" +
        "body.fxbn-on .gmail-btn{bottom:calc(148px + env(safe-area-inset-bottom,0px))!important}" +
        ".fxbn-ov{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,36,54,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);z-index:1600}" +
        ".fxbn-ov.open{display:block}" +
        ".fxbn-sheet{position:fixed;left:0;right:0;bottom:0;z-index:1700;background:#fff;border-radius:28px 28px 0 0;max-height:85vh;overflow-y:auto;" +
        "padding:18px 16px calc(22px + env(safe-area-inset-bottom,0px));box-shadow:0 -14px 40px rgba(2,132,199,.25)}" +
        ".fxbn-sheet.open{display:block}" +
        ".fxbn-sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}" +
        ".fxbn-sh h2{margin:0;font-size:1.2rem;font-weight:800;color:#0284C7}" +
        ".fxbn-sheet .fxbn-x{width:38px!important;height:38px;border:0;border-radius:50%;background:#e8f6fd;font-size:1.05rem;cursor:pointer;padding:0;margin:0;color:#17435a}" +
        ".fxbn-sheet p{margin:6px 0 12px;color:#3b5b6e;font-size:.93rem;line-height:1.45}" +
        ".fxbn-sheet .fxbn-who{background:#F5FAFF;border:1px solid rgba(56,189,248,.28);border-radius:16px;padding:12px 14px;margin:8px 0 12px}" +
        ".fxbn-sheet .fxbn-who b{display:block;color:#17435a;word-break:break-word}.fxbn-sheet .fxbn-who span{font-size:.85rem;color:#3b5b6e;word-break:break-all}" +
        ".fxbn-sheet .fxbn-l{display:block;width:100%!important;margin:0 0 8px;padding:14px 15px;border:0;border-radius:16px;background:#e8f6fd;color:#0284C7;" +
        "font-weight:800;font-size:.98rem;text-align:left;text-decoration:none;cursor:pointer}" +
        ".fxbn-sheet .fxbn-l.main{background:#0284C7;color:#fff;text-align:center;box-shadow:0 10px 22px rgba(2,132,199,.3)}" +
        ".fxbn-sheet .fxbn-l.out{background:#fff;color:#0284C7;border:1.5px solid #38BDF8}" +
        ".fxbn-toast{bottom:calc(78px + env(safe-area-inset-bottom,0px))}" +
        /* dark mode (the bar styles itself, the theme engine skips it) */
        "html.fx-dark .fxbn{background:rgba(14,32,45,.90);border-top-color:rgba(56,189,248,.24);box-shadow:0 -10px 34px rgba(0,0,0,.45)}" +
        "html.fx-dark .fxbn .fxbn-i{color:#8fa9ba}" +
        "html.fx-dark .fxbn .fxbn-i.on{color:#6ccdfb}" +
        "html.fx-dark .fxbn .fxbn-i.on::after{background:linear-gradient(135deg,rgba(56,189,248,.20),rgba(167,232,192,.16))}" +
        "html.fx-dark .fxbn .fxbn-b{border-color:#0e202d}" +
        "html.fx-dark .fxbn-sheet{background:#112636;box-shadow:0 -14px 40px rgba(0,0,0,.55)}" +
        "html.fx-dark .fxbn-sh h2{color:#6ccdfb}" +
        "html.fx-dark .fxbn-sheet .fxbn-x{background:#1a3b52;color:#e3f1f9}" +
        "html.fx-dark .fxbn-sheet p,html.fx-dark .fxbn-sheet .fxbn-who span{color:#b7cddb}" +
        "html.fx-dark .fxbn-sheet .fxbn-who{background:#153247;border-color:rgba(56,189,248,.22)}" +
        "html.fx-dark .fxbn-sheet .fxbn-who b{color:#e3f1f9}" +
        "html.fx-dark .fxbn-sheet .fxbn-l{background:#153247;color:#6ccdfb}" +
        "html.fx-dark .fxbn-sheet .fxbn-l.main{background:#0284C7;color:#fff}" +
        "html.fx-dark .fxbn-sheet .fxbn-l.out{background:transparent;color:#6ccdfb;border-color:rgba(56,189,248,.5)}" +
        "}" +
        "@media (prefers-reduced-motion:reduce){.fxbn .fxbn-i,.fxbn .fxbn-i svg{transition:none}}";
      document.head.appendChild(s);
    }

    /* ---------- build the bar ---------- */
    var ICONS = {
      home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
      discover: '<g transform="rotate(-45 12 12)"><rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M12 8v8"/></g>',   // capsule icon for Products
      cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h9.4a1 1 0 0 0 1-.8L21 7H6"/>',
      orders: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
      account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'
    };
    var ITEMS = [
      { k: "home", label: "Home", href: "index.html" },
      { k: "discover", label: "Products", href: "index.html?discover=1" },   // key stays "discover" so the page links keep working
      { k: "cart", label: "Cart" },
      { k: "orders", label: "Orders", href: "orders.html" },
      { k: "account", label: "Account" }
    ];

    function build() {
      if (document.querySelector(".fxbn")) return false;
      addStyles();

      var bar = el("div", "fxbn");
      bar.setAttribute("role", "navigation");
      bar.setAttribute("data-fx-own", "1");
      bar.setAttribute("aria-label", "Main navigation");
      ITEMS.forEach(function (it) {
        var n = it.href ? el("a", "fxbn-i") : el("button", "fxbn-i");
        if (it.href) n.href = it.href; else n.type = "button";
        n.setAttribute("data-k", it.k);
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML = ICONS[it.k];
        n.appendChild(svg);
        n.appendChild(el("span", null, it.label));
        if (it.k === "cart") { ui.badge = el("b", "fxbn-b", "0"); n.appendChild(ui.badge); }
        ui[it.k] = n;
        bar.appendChild(n);
      });
      document.body.appendChild(bar);
      document.body.appendChild(el("div", "fxbn-sp"));
      ui.bar = bar;

      ui.toast = el("div", "fxbn-toast");
      ui.toast.setAttribute("role", "status");
      ui.toast.setAttribute("data-fx-own", "1");
      document.body.appendChild(ui.toast);

      // account sheet
      ui.ov = el("div", "fxbn-ov");
      ui.sheet = el("div", "fxbn-sheet");
      ui.sheet.setAttribute("role", "dialog");
      ui.sheet.setAttribute("data-fx-own", "1");
      ui.sheet.setAttribute("aria-modal", "true");
      ui.sheet.setAttribute("aria-label", "Account");
      document.body.appendChild(ui.ov);
      document.body.appendChild(ui.sheet);
      document.body.classList.add("fxbn-on");
      return true;
    }

    /* ---------- highlight ---------- */
    function setActive(k) {
      active = k;
      ITEMS.forEach(function (it) {
        var n = ui[it.k];
        if (!n) return;
        var on = it.k === k;
        n.classList.toggle("on", on);
        if (on) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current");
      });
    }
    function drawerOpen() {
      var d = document.getElementById("fxDrawer");
      return !!(d && d.classList.contains("open"));
    }
    function sheetOpen() { return ui.sheet && ui.sheet.classList.contains("open"); }
    var sync = safe(function () {
      if (sheetOpen()) return setActive("account");
      if (drawerOpen()) return setActive("cart");
      if (isOrdersPage) return setActive("orders");
      if (isAccountPage) return setActive("account");
      if (!isShop) return setActive("");
      var s = document.getElementById("search-section");
      var c = document.getElementById("checkout");
      var y = s ? s.getBoundingClientRect().top : 1e9;
      var after = c ? c.getBoundingClientRect().top : 1e9;
      setActive(y < window.innerHeight * 0.55 && after > window.innerHeight * 0.3 ? "discover" : "home");
    });

    /* ---------- cart badge ---------- */
    var refreshBadge = safe(function () {
      if (!ui.badge) return;
      var n = cartCount();
      ui.badge.textContent = n > 99 ? "99+" : String(n);
      ui.badge.style.display = n ? "grid" : "none";
      ui.cart.setAttribute("aria-label", "Cart, " + n + (n === 1 ? " item" : " items"));
    });
    var toastTimer = null;
    function say(t) {
      if (!ui.toast) return;
      ui.toast.textContent = t;
      ui.toast.style.display = "block";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { ui.toast.style.display = "none"; }, 5000);
    }

    /* ---------- account sheet ---------- */
    function closeSheet() {
      if (!ui.sheet) return;
      ui.sheet.classList.remove("open");
      ui.ov.classList.remove("open");
      sync();
    }
    function link(text, href, cls) {
      var a = el("a", "fxbn-l" + (cls ? " " + cls : ""), text);
      a.href = href;
      return a;
    }
    function renderSheet() {
      ui.sheet.innerHTML = "";
      var head = el("div", "fxbn-sh");
      head.appendChild(el("h2", null, "Account"));
      var x = el("button", "fxbn-x", "\u2715");
      x.type = "button";
      x.setAttribute("aria-label", "Close account panel");
      x.addEventListener("click", closeSheet);
      head.appendChild(x);
      ui.sheet.appendChild(head);
      ui.x = x;

      if (!user) {
        ui.sheet.appendChild(el("p", null, "Sign in to track your orders and upload prescriptions."));
        ui.sheet.appendChild(link("Sign In", "_login.html", "main"));
        ui.sheet.appendChild(link("Create Account", "_signup.html"));
      } else {
        var who = el("div", "fxbn-who");
        who.appendChild(el("b", null, user.displayName || user.email || "Signed in"));
        if (user.displayName && user.email) who.appendChild(el("span", null, user.email));
        ui.sheet.appendChild(who);
        ui.sheet.appendChild(link("My Orders", "orders.html"));
        ui.sheet.appendChild(link("Upload Prescription", "upload-prescription.html"));
        ui.sheet.appendChild(link("My Prescriptions", "my-prescriptions.html"));
        var out = el("button", "fxbn-l out", "Logout");
        out.type = "button";
        out.addEventListener("click", function () {
          try {
            firebase.auth().signOut().then(function () { location.href = "index.html"; });
          } catch (e) { location.href = "index.html"; }
        });
        ui.sheet.appendChild(out);
      }
    }
    function openSheet() {
      renderSheet();
      ui.sheet.classList.add("open");
      ui.ov.classList.add("open");
      setActive("account");
      if (ui.x) ui.x.focus();
    }

    /* ---------- actions ---------- */
    function goHome(e) {
      if (!isShop) return;            // other pages: normal link to index.html
      e.preventDefault();
      closeSheet();
      if (drawerOpen() && typeof closeCart === "function") closeCart();
      window.scrollTo({ top: 0, behavior: "smooth" });
      try { history.replaceState(null, "", location.pathname); } catch (x) {}
    }
    function goDiscover(e) {
      if (!isShop) return;
      if (e) e.preventDefault();
      closeSheet();
      if (drawerOpen() && typeof closeCart === "function") closeCart();
      // Products tab: go to the products section (the search box stays available inside it)
      var s = document.getElementById("products") || document.getElementById("search-section");
      if (s) s.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function goCart() {
      closeSheet();
      if (typeof openCart === "function" && document.getElementById("fxDrawer")) openCart();
      else location.href = "index.html?cart=1";
    }

    /* ---------- cart safety on the shop page ---------- */
    function restoreCart() {
      if (typeof cartItems === "undefined" || !Array.isArray(cartItems) || cartItems.length) return;
      var saved = readSaved();
      if (!saved.length) return;
      saved.forEach(function (i) { cartItems.push(i); });
      if (typeof updateCartUI === "function") updateCartUI();
    }
    // keep prices and stock in step with the live catalogue; drop anything no longer sold
    var reconcile = safe(function () {
      if (!window.FX_LIVE || !window.FX_BYNAME || typeof cartItems === "undefined") return;
      var map = window.FX_BYNAME, out = [], count = {}, changed = false;
      cartItems.forEach(function (it) {
        var info = map[it.name];
        if (!info) { changed = true; return; }                       // removed from the shop
        count[it.name] = (count[it.name] || 0) + 1;
        if (typeof info.stock === "number" && count[it.name] > info.stock) { changed = true; return; }
        if (it.price !== info.price || it.productId !== info.id) {
          changed = true;
          out.push({ name: it.name, price: info.price, productId: info.id });
        } else out.push(it);
      });
      if (changed) {
        cartItems.splice.apply(cartItems, [0, cartItems.length].concat(out));
        if (typeof updateCartUI === "function") updateCartUI();
        say("Your cart was updated to match current prices and stock.");
      }
    });

    /* ---------- start ---------- */
    function start() {
      if (!build()) return;

      ui.home.addEventListener("click", safe(goHome));
      ui.discover.addEventListener("click", safe(goDiscover));
      ui.cart.addEventListener("click", safe(goCart));
      ui.account.addEventListener("click", safe(function () { if (sheetOpen()) closeSheet(); else openSheet(); }));
      ui.ov.addEventListener("click", safe(closeSheet));
      document.addEventListener("keydown", safe(function (e) { if (e.key === "Escape" && sheetOpen()) closeSheet(); }));

      if (isShop) {
        // wrap the existing cart functions without replacing their behaviour
        var baseUpdate = window.updateCartUI;
        if (typeof baseUpdate === "function") {
          window.updateCartUI = function () {
            var r = baseUpdate.apply(this, arguments);
            saveCart(); refreshBadge();
            return r;
          };
        }
        ["openCart", "closeCart"].forEach(function (name) {
          var f = window[name];
          if (typeof f === "function") {
            window[name] = function () { var r = f.apply(this, arguments); sync(); return r; };
          }
        });
        restoreCart();
        document.addEventListener("fx:catalog", reconcile);
        reconcile();

        // clear the saved cart once an order has been placed successfully
        var os = document.getElementById("orderSuccess");
        if (os && typeof MutationObserver !== "undefined") {
          new MutationObserver(safe(function () {
            if (!os.classList.contains("hidden") && cartItems.length) {
              cartItems.splice(0, cartItems.length);
              if (typeof updateCartUI === "function") updateCartUI();
            }
          })).observe(os, { attributes: true, attributeFilter: ["class"] });
        }

        var ticking = false;
        window.addEventListener("scroll", function () {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(function () { ticking = false; sync(); });
        }, { passive: true });

        // arrived from another page asking for the cart or search
        var q = location.search;
        if (/[?&]cart=1/.test(q)) {
          if (typeof openCart === "function") openCart();
          try { history.replaceState(null, "", location.pathname + location.hash); } catch (x) {}
        } else if (/[?&]discover=1/.test(q)) {
          setTimeout(safe(function () { goDiscover(null); }), 250);
          try { history.replaceState(null, "", location.pathname + location.hash); } catch (x) {}
        }
      }

      window.addEventListener("storage", safe(function (e) { if (e.key === CART_KEY) refreshBadge(); }));
      window.addEventListener("pageshow", safe(function () { refreshBadge(); sync(); }));

      // sign-in state (guest sessions count as signed out)
      try {
        if (typeof firebase !== "undefined" && firebase.auth && firebase.apps && firebase.apps.length) {
          firebase.auth().onAuthStateChanged(safe(function (u) {
            user = u && !u.isAnonymous ? u : null;
            if (sheetOpen()) renderSheet();
          }));
        }
      } catch (e) { console.error("Bottom navigation: sign-in state unavailable", e); }

      refreshBadge();
      sync();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safe(start));
    else start();
  } catch (e) {
    console.error("Bottom navigation could not start (website is unaffected):", e);
  }
  /* Account button opens account.html */
document.addEventListener("click", function (e) {
  var el = e.target;
  while (el && el !== document.body) {
    if ((el.textContent || "").trim().toLowerCase() === "account" &&
        (el.tagName === "A" || el.tagName === "BUTTON" || el.className)) {
      e.preventDefault();
      e.stopPropagation();
      location.href = "account.html";
      return;
    }
    el = el.parentElement;
  }
}, true);
})();
