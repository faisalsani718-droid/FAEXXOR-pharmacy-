/* FAEXXOR cart store: keeps the cart saved in the phone so it survives moving between pages.
   Load it AFTER script.js on index.html, and on medicine.html (which does not load script.js). */
(function () {
  "use strict";
  var KEY = "fx_cart_v1"; /* same key and format that checkout.html reads */

  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      var a = o && Array.isArray(o.items) ? o.items : [];
      return a.filter(function (i) { return i && typeof i.name === "string" && typeof i.price === "number" && isFinite(i.price); });
    } catch (e) { return []; }
  }
  function write(a) {
    try {
      var items = a.map(function (i) {
        var u = { name: i.name, price: Number(i.price) || 0 };
        if (i.productId) u.productId = i.productId;
        return u;
      });
      if (items.length) localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items: items }));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }

  window.FXCart = {
    count: function () { return read().length; },
    qty: function (id) { return read().filter(function (i) { return i.productId === id; }).length; },
    add: function (name, price, productId) {
      var a = read(); a.push({ name: name, price: Number(price) || 0, productId: productId || "" });
      write(a); return a.length;
    }
  };

  /* ----- index.html only: connect the saved cart to the existing cart code ----- */
  if (typeof cartItems === "undefined" || typeof updateCartUI !== "function") return;

  var render = updateCartUI;
  function pull() {
    var a = read();
    cartItems.splice(0, cartItems.length);
    a.forEach(function (x) { cartItems.push(x); });
  }

  pull();
  render();
  window.updateCartUI = function () { render(); write(cartItems); };

  /* back button / another tab changed the cart */
  window.addEventListener("pageshow", function (e) { if (e.persisted) { pull(); render(); } });
  window.addEventListener("storage", function (e) { if (e.key === KEY) { pull(); render(); } });

  /* medicine.html "View cart" link */
  if (new URLSearchParams(location.search).get("cart") === "1") {
    if (typeof openCart === "function") openCart();
    history.replaceState(null, "", location.pathname + location.hash);
  }
})();
