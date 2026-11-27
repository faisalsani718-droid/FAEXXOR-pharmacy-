// @ts-nocheck
/*!
 * FX PHARMARKET: website-wide Light / Auto / Dark theme
 *
 * Add ONE line inside <head> of every page, before other scripts:
 *     <script src="theme.js"></script>
 * (Pages that already load bottom-nav.js get it automatically.)
 *
 * How it works
 *  - The customer's choice (Light, Auto or Dark) is saved on the phone and applied on every page.
 *  - Light mode does nothing at all, so your pages look exactly as they do today.
 *  - Dark mode recolours light surfaces, dark text and light borders it finds on the page,
 *    keeps coloured buttons, badges and gradients as they are, and follows content added later.
 *  - Elements marked data-fx-own (the account page, the bottom bar) style themselves and are skipped.
 *  - Everything runs inside try/catch. If anything fails, the page stays light and keeps working.
 */
(function () {
  "use strict";
  try {
    if (window.FXTheme) return;

    var KEY = "fx-theme";          // "light" | "dark" | "auto"
    var OLD = "fx-dark";           // old account-page key, kept in step for safety
    var root = document.documentElement;
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    var listeners = [];

    function stored() {
      try {
        var v = localStorage.getItem(KEY);
        if (v === "light" || v === "dark" || v === "auto") return v;
        var o = localStorage.getItem(OLD);
        if (o === "1") return "dark";
      } catch (e) { /* storage blocked */ }
      return "light";              // default: the site looks exactly as before until the customer chooses
    }
    var mode = stored();
    function isDark() { return mode === "dark" || (mode === "auto" && !!(mq && mq.matches)); }

    /* ---------- base styles (tiny, injected at once) ---------- */
    var css =
      "html.fx-dark{background:#0a1822;color-scheme:dark}" +
      "html.fx-dark [data-fxs]{background-color:var(--fxbg,#112636)!important}" +
      "html.fx-dark [data-fxt]{color:var(--fxc,#cfe3ef)!important}" +
      "html.fx-dark [data-fxb]{border-color:rgba(255,255,255,.15)!important}" +
      "html.fx-dark ::placeholder{color:#7f9bad!important;opacity:1}" +
      "html.fx-dark img:not([data-fx-own] *){filter:brightness(.93)}" +
      "html.fx-dark ::selection{background:rgba(56,189,248,.35)}";
    var st = document.createElement("style");
    st.id = "fxThemeCss";
    st.textContent = css;
    (document.head || root).appendChild(st);

    /* ---------- colour helpers ---------- */
    function parse(c) {
      var m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,\/]+([\d.]+%?))?\s*\)/.exec(c || "");
      if (!m) return null;
      var a = m[4] === undefined ? 1 : (String(m[4]).slice(-1) === "%" ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r: +m[1], g: +m[2], b: +m[3], a: a };
    }
    function lum(c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
    function toHsl(c) {
      var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
      if (mx !== mn) {
        var d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
      }
      return { h: h, s: s, l: l };
    }
    function fromHsl(h, s, l) {
      function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      return "rgb(" + Math.round(f(p, q, h + 1 / 3) * 255) + "," + Math.round(f(p, q, h) * 255) + "," + Math.round(f(p, q, h - 1 / 3) * 255) + ")";
    }
    function lightText(c) {            // dark text colour -> a readable light colour of the same hue
      var h = toHsl(c);
      return fromHsl(h.h, Math.min(h.s, 0.8), Math.min(0.92, Math.max(0.66, 1 - h.l * 0.55)));
    }
    var TIERS = { a: [17, 38, 54], b: [21, 50, 71], c: [26, 59, 82], bg: [10, 24, 34] };

    /* ---------- scanner ---------- */
    var SKIP = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|IMG|VIDEO|CANVAS|IFRAME|PICTURE|SOURCE|SVG|PATH|CIRCLE|RECT|G|LINE|POLYLINE|POLYGON|DEFS|USE)$/i;
    var ctxOf = new WeakMap();         // element -> "s" (dark surface), "k" (kept colour), "o" (own styled)

    function classify(el, cs, parentCtx) {
      var own = parentCtx === "o" || el.hasAttribute("data-fx-own");
      if (own) return { ctx: "o" };
      var out = { ctx: parentCtx || "s" };
      var bg = parse(cs.backgroundColor);
      var bgi = cs.backgroundImage;
      var keep = false, tier = null, alpha = 1;

      if (bgi && bgi !== "none" && /gradient/.test(bgi)) {         // coloured gradients stay as they are
        var stops = bgi.match(/rgba?\([^)]*\)/g) || [], minL = 1, hasOpaque = false;
        stops.forEach(function (s) { var p = parse(s); if (p && p.a >= 0.5) { hasOpaque = true; minL = Math.min(minL, lum(p)); } });
        if (hasOpaque && minL < 0.88) keep = true;
      }
      if (!keep && bg && bg.a >= 0.5) {
        var L = lum(bg);
        if (L >= 0.88) { tier = L >= 0.985 ? "a" : L >= 0.93 ? "b" : "c"; alpha = bg.a; }
        else keep = true;
      }
      if (keep) { out.ctx = "k"; out.keep = true; }
      else if (tier) {
        if (el === document.body || el === root) tier = "bg";
        var t = TIERS[tier];
        out.ctx = "s"; out.tier = tier; out.bg = "rgba(" + t[0] + "," + t[1] + "," + t[2] + "," + alpha + ")";
      }
      return out;
    }

    var scanning = false;
    function scan(nodes) {
      if (scanning || !isDark()) return;
      scanning = true;
      var wasDark = root.classList.contains("fx-dark");
      if (wasDark) root.classList.remove("fx-dark");      // measure the authored colours (no paint happens in between)
      try {
        var all = [];
        nodes.forEach(function (n) {
          if (!n || n.nodeType !== 1) return;
          all.push(n);
          var d = n.querySelectorAll("*");
          for (var i = 0; i < d.length && all.length < 6000; i++) all.push(d[i]);
        });
        var rows = [];
        all.forEach(function (el) {
          if (SKIP.test(el.tagName) || el.closest && el.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
          var cs = getComputedStyle(el);
          var pc = el.parentElement ? ctxOf.get(el.parentElement) : "s";
          var info = classify(el, cs, pc);
          ctxOf.set(el, info.ctx);
          var col = parse(cs.color), bd = null;
          ["Top", "Bottom", "Left", "Right"].some(function (side) {
            if (parseFloat(cs["border" + side + "Width"]) > 0) { var p = parse(cs["border" + side + "Color"]); if (p && p.a >= 0.5 && lum(p) >= 0.8) { bd = true; return true; } }
            return false;
          });
          rows.push([el, info, col, bd]);
        });
        rows.forEach(function (r) {
          var el = r[0], info = r[1], col = r[2], bd = r[3];
          el.removeAttribute("data-fxs"); el.removeAttribute("data-fxt"); el.removeAttribute("data-fxb");
          if (info.ctx === "o") return;
          if (info.tier) { el.setAttribute("data-fxs", info.tier); el.style.setProperty("--fxbg", info.bg); }
          if (bd) el.setAttribute("data-fxb", "1");
          if (info.ctx !== "k" && col && col.a >= 0.4 && lum(col) < 0.55) {
            el.setAttribute("data-fxt", "1"); el.style.setProperty("--fxc", lightText(col));
          }
        });
      } catch (e) { console.error("Theme scan:", e); }
      if (wasDark) root.classList.add("fx-dark");
      scanning = false;
    }

    /* ---------- follow content that appears later ---------- */
    var pending = [], timer = null, observer = null;
    function queue(n) {
      pending.push(n);
      clearTimeout(timer);
      timer = setTimeout(function () { var p = pending; pending = []; scan(p); }, 60);
    }
    function observe() {
      if (observer || !window.MutationObserver || !document.body) return;
      observer = new MutationObserver(function (list) {
        if (scanning || !isDark()) return;
        list.forEach(function (m) {
          if (m.type === "childList") m.addedNodes.forEach(function (n) { if (n.nodeType === 1) queue(n); });
          else if (m.type === "attributes" && m.target.nodeType === 1) queue(m.target);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    }

    /* ---------- apply ---------- */
    function setMeta(dark) {
      var m = document.querySelector('meta[name="theme-color"]');
      if (!m) return;
      if (!m.getAttribute("data-fx-light")) m.setAttribute("data-fx-light", m.getAttribute("content") || "#ffffff");
      m.setAttribute("content", dark ? "#0a1822" : m.getAttribute("data-fx-light"));
    }
    function apply() {
      var d = isDark();
      root.classList.toggle("fx-dark", d);
      root.setAttribute("data-theme", d ? "dark" : "light");
      if (document.body) document.body.classList.toggle("dark", d);   // old pages used body.dark
      setMeta(d);
      if (d && document.body) { observe(); scan([document.body]); }
      listeners.forEach(function (fn) { try { fn(mode, d); } catch (e) { /* ignore */ } });
    }

    window.FXTheme = {
      get: function () { return mode; },
      isDark: isDark,
      set: function (m) {
        if (m !== "light" && m !== "dark" && m !== "auto") return;
        mode = m;
        try { localStorage.setItem(KEY, m); localStorage.setItem(OLD, m === "dark" ? "1" : "0"); } catch (e) { /* ignore */ }
        apply();
      },
      onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); }
    };

    // before the page paints: set the class at once so there is no white flash
    root.classList.toggle("fx-dark", isDark());
    root.setAttribute("data-theme", isDark() ? "dark" : "light");

    function ready() { apply(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
    window.addEventListener("load", function () { if (isDark() && document.body) scan([document.body]); });
    window.addEventListener("pageshow", function () { mode = stored(); apply(); });
    window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === OLD) { mode = stored(); apply(); } });
    if (mq) {
      var onMq = function () { if (mode === "auto") apply(); };
      if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
    }
  } catch (e) {
    console.error("Theme could not start (website is unaffected):", e);
  }
})();
