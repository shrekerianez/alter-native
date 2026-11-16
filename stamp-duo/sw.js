const CACHE = 'alternative-stamp-duo-v0.2.0';
const SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/crest.svg','./assets/leather.webp','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return; const url = new URL(e.request.url);
  if(url.origin===location.origin){e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;})));return;}
  // PDF.js and pdf-lib are cached on first online use; once cached, editing works offline.
  if(url.hostname==='cdn.jsdelivr.net'){e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;})));}
});