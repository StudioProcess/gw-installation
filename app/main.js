import * as capture from '../vendor/recorder.js';

import * as tilesaver from '../vendor/tilesaver.js';
import {initGui} from "../shared/generateGui.js";

import getInstancedSplineGeometry from "../shared/getInstancedSplineGeometry.js";
import PingPongRunner from "../shared/pingPongRunner.js";

import fullscreenVS from "../shaders/fullscreenVS.js";
import computeHeightFS from "../shaders/computeWaveHeightFS.js";
import backgroundFS from "../shaders/backgroundFS.js";

import ligoPlaneVS from "../shaders/ligoPlaneVS.js";
import ligoPlaneFS from "../shaders/ligoPlaneFS.js";

import {inverseLerpClamped} from "../shared/mathUtils.js";

const W = 1920;
const H = 1080;
const PX_RATIO = 1;
const SW_ENABLED = false;
const WALZE = false;
const WALZE_PERIOD = 3; // duration in seconds (originial value: 10)

let RENDERING = false;
let TILES = 2;

let renderer, scene, camera;
let controls; // eslint-disable-line no-unused-vars
let gui;

const clock = new THREE.Clock();
const heightPingPong = new PingPongRunner();
const renderResolutionX = 1024;
const renderResolutionY = 1024;
const fixedFrameRate = 1.0 / 24.0;
// const fixedFrameRate = 1.0 / 60.0;
let deltaCounter = fixedFrameRate + 0.1;
let walzeLoopValue = 0; // position inside the loop [0..1)
let frameRequest;

const cams = [
  {"position":[0.0,-10.743654156564656,13.938095455943627],"rotation":[0.6566884115103175,0.0,0.0,"XYZ"],"target":[0,0,0]},
  {position: [0, 0, 1.75], rotation: [0, 0, 0], target: [0,0,0]},
  {position: [0, 0, 4], rotation: [0, 0, 0], target: [0,0,0]},
  {"position":[0,1.7609600643905499,3.343492523192335],"rotation":[0.3202709674243868,0,0,"XYZ"],"target":[0.2574544348659495,2.86981734899508,0]},
  {"position":[-5.10960898077193,-6.007670482424828,4.665403119988329],"rotation":[0,0,0,"XYZ"],"target":[-5.10960898077193,-6.007670482424828,0]},
  {"position":[-3.8494472591765705,2.4988612220513193,1.8389136367279406],"rotation":[0,0.3816855639874027,0,"XYZ"],"target":[-4.5875407601223905,2.5091210631308254,0]}
];
let current_cam = 0;

const colors = [
  {background: [0.06, 0.11, 0.25], line: [0.24, 0.29, 0.46]},   // original
  {background: [0.040,0.111,0.225], line: [0.458,0.512,0.764]}, // high contrast
  {background: [0,0,0], line: [1,1,1]},                         // b/w
  {background: [0.1, 0.08, 0.16], line: [0.31, 0.28, 0.45]},    // violet variation 1
  {background: [0.8, 0.74, 0.64], line: [0.64, 0.58, 0.51]},    // golden; low contrast
  {background: [1.0, 1.0, 1.0], line: [1.0, 0.24, 0.24]},       // red-white
];
let current_colors = 0;

const uniforms = {
  time: {type: "f", value: 0.0, hideinGui: true}, // not used
  aspectRatio: {type: "f", value: W / H, hideinGui: true},
  computeResolution: {type: "2fv", value: [1.0 / renderResolutionX, 1.0 / renderResolutionY], hideinGui: true},
  
  backgroundColor: {type: "3fv", value: [0.06, 0.11, 0.25], color: true},
  lineColor: {type: "3fv", value: [0.24, 0.29, 0.46], color: true},
  lineWeight: {type: "f", value: 0.0171, min: 0.0, max: 0.1, step: 0.0001},

  extent: {type: "2fv", value: [40.0, 40.0], min: 0.0, max: 100.0, step: 1.0001},   // plane size
  uvTranslate: {type: "2fv", value: [0.0, 0.0], min: -5.0, max: 5.0, step: 0.0001}, // x/y position of simulation
  uvScale: {type: "2fv", value: [1.0, 1.0], min: 0.0, max: 10.0, step: 0.0001},     // x/y scale of simulation
  uvRotate: {type: "f", value: 0.000, min: -Math.PI, max: Math.PI, step: 0.001},    // rotation of simulation
  
  // This is for an animated hiding and showing of the animation (`walzeLeft` and `walzeRight` are animated)
  walzeLeft: {type: "f", value: 0.0, min: -0.5, max: 1.5, step: 0.0001, hideinGui: true},
  walzeRight: {type: "f", value: 1.0, min: -0.5, max: 1.5, step: 0.0001, hideinGui: true},
  walzeRelDuration: {type: "f", value: 0.33, min: 0.0, max: 1.0, step: 0.0001, hideinGui: true}, // original: value: 0.1, hideinGui: false
  walzeWidth: {type: "f", value: 0.0, min: 0.0, max: 0.5, step: 0.0001, hideinGui: true}, // original" value: 0.8, hideinGui: false
  
  // [0] / x is left-right axis [0.0 .. 1.0]
  // [1] / y is bottom-top axis [0.0 .. 1.0]
  // [2] / z is the animated height of the point; driven in loop()
  pointPositions: {
    type: "v3v",
    value: [
      new THREE.Vector3( 0.5, 0.50, 0.0 ), // original:  0.5, 0.65, 0.0 
      new THREE.Vector3( 0.5, 0.35, 0.0 )
    ]
  },
  // This is actually a period.
  // 1 -> 1.8 Hz
  // 2 -> 0.9 Hz
  // 3 -> 0.6 Hz
  // 4 -> 0.45 Hz
  // 5 -> 0.36 Hz
  pointFrequencies: {
    type: "2fv",
    value: [
      1, // original: 0.3
      0.0 // original: 0.4
    ]
  },
  pointOnDurations: {
    type: "2fv",
    value: [
      0.05,
      0.05
    ]
  },
  
  dotEffect: {type: "f", value: 3.0},

  attack: {type: "f", value: 2.0},
  // decay: {type: "f", value: 0.999},
  energyReduce: {type: "f", value: 0.9989001, min: 0.5, max: 1.0, step: 0.0001}, // original: value: 0.9999, min: 0.1, max: 2.0, step: 0.0001

  displaceGain: {type: "f", value: 0.13, min: 0.0, max: 0.5, step: 0.0001}, // original: value: 0.13, min: 0.0, max: 2.0, step: 0.0001
  displaceHeight: {type: "f", value: 0.2, min: -2.0, max: 2.0, step: 0.0001},

  pointSize: {type: "f", value: 0.01}, // original: value: 0.01

  cornerEffect: {type: "f", value: 0.75},
  averageDivider: {type: "f", value: 7},
  
  // Not used
  // colorEdge: {type: "f", value: 0.0,  min: -1.0, max: 1.0, step: 0.0001},
  // colorEdgeWidth: {type: "f", value: 0.1}, min: -0.2, max: 0.2, step: 0.0001,
};

main();


function main() {

  setup(); // set up scene

  loop(); // start game loop

  tilesaver.init(renderer, scene, camera, TILES);
  
  gui = initGui(uniforms);
  gui.hide();
  
}


function setup() {
  
  // check screen
  const screen_w = screen.width * devicePixelRatio;
  const screen_h = screen.height * devicePixelRatio;
  const aspect = screen_w >= screen_h ? screen_w / screen_h : screen_h / screen_w;
  const orientation = screen_w >= screen_h ? 'landscape' : 'portrait'
  console.log('screen: %d x %d — 1:%.2f — %s', screen_w, screen_h, aspect, orientation);
  
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    // alpha: false
  });
  renderer.setSize( W, H );
  renderer.setPixelRatio( PX_RATIO );
  document.body.appendChild( renderer.domElement );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 75, W / H, 0.01, 1000 );
  controls = new THREE.OrbitControls( camera, renderer.domElement );
  next_cam(0);
  next_colors(0);

  heightPingPong.setup(
    camera,
    renderer,
    fullscreenVS,
    computeHeightFS,
    uniforms,
    {
      NUM_POINTS: uniforms.pointPositions.value.length
    },
    renderResolutionX,
    renderResolutionY
  );

  const background = new THREE.Mesh(
    // Fix for three@latest (0.144):
    // new THREE.PlaneBufferGeometry(2.0, 2.0),
    new THREE.PlaneGeometry(2.0, 2.0),
    // ---
    new THREE.RawShaderMaterial({
      vertexShader: fullscreenVS,
      fragmentShader: backgroundFS,
      uniforms,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
  );
  background.frustumCulled = false;
  scene.add(background);

  const waves = new THREE.Mesh(
    getInstancedSplineGeometry(renderResolutionX, renderResolutionY / 2),
    new THREE.RawShaderMaterial({
      vertexShader: ligoPlaneVS,
      fragmentShader: ligoPlaneFS,
      uniforms,
      side: THREE.DoubleSide,
      // transparent: true,
      // wireframe: true,
      // depthTest: false,
      // depthWrite: false,
    })
  );
  waves.frustumCulled = false;
  scene.add(waves);

  // onResize();
  // window.addEventListener("resize", onResize);
  
  // fullscreen button
  const div = document.createElement('div');
  div.innerText = '←→';
  div.style.fontSize = '20px';
  div.style.width = '40px';
  div.style.height = '40px';
  div.style.position = 'fixed';
  div.style.top = '10px';
  div.style.left = '10px';
  div.style.cursor = 'pointer';
  div.style.rotate = '-45deg';
  div.style.userSelect = 'none';
  div.style.webkitUserSelect = 'none';
  div.addEventListener('click', toggleFullscreen );
  document.body.appendChild( div );
  
  clock.start();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  uniforms.aspectRatio.value = camera.aspect;
  camera.updateProjectionMatrix();
}


function loop(time) { // eslint-disable-line no-unused-vars
  if (WALZE) {
    walzeLoopValue = (time/1000 % WALZE_PERIOD) / WALZE_PERIOD;
    uniforms.walzeRight.value = inverseLerpClamped(0.0, uniforms.walzeRelDuration.value, walzeLoopValue);
    uniforms.walzeLeft.value = inverseLerpClamped(1.0 - uniforms.walzeRelDuration.value, 1.0, walzeLoopValue);
  }

  // console.log(loopValue, uniforms.walzeLeft.value, uniforms.walzeRight.value);
  // console.log(loopValue, uniforms.walzeRight.value);

  const delta = Math.min(1.0 / 20.0, clock.getDelta());
  deltaCounter += 1.0 / 30.0;

  if (!RENDERING) {
    if (deltaCounter > fixedFrameRate) {
      uniforms.time.value += fixedFrameRate;

      for (let i = 0, l = uniforms.pointPositions.value.length; i < l; i++) {
        uniforms.pointPositions.value[i].z =
          uniforms.time.value % uniforms.pointFrequencies.value[i] < uniforms.pointOnDurations.value[i] ? 1.0 : 0.0;
      }
    }
  }

  if (!RENDERING) {
    frameRequest = requestAnimationFrame( loop );
  }


  if (deltaCounter > fixedFrameRate) {
    heightPingPong.render();

    deltaCounter %= fixedFrameRate;
  }
  renderer.setRenderTarget( null ); // Fix for three@0.102
  renderer.render( scene, camera );
  capture.update( renderer );
  
  controls.target.z = 0; // lock orbit target to plane
}

function reset_simulation() {
  heightPingPong.resetRenderTargets();
  uniforms.time.value = 0;
  clock.start();
}


// Toggles the browser's fullscreen mode on the body element
// Note: Doesn't work on iPhone
function toggleFullscreen() {
    // TODO: check latest fullscreen spec: https://caniuse.com/fullscreen
    console.log('toggle fullscreen');
    if (document.webkitFullscreenEnabled) { // Chrome, Opera, Safari
        if (!document.webkitFullscreenElement) {
            document.querySelector('body').webkitRequestFullscreen();
        } else { document.webkitExitFullscreen(); }
    } else if (document.mozFullScreenEnabled) { // Firefox
        if (!document.mozFullScreenElement) {
            document.querySelector('body').mozRequestFullScreen();
        } else { document.mozCancelFullScreen(); }
    } else if (document.fullscreenEnabled) { // Standard, Edge
        if (!document.fullscreenElement) {
            document.querySelector('body').requestFullscreen();
        } else { document.exitFullscreen(); }
    }
}

function get_cam_pos() {
  return {
    position: camera.position.toArray(),
    rotation: camera.rotation.toArray(),
    target: controls.target.toArray(),
  };
}

function set_cam_pos(obj) {
  if (obj?.position) { camera.position.fromArray(obj.position); }
  if (obj?.rotation) { camera.rotation.fromArray(obj.rotation); }
  if (obj?.target) {controls.target.fromArray(obj.target); };
  // camera.updateProjectionMatrix();
  // controls.update();
}

function next_cam(offset = 1) {
  current_cam += offset;
  current_cam %= cams.length;
  if (current_cam < 0) { current_cam += cams.length; }
  console.log('cam %i', current_cam);
  set_cam_pos( cams[current_cam] );
}

function get_colors() {
  return {
    background: uniforms.backgroundColor.value,
    line: uniforms.lineColor.value
  };
}

function set_colors(obj) {
  if (obj?.background) { uniforms.backgroundColor.value = Array.from(obj.background); } // copy array
  if (obj?.line) { uniforms.lineColor.value = Array.from(obj.line); } // copy array
  gui?.controllers[0].updateDisplay();
  gui?.controllers[1].updateDisplay();
}

function next_colors(offset = 1) {
  current_colors += offset;
  current_colors %= colors.length;
  if (current_colors < 0) { current_colors += colors.length; }
  console.log('colors %i', current_colors);
  set_colors( colors[current_colors] );
}

document.addEventListener('keydown', e => {
  // console.log(e.key);
  
  if (e.key == 'h') {
    gui?.show(gui._hidden);
  }
  else if (e.key == ' ') {
    console.log('space');
    RENDERING = !RENDERING;

    if (!RENDERING) {
      cancelAnimationFrame(frameRequest);
      loop();
    }
  } else if (e.key == 'e') {
    tilesaver.save().then(
      (f) => {
        console.log(`Saved to: ${f}`);
        onResize();

        cancelAnimationFrame(frameRequest);
        loop();
      }
    );
  } else if (e.key == 'f') { // f .. fullscreen
    toggleFullscreen();
  }

//   else if (e.key == 'c') {
//     renderer.setSize( W, H );
// 
//     camera.aspectRatio = W/H;
//     camera.updateProjectionMatrix();
// 
//     capture.startstop(); // start/stop recording
//   }
//   else if (e.key == 'v') {
//     renderer.setSize( W, H );
// 
//     camera.aspectRatio = W/H;
//     camera.updateProjectionMatrix();// 
//     capture.startstop( {start:0, duration:loopPeriod} ); // record 1 second
//   }
  
  // log camera position
  else if (e.key == 'p') {
    console.log( JSON.stringify(get_cam_pos()) );
    console.log( JSON.stringify(get_colors()) );
  }
  // switch camera position
  else if (e.key == 'n') {
    next_cam();
  }
  // switch colors
  else if (e.key == 'm') {
    next_colors();
  }
  // reset simulation
  else if (e.key == 'Backspace') {
    reset_simulation();
  }
});


document.addEventListener('dblclick', e => {
  console.log('double click');
  toggleFullscreen();
});


// Register service worker to control making site work offline
if (SW_ENABLED && 'serviceWorker' in navigator) {
  // Service worker URL is relative to web root (not this file)
  navigator.serviceWorker.register('./sw.js').then(() => { 
    console.log('Service Worker registered');
  });
}
