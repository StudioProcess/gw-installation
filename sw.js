// URLs are relative to web root (not this file)
const resources = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/main.js',
  './app/main.css',
  './node_modules/three/build/three.js',
  './node_modules/three/examples/js/controls/OrbitControls.js',
  './node_modules/dat.gui/build/dat.gui.min.js',
  './shaders/backgroundFS.js',
  './shaders/computeWaveHeightFS.js',
  './shaders/fullscreenVS.js',
  './shaders/ligoPlaneFS.js',
  './shaders/ligoPlaneVS.js',
  './shared/generateGui.js',
  './shared/getInstancedSplineGeometry.js',
  './shared/mathUtils.js',
  './shared/pingPongRunner.js',
  './vendor/recorder.js',
  './vendor/tar.js',
  './vendor/tilesaver.js',
];

self.addEventListener('install', (e) => {
  console.log('Service Worker: install');
  e.waitUntil(
    caches.open('gw-installation').then((cache) => cache.addAll(resources))
  );
});

// self.addEventListener('activate', (e) => {
//   console.log('Service Worker: activate');
// });

self.addEventListener('fetch', (e) => {
  console.log(`Service Worker: fetch ${e.request.url}`);
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});
