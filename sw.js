// sw.js — cache leve (instalação do PWA)
const CACHE = "festas-v3"; // << trocado para v3 para forçar atualização
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=mobile2",
  "./app.js?v=mobile2",
  "./config.js",
  "./manifest.webmanifest",
  "./favicon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});