const CACHE = "festas-v5"; // mude o sufixo sempre que alterar CSS/JS/HTML
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./diag.html" // opcional: remova se não quiser offline
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET e mesma origem (evita reqs externas/POST irem pro cache)
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) {
    return;
  }

  // Navegação → fallback para index.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Network-first para assets
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});