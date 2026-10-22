/* Nomvula Weather offline support: the app shell is cached; the forecast and
   records always try the network first and fall back to the last copy. */
const SHELL = "nw-shell-v2";
const DATA = "nw-data-v1";
const FILES = ["/", "/index.html", "/style.css", "/app.js", "/manifest.webmanifest", "/icons/logo.png", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(DATA).then(c => c.put(url.pathname, copy)); } return res; }).catch(() => caches.match(url.pathname, { cacheName: DATA }).then(r => r || new Response('{"error":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } }))));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then(r => r || caches.match("/index.html"))));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); return res; })));
  }
});
