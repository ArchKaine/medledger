const CACHE_NAME = 'medledger-v5'; // Bumped version to include V5 architecture files
const ASSETS = [
    '/',
    '/index.html',
    '/privacy.html',
    '/terms.html',
    '/newstyle.css',
    'vars.css',
    'base.css',
    'layout.css',
    'components.css',
    'modules.css',
    /*'/style.css',*/
    '/app.js',
    '/profiles.js',
    '/reports.js',
    '/engine.js',
    '/ui.js',
    '/analytics.js',
    '/vault.js',
    '/clinical.js',
    '/help.js',
    '/dev.js',
    '/interactions.json',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install event: Cache essential files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event: Network first, fallback to cache
self.addEventListener('fetch', event => {
    // Only intercept HTTP/HTTPS requests (ignores browser extensions, etc.)
    if (!(event.request.url.startsWith('http:') || event.request.url.startsWith('https:'))) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone the response and update the cache silently in the background
                const resClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, resClone);
                });
                return response;
            })
            .catch(() => {
                // If offline, serve from cache
                return caches.match(event.request);
            })
    );
});
