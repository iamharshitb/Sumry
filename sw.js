/* Sumry service worker: keeps the app usable with no signal.
   Bump CACHE whenever index.html changes so phones fetch the new version. */
const CACHE = 'sumry-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  const cloud = new URL(self.location.href).searchParams.get('cloud') === '1';
  const SDK = ['app', 'auth', 'firestore'].map(n => 'https://www.gstatic.com/firebasejs/10.12.2/firebase-' + n + '-compat.js');
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    // Sign-in and sync scripts, saved now so the app also starts with no signal. A failure here must not block install.
    if (cloud) await Promise.all(SDK.map(u => fetch(new Request(u, {mode: 'no-cors'})).then(r => c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');

  // Page loads: show the saved copy straight away (works with weak or no signal), refresh it in the background.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(saved => {
        const fresh = fetch(req).then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
          return res;
        }).catch(() => saved);
        return saved || fresh;
      })
    );
    return;
  }

  // Own files and the Firebase scripts: saved copy first, then network (and save it for next time).
  if (sameOrigin || firebaseSdk) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
