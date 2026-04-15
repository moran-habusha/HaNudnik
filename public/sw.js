const CACHE = 'hanudnik-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('push', event => {
  const data = event.data?.json() || {}
  const title = data.title || 'HaNudnik 🏠'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'hanudnik',
    data: data.data || { url: '/bot' },
    actions: data.actions || [],
    dir: 'rtl',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data || {}
  const baseUrl = data.url || '/bot'
  const url = (event.action && data.msg_id)
    ? `${baseUrl}?action=${encodeURIComponent(event.action)}&msg=${encodeURIComponent(data.msg_id)}`
    : baseUrl
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/bot'))
      if (existing && !event.action) return existing.focus()
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request).then(r => r || new Response('', { status: 503 })))
  );
});
