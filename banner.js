// banner.js - auto-sliding advert banner for index.html
// Pictures come from the Firestore "banners" collection (managed in Admin > Store > Banners).
// Until you add real pictures, three placeholder adverts are shown.
// SAFETY: everything is inside try/catch. If anything fails, the banner stays empty and the website works as before.
(function () {
  "use strict";
  try {
    var host = document.getElementById("fxBanner");
    if (!host) return;

    var INTERVAL = 4000;      // time each picture stays on screen (milliseconds)
    var SLIDE_MS = 600;       // how long the push-to-the-left movement takes
    var MAX = 8;              // most banners shown
    var CACHE_KEY = "fx_banners_v1";

    function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

    /* ---------- styles ---------- */
    var css = document.createElement("style");
    css.id = "fxBannerCss";
    css.textContent =
      "#fxBanner{max-width:1000px;margin:14px auto 6px;padding:0 14px}" +
      "#fxBanner .fxbnr-view{position:relative;overflow:hidden;border-radius:16px;aspect-ratio:16/7;background:#e3f3fb;" +
      "box-shadow:0 4px 16px rgba(4,140,200,.18);touch-action:pan-y}" +
      "#fxBanner .fxbnr-track{display:flex;height:100%;will-change:transform}" +
      "#fxBanner .fxbnr-slide{flex:0 0 100%;width:100%;height:100%;display:block;overflow:hidden}" +
      "#fxBanner .fxbnr-slide img{width:100%;height:100%;object-fit:cover;display:block;user-select:none;-webkit-user-drag:none}" +
      "#fxBanner .fxbnr-dots{display:flex;justify-content:center;gap:7px;margin:10px 0 2px}" +
      "#fxBanner .fxbnr-dot{width:8px;height:8px;border-radius:99px;background:#c3d6e4;border:0;padding:0;cursor:pointer;transition:width .3s,background .3s}" +
      "#fxBanner .fxbnr-dot.on{width:22px;background:#0b8fd0}" +
      "#fxBanner .fxbnr-skel{animation:fxbnrPulse 1.3s ease-in-out infinite}" +
      "@keyframes fxbnrPulse{0%,100%{opacity:1}50%{opacity:.55}}" +
      "@media (prefers-reduced-motion:reduce){#fxBanner .fxbnr-skel{animation:none}}";
    document.head.appendChild(css);

    /* ---------- placeholder adverts (shown until you add real pictures in the admin) ---------- */
    function ph(c1, c2, line1, line2, link) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
        '<rect width="960" height="420" fill="url(#g)"/>' +
        '<circle cx="830" cy="70" r="160" fill="#fff" opacity=".09"/><circle cx="910" cy="370" r="120" fill="#fff" opacity=".09"/>' +
        '<text x="60" y="185" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" fill="#fff">' + line1 + '</text>' +
        '<text x="60" y="255" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#eaf8ff">' + line2 + '</text>' +
        '<text x="60" y="370" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" letter-spacing="3" fill="#ffffff" opacity=".85">FX PHARMARKET</text>' +
        '</svg>';
      return { src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), link: link || "" };
    }
    var PLACEHOLDERS = [
      ph("#0b8fd0", "#0b4a9e", "Quality Medicines", "Trusted service you can rely on", "#products"),
      ph("#1f9d55", "#0b8fd0", "Upload Your Prescription", "Our pharmacist will help you", "upload-prescription.html"),
      ph("#0b4a9e", "#1f9d55", "Order Today", "Track your order from start to delivery", "#products")
    ];

    /* ---------- safety checks on data coming from the database ---------- */
    function safeImage(s) {
      s = String(s || "");
      return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s) || /^https:\/\/\S+$/.test(s) ? s : "";
    }
    function safeLink(l) {
      l = String(l || "").trim();
      if (!l) return "";
      return /^(https?:\/\/\S+|#[\w-]*|[\w\-.\/]+\.html(\?\S*)?(#\S*)?)$/i.test(l) ? l : "";
    }

    /* ---------- slider ---------- */
    var timer = null, idx = 0, n = 0, busy = false, track = null, dots = [], moved = false, hold = false;

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { stop(); if (n > 1) timer = setInterval(function () { if (!hold && !document.hidden) next(); }, INTERVAL); }
    function mark() {
      dots.forEach(function (d, i) { d.classList.toggle("on", i === idx % n); });
    }
    function go(i, animate) {
      track.style.transition = animate ? "transform " + SLIDE_MS + "ms ease" : "none";
      track.style.transform = "translate3d(" + (-i * 100) + "%,0,0)";
      mark();
    }
    function next() {
      if (n < 2 || busy) return;
      busy = true; idx++; go(idx, true);
      setTimeout(function () {
        if (idx >= n) { idx = 0; go(0, false); }       // after the copy of picture 1, jump back to the real picture 1
        busy = false;
      }, SLIDE_MS + 40);
    }
    function prev() {
      if (n < 2 || busy) return;
      busy = true;
      if (idx === 0) { idx = n; go(n, false); void track.offsetWidth; }
      idx--; go(idx, true);
      setTimeout(function () { busy = false; }, SLIDE_MS + 40);
    }

    function render(list) {
      stop();
      host.innerHTML = "";
      idx = 0; busy = false; dots = [];
      n = list.length;
      if (!n) return;

      var view = el("div", "fxbnr-view");
      track = el("div", "fxbnr-track");
      var all = n > 1 ? list.concat([list[0]]) : list;       // a copy of picture 1 at the end makes the loop smooth
      all.forEach(function (it, i) {
        var s;
        if (it.link) {
          s = el("a", "fxbnr-slide");
          s.href = it.link;
          if (/^https?:/i.test(it.link)) { s.target = "_blank"; s.rel = "noopener"; }
        } else s = el("div", "fxbnr-slide");
        if (i >= n) s.setAttribute("aria-hidden", "true");
        var img = el("img");
        img.src = it.src; img.alt = "Advert"; img.draggable = false;
        if (i > 0) img.loading = "lazy";
        s.appendChild(img);
        track.appendChild(s);
      });
      view.appendChild(track);
      host.appendChild(view);

      if (n > 1) {
        var bar = el("div", "fxbnr-dots");
        for (var i = 0; i < n; i++) {
          (function (k) {
            var d = el("button", "fxbnr-dot");
            d.type = "button"; d.setAttribute("aria-label", "Show advert " + (k + 1));
            d.addEventListener("click", function () {
              if (busy) return;
              idx = k; go(k, true); start();
            });
            dots.push(d); bar.appendChild(d);
          })(i);
        }
        host.appendChild(bar);
      }
      go(0, false);

      // swipe with a finger; the timer waits while the customer is touching the banner
      var sx = 0, sy = 0, dx = 0, drag = false;
      view.addEventListener("touchstart", function (e) {
        if (n < 2 || busy) return;
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; drag = false; hold = true; moved = false;
      }, { passive: true });
      view.addEventListener("touchmove", function (e) {
        if (n < 2 || busy || !hold) return;
        var t = e.touches[0]; dx = t.clientX - sx; var dy = t.clientY - sy;
        if (!drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) drag = true;
        if (drag) {
          moved = true;
          track.style.transition = "none";
          track.style.transform = "translate3d(calc(" + (-idx * 100) + "% + " + dx + "px),0,0)";
        }
      }, { passive: true });
      function release() {
        if (!hold) return;
        hold = false;
        if (drag) {
          if (dx < -40) next(); else if (dx > 40) prev(); else go(idx, true);
          setTimeout(function () { moved = false; }, 60);
        }
        drag = false; start();
      }
      view.addEventListener("touchend", release, { passive: true });
      view.addEventListener("touchcancel", release, { passive: true });
      view.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

      start();
    }

    function skeleton() {
      host.innerHTML = "";
      var v = el("div", "fxbnr-view fxbnr-skel");
      host.appendChild(v);
    }

    /* ---------- load pictures from Firestore ---------- */
    function readCache() {
      try {
        var a = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
        return Array.isArray(a) ? a.filter(function (x) { return x && safeImage(x.src); }).slice(0, MAX) : [];
      } catch (e) { return []; }
    }
    function writeCache(list) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) { /* storage full: not a problem */ }
    }
    function fetchBanners() {
      return new Promise(function (ok, bad) {
        if (typeof firebase === "undefined" || !firebase.firestore || !firebase.apps || !firebase.apps.length) { bad(new Error("no firebase")); return; }
        var t = setTimeout(function () { bad(new Error("timeout")); }, 7000);
        firebase.firestore().collection("banners").get().then(function (snap) {
          clearTimeout(t);
          var rows = [];
          snap.forEach(function (d) {
            var o = d.data() || {};
            if (o.active === false) return;
            var src = safeImage(o.image);
            if (!src) return;
            rows.push({ src: src, link: safeLink(o.link), order: Number(o.order) || 0 });
          });
          rows.sort(function (a, b) { return a.order - b.order; });
          ok(rows.slice(0, MAX).map(function (r) { return { src: r.src, link: r.link }; }));
        }, function (e) { clearTimeout(t); bad(e); });
      });
    }

    var cached = readCache();
    var shownKey = "";
    if (cached.length) { render(cached); shownKey = JSON.stringify(cached); } else skeleton();

    fetchBanners().then(function (list) {
      if (!list.length) { writeCache([]); if (shownKey !== "ph") { render(PLACEHOLDERS); shownKey = "ph"; } return; }
      var key = JSON.stringify(list);
      writeCache(list);
      if (key !== shownKey) { render(list); shownKey = key; }
    }).catch(function (e) {
      console.error("Banner:", e);
      if (!shownKey) { render(PLACEHOLDERS); shownKey = "ph"; }
    });

    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
  } catch (e) {
    console.error("Banner could not start (website is unaffected):", e);
  }
})();
