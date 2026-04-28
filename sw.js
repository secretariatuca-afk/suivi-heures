// ============================================================
// sw.js — Service Worker CROUS Suivi Heures
// Version : 2.1 — Compatible PWA Samsung / Android / iOS
// ============================================================

const CACHE_NAME = 'suivi-heures-v2.1';
const OFFLINE_URL = '/suivi-heures/offline.html';

// Ressources à mettre en cache immédiatement à l'installation
const PRECACHE_URLS = [
  '/suivi-heures/',
  '/suivi-heures/index.html',
  '/suivi-heures/manifest.json',
  '/suivi-heures/offline.html',
];

// ── Installation ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        // Continuer même si certaines ressources échouent
        console.warn('[SW] Précache partiel :', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activation — nettoyage des anciens caches ─────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch — stratégie Network First avec fallback cache ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes vers Apps Script (Google)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return; // Laisse le navigateur gérer
  }

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ne pas intercepter les extensions Chrome/Firefox
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Mettre en cache les ressources du même domaine
        if (
          networkResponse.ok &&
          url.hostname === self.location.hostname
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Réseau indisponible → cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          // Fallback page hors-ligne pour les navigations HTML
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL).then((offlinePage) => {
              return offlinePage || new Response(
                '<h1>Hors ligne</h1><p>Vérifiez votre connexion et rechargez la page.</p>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            });
          }

          // Ressource introuvable hors-ligne
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// ── Messages depuis la page ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Répondre au ping de vérification
  if (event.data && event.data.type === 'PING') {
    event.ports[0]?.postMessage({ type: 'PONG', version: CACHE_NAME });
  }
});

// ── Notifications push (si activées) ─────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'CROUS Suivi Heures', body: 'Nouvelle notification' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/suivi-heures/icons/icon-192.png',
      badge: '/suivi-heures/icons/badge-72.png',
      data: data.url || '/suivi-heures/',
      vibrate: [200, 100, 200],
      tag: 'suivi-heures-notif',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/suivi-heures/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/suivi-heures/') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
