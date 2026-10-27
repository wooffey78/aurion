const CACHE='aurion-shell-v15.2.41-r1';
const SCOPE=self.registration.scope;
const ASSETS=[
  './','./index.html','./assets/css/app.css','./assets/js/config.js','./assets/js/main.js',
  './assets/platforms/android.svg','./assets/platforms/windows.svg','./assets/platforms/macos.svg',
  './assets/platforms/ios.svg','./branding/aurion.png'
];
const CACHEABLE_EXACT=new Set([
  new URL('./',SCOPE).pathname,
  new URL('index.html',SCOPE).pathname,
  new URL('manifest.webmanifest',SCOPE).pathname
]);
const CACHEABLE_PREFIXES=[
  new URL('assets/',SCOPE).pathname,
  new URL('branding/',SCOPE).pathname
];
function shouldCacheStaticRequest(request){
  if(request.method!=='GET')return false;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return false;
  return CACHEABLE_EXACT.has(url.pathname)||CACHEABLE_PREFIXES.some(prefix=>url.pathname.startsWith(prefix));
}
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  // Only public application shell assets are cached. API responses may contain private business data.
  if(!shouldCacheStaticRequest(event.request))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response.ok&&response.type!=='opaque'){
        const cache=await caches.open(CACHE);
        await cache.put(event.request,response.clone());
      }
      return response;
    }catch{
      return await caches.match(event.request,{ignoreSearch:true})||Response.error();
    }
  })());
});
