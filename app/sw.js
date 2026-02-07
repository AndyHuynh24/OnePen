const CACHE_NAME = 'onepen-v4';

// Core app files to cache
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/collectData.html',
  '/math.html',
  '/style.css',
  '/config.js',
  '/draw.js',
  '/main.js',
  '/math.js',
  '/predict.js',
  '/saveNote.js',
  '/signin.js',
  '/feedbackCollector.js',
  '/tf.min.js',
  '/cursor.png',
  '/manifest.json',
  // TensorFlow.js model files
  '/autoShapeModel/model.json',
  '/autoShapeModel/group1-shard1of3.bin',
  '/autoShapeModel/group1-shard2of3.bin',
  '/autoShapeModel/group1-shard3of3.bin'
];

// External CDN resources to cache
const CDN_ASSETS = [
  'https://cdn.boxicons.com/fonts/basic/boxicons.min.css',
  'https://fonts.googleapis.com/css2?family=Mali:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,200;1,300;1,400;1,500;1,600;1,700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

// Install event - cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core assets');
      // Cache core assets first
      return cache.addAll(CORE_ASSETS).then(() => {
        // Try to cache CDN assets (don't fail if some don't work)
        return Promise.allSettled(
          CDN_ASSETS.map(url =>
            cache.add(url).catch(err => console.log('[SW] Could not cache:', url))
          )
        );
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Google API requests (auth, drive sync)
  if (url.hostname.includes('google') || url.hostname.includes('googleapis')) {
    return;
  }

  // For navigation requests, try network first then cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the new version
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request) || caches.match('/index.html');
        })
    );
    return;
  }

  // For other requests, try cache first then network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version but also update cache in background
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            })
            .catch(() => {})
        );
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((response) => {
          // Don't cache non-ok responses
          if (!response.ok) {
            return response;
          }

          // Cache the response for future use
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline and not in cache
          console.log('[SW] Fetch failed, no cache for:', request.url);
        });
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
