/*
  ECOSWITCH — Service Worker
  Precarga el shell de la app y la fuente DSEG7 en la instalación, para que
  todo funcione sin conexión de ahí en adelante — resolviendo de raíz (no
  dependiendo de una caché incidental del navegador) el punto que se discutió
  sobre la fuente y el modo avión.
*/

const CACHE_NAME = "ecoswitch-cache-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./banner.jpg"
];

const FUENTE_DSEG7 =
  "https://cdn.jsdelivr.net/npm/dseg@0.46.0/fonts/DSEG7-Classic/DSEG7Classic-Bold.woff2";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Se agrega la fuente por separado: si el CDN no respondiera en el
      // momento de instalar, no queremos que eso tumbe la instalación de
      // todo el resto del shell, que sí es imprescindible.
      return cache.addAll(APP_SHELL).then(function () {
        return cache.add(FUENTE_DSEG7).catch(function () {
          // Si falla, la app igual queda instalada y usable; la fuente
          // se reintentará cachear en el próximo fetch exitoso (ver abajo).
        });
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = event.request.url;

  // Las llamadas al backend (Apps Script) NO se interceptan en absoluto.
  // Apps Script responde con una redireccion (302) hacia googleusercontent.com, y
  // una respuesta redirigida servida por un service worker es rechazada por el
  // navegador. Al no llamar a respondWith(), la peticion va directo a la red como
  // si el service worker no existiera, que es justo lo que necesita.
  if (url.indexOf("script.google.com") !== -1 ||
      url.indexOf("googleusercontent.com") !== -1) {
    return;
  }

  // Todo lo demás (shell de la app, fuente): cache-first, y si se consigue
  // por red una copia nueva, se guarda para la próxima vez sin conexión.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copia); });
        }
        return resp;
      });
    })
  );
});
