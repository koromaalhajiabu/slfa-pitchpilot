const CACHE_NAME = 'slfa-pitchpilot-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
// Third-party scripts the page needs to run. Cached so the app opens offline.
const CDN_SCRIPTS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/framer-motion@11.11.9/dist/framer-motion.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

const NEVER_CACHE_HOSTS = ['supabase.co', 'supabase.in'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Best effort: one failed CDN download should not block installation.
    await Promise.all(CDN_SCRIPTS.map(url =>
      cache.add(new Request(url, { mode: 'cors' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NEVER_CACHE_HOSTS.some(h => url.hostname.endsWith(h))) return;

  const isPage = url.origin === self.location.origin && (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isPage) {
      // Pages: network first, so design and content updates appear straight away.
      // The saved copy is used only when the phone is offline.
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put('./index.html', res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
        throw err;
      }
    }
    // Other files (icons, background, manifest): saved copy first, then network.
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  })());
});
