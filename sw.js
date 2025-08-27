const CACHE = 'vivendas-v22';
const ASSETS = [
  'index.html', 'style.css?v=22', 'app.js?v=22',
  'favicon.svg', 'hero.svg', 'manifest.webmanifest'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp=>{
      if (resp.ok && request.url.startsWith(location.origin)) {
        const copy = resp.clone();
        caches.open(CACHE).then(c=>c.put(request, copy));
      }
      return resp;
    }).catch(()=> cached))
  );
});