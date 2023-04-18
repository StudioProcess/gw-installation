// Default scope of a service worker: ./ relative to the script URL.
// E.g.: //example.com/sw.js has a default scope of //example.com/

const DEBUG = false;

// Change this value to cause the service worker to be reinstalled
// This will also re-cache all resources
const UPDATE_SEQ = 13;

let latest_cache_name = null; // Remember name of cache between 'install' and 'activate' events

async function fetch_resource_list() {
  const res = await fetch('./siginfo.json');
  if (!res.ok) { throw res; }
  let sitemap = (await res.json()).sitemap;
  sitemap = sitemap.filter(f => f !== 'sw.js'); // Don't cache service worker script itself
  sitemap.push('./'); // Add root
  return sitemap;
}

async function install() {
  try {
    const resources = await fetch_resource_list();
    latest_cache_name = 'gw-installation:' + new Date().toISOString();
    const cache = await caches.open(latest_cache_name);
    await cache.addAll(resources); // Always resolves to undefined
    console.log(`Service worker installed. Resources cached: ${resources.length}`);
  } catch (error) {
    console.log('Service worker installation failed:', error);
    throw error;
  }
}

// Only called once per service worker
// Note: If sw.js changes, this is considered a new service worker
// If the promise passed to e.waitUntil rejects, the install is considered a failure and the service worker is discared
self.addEventListener('install', (e) => {
  if (DEBUG) { console.log('[Service worker] install'); }
  self.skipWaiting(); // Causes activate to be called immediately, without waiting for tabs to be closed
  e.waitUntil(install());
});

// Clean up resources used in previous versions of the service worker
// For new service workers activate fires immediately after install
// For updated service workers fires as soon as the old service worker loses control of any open pages
self.addEventListener('activate', (e) => {
  if (DEBUG) { console.log('[Service worker] activate'); }
  // Delete all caches execpt the one last installed
  e.waitUntil(caches.keys().then( keys => Promise.all(
    keys.map(key => {
      if (key !== latest_cache_name) {
        console.log('Deleting old cache:', key);
        return caches.delete(key); 
      }
    })
  )));
});

self.addEventListener('fetch', (e) => {
  if (DEBUG) { console.log(`[Service Worker] fetch ${e.request.url}`); }
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});
