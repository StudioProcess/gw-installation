// URLs are relative to web root (not this file)
const resources = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/main.js',
  './app/main.css',
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
  './icons/192.png',
  './icons/1024.png',
  './fonts/Oswald-VariableFont_wght.ttf',
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
