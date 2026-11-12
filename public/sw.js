/* Cache only static offline assets; never cache authenticated HTML, API responses, or personal data. */
const CACHE='diction-pwa-v1';
const ASSETS=['/offline.html','/brand/icon-192.png','/brand/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('diction-pwa-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;if(ASSETS.includes(url.pathname)){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));return;}if(request.mode==='navigate'&&!/^\/(bn|en)\/(admin|dashboard|teacher|parent|portal|login|register|admission|trial-class)(\/|$)/.test(url.pathname)){event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));}});
