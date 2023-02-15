// Default scope of a service worker: ./ relative to the script URL.
// E.g.: //example.com/sw.js has a default scope of //example.com/

// Change this value to cause the service worker to be reinstalled
// This will also re-cache all resources
const UPDATE_SEQ = 0;

// URLs are relative to web root (not this file)
const resources = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/main.js',
  './app/main.css',
  './app/env.js',
  './vendor/es-module-shims.js',
  './vendor/three.module.js',
  './vendor/OrbitControls.js',
  './vendor/lil-gui.esm.js',
  './vendor/Stats.js',
  './shaders/backgroundFS.js',
  './shaders/computeWaveHeightFS.js',
  './shaders/fullscreenVS.js',
  './shaders/ligoPlaneFS.js',
  './shaders/ligoPlaneVS.js',
  './shared/generateGui.js',
  './shared/getInstancedSplineGeometry.js',
  './shared/mathUtils.js',
  './shared/pingPongRunner.js',
  './lib/recorder.js',
  './lib/tar.js',
  './lib/tilesaver.js',
  './img/192.png',
  './img/1024.png',
  './fonts/Oswald-VariableFont_wght.ttf',
];

let cache_name = null;

function new_cache_name() {
  cache_name = (new Date()).toISOString();
  return Promise.resolve(cache_name);
}

// Only called once per service worker
// Note: If sw.js changes, this is considered a new service worker
self.addEventListener('install', (e) => {
  console.log('Service Worker: install');
  self.skipWaiting(); // Causes activate to be called immediately, without waiting for tabs to be closed
  e.waitUntil(new_cache_name().then( cache_name => {
    console.log('Creating cache:', cache_name);
      return caches.open(cache_name).then((cache) => cache.addAll(resources))
  }));
});

// Clean up resources used in previous versions of the service worker
// For new service workers activate fires immediately after install
// For updated service workers fires as soon as the old service worker loses control of any open pages
self.addEventListener('activate', (e) => {
  console.log('Service Worker: activate');
  if (cache_name) {
    e.waitUntil(caches.keys().then( keys => Promise.all(
      keys.map(key => {
        if (key !== cache_name) { 
          console.log('Deleting cache:', key);
          return caches.delete(key); 
        }
      })
    )));
  }
});

self.addEventListener('fetch', (e) => {
  console.log(`Service Worker: fetch ${e.request.url}`);
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});
