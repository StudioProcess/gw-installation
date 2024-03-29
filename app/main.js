import env from './env.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'stats.js';
  
import * as capture from '../libs/recorder.js';

import * as tilesaver from '../libs/tilesaver.js';
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
  D ........... Cycle wave speeds (Wave equation "C" parameter)

  C ........... Log camera and colors
  N ........... Next camera
  M ........... Next colors
  
  O ........... Toggle overlay
  P ........... Cycle overlay position
  T ........... Toggle overlay timer
  
  R ........... Randomize camera
  E ........... Randomize emitters
  B ........... Force emitter burst
  Enter ....... Start generative sequence
  L ........... Lock/unlock controls
  
  I ........... Install/Register Service worker
  Ctrl-I ...... Uninstall/Unregister Service worker
  ---------------------------------------
*/

/* 
  Shader passes:
  * Simulation: fullscreenVS + computeWaveHeightFS
  * Background: fullscreenVS + backgroundFS
  * Waves:      ligoPlaneVS  + ligoPlaneFS
*/

const RES_INSTALLATION = [3840, 2160, 60];
const RES_DESKTOP      = [1920, 1080, 60];
const RES_MOBILE       = [1920, 1080, 30];

const PX_RATIO = 1;
const SW_INSTALL = true;
const LS_PREFIX = 'gw-installation:'; // localstorage prefix (needs to be defined before get_platform)
const PLATFORM = get_platform();

const WALZE = false;
const WALZE_PERIOD = 3; // duration in seconds (originial value: 10)

const CHANGE_VIEW = [15, 25]; // seconds
const CHANGE_EMITTERS = 30; // seconds
const ROTATION_EVERY = 90; // once every x seconds 
const SPECIAL_VIEW_EVERY = 540; // once every x seconds
const SPECIAL_VIEWS = [2, 4]; // indices into cams array
const SPECIAL_VIEWS_MANUAL = [2]; // indices into cams array (can be triggered manually)
const EMITTER_BURST_EVERY = 75; // seconds
const EMITTER_BURST_COUNT = [3, 5];
const EMITTER_MANUAL_BURST_COUNT = [4, 6];
const EMITTER_OUT_OF_PHASE_EVERY = 90; // seconds
const WAVE_SPEEDS = [0.2, 0.4, 0.7]; // c parameter (spped of light) in simulation
const WAVE_SPEED_TRANSITION_TIME = 5000; // time for transitions to another SIM_SPEED (milliseconds)
const WAVE_SMOOTHING = 1.0; // [0.0, 1.0] apply 3x3 gauss filter to wave height samples

// randomize view params
const VIEW_X = [-7.5, 7.5];
const VIEW_Y = [-7.5, 7.5];
const VIEW_Z = [1.3, 3];
const VIEW_TILT = [0, 30];
const VIEW_ROTATION = [1000, 1250]; // rotation period in seconds (per full rotation)
const VIEW_MIN_CHANGE = 5; // minimum amount the camera needs to change position
const VIEW_MIN_HEIGHT_CHANGE = 0.5; // minimum amount the camera needs to change height
const VIEW_EMITTER_DIST_FACTOR = 2.25; // factor for exclusion radius for views around emitters
const VIEW_EMITTER_DIST_LIMIT = 10; // limit minimum distance
const VIEW_EMITTER_DIST_MAX = 10; // maximum distance, so camera isn't placed in in a place with nothing happening

// randomize emitter params
const EMITTER_BORDER_X = [0.25, 0.00]; // outer, inner (sum <= 0.5)
const EMITTER_BORDER_Y = [0.25, 0.25]; // top, bottom (sum <= 1.0)
const EMITTER_PERIOD = [1.5, 8];

let EXPORT_TILES = 2;

let SIMULATING = true;
let SCENE_ROTATION_PERIOD = 900;

const LOCK_CAM_TARGET_TO_PLANE = false;
const RANDOMIZE_RETRY_COUNT = 1000; // max tries to get random values that fit conditions (randomize_cam and randomize_emitters_once)

const OVERLAY_TEXT_TOP = 'bernhardhoetzl.com'; // can be overridden in local storage (key: LS_PREFIX + 'overlay_text_top')
const OVERLAY_TEXT_BOTTOM = 'Think ahead'; // can be overridden in local storage (key: LS_PREFIX + 'overlay_text_bottom')
const OVERLAY_HREF = 'https://bernhardhoetzl.com'; // can be overridden in local storage (key: LS_PREFIX + 'overlay_text_href')
const OVERLAY_TIMER_PERIOD = 60; // can be overridden in local storage (key: LS_PREFIX + 'overlay_timer_period')
const OVERLAY_TIMER_ON = 30; // can be overridden in local storage (key: LS_PREFIX + 'overlay_timer_on')
const OVERLAY_RELATIVE_TO_CANVAS = true; // adjust overlay to be inside the canvas (even when screen has black bars)

const HIDE_CURSOR_AFTER = 3; // seconds
const HIDE_MENU_AFTER = 300; // seconds

let W, H, SIMULATION_FPS;
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
let current_speed = 1; // index to WAVE_SPEEDS

const cams = [
  // overview (development)
  {"position":[0.0,-10.743654156564656,13.938095455943627],"rotation":[0.6566884115103175,0.0,0.0,"XYZ"],"target":[0,0,0]},
  
  // special: top view (near)
  {"position":[0,-10.455128319584357,3.9503727500140187],"rotation":[0.6965145418735411,0,0,"XYZ"],"target":[0,-3.9949149773471113,-3.7739436503427433]},
  // {"position":[0,-11.9263622096271,5.709490516499767],"rotation":[0.696514541873541,0,0,"XYZ"],"target":[0,-3.9949149773471113,-3.7739436503427433]},
  // special: elevation view
  {position: [0,-28,0], rotation: [Math.PI/2, 0,0],target:[0,0,0]},
  
  {position: [0, 0, 1.75], rotation: [0, 0, 0], target: [0,0,0]},
  {position: [0, 0, 4], rotation: [0, 0, 0], target: [0,0,0]},
  {"position":[0,1.7609600643905499,3.343492523192335],"rotation":[0.3202709674243868,0,0,"XYZ"],"target":[0.2574544348659495,2.86981734899508,0]},
  {"position":[-5.10960898077193,-6.007670482424828,4.665403119988329],"rotation":[0,0,0,"XYZ"],"target":[-5.10960898077193,-6.007670482424828,0]},
  // {"position":[-3.8494472591765705,2.4988612220513193,1.8389136367279406],"rotation":[0,0.3816855639874027,0,"XYZ"],"target":[-4.5875407601223905,2.5091210631308254,0]}
];
let current_cam = 0;

const colors = [
  // {background: [0.06, 0.11, 0.25], line: [0.24, 0.29, 0.46]},                 // original
  // {background: [0.06, 0.11, 0.25], line: [0.24, 0.29, 0.46], contrast: 1.5}, // high contrast
  {background: [0.06, 0.11, 0.25], line: [0.396, 0.482, 0.784]}, // high contrast (manual)
  // {background: [0,0,0], line: [1,1,1]},                                       // b/w
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
  displaceLimit: {type: "f", value: 1.5, min: 0.0, max: 3.0, step: 0.0001},
  waveSmoothing: {type: "f", value: WAVE_SMOOTHING, min: 0.0, max: 1.0, step: 0.0001},
  
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
      2, // original: 0.3
      2 // original: 0.4
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
  
  gui = initGui(uniforms);
  gui.hide();

  setup(); // set up scene

  loop(); // start game loop

  tilesaver.init(renderer, scene, camera, EXPORT_TILES);
  
}

function display_mode() {
  const modes = [ 'fullscreen', 'standalone', 'minimal-ui', 'browser', 'window-controls-overlay' ];
  for (const mode of modes) {
    if ( matchMedia(`(display-mode: ${mode})`).matches ) { return mode; }
  }
  return 'unknown';
}

function update_info() {
  const screen_w = screen.width * devicePixelRatio;
  const screen_h = screen.height * devicePixelRatio;
  const aspect = screen_w >= screen_h ? screen_w / screen_h : screen_h / screen_w;
  const orientation = screen_w >= screen_h ? 'landscape' : 'portrait'
  
  let t = '<div>';
  t += `Platform: ${PLATFORM.device} (${PLATFORM.os})\n`;
  t += `Rendering: ${W} ✕ ${H}\n`;
  t += `Simulation: ${SIMULATION_FPS} fps`;
  t += `</div>`;
  t += `<div style="margin-top: 8px;">`;
  t += `Screen: ${screen_w} ✕ ${screen_h}\n`;
  t += `Aspect: 1:${aspect.toFixed(2)}\n`;
  t += `Orientation: ${orientation}\n`;
  t += `Current: ${renderer.domElement.offsetWidth * devicePixelRatio} ✕ ${renderer.domElement.offsetHeight * devicePixelRatio}\n`;
  t += `Display Mode: ${display_mode()}\n`;
  t += `</div>`;
  t += `<div style="margin-top: 8px;">`;
  t += `Controls: ${controls.enabled ? '● <a id="toggle_controls">Disable</a>' : '○ <a id="toggle_controls">Enable</a>' }\n`;
  t += `Sequence: ${sequence_running ? '● <a id="toggle_sequence">Stop</a>' : '○ <a id="toggle_sequence">Start</a>' }\n`;
  t += `Trigger: <a id="rnd_cam">Cam</a> <a id="rnd_emitters">Emts</a> <a id="rnd_burst">Burst</a>\n`;
  t += `</div>`;
  t += `<div style="margin-top: 8px;">`;
  t += `Service worker: ${sw_installed ? '● <a id="sw_reinstall">Reinstall</a> <a id="sw_uninstall">Uninstall</a>' : '○ <a id="sw_install">Install</a>' }\n`;
  t += `Environment: ${env.ENV}\n`;
  if (env.ENV === 'production') {
    t += `Build: ${env.BUILD_DATE}\n`;
  }
  t += `</div>`;
  
  const info = document.querySelector('#info');
  info.innerHTML = t;
  
  info.querySelector('#sw_install')?.addEventListener('click', () => { sw_install(); });
  info.querySelector('#sw_uninstall')?.addEventListener('click', () => { sw_uninstall(); });
  info.querySelector('#sw_reinstall')?.addEventListener('click', () => { sw_reinstall(); });
  info.querySelector('#toggle_controls')?.addEventListener('click', () => { toggle_controls_enabled(); });
  info.querySelector('#toggle_sequence')?.addEventListener('click', () => { toggle_sequence(undefined, true); });
  info.querySelector('#rnd_cam')?.addEventListener('click', () => {    randomize_cam(); toggle_sequence(false); });
  info.querySelector('#rnd_emitters')?.addEventListener('click', () => { randomize_emitters(); });
  info.querySelector('#rnd_burst')?.addEventListener('click', () => { randomize_emitters_burst(); });
  info.onclick = (e) => { e.stopPropagation(); }
  info.ondblclick = (e) => { e.stopPropagation(); }
}


function setup() {
  console.log(`ENV: ${env.ENV}`);
  if (env.ENV === 'production') {
    console.log(`BUILD_DATE: ${env.BUILD_DATE}`);
  }
  
  if (PLATFORM.device == 'installation') {
    [ W, H, SIMULATION_FPS ] = RES_INSTALLATION;
  } else if (PLATFORM.device === 'desktop') {
    [ W, H, SIMULATION_FPS] = RES_DESKTOP;
  } else {
    [ W, H, SIMULATION_FPS ] = RES_MOBILE;
  }
  
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    // alpha: false
  });
  renderer.setSize( W, H );
  renderer.setPixelRatio( PX_RATIO );
  renderer.domElement.id = "three-js";
  document.body.appendChild( renderer.domElement );

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 75, W / H, 0.01, 1000 );
  controls = new OrbitControls( camera, renderer.domElement );
  if (env.ENV === 'production') { toggle_controls_enabled(false); } // lock controls in production mode
  set_cam_by_idx(0);
  set_colors_by_idx( JSON.parse(localStorage.getItem(LS_PREFIX + 'current_colors')) ?? 0 );

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
  
  // menu
  setup_menu();
  
  // stats + info
  stats = new Stats();
  stats.dom.id = 'stats_js';
  document.body.appendChild( stats.dom );
  toggle_stats(false);
  update_info();
  window.addEventListener('resize', update_info);
  
  // needs to happen after stats (since, menu indicators are updated)
  set_speed_by_idx(localStorage.getItem(LS_PREFIX + 'wave_speed') ?? current_speed, 0);
  
  // overlay
  set_overlay_pos( localStorage.getItem(LS_PREFIX + 'overlay_pos_h') ?? 'center', localStorage.getItem(LS_PREFIX + 'overlay_pos_v') ?? 'center' );
  if (JSON.parse(localStorage.getItem(LS_PREFIX + 'overlay_timer')) ?? false) {
    toggle_overlay_timer(true)
  } else if (JSON.parse(localStorage.getItem(LS_PREFIX + 'overlay')) ?? false) {
    toggle_overlay(true);
  }
  toggle_overlay_bg( JSON.parse(localStorage.getItem(LS_PREFIX + 'overlay_background')) ?? false );
  window.addEventListener('resize', adjust_overlay);
  
  if (env.ENV === 'production') {
    toggle_sequence(true, true); // start sequence and change emitters immediately
  }
  
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
        // const onDuration = uniforms.pointOnDurations.value[i]; // in secs
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


function is_fullscreen() {
  return Boolean(document.webkitFullscreenElement || document.mozFullScreenElement || document.fullscreenElement);
}

function fullscreen_supported() {
  return document.webkitFullscreenEnabled || document.mozFullScreenEnabled || document.fullscreenEnabled;
}

// Toggles the browser's fullscreen mode on the body element
// Note: Doesn't work on iPhone
function toggle_fullscreen() {
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
  if (! overlay.classList.contains('hidden')) {
    overlay.querySelector('.top').innerText = localStorage.getItem(LS_PREFIX + 'overlay_text_top') || OVERLAY_TEXT_TOP;
    overlay.querySelector('.bottom').innerText = localStorage.getItem(LS_PREFIX + 'overlay_text_bottom') || OVERLAY_TEXT_BOTTOM;
    overlay.querySelector('a').href = localStorage.getItem(LS_PREFIX + 'overlay_href') || OVERLAY_HREF;
  }
  update_menu_indicators();
  localStorage.setItem(LS_PREFIX + 'overlay', !overlay.classList.contains('hidden'));
  // when showing the overlay, make sure position is correct
  if (!overlay.classList.contains('hidden')) { adjust_overlay(); }
}

let overlay_timeout = null;
function toggle_overlay_timer(force) {
  const timer_on = localStorage.getItem(LS_PREFIX + 'overlay_timer_on') || OVERLAY_TIMER_ON;
  const timer_period = localStorage.getItem(LS_PREFIX + 'overlay_timer_period') || OVERLAY_TIMER_PERIOD;
  console.log('timer_on', timer_on);
  console.log('timer_period', timer_period);
  
  function show() {
    toggle_overlay(true); // show overlay
    overlay_timeout = setTimeout(hide, timer_on * 1000);
  }
  
  function hide() {
    toggle_overlay(false); // hide overlay
    overlay_timeout = setTimeout(show, (timer_period - timer_on) * 1000);
  }
  
  if (!overlay_timeout || force === true) { // timer is not active
    show();
    localStorage.setItem(LS_PREFIX + 'overlay_timer', true);
  } else { // timer is active
    cancel_overlay_timer(); // stop timer
    toggle_overlay(false); // hide overlay
    localStorage.setItem(LS_PREFIX + 'overlay_timer', false);
  }
  
  update_menu_indicators();
}

function cancel_overlay_timer() {
  clearTimeout(overlay_timeout);
  overlay_timeout = null;
}

function toggle_overlay_bg(force) {
  const overlay = document.querySelector('#overlay');
  if (force === undefined) {
    overlay.classList.toggle('hidden-bg');
  } else {
    overlay.classList.toggle('hidden-bg', !force);
  }
  localStorage.setItem(LS_PREFIX + 'overlay_background', !overlay.classList.contains('hidden-bg'));
  update_menu_indicators();
}

function toggle_stats(force) {
  const info = document.querySelector('#info');
  if (force !== undefined) {
    if (force) {
      stats.dom.style.display = '';
      info.classList.remove('hidden');
    } else {
      stats.dom.style.display = 'none';
      info.classList.add('hidden');
    }
  } else {
    if (stats.dom.style.display === '') { toggle_stats(false); }
    else { toggle_stats(true); }
  }
  update_menu_indicators();
}

let special_views_manual_idx = -1;
function cycle_special_view() {
  special_views_manual_idx += 1;
  if (special_views_manual_idx >= SPECIAL_VIEWS_MANUAL.length) {
    special_views_manual_idx = -1;
    toggle_sequence(true);
  } else {
    set_cam_by_idx(SPECIAL_VIEWS_MANUAL[special_views_manual_idx]);
    reset_rotation();
    toggle_sequence(false);
  }
  return special_views_manual_idx;
}

function get_cam_pos() {
  return {
    position: camera.position.toArray(),
    rotation: camera.rotation.toArray(),
    target: controls.target.toArray(),
  };
}

let overlay_pos_h = 'center'; // left|center|right
let overlay_pos_v = 'center'; // top|center|bottom
function set_overlay_pos(pos_h = 'center', pos_v = 'center') {
  if (!pos_v) { pos_v = overlay_pos_v; }
  if (!pos_h) { pos_h = overlay_pos_h; }
  const overlay = document.querySelector('#overlay');
  
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
  
  adjust_overlay();
  
  localStorage.setItem(LS_PREFIX + 'overlay_pos_v', overlay_pos_v);
  localStorage.setItem(LS_PREFIX + 'overlay_pos_h', overlay_pos_h);
}

function adjust_overlay() {
  if (!OVERLAY_RELATIVE_TO_CANVAS) { return; }
  const overlay = document.querySelector('#overlay');
  if (overlay_pos_v === 'top') {
    overlay.style.marginTop = Math.max(0, renderer.domElement.offsetTop) + 'px';
    overlay.style.marginBottom = '';
  } else if (overlay_pos_v === 'bottom') {
    overlay.style.marginTop = '';
    overlay.style.marginBottom = Math.max(0, window.innerHeight - renderer.domElement.clientHeight - renderer.domElement.offsetTop) + 'px';
  } else {
    overlay.style.marginTop = '';
    overlay.style.marginBottom = '';
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
  if (obj?.target) {controls.target.fromArray(obj.target); }
  // camera.updateProjectionMatrix();
  // controls.update();
  reset_rotation();
  toggle_rotation(false);
}

function set_cam_by_idx(idx) {
  current_cam = idx;
  current_cam %= cams.length;
  if (current_cam < 0) { current_cam += cams.length; }
  console.log('cam', current_cam);
  set_cam_pos( cams[current_cam] );
}

function next_cam(offset = 1) {
  set_cam_by_idx(current_cam + offset);
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

function animate(from_val, to_val, time, cb) {
  const start = performance.now();
  let should_stop = false;
  
  function update(ts) {
    if (should_stop) { return; }
    let elapsed = ts - start;
    if (elapsed < 0) { elapsed = 0; }
    if (elapsed > time) { elapsed = time; }
    const val = time == 0 ? to_val : from_val + (to_val - from_val) / time * elapsed;
    if (typeof cb === 'function') { cb(val, elapsed); }
    if (elapsed < time) { requestAnimationFrame(update); }
  }
  
  update(start);
  
  return {
    stop() { should_stop = true; }
  };
}

let speed_anim = null;
function set_speed_by_idx(idx, transition_time = WAVE_SPEED_TRANSITION_TIME) {
  idx = Math.min(WAVE_SPEEDS.length-1 , Math.max(0, idx));
  console.log('speed', idx);
  current_speed = idx;
  if (speed_anim) { speed_anim.stop(); } // cancel previous animation
  speed_anim = animate(uniforms.c.value, WAVE_SPEEDS[idx], transition_time, val => {
    // console.log(val);
    uniforms.c.value = val;
    gui.get('c').updateDisplay();
    // console.log('c', val)
  });
  localStorage.setItem(LS_PREFIX + 'wave_speed', idx);
  update_menu_indicators();
}

function next_speed(offset = 1) {
  current_speed += offset;
  current_speed %= WAVE_SPEEDS.length;
  if (current_speed < 0) { current_speed += WAVE_SPEEDS.length; }
  set_speed_by_idx(current_speed);
  return current_speed;
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

function rnd_every( every, call_period = (CHANGE_VIEW[0] + CHANGE_VIEW[1])/2 ) {
  return rnd() < 1/(every/call_period);
}

function uv_to_plane(u, v) {
  return [
    (u - 0.5) * uniforms.extent.value[0],
    (v - 0.5) * uniforms.extent.value[1],
  ];
}

let special_views_idx = -1;
function randomize_cam() {
  if (rnd_every(SPECIAL_VIEW_EVERY)) {
    special_views_idx += 1;
    if (special_views_idx >= SPECIAL_VIEWS.length) { special_views_idx = 0; }
    set_cam_by_idx(SPECIAL_VIEWS[special_views_idx]);
    reset_rotation();
    toggle_rotation( true, rnd(...VIEW_ROTATION), rnd([true, false]) );
    log(`🎥 🎬 randomize cam – special ${SPECIAL_VIEWS[special_views_idx]}`);
    return;
  }
  
  // distance to closest emitter
  function emitter_dist(x, y) {
    // distance to left emitter
    const el = uv_to_plane(...uniforms.pointPositions.value[0]);
    const dl = Math.sqrt( (x - el[0])**2 + (y - el[1])**2 );
    // console.log(dl);
    // distance to right emitter
    const er = uv_to_plane(...uniforms.pointPositions.value[1]);
    const dr = Math.sqrt( (x - er[0])**2 + (y - er[1])**2 );
    // console.log(dr);
    return Math.min(dl, dr);
  }
  
  let new_x, new_y, new_h;
  let d = 0, dh = 0, de = 0, count = 0;
  
  // make sure change in height is big enough
  count = 0;
  let best_h, best_dh = -1;
  while (dh < VIEW_MIN_HEIGHT_CHANGE ) {
    new_h = rnd(...VIEW_Z);
    dh = Math.abs(camera.position.z - new_h);
    if (dh > best_dh) {
      best_dh = dh;
      best_h = new_h;
    }
    if (++count > RANDOMIZE_RETRY_COUNT) {
      console.warn(`Breaking out VIEW_MIN_HEIGHT_CHANGE loop (Achieved dh=${best_dh.toFixed(2)} [>= ${VIEW_MIN_HEIGHT_CHANGE}])`);
      new_h = best_h;
      break;
    }
  }
  
  // new (random) camera tilt
  const new_tilt = rnd(...VIEW_TILT)
  
  // Calculate approximate view radius, based on FOV and view height. Add in an exclusion factor (to compensate for tilt etc.)
  let de_min = 0;
  try {
    de_min = new_h * Math.tan((camera.fov/180 * Math.PI) / 2) * camera.aspect * VIEW_EMITTER_DIST_FACTOR;
  } catch { /* Ignore any calculation errors */ } 
  de_min = Math.min(de_min, VIEW_EMITTER_DIST_LIMIT); // limit min radius
  
  // make sure change distance is big enough + view is far enough from the nearest emitter (but not too far)
  count = 0;
  let best_x, best_y, best_de = 0;
  while (d < VIEW_MIN_CHANGE || de <= de_min || de > VIEW_EMITTER_DIST_MAX) {
    new_x = rnd(...VIEW_X);
    new_y = rnd(...VIEW_Y);
    // calculate view point (center of view cone intersection with plane)
    const [view_x, view_y] = [ new_x, new_y + (new_h * Math.tan(new_tilt/180 * Math.PI)) ] ;
    // distances
    d = Math.sqrt( (camera.position.x - new_x)**2 + (camera.position.y - new_y)**2 ); // distance from old position
    de = emitter_dist(view_x, view_y); // distance to closest emitter
    // best is smallest de that is >= de_min (if de < de_min: move up; if de >= de_min: move down)
    if (best_de === 0 || (de >= de_min && de < best_de) || (de < de_min && de > best_de)) {
      best_de = de;
      best_x = new_x;
      best_y = new_y;
    }
    if (++count > RANDOMIZE_RETRY_COUNT) {
      console.warn(`Breaking out VIEW_MIN_CHANGE loop (Achieved de=${best_de.toFixed(2)} [${de_min.toFixed(2)}, ${VIEW_EMITTER_DIST_MAX}])`);
      new_x = best_x;
      new_y = best_y;
      break;
    }
  }
  
  set_cam_by_tilt( new_x, new_y, new_h, new_tilt );
  reset_rotation();
  if ( rnd_every(ROTATION_EVERY) ) {
    const new_rot = rnd(...VIEW_ROTATION);
    toggle_rotation( true, new_rot, rnd([true, false]) );
    log(`🎥 🔄 randomize cam – rotation (x=${new_x.toFixed(1)}, y=${new_y.toFixed(1)}, z=${new_h.toFixed(1)}, tilt=${new_tilt.toFixed(0)}, de=${de.toFixed(1)} >= ${de_min.toFixed(1)}, rot=${new_rot.toFixed(0)})`);
  } else {
    toggle_rotation(false);
    log(`🎥 randomize cam (x=${new_x.toFixed(1)}, y=${new_y.toFixed(1)}, z=${new_h.toFixed(1)}, tilt=${new_tilt.toFixed(0)}, de=${de.toFixed(1)} >= ${de_min.toFixed(1)})`);
  }
}

function randomize_emitters() {
  if (rnd_every(EMITTER_BURST_EVERY, CHANGE_EMITTERS)) {
    randomize_emitters_burst();
  } else {
    randomize_emitters_once(true);
  }
}

function randomize_emitters_once(avoid_view = false) {
  let lx, ly, rx, ry;
  // distance to center of camera view (in plane units, not uv); return value >= 0
  function view_dist(x, y) {
    const e = uv_to_plane(x, y); // emitter position in plane units
    return Math.sqrt( (camera.position.x - e[0])**2 + (camera.position.y - e[1])**2 );
  }
  
  // position left emitter
  if (avoid_view) {
    // Calculate approximate view radius, based on FOV and view height. Add in an exclusion factor (to compensate for tilt etc.)
    let d_min = 0;
    try {
      d_min = camera.position.z * Math.tan((camera.fov/180 * Math.PI) / 2) * camera.aspect * VIEW_EMITTER_DIST_FACTOR;
    } catch { /* Ignore any calculation errors */ } 
    d_min = Math.min(d_min, VIEW_EMITTER_DIST_LIMIT); // limit min radius => [0, VIEW_EMITTER_DIST_LIMIT]
    let d, count;
    d = -1; count = 0;
    let best_x, best_y, best_d = -1;
    while ( d < d_min ) { // d_min >= 0
      lx = rnd(0.0 + EMITTER_BORDER_X[0], 0.5 - EMITTER_BORDER_X[1]);
      ly = rnd(0.0 + EMITTER_BORDER_Y[0], 1.0 - EMITTER_BORDER_Y[1]);
      d = view_dist(lx, ly);
      if (d > best_d) {
        best_d = d;
        best_x = lx;
        best_y = ly;
      }
      if (++count > RANDOMIZE_RETRY_COUNT) {
        console.warn(`Breaking out L emitter positioning loop (Achieved d=${best_d.toFixed(2)} [>= ${d_min.toFixed(2)}])`);
        lx = best_x;
        ly = best_y;
        break;
      }
    }
    
    d = -1; count = 0; best_d = -1;
    while ( d < d_min ) { // d_min >= 0
      rx = rnd(0.5 + EMITTER_BORDER_X[1], 1.0 - EMITTER_BORDER_X[0]);
      ry = rnd(0.0 + EMITTER_BORDER_Y[0], 1.0 - EMITTER_BORDER_Y[1]);
      d = view_dist(rx, ry);
      if (d > best_d) {
        best_d = d;
        best_x = rx;
        best_y = ry;
      }
      if (++count > RANDOMIZE_RETRY_COUNT) {
        console.warn(`Breaking out R emitter positioning loop (Achieved d=${best_d.toFixed(2)} [>= ${d_min.toFixed(2)}])`);
        rx = best_x;
        ry = best_y;
        break;
      }
    }
  } else {
    lx = rnd(0.0 + EMITTER_BORDER_X[0], 0.5 - EMITTER_BORDER_X[1]);
    ly = rnd(0.0 + EMITTER_BORDER_Y[0], 1.0 - EMITTER_BORDER_Y[1]);
    rx = rnd(0.5 + EMITTER_BORDER_X[1], 1.0 - EMITTER_BORDER_X[0]);
    ry = rnd(0.0 + EMITTER_BORDER_Y[0], 1.0 - EMITTER_BORDER_Y[1]);
  }
  
  // position left emitter
  uniforms.pointPositions.value[0].x = lx;
  uniforms.pointPositions.value[0].y = ly;
  gui.get('pointPositions', 0, 'x').updateDisplay();
  gui.get('pointPositions', 0, 'y').updateDisplay();

  // position right emitter
  uniforms.pointPositions.value[1].x = rx;
  uniforms.pointPositions.value[1].y = ry;
  gui.get('pointPositions', 1, 'x').updateDisplay();
  gui.get('pointPositions', 1, 'y').updateDisplay();
  
  // randomize period
  const lperiod = rnd(...EMITTER_PERIOD);
  let rperiod = lperiod;
  if (rnd_every(EMITTER_OUT_OF_PHASE_EVERY, CHANGE_EMITTERS) ) {
    rperiod = rnd(...EMITTER_PERIOD);
  }
  uniforms.pointPeriods.value[0] = lperiod;
  uniforms.pointPeriods.value[1] = rperiod;
  gui.get('pointPeriods').updateDisplay();
  
  // console.debug('lx=', lx, 'ly=', ly, 'rx=', rx, 'ry=', ry, 'lperiod=', lperiod, 'rperiod=', rperiod);
  // console.debug('uniforms.pointPositions.value[0].x=', uniforms.pointPositions.value[0].x, 'uniforms.pointPositions.value[0].y=', uniforms.pointPositions.value[0].y, 'uniforms.pointPositions.value[1].x=', uniforms.pointPositions.value[1].x, 'uniforms.pointPositions.value[1].y=', uniforms.pointPositions.value[1].y);
  
  log(`🌊 randomize emitters${lperiod !== rperiod ? ' – out-of-phase' : ''} (l=${uniforms.pointPositions.value[0].x.toFixed(2)}|${uniforms.pointPositions.value[0].y.toFixed(2)}, r=${uniforms.pointPositions.value[1].x.toFixed(2)}|${uniforms.pointPositions.value[1].y.toFixed(2)}, period=${lperiod.toFixed(1) + (lperiod !== rperiod ? '|' + rperiod.toFixed(1) : '')})`);
}

function randomize_emitters_burst(force_count = null, cb = null) {
  const count = force_count ?? Math.round(rnd(...EMITTER_BURST_COUNT));
  log(`💥 randomize emitters – burst ${count}x`);
  const t_burst = make_timer([0.07, 0.3], (i) => {
    randomize_emitters_once(true);
    if (i == count-1 && typeof cb === 'function') { // last call
      cb();
    }
  }, count); // avoid view when randomizing
  t_burst.start();
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
    if (background) { background = background.map(x => x * (2.0 - obj.contrast)); } // make background darker
    if (line) { line = line.map(x => x * obj.contrast); } // make lines brighter
  }
  if (background) { uniforms.backgroundColor.value = Array.from(background); } // copy array
  if (line) { uniforms.lineColor.value = Array.from(line); } // copy array
  gui?.get('backgroundColor').updateDisplay();
  gui?.get('lineColor').updateDisplay();
  // set overlay colors
  if (background) {
    document.querySelector('#overlay').style.backgroundColor = `rgb(${background.map(x => x*255).join(',')},0.9)`;
  }
  if (line) {
    document.querySelector('#overlay').style.color = `rgb(${line.map(x => x*1.66*255).join(',')})`;
  }
}

function set_colors_by_idx(idx) {
  current_colors = idx;
  current_colors %= colors.length;
  if (current_colors < 0) { current_colors += colors.length; }
  console.log('colors', current_colors);
  set_colors( colors[current_colors] );
  localStorage.setItem(LS_PREFIX + 'current_colors', current_colors);
}

function next_colors(offset = 1) {
  set_colors_by_idx(current_colors + offset);
}

function make_timer(period_s, cb, max_count = 0) {
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
    if (count < max_count || max_count <= 0) {
      timer = setTimeout(start, time * 1000);
    }
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
function toggle_sequence(force, emitters_immediate = false) {
  function stop() {
    if (sequence_running) {
      t_view.stop();
      t_emitters.stop();
      log(`sequence stopped`);
    }
    sequence_running = false;
  }
  
  function start() {
    log('sequence started');
    stop();
    t_view = make_timer( CHANGE_VIEW, randomize_cam );
    t_view.start();
    t_emitters = make_timer( CHANGE_EMITTERS, randomize_emitters );
    if (emitters_immediate) { t_emitters.start(); }
    else { t_emitters.reset(); }
    sequence_running = true;
  }
  
  if (force !== undefined) {
    if (force) { start(); }
    else { stop(); }
  } else {
    toggle_sequence(!sequence_running, emitters_immediate);
  }
  
  update_info();
}

function next_sequence() {
  if (!sequence_running) {
    toggle_sequence(true);
  } else {
    t_view.start(); // change view, with new timer
    // Don't reset emitter change
  }
  special_views_manual_idx = -1;
  update_menu_indicators();
}

function debounce(fn, delay = 100) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

function setup_menu() {
  const menu = document.querySelector('#menu');
  const stop_prop = (e) => { e.stopPropagation(); };
  menu.onmousedown = stop_prop;
  menu.onclick = stop_prop;
  
  let last_hidden = 0;
  document.body.addEventListener('mousedown', () => {
    if (!menu.classList.contains('hidden')) {
      last_hidden = Date.now();
    }
    toggle_menu(false);
  });
  document.body.addEventListener('dblclick', () => {
    if (Date.now() - last_hidden < 250) { return; }
    toggle_menu(true);
  });
  
  menu.querySelector('.fullscreen').onclick = () => {
    // disallow fullscreen if chrome fullscreen is active (window size is screen size, but browser fullscreen inactive)
    if (!is_fullscreen() && window.innerWidth === screen.width && window.innerHeight === screen.height) { return; }
    toggle_fullscreen();
  };
  if (!fullscreen_supported()) {
    menu.querySelector('.fullscreen').classList.add('hidden');
  }
  
  menu.querySelector('.color').onclick = () => {
    next_colors();
  };
  
  menu.querySelector('.text').onclick = () => {
    if (overlay_timeout === null) { // no timer running
      if (document.querySelector('#overlay').classList.contains('hidden')) { // no overlay shown
        toggle_overlay(true);
      } else {
        toggle_overlay_timer();
      }
    } else { // timer is running
      toggle_overlay_timer(false);
    }
  };
  
  menu.querySelector('.text-background').onclick = () => {
    toggle_overlay_bg();
  };
  
  menu.querySelector('.text-position').onclick = () => {
    cycle_overlay_pos();
  };
  
  menu.querySelector('.view').onclick = () => {
    next_sequence();
  };
  
  menu.querySelector('.special-view').onclick = (e) => {
    const idx = cycle_special_view();
    e.target.classList.toggle('dot-pulse', idx >= 0);
  };
  
  menu.querySelector('.trigger').onclick = (e) => {
    e.target.classList.add('dot-on');
    randomize_emitters_burst(Math.round(rnd(...EMITTER_MANUAL_BURST_COUNT)), () => {
      e.target.classList.remove('dot-on');
    });
  };
  
  menu.querySelector('.speed').onclick = () => {
    next_speed();
  };
  
  menu.querySelector('.reset').onclick = () => {
    reset_simulation();
  };
  
  menu.querySelector('.fps').onclick = () => {
    toggle_stats();
  };
  
  // fullscreen indicator (don't use browser events, because these don't detect borderless window i.e. in chrome)
  function update_fs_indicator() {
    let chrome_fullscreen = !is_fullscreen() && window.innerWidth === screen.width && window.innerHeight === screen.height;
    menu.querySelector('.fullscreen').classList.toggle('dot-on', is_fullscreen() || chrome_fullscreen );
  }
  update_fs_indicator = debounce(update_fs_indicator);
  window.addEventListener('resize', update_fs_indicator);

  // Add verify link
  const current_site = window.location.origin + window.location.pathname + (!window.location.pathname.endsWith('/') ? '/' : '');
  const verify_site = env.ENV === 'production' ? 'https://verify.process.studio' : new URL('verify', current_site).href;
  menu.querySelector('.verify a').href = verify_site + '/?url=' + encodeURIComponent(current_site);
}

function toggle_menu(force) {
  const menu = document.querySelector('#menu');
  if (force !== undefined) {
    if (force) {
      menu.classList.remove('hidden');
      toggle_menu_autohide(true);
    } else {
      menu.classList.add('hidden');
      toggle_menu_autohide(false);
    }
  } else {
    toggle_menu(menu.classList.contains('hidden'));
  }
}

let autohide_timer = null;
let autohide_abort = null;
function toggle_menu_autohide(force) {
  if (force === undefined) {
    toggle_menu_autohide(autohide_timer === null);
    return;
  }
  
  function add_events() {
    if (autohide_abort === null) {
      // console.log('add listerners');
      autohide_abort = new AbortController();
      ['mousemove', 'mousedown', 'resize', 'keydown'].forEach(e => window.addEventListener(e, restart, {signal: autohide_abort.signal}));
    }
  }
  
  function remove_events() {
    if (autohide_abort !== null) {
      // console.log('remove listerners');
      autohide_abort.abort();
      autohide_abort = null;
    }
  }
  
  function stop() {
    if (autohide_timer !== null) { 
      // console.log('stop timer');
      clearTimeout(autohide_timer);
      remove_events();
      autohide_timer = null;
    }
  }
  
  function restart() {
    // console.log('restart');
    clearTimeout(autohide_timer);
    autohide_timer = setTimeout(() => {
      document.querySelector('#menu').classList.add('hidden');
      stop();
    }, HIDE_MENU_AFTER * 1000);
  }
  
  if (force) {
    // console.log('autohide true');
    restart();
    remove_events();
    add_events();
  } else {
    // console.log('autohide false');
    stop();
  }
}

function update_menu_indicators() {
  //console.log('update');
  const menu = document.querySelector('#menu');
  const overlay = document.querySelector('#overlay');
  menu.querySelector('.text').classList.toggle('dot-on', !overlay.classList.contains('hidden'));
  menu.querySelector('.text').classList.toggle('dot-pulse', overlay_timeout !== null);
  menu.querySelector('.text-background').classList.toggle('disabled', overlay.classList.contains('hidden'));
  menu.querySelector('.text-position').classList.toggle('disabled', overlay.classList.contains('hidden'));
  menu.querySelector('.text-background').classList.toggle('dot-on', !overlay.classList.contains('hidden-bg'));
  menu.querySelector('.fps').classList.toggle('dot-on', stats.dom.style.display === '');
  menu.querySelector('.special-view').classList.toggle('dot-pulse', special_views_manual_idx >= 0);
  menu.querySelector('.speed').classList.toggle('three-dots-1', current_speed === 0);
  menu.querySelector('.speed').classList.toggle('three-dots-2', current_speed === 1);
  menu.querySelector('.speed').classList.toggle('three-dots-3', current_speed === 2);
}

// https://stackoverflow.com/a/38241481
function get_platform() {
  let userAgent = window.navigator.userAgent,
    platform = window.navigator?.userAgentData?.platform || window.navigator.platform,
    macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K', 'macOS'],
    windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
    iosPlatforms = ['iPhone', 'iPad', 'iPod'],
    os = 'unknown';
    
  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'macos';
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    os = 'ios';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'windows';
  } else if (/Android/.test(userAgent)) {
    os = 'android';
  } else if (/Linux/.test(platform)) {
    os = 'linux';
  }
  
  const hash = location.hash.toLowerCase();
  let device;
  if ( ['#installation', '#inst', '#hires'].includes(hash) ) {
    device = 'installation';
  } else if ( hash === '#desktop' ) {
    device = 'desktop';
  } else if ( hash === '#mobile' ) {
    device = 'mobile';
  } else {
    device = ['ios', 'android'].includes(os) ? 'mobile' : 'desktop';
  }
  
  // Remember device choice from hash
  if (['#installation', '#inst', '#hires', '#desktop', '#mobile'].includes(hash)) {
    localStorage.setItem(LS_PREFIX + 'force_device', device);
  }
  
  // Clear device choice with special hashes
  if ( ['#clear', '#default', '#reset', '#auto'].includes(hash) ) {
    localStorage.removeItem(LS_PREFIX + 'force_device');
    location.hash = '';
  }
  
  // Force remembered device choice
  const forced_device = localStorage.getItem(LS_PREFIX + 'force_device');
  if ( forced_device && ['installation', 'desktop', 'mobile'].includes(forced_device) ) {
    console.log('Forced device:', forced_device);
    location.hash = forced_device;
    device = forced_device;
  }
  
  return { device, os };
}

function toggle_controls_enabled(force) {
  if (force !== undefined) {
    controls.enabled = force;
  } else {
    controls.enabled = !controls.enabled;
  }
  update_info();
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
    toggle_fullscreen();
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
  else if (e.key == 'b') {
    randomize_emitters_burst();
  }
  else if (e.key == 'w') {
    toggle_rotation();
  }
  else if (e.key == 'Enter') {
    toggle_sequence(undefined, true);
  }
  else if (e.key == 's') {
    toggle_stats();
  }
  else if (e.key == 'Tab') {
    toggle_menu();
    e.preventDefault();
  }
  else if (e.key == 'l') {
    toggle_controls_enabled();
  }
  else if (e.key == 'i') {
    if (e.ctrlKey) { sw_uninstall(); }
    else { sw_install(); }
  } 
  else if (e.key == 'd') {
    next_speed();
  }
  
});

function pad(n, z = 2) {
  return (n + '').padStart(z, '0');
}

function tz_offset_str(d) {
  if (!d) { d = new Date(); }
  const o = d.getTimezoneOffset();
  const o_sign = Math.sign(-o);
  const o_hours = Math.floor(Math.abs(o) / 60);
  const o_mins = Math.abs(o) % 60;
  return 'UTC' + (o_sign >= 0 ? '+' : '-') + (o_mins === 0 ? o_hours : pad(o_hours)+pad(o_mins));
}

function ts_local(d) {
  if (!d) { d = new Date(); }

  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} ${tz_offset_str(d)}`;
}

function log(msg) {
  console.log(`${ts_local()}: ${msg}`);
}

function notify(msg) {
  const div = document.querySelector('#notify');
  div.innerHTML = msg;
  div.classList.remove('hidden');
}

function on_sw_update(e) {
  console.log('Updating service worker...');
  notify('Update found\nInstalling...');
  e.target.installing.onstatechange = (e) => { // fired when the state changes
    if (e.target.state === 'activated') {
      console.log('Service worker installed and activated. Reloading soon ...');
      notify('Update found\nReloading...');
      setTimeout(() => { location.reload(); }, 3000);
    }
  };
}

async function sw_install() {
  if (!navigator.serviceWorker) { return; }
  try {
    console.log('Registering service worker. Will only be installed if update is found.');
    // Service worker URL is relative to web root (not this file)
    const registration = await navigator.serviceWorker.register('./sw.js');
    // fired when the registration acquires a new worker in the installing property
    registration.onupdatefound = on_sw_update;
    // console.log('Service worker registered');
  } catch (e) {
    console.log('Service worker registration failed', e);
  }
}

async function sw_uninstall(delay = 3000) {
  if (!navigator.serviceWorker) { return; }
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) {
    console.log(`No service workers registered.`);
  } else {
    if (delay > 0) { notify('Uninstalling...\n'); }
    console.log(`Unregistering ${registrations.length} service workers...`);
    const results = await Promise.all(registrations.map(r => r.unregister())); // Result is true if the registration was found, regardless of the actual unregister status. Service workers finish all ongoing operations before unregisteing.
    const count = results.filter(r => r).length;
    console.log(`${count} service worker(s) set to be unregistered. Reloading soon ...`);
    if (delay > 0) { notify('Uninstalled\nReloading...'); }
    setTimeout(() => { location.reload(); }, delay);
    localStorage.setItem(LS_PREFIX + 'sw_manually_uninstalled', true);
  }
}

async function sw_reinstall() {
  if (!navigator.serviceWorker) { return; }
  await sw_uninstall(0);
  localStorage.setItem(LS_PREFIX + 'sw_manually_uninstalled', false); // Causes installation on reload
}

let sw_installed;
if (navigator.serviceWorker) {
  const sw_registration = await navigator.serviceWorker.getRegistration(); // can be undefined
  if (sw_registration) {
    console.log(`Service worker: 🟢 Registered${sw_registration.active ? ' and active' : ''}`);
    sw_registration.onupdatefound = on_sw_update;
    sw_installed = true;
    // registration.update();
  } else {
    console.log('Service worker: ⚫️ None registered');
    sw_installed = false;
    
    if (SW_INSTALL && !JSON.parse(localStorage.getItem(LS_PREFIX + 'sw_manually_uninstalled'))) {
      sw_install();
    }
  }
} else {
  console.log('Service worker: 🔴 Not supported');
}

// Install app button
if ( ! ['standalone', 'fullscreen'].includes(display_mode()) ) { // only when not already running as standalone app
  if (PLATFORM.os === 'ios') {
    // On iOS show info on how to manually install (Add to Home Screen)
    const install_btn = document.querySelector('menu li.install');
    install_btn.onclick = () => {
      const div_ios_info = document.querySelector('#ios-install-info');
      div_ios_info.classList.remove('hidden');
      const on_mousedown = (e) => {
        div_ios_info.classList.add('hidden');
        div_ios_info.removeEventListener('mousedown', on_mousedown);
        e.stopPropagation();
      };
      div_ios_info.addEventListener('mousedown', on_mousedown);
    };
    install_btn.classList.remove('hidden');
  } else {
    // Install (as App) button in menu (Chrome only, needs service worker)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // Prevents the default mini-infobar or install dialog from appearing on mobile
      const install_btn = document.querySelector('menu li.install');
      install_btn.onclick = async () => {
        const result = await e.prompt();
        if (result?.userChoice === 'accepted' || result?.outcome === 'accepted') {
          install_btn.classList.add('hidden');
        }
      };
      install_btn.classList.remove('hidden');
    });
  }
}

// Reload on hash change
window.addEventListener('hashchange', () => {
  window.location.reload();
});

// Hide mouse on inactivity
let cursor_timer;
function hide_cursor_after_delay(delay = HIDE_CURSOR_AFTER * 1000) {
  cursor_timer = setTimeout(() => {
    document.body.classList.add('nocursor');
  }, delay);
}
window.addEventListener('mousemove', () => {
  clearTimeout(cursor_timer);
  document.body.classList.remove('nocursor');
  hide_cursor_after_delay();
});
hide_cursor_after_delay();

main();