const V = 'holdem-royale-v5';
const F = ['./', 'index.html', 'style.css', 'skin.css', 'theme.css',
  'DisplaySerif.ttf', 'CinzelDecorative-Bold.ttf', 'Rye-Regular.ttf',
  'poker-core.js', 'engine.js', 'courts.js', 'bots.js', 'game.js',
  'replay-format.js', 'replay.js',
  'icon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => e.waitUntil(
  caches.open(V).then((c) => c.addAll(F)).then(() => self.skipWaiting())));

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x))))
    .then(() => self.clients.claim())));

// Network first: always run the newest build when online, fall back to the
// cached copy when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
