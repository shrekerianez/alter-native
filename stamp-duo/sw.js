/* AlterNative Stamp Manager Duo · v0.3.0 */
const CACHE='alternative-stamp-duo-v0.3.0';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/crest.svg','./assets/leather.webp','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png','./assets/sample-blue.png','./assets/sample-red.png','./assets/sample-signature.png','./assets/demo.pdf'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('alternative-stamp-duo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
 if(url.origin===self.location.origin){
  const isCode=req.mode==='navigate'||/\.(?:html|css|js|webmanifest)$/.test(url.pathname);
  if(isCode){e.respondWith(fetch(req).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return resp;}).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));return;}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return resp;})));return;
 }
 if(url.hostname==='cdn.jsdelivr.net')e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return resp;})));
});