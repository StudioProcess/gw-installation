import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'stats.js';
  
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
  HOTKEYS
  ---------------------------------------
  H ........... Toggle HUD/GUI
  F ........... Toggle fullscreen
  X ........... Export hi-res still
  S ........... Toggle FPS/Stats
  Tab ......... Toggle Menu
  
  Space ....... Toggle simulation
  Backspace ... Reset simulation

  C ........... Log camera and colors
  N ........... Next camera
  M ........... Next colors
  
  O ........... Toggle overlay
  P ........... Cycle overlay position
  T ........... Toggle overlay timer
  
  R ........... Randomize camera
  E ........... Randomize emitters
  Enter ....... Start generative sequence
  ---------------------------------------
*/

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
let SIMULATION_FPS = 60;
let SCENE_ROTATION_PERIOD = 900;

const ADD_FULLSCREEN_BUTTON = false;
const LOCK_CAM_TARGET_TO_PLANE = false;

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
let sceneRotationPeriod = 0;
let stats;

const cams = [
  {"position":[0.0,-10.743654156564656,13.938095455943627],"rotation":[0.6566884115103175,0.0,0.0,"XYZ"],"target":[0,0,0]},
  {position: [0, 0, 14.6], rotation: [0, 0, 0], target: [0,0,0]},
  {position: [0,-28,0], rotation: [Math.PI/2, 0,0],target:[0,0,0]},
  {position: [0, 0, 1.75], rotation: [0, 0, 0], target: [0,0,0]},
  {position: [0, 0, 4], rotation: [0, 0, 0], target: [0,0,0]},
  {"position":[0,1.7609600643905499,3.343492523192335],"rotation":[0.3202709674243868,0,0,"XYZ"],"target":[0.2574544348659495,2.86981734899508,0]},
  {"position":[-5.10960898077193,-6.007670482424828,4.665403119988329],"rotation":[0,0,0,"XYZ"],"target":[-5.10960898077193,-6.007670482424828,0]},
  // {"position":[-3.8494472591765705,2.4988612220513193,1.8389136367279406],"rotation":[0,0.3816855639874027,0,"XYZ"],"target":[-4.5875407601223905,2.5091210631308254,0]}
];
let current_cam = 0;

const colors = [
  {background: [0.06, 0.11, 0.25], line: [0.24, 0.29, 0.46]},                 // original
  {background: [0.06, 0.11, 0.25], line: [0.24, 0.29, 0.46], contrast: 1.1 }, // high contrast
  {background: [0,0,0], line: [1,1,1]},                                       // b/w
  {background: [0.1,0.1,0.1], line: [0.9,0.9,0.9]},                           // off-b/w 
  // {background: [0.1, 0.08, 0.16], line: [0.31, 0.28, 0.45]},                  // violet variation 1
  // {background: [0.8, 0.74, 0.64], line: [0.64, 0.58, 0.51]},                  // golden; low contrast
  // {background: [1.0, 1.0, 1.0], line: [1.0, 0.24, 0.24]},                     // red-white
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
      new THREE.Vector3( 0.35, 0.5, 0.0 ), // original:  0.5, 0.65, 0.0 
      new THREE.Vector3( 0.65, 0.5, 0.0 )
    ]
  },
  // period in seconds
  pointPeriods: {
    type: "2fv",
    value: [
      1, // original: 0.3
      1 // original: 0.4
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
  if (ADD_FULLSCREEN_BUTTON) {
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
  }
  
  // menu
  setup_menu(); 
  
  // overlay
  set_overlay_pos(overlay_pos_h, overlay_pos_v);
  if (START_WITH_OVERLAY) { toggle_overlay(true); }
  if (START_WITH_OVERLAY_TIMER) { toggle_overlay_timer(true); }
  
  // stats
  stats = new Stats();
  document.body.appendChild( stats.dom );
  toggle_stats(false);
  
  clock.start();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  uniforms.aspectRatio.value = camera.aspect;
  camera.updateProjectionMatrix();
}


function loop(time) { // eslint-disable-line no-unused-vars
  stats.begin();
  
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
  
  if (LOCK_CAM_TARGET_TO_PLANE) {
    controls.target.z = 0; // lock orbit target to plane
  }
  
  if (sceneRotationPeriod) {
    scene.rotation.z += 2 * Math.PI * delta / sceneRotationPeriod;
  }
  
  renderer.setRenderTarget( null ); // Fix for three@0.102
  renderer.render( scene, camera );
  
  stats.end();
  
  capture.update( renderer );
  frameRequest = requestAnimationFrame( loop );
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

function toggle_stats(force) {
  if (force !== undefined) {
    if (force) {
      stats.dom.style.display = '';
    } else {
      stats.dom.style.display = 'none';
    }
  } else {
    if (stats.dom.style.display === '') { toggle_stats(false); }
    else { toggle_stats(true); }
  }
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
  reset_rotation();
  toggle_rotation(false);
}

function next_cam(offset = 1) {
  current_cam += offset;
  current_cam %= cams.length;
  if (current_cam < 0) { current_cam += cams.length; }
  console.log('cam %i', current_cam);
  set_cam_pos( cams[current_cam] );
}

// Set camera by position on plane, height above plane + target offset (from projected point on plane)
function set_cam_by_offset(plane_x, plane_y, height, target_offset_y, limit_target_to_plane = true) {
  camera.position.set( plane_x, plane_y, height );
  
  let target_y = plane_y + target_offset_y;
  if (limit_target_to_plane) {
    target_y = Math.max(-20, target_y);
    target_y = Math.min(20, target_y);
  }
  controls.target.set( plane_x, target_y, 0 );
  controls.update();
}

// Set camera by position above plane, height above plane + tilt angle
// Ranges:
//   plane_x: [-20, 20] ... left to right
//   plane_y: [-20, 20] ... bottom to top
//   height:  [0.2, 10] ... close to far
//   tilt:    [-90, 90] ... 0 is straight down, 45 is tilted upwards, 90 is horizontally forward
function set_cam_by_tilt(plane_x, plane_y, height, tilt_up) {
  // clamp tilt_up to [-90, 90]
  tilt_up = Math.max(-90, tilt_up);
  tilt_up = Math.min( 90, tilt_up);
  
  camera.position.set( plane_x, plane_y, height );
  
  // tilt angle that will hit the edge of the plane
  const tilt_limit = Math.atan(20/height) / Math.PI * 180;
  
  // if tilt limit is exceeded, move target upward (instead of further away)
  if (tilt_up > tilt_limit || tilt_up < -tilt_limit) {
    // console.log(90-tilt_limit, Math.tan( (90-tilt_up)/180*Math.PI ));
    const target_height = height - Math.tan( (90-Math.abs(tilt_up))/180*Math.PI ) * 20;
    controls.target.set( plane_x, tilt_up >= 0 ? 20 : -20, target_height );
  } else {
    const target_offset_y = height * Math.tan(tilt_up / 180 * Math.PI);
    controls.target.set( plane_x, plane_y + target_offset_y, 0 );
  }
  controls.update();
}

function rnd(min, max) {
  if (Array.isArray(min)) {
    const rndIdx = Math.floor(rnd(min.length));
    return min[rndIdx];
  }
  if (min === undefined && max === undefined) {
    max = 1;
    min = 0;
  } else if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max-min);
}

function randomize_cam() {
  set_cam_by_tilt( rnd(-10,10), rnd(-10,10), rnd(0.2, 3), rnd(0, 30) );
  reset_rotation();
  if ( rnd() < 0.25 ) {
    toggle_rotation( true, rnd(750,1000), rnd([true, false]) );
  } else {
    toggle_rotation(false);
  }
}

function randomize_emitters() {
  // position left emitter
  uniforms.pointPositions.value[0].x = rnd(0.25, 0.5);
  uniforms.pointPositions.value[0].y = rnd(0.25, 0.75);
  gui.children[9].children[0].controllers[0].updateDisplay();
  gui.children[9].children[0].controllers[1].updateDisplay();

  // position right emitter
  uniforms.pointPositions.value[1].x = rnd(0.5, 0.75);
  uniforms.pointPositions.value[1].y = rnd(0.25, 0.75);
  gui.children[9].children[1].controllers[0].updateDisplay();
  gui.children[9].children[1].controllers[1].updateDisplay();
  
  // randomize period
  const period = rnd(1.0, 5.0);
  uniforms.pointPeriods.value[0] = period;
  uniforms.pointPeriods.value[1] = period;
  gui.children[10].controllers[0].updateDisplay();
  gui.children[10].controllers[1].updateDisplay();
}

function toggle_rotation(force, period = SCENE_ROTATION_PERIOD, reverse_direction = false) {
  if (reverse_direction) { period = -period; }
  if (force !== undefined) {
    if (force) {
      sceneRotationPeriod = period;
    } else {
      sceneRotationPeriod = 0;
    }
  } else {
    // toggle
    if (sceneRotationPeriod === 0) {
      sceneRotationPeriod = period;
    } else {
      sceneRotationPeriod = 0;
    }
  }
}

function reset_rotation(rotation = 0) {
  scene.rotation.z = rotation / 180 * Math.PI;
}

function get_colors() {
  return {
    background: uniforms.backgroundColor.value,
    line: uniforms.lineColor.value
  };
}

function set_colors(obj) {
  let background = obj.background;
  let line = obj.line;
  if (obj?.contrast) {
    background = background.map(x => x * (2.0 - obj.contrast)); // make background darker
    line = line.map(x => x * obj.contrast); // make lines brighter
  }
  if (background) { uniforms.backgroundColor.value = Array.from(background); } // copy array
  if (line) { uniforms.lineColor.value = Array.from(line); } // copy array
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

function make_timer(period_s, cb) {
  let count = 0;
  let timer = null;
  
  function callback() {
    // console.log('callback:', count);
    if (typeof cb === 'function') { cb(count); }
    count += 1;
  }
  
  function start(immediate = true) {
    stop(); // clear previous timer
    if (immediate) { callback(); }
    const time = Array.isArray(period_s) ? rnd(...period_s) : period_s;
    // console.log('timer:', time);
    timer = setTimeout(start, time * 1000);
  }
  
  function stop() {
    clearTimeout(timer);
    timer = null;
  }
  
  function reset() {
    start(false);
  }
  
  return {
    start, stop, reset
  };
}

let sequence_running = false;
let t_view;
let t_emitters;
function toggle_sequence(force) {
  
  function stop() {
    if (sequence_running) {
      t_view.stop();
      t_emitters.stop();
    }
    sequence_running = false;
  }
  
  function start() {
    stop();
    t_view = make_timer( [15,30], randomize_cam );
    t_view.start();
    t_emitters = make_timer( 150, randomize_emitters );
    t_emitters.reset();
    sequence_running = true;
  }
  
  if (force !== undefined) {
    if (force) { start(); }
    else { stop(); }
  } else {
    toggle_sequence(!sequence_running);
  }
}

function setup_menu() {
  const menu = document.querySelector('#menu');
  menu.onclick = (e) => {
    e.stopPropagation();
  };
  
  let last_hidden = 0;
  document.body.onclick = () => {
    if (!menu.classList.contains('hidden')) {
      last_hidden = Date.now();
    }
    toggle_menu(false);
  };
  document.body.ondblclick = () => {
    if (Date.now() - last_hidden < 400) { return; }
    toggle_menu(true);
  };
  
  menu.querySelector('.fullscreen').onclick = () => {
    toggleFullscreen();
  };
  menu.querySelector('.color').onclick = () => {
    next_colors();
  };
}

function toggle_menu(force) {
  const menu = document.querySelector('#menu');
  if (force !== undefined) {
    if (force) {
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  } else {
    toggle_menu(menu.classList.contains('hidden'));
  }
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
  else if (e.key == 'x') {
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
    toggle_sequence(false); // stop running sequence
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
  // cycle overlay position
  else if (e.key == 'p') {
    cycle_overlay_pos();
  }
  // toggle overlay timer
  else if (e.key == 't') {
    toggle_overlay_timer();
  }
  
  else if (e.key == 'r') {
    randomize_cam();
    toggle_sequence(false); // stop running sequence
  }
  else if (e.key == 'e') {
    randomize_emitters();
  }
  else if (e.key == 'w') {
    toggle_rotation();
  }
  else if (e.key == 'Enter') {
    toggle_sequence();
  }
  else if (e.key == 's') {
    toggle_stats();
  }
  else if (e.key == 'Tab') {
    toggle_menu();
    e.preventDefault();
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