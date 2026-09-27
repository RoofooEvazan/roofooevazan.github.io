/* Service worker: keeps the wiki's data on the device between visits.
 *   data/*.json?v=…, data/pages/*.html?r=…  cache first. The version stamp (from the sync) or
 *                                            page revision is in the URL, so a cached copy is
 *                                            never out of date; older copies are dropped.
 *   everything else of ours (page, scripts, styles, index.json)
 *                                            network first, so deploys and syncs show at once;
 *                                            the saved copy is only used offline.
 * Other sites (wiki images, fonts) are left to the browser.
 */
const DATA = 'pd2wiki-data-v1';
const SHELL = 'pd2wiki-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== DATA && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location).pathname)) return;
  const pinned = /\/data\//.test(url.pathname) && (url.searchParams.has('v') || url.searchParams.has('r'));
  e.respondWith(pinned ? cacheFirst(req, url) : networkFirst(req));
});

async function cacheFirst(req, url) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    // Drop other versions of the same file.
    for (const k of await cache.keys()) {
      const u = new URL(k.url);
      if (u.pathname === url.pathname && u.search !== url.search) await cache.delete(k);
    }
  }
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
