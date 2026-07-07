var CACHE_NAME = 'kap-app-v2026-07-07-21-43';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './app-init.js',
  './app-router.js',
  './manifest.webmanifest',
  './service-worker.js',
  './assets/icon-192.svg',
  './assets/icon-512.svg',
  './shared/ids.js',
  './shared/settings.js',
  './shared/item-discovery.js',
  './shared/item-entry-rules.js',
  './data/stores.js',
  './data/db.js',
  './ui/ui.js',
  './features/items/items-service.js',
  './features/categories/categories-service.js',
  './features/lists/lists-service.js',
  './features/lists/lists-page.js',
  './features/templates/templates-service.js',
  './features/templates/templates-page.js',
  './features/settings/settings-page.js',
  './features/main/main-page.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') {
    return;
  }

  var requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put('./index.html', responseClone);
          });
          return response;
        })
        .catch(function () {
          return caches.match('./index.html');
        })
    );
    return;
  }

  var pathname = requestUrl.pathname || '';
  var shouldPreferNetwork =
    pathname.endsWith('/appsettings.json') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.json');

  if (shouldPreferNetwork) {
    event.respondWith(
      fetch(event.request)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(function (networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    })
  );
});



