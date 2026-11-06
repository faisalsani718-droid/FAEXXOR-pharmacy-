const CACHE = 'fxp-v1';

const OFFLINE_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#f2f7ff">
<h2 style="color:#0b4ba0">You are offline</h2>
<p>FAEXXOR Pharmacy needs an internet connection. Please check your connection and try again.</p>
<button onclick="location.reload()" style="padding:12px 24px;border:0;border-radius:10px;background:#0b4ba0;color:#fff;font-size:16px">Try again</button>
</body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } }))
    );
    return;
  }

  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
