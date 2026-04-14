const CACHE_NAME = 'song-detector-v1';
const SHARE_CACHE = 'song-detector-share';
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== SHARE_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Intercept the share-target POST
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Network-first for navigation, cache-first for assets
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── Share Target Handler ──────────────────────────────────
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('video');

    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      // Store the file blob with metadata in headers
      await cache.put(
        '/pending-video',
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'video/mp4',
            'X-File-Name': encodeURIComponent(file.name || 'shared-video'),
            'X-File-Size': String(file.size),
          }
        })
      );

      // Notify any open clients
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => client.postMessage({ type: 'SHARED_VIDEO_READY' }));
    }
  } catch (err) {
    console.error('[SW] Share target error:', err);
  }

  // Redirect back to app with flag
  return Response.redirect('/?shared=1', 303);
}
