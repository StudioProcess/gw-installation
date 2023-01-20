import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  
import * as capture from '../vendor/recorder.js';

import * as tilesaver from '../vendor/tilesaver.js';
import {initGui} from "../shared/generateGui.js";

import getInstancedSplineGeometry from "../shared/getInstancedSplineGeometry.js";
import PingPongRunner from "../shared/pingPongRunner.js";

import fullscreenVS from "../shaders/fullscreenVS.js";
import computeWaveHeightFS from "../shaders/computeWaveHeightFS.js";
import backgroundFS from "../shaders/backgroundFS.js";

import ligoPlaneVS from "../shaders/ligoPlaneVS.js";
import ligoPlaneFS from "../shaders/ligoPlaneFS.js";

import {inverseLerpClamped} from "../shared/mathUtils.js";

/* 
  Shader passes:
  * Simulation: fullscreenVS + computeWaveHeightFS
  * Background: fullscreenVS + backgroundFS
  * Waves:      ligoPlaneVS  + ligoPlaneFS
*/

const W = 1920;
const H = 1080;
const PX_RATIO = 1;
const SW_ENABLED = false;
const WALZE = false;
const WALZE_PERIOD = 3; // duration in seconds (originial value: 10)

let EXPORT_TILES = 2;

let SIMULATING = true;
let SIMULATION_FPS = 24;

const START_WITH_OVERLAY = false;
const START_WITH_OVERLAY_TIMER = false;
const OVERLAY_TIMER_PERIOD = 60;
const OVERLAY_TIMER_ON = 20;
let overlay_pos_h = 'center'; // left|center|right
let overlay_pos_v = 'center'; // top|center|bottom

let renderer, scene, camera;
let controls; // eslint-disable-line no-unused-vars
let gui;

const clock = new THREE.Clock();
const heightPingPong = new PingPongRunner();
const renderResolutionX = 1024;
const renderResolutionY = 1024;
// const fixedFrameRate = 1.0 / 24.0;
// const fixedFrameRate = 1.0 / 60.0;
// let deltaCounter = fixedFrameRate + 0.1;
let deltaCounter = 0;
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
  //
  // Common uniforms:
  //
  time: {type: "f", value: 0.0, hideinGui: true}, // not used
  aspectRatio: {type: "f", value: W / H, hideinGui: true}, // not used
  computeResolution: {type: "2fv", value: [1.0 / renderResolutionX, 1.0 / renderResolutionY], hideinGui: true},
  
  //
  // backgroundFS uniforms:
  //
  backgroundColor: {type: "3fv", value: [0.06, 0.11, 0.25], color: true},
  
  //
  // ligoPlaneVS uniforms:
  //
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
  walzeWidth: {type: "f", value: 0.001, min: 0.0, max: 1.0, step: 0.0001, hideinGui: true}, // original" value: 0.8, hideinGui: false // Note: Don't set to 0, won't render in Chrome
  
  displaceGain: {type: "f", value: 0.13, min: 0.0, max: 0.5, step: 0.0001}, // original: value: 0.13, min: 0.0, max: 2.0, step: 0.0001
  displaceHeight: {type: "f", value: 1.0, min: 0.0, max: 3.0, step: 0.0001}, // original: value: 1.0, min: -2.0, max: 2.0, step: 0.0001
  
  //
  // computeWaveHeightFS uniforms:
  //
  // [0] / x is left-right axis [0.0 .. 1.0]
  // [1] / y is bottom-top axis [0.0 .. 1.0]
  // [2] / z is the animated height of the point; driven in loop()
  pointPositions: {
    type: "v3v",
    value: [
      new THREE.Vector3( 0.5, 0.50, 0.0 ), // original:  0.5, 0.65, 0.0 
      // new THREE.Vector3( 0.5, 0.35, 0.0 )
    ]
  },
  // period in seconds
  pointPeriods: {
    type: "2fv",
    value: [
      1, // original: 0.3
      0.0 // original: 0.4
    ]
  },
  // on duration in seconds
  pointOnDurations: {
    type: "2fv",
    value: [
      0.05,
      0.05
    ]
  },
  pointSize: {type: "f", value: 4.0 },
  pointEffect: {type: "f", value: 3.0},
  
  c: {type: "f", value: 0.6},
  damping: {type: "f", value: 1.0},
  
  border: {type: "f", value: 0.03, min: 0.001, max: 0.5, step: 0.001 },
  
  // // computeWaveHeightFS.old uniforms:
  // attack: {type: "f", value: 0.0, min: 0.0, max: 1.0, step: 0.0001}, // original: value: 2.0 
  // decay: {type: "f", value: 0.999},
  // energyReduce: {type: "f", value: 0.9989001, min: 0.5, max: 1.0, step: 0.0001}, // original: value: 0.9999, min: 0.1, max: 2.0, step: 0.0001
  // cornerEffect: {type: "f", value: 0.75},
  // averageDivider: {type: "f", value: 7},
};


function main() {

  setup(); // set up scene

  loop(); // start game loop

  tilesaver.init(renderer, scene, camera, EXPORT_TILES);
  
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
  controls = new OrbitControls( camera, renderer.domElement );
  next_cam(0);
  next_colors(0);

  heightPingPong.setup(
    camera,
    renderer,
    fullscreenVS,
    computeWaveHeightFS,
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
      glslVersion: THREE.GLSL3,
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
      glslVersion: THREE.GLSL3,
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
  
  // overlay
  set_overlay_pos(overlay_pos_h, overlay_pos_v);
  if (START_WITH_OVERLAY) { toggle_overlay(true); }
  if (START_WITH_OVERLAY_TIMER) { toggle_overlay_timer(true); }
  
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

  // const delta = Math.min(1.0 / 20.0, clock.getDelta());
  // deltaCounter += 1.0 / 30.0;
  const delta = clock.getDelta();
  deltaCounter += delta; // accumulated delta
  uniforms.time.value += delta;
  
  if (SIMULATING) {
    if (deltaCounter > 1/SIMULATION_FPS) {
      for (let i = 0; i < uniforms.pointPositions.value.length; i++) {
        const period = uniforms.pointPeriods.value[i]; // in secs
        const onDuration = uniforms.pointOnDurations.value[i]; // in secs
        const cycleTime = uniforms.time.value % period; // [0.0, period]
        // uniforms.pointPositions.value[i].z = cycleTime < onDuration ? 1.0 : 0.0;
        
        const cycle = cycleTime / period; // [0.0, 1.0]
        uniforms.pointPositions.value[i].z = Math.sin(cycle * Math.PI * 2);
      }
      heightPingPong.render();
      deltaCounter %= delta;
    }
  }
  
  frameRequest = requestAnimationFrame( loop );
  
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

function toggle_overlay(force) {
  const overlay = document.querySelector('#overlay');
  overlay.classList.toggle('hidden', force !== undefined ? !force : undefined);
}

let overlay_timeout = null;
function toggle_overlay_timer(force) {
    function show() {
        toggle_overlay(true); // show overlay
        overlay_timeout = setTimeout(hide, OVERLAY_TIMER_ON * 1000); 
    }
    
    function hide() {
        toggle_overlay(false); // hide overlay
        overlay_timeout = setTimeout(show, (OVERLAY_TIMER_PERIOD - OVERLAY_TIMER_ON) * 1000);
    }
    
    if (!overlay_timeout || force === true) { // timer is not active
        show();
    } else { // timer is active
        cancel_overlay_timer(); // stop timer
        toggle_overlay(false); // hide overlay
    }
}

function cancel_overlay_timer() {
    clearTimeout(overlay_timeout);
    overlay_timeout = null;
}

function get_cam_pos() {
  return {
    position: camera.position.toArray(),
    rotation: camera.rotation.toArray(),
    target: controls.target.toArray(),
  };
}

function set_overlay_pos(pos_h = 'center', pos_v = 'center') {
    if (!pos_v) { pos_v = overlay_pos_v; }
    if (!pos_h) { pos_h = overlay_pos_h; }
    const overlay = document.querySelector('#overlay');
    const body = document.querySelector('body');
    
    overlay_pos_v = pos_v;
    if (pos_v === 'top') {
        overlay.style.top = 0;
        overlay.style.bottom = '';
    } else if (pos_v === 'bottom') {
        overlay.style.top = '';
        overlay.style.bottom = 0;
    } else {
        overlay.style.top = '';
        overlay.style.bottom = '';
        overlay_pos_v = 'center';
    }
    
    overlay_pos_h = pos_h;
    if (pos_h === 'left') {
        overlay.style.left = 0;
        overlay.style.right = '';
    } else if (pos_h === 'right') {
        overlay.style.left = '';
        overlay.style.right = 0;
    } else {
       overlay.style.left = '';
       overlay.style.right = '';
       overlay_pos_h = 'center';
    }
}

function cycle_overlay_pos() {
    const sequence = [
        ['center','center'],
        ['center','top'],
        ['right','top'],
        ['right','center'],
        ['right','bottom'],
        ['center','bottom'],
        ['left','bottom'],
        ['left','center'],
        ['left','top'],
    ];
    let idx = sequence.findIndex(el => el[0] === overlay_pos_h && el[1] === overlay_pos_v);
    idx += 1;
    if (idx >= sequence.length) { idx = 0; }
    set_overlay_pos(...sequence[idx]);
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
  
  // toggle HUD/GUI
  if (e.key == 'h') {
    gui?.show(gui._hidden);
  }
  // toggle simulation on/off
  else if (e.key == ' ') {
    SIMULATING = !SIMULATING;
  }
  // export hi-res still
  else if (e.key == 'e') {
    tilesaver.save().then(
      (f) => {
        console.log(`Saved to: ${f}`);
        onResize();
        // cancelAnimationFrame(frameRequest);
        // loop();
      }
    );
  } 
  // fullscreen
  else if (e.key == 'f') { // f .. fullscreen
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
  else if (e.key == 'c') {
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
  // toggle overlay
  else if (e.key == 'o') {
    cancel_overlay_timer(); // cancel timer (if any)
    toggle_overlay();
  }
  // toggle overlay timer
  else if (e.key == 'p') {
    cycle_overlay_pos();
  }
  // toggle overlay timer
  else if (e.key == 't') {
    toggle_overlay_timer();
  }
});


// Register service worker to control making site work offline
if (SW_ENABLED && 'serviceWorker' in navigator) {
  // Service worker URL is relative to web root (not this file)
  navigator.serviceWorker.register('./sw.js').then(() => { 
    console.log('Service Worker registered');
  });
}

main();