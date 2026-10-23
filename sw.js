// Service worker: makes the app installable and fully usable offline.
//  - App shell is precached on install (bump SHELL_VERSION whenever you deploy changes).
//  - Voice-pack audio is cached the first time it is fetched, and kept across app updates.
//  - voicepacks/packs.json is network-first so new packs show up as soon as you are online.

const SHELL_VERSION = 'v5';
const SHELL_CACHE = `bingo-shell-${SHELL_VERSION}`;
const VOICE_CACHE = 'bingo-voice-v1'; // keep in sync with js/audio.js

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/ui.js',
  'js/patterns.js',
  'js/audio.js',
  'js/setup.js',
  'js/play.js',
  'js/balls.js',
  'js/install.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'voicepacks/packs.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bingo-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Helper to strip Safari's redirect flag from cached responses
function cleanResponse(response) {
  if (response && response.redirected) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return cleanResponse(hit); // Cleaned for Safari
    throw new Error('offline');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return cleanResponse(hit); // Cleaned for Safari
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('/voicepacks/packs.json')) {
    event.respondWith(networkFirst(request, VOICE_CACHE));
  } else if (url.pathname.includes('/voicepacks/')) {
    // the app's "Cache voices" button asks for cache: 'reload' to force fresh copies
    event.respondWith(request.cache === 'reload' ? fetch(request) : cacheFirst(request, VOICE_CACHE));
  } else if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((hit) => cleanResponse(hit) || fetch(request))
    );
  } else {
    event.respondWith(
      caches.match(request).then((hit) => cleanResponse(hit) || fetch(request))
    );
  }
});