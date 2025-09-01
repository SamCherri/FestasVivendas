// sw.js
const CACHE = "festas-v13"; // ↑ suba a versão quando publicar mudanças
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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

  // só GET do mesmo domínio
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navegação: tenta rede, cai no index.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res)=>{ caches.open(CACHE).then((c)=>c.put(req,res.clone())); return res; })
        .catch(()=> caches.match("./index.html"))
    );
    return;
  }

  // Demais assets: network first com fallback ao cache
  event.respondWith(
    fetch(req)
      .then((res)=>{ caches.open(CACHE).then((c)=>c.put(req,res.clone())); return res; })
      .catch(()=> caches.match(req))
  );
});

// Permite que a página peça para aplicar atualização imediatamente
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// (Opcional) Clique em notificações (se voltar a usar no futuro)
/*
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ includeUncontrolled: true, type: "window" });
      for (const c of allClients) {
        if (c.url.includes("./index.html")) { c.focus(); return; }
      }
      clients.openWindow("./");
    })()
  );
});
*/