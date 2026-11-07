// Retire the previous cache-first worker: forms and generated PDFs remain memory-only.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('lotte-consent-')).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
// No request interception, no background synchronization, and no persistent data.
