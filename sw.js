// sw.js — cache simples (PWA) — sem tema claro/escuro
const CACHE = "festas-stable-1"; // mude esse nome quando publicar de novo

const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=stable1",
  "./app.js",
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