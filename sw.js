const CACHE='aurion-shell-v15.2.30-r14';
const ASSETS=['./','./index.html','./assets/css/app.css','./assets/js/config.js','./assets/js/main.js','./assets/platforms/android.svg','./assets/platforms/windows.svg','./assets/platforms/macos.svg','./assets/platforms/ios.svg','./branding/aurion.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));});
