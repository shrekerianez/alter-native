/* AlterNative Stamp Manager Duo 0.3.0 */
const CACHE='alternative-stamp-duo-v0.3.0';
const SHELL=['./','./index.html','./styles.css?v=0.3.0','./app.js?v=0.3.0','./manifest.webmanifest','./assets/crest.svg','./assets/leather.webp','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png','./assets/sample-blue.png','./assets/sample-red.png','./assets/sample-signature.png','./assets/demo.pdf'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin===self.location.origin){
  // Avoid serving outdated interface files indefinitely on iOS Safari.
  if(e.request.mode==='navigate'||/\.(html|css|js)$/.test(u.pathname)){
   e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;})));return;
 }
 if(u.hostname==='cdn.jsdelivr.net')e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;})));
});