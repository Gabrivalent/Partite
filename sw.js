const CACHE_NAME = 'partite-cache-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/modals.css',
  './css/responsive.css',
  './js/config.js',
  './js/state.js',
  './js/api.js',
  './js/main.js',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Avviso: alcuni asset non sono stati memorizzati in cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Le chiamate verso Supabase (API / Realtime / Auth) vanno sempre via rete
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Per tutte le risorse dell'app (HTML, JS, CSS, Font), usa la cache se disponibile
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Aggiorna la cache in background se c'è connessione (Stale-While-Revalidate)
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // Fallback per la navigazione offline verso la pagina principale
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
