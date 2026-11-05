/* FAEXXOR Pharmacy - service worker (v1)
 *
 * WHAT IT DOES
 *  - Lets Android install the site as an app.
 *  - Keeps a small copy of public pictures (images/ and icons/) and CSS files so they load faster.
 *  - Shows a friendly "You are offline" page when there is no internet.
 *
 * WHAT IT NEVER DOES
 *  - It never touches Firebase, Firestore, login, orders, prescriptions or payments:
 *    every request to another website (Google / Firebase / CDNs) is ignored completely.
 *  - It never stores pages (HTML) or JavaScript, so customers always get your newest code and products.
 *  - It never handles POST / PUT / PATCH / DELETE requests.
 *  - It never deletes caches that do not start with "faexxor-pwa-".
 *
 * HOW TO PUSH AN UPDATE: upload the new website files as usual. The browser re-checks this file
 * on every visit. If you change anything in it (for example VERSION below), the new version
 * installs itself and the old "faexxor-pwa-" caches are removed automatically.
 */
"use strict";

var VERSION = "v1";
var PREFIX = "faexxor-pwa-";
var ASSET_CACHE = PREFIX + "assets-" + VERSION;
var MAX_ASSETS = 150; // keeps phone storage use small

var OFFLINE_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta name="theme-color" content="#0878d1"><title>Offline - FAEXXOR Pharmacy</title>' +
  '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'font-family:system-ui,Arial,sans-serif;background:#f3f8ff;color:#1b2733;text-align:center;padding:24px}' +
  '.c{max-width:360px}.i{width:72px;height:72px;border-radius:20px;background:#0878d1;color:#fff;' +
  'font-size:44px;line-height:72px;margin:0 auto 18px;font-weight:700}h1{font-size:1.35rem;color:#0b4a9e;margin:0 0 10px}' +
  'p{color:#55677a;line-height:1.5;margin:0 0 20px}button{border:0;border-radius:12px;background:#0b4a9e;color:#fff;' +
  'font-size:1rem;font-weight:700;padding:14px 22px;cursor:pointer}</style></head><body><div class="c">' +
  '<div class="i">+</div><h1>You are offline</h1>' +
  '<p>FAEXXOR Pharmacy needs an internet connection to show medicines, place orders and upload prescriptions. ' +
  'Please check your connection and try again.</p>' +
  '<button type="button" onclick="location.reload()">Try again</button></div></body></html>';

function offlinePage() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// only plain, successful, same-site answers that are allowed to be stored
function cacheable(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return false;
  var cc = res.headers.get("Cache-Control") || "";
  return !/no-store|private/i.test(cc);
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - MAX_ASSETS;
    if (extra <= 0) return;
    return Promise.all(keys.slice(0, extra).map(function (k) { return cache.delete(k); }));
  });
}

// pictures: show the saved copy at once, refresh it in the background
function staleWhileRevalidate(event) {
  var req = event.request;
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (cacheable(res)) {
          var copy = res.clone();
          cache.put(req, copy).then(function () { return trim(cache); }).catch(function () {});
        }
        return res;
      }).catch(function () { return cached || Response.error(); });
      if (cached) { event.waitUntil(network.catch(function () {})); return cached; }
      return network;
    });
  });
}

// CSS: always try the internet first so design changes appear immediately
function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (cacheable(res)) {
      var copy = res.clone();
      caches.open(ASSET_CACHE).then(function (cache) { return cache.put(req, copy); }).catch(function () {});
    }
    return res;
  }).catch(function () {
    return caches.open(ASSET_CACHE).then(function (cache) {
      return cache.match(req);
    }).then(function (hit) { return hit || Response.error(); });
  });
}

self.addEventListener("install", function () {
  // nothing is pre-downloaded, so installing can never fail because of a missing file
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        // only remove OLD caches of this app; anything else belongs to someone else
        if (n.indexOf(PREFIX) === 0 && n !== ASSET_CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  if (req.method !== "GET") return;                                  // never touch POST / PUT / PATCH / DELETE
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;                   // Firebase, Google, CDNs: not our business
  if (req.headers.has("range")) return;                              // video / partial downloads

  // opening a page: always the live page; offline message only if the internet is down
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(offlinePage));
    return;
  }

  var path = url.pathname;
  if (/^\/(images|icons)\//.test(path) && /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(path)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (/\.css$/i.test(path)) {
    event.respondWith(networkFirst(req));
    return;
  }
  // everything else (JavaScript, JSON, data requests): handled by the browser exactly as before
});
