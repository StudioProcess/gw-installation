import Tarball from './tar.js';
// import { logFrame } from './main.js';

let state = {
  startTime: 0, // time for first frame
  currentTime: 0, // current faked time
  frameRate: 0, // recording frame rate
  frameTime: 0, // duration of a frame
  totalFrames: 0, // total frames to record. 0 means unbounded
  currentFrame: 0, // current recording frame,
  recording: false,
  startRecording: false, // used to wait for one update() after recording was triggered
  tarDownloadedSize: 0,
  tarMaxSize: 0,
  tarSequence: 0,
  tarFilename: '',
};

let tape; // Tarball (i.e. Tape ARchive)


// Save original timing functions (on module load)
const originalTimingFunctions = {
  requestAnimationFrame: window.requestAnimationFrame,
  performanceDotNow: window.performance.now,
  dateDotNow: window.Date.now
};

let requestAnimationFrameCallbacks = [];

function hijackTimingFunctions() {
  window.requestAnimationFrame = function replacementRequestAnimationFrame(callback) {
    requestAnimationFrameCallbacks.push(callback);
  };
  // // Version of replacementRequestAnimationFrame with logging
  // window.requestAnimationFrame = function replacementRequestAnimationFrame(callback) {
  //   logFrame('hijacked requestAnimationFrame ' + state.currentTime);
  //   requestAnimationFrameCallbacks.push(callback);
  // };
  window.performance.now = function replacementPerformanceDotNow() {
    return state.currentTime;
  };
  window.Date.now = function replacementDateDotNow() {
    return state.currentTime;
  };
}

function resetTimingFunctions() {
  window.performance.now = originalTimingFunctions.performanceDotNow;
  window.requestAnimationFrame = originalTimingFunctions.requestAnimationFrame;
  window.Date.now = originalTimingFunctions.dateDotNow;
}

function callRequestAnimationFrameCallbacks() {
  requestAnimationFrameCallbacks.forEach( callback => {
    setTimeout(callback, 0, state.currentTime);
  });
  requestAnimationFrameCallbacks = [];
}

// // Version of callRequestAnimationFrameCallbacks with logging
// function callRequestAnimationFrameCallbacks() {
//   requestAnimationFrameCallbacks.forEach( callback => {
//     logFrame('queuing anim callback ' + state.currentTime);
//     setTimeout((time) => {
//       logFrame('running anim callback ' + time);
//       callback(time);
//     }, 0, state.currentTime);
//   });
//   requestAnimationFrameCallbacks = [];
// }


let default_options = {
  start: undefined,
  duration: undefined,
  framerate: 30,
  chunk: 500,
};

export function start(options) {
  options = Object.assign({}, default_options, options);
  console.log('rec: starting', options);
  
  // frame rate and time
  state.frameRate = options.framerate;
  state.frameTime = 1000 / state.frameRate;
  
  // start and current time
  if (options.start === undefined) {
    state.startTime = performance.now(); // no start time given, record from current time
  } else {
    state.startTime = options.start * 1000;
    console.log('setting start time', state.startTime);
  }
  state.currentTime = state.startTime;
  state.currentFrame = 0;
  
  // number of frames to record
  if (options.duration === undefined) {
    state.totalFrames = 0;
  } else {
    state.totalFrames = Math.ceil(options.duration * state.frameRate);
  }
  
  state.tarMaxSize = options.chunk;
  state.tarDownloadedSize = 0;
  state.tarSequence = 0;
  state.tarFilename = new Date().toISOString();
  
  hijackTimingFunctions();
  
  tape = new Tarball();
  
  createHUD();
  
  state.recording = false;
  state.startRecording = true;
}


export function update(renderer) {
  if (state.startRecording) {
    state.recording = true;
    state.startRecording = false;
    // IMPORTANT: Skip recording this frame, just run callback
    // This frame still has unhijacked timing
    callRequestAnimationFrameCallbacks();
    return;
  }
  if (!state.recording) return;
  
  let canvas = renderer.domElement;
  
  // Capture a frame; numbering is currentFrame+1
  console.log('CAPTURING FRAME #' + (state.currentFrame+1) + ' TIME ' + state.currentTime);
  // console.assert(performance.now() === state.currentTime, "checking performance.now()");
  let filename = `${state.currentFrame+1}`.padStart(7,'0') + '.png';
  
  // saveCanvasToPNG(canvas, filename).then(() => {
  addPNGToTarball(canvas, filename).then(() => {
    // advance time
    state.currentTime += state.frameTime;
    state.currentFrame++;
    
    callRequestAnimationFrameCallbacks();
    
    // check for end of recording
    if (state.totalFrames > 0 && state.currentFrame >= state.totalFrames) {
      stop();
    } else if (tape.length / 1000000 >= state.tarMaxSize) {
      saveTarball();
    }
  });
  
  updateHUD();
}


export function stop() {
  console.log('rec: stopping');
  resetTimingFunctions();
  
  state.recording = false;
  
  if (tape) {
    saveTarball({last:true});
  }
  
  updateHUD();
  hideHUD(60000 * 3);
}


export function startstop(options) {
  if (!state.recording) {
    start(options);
  } else {
    stop();
  }
}

export function now() {
  if (state.recording) {
    return state.currentTime;
  } else {
    return window.performance.now();
  }
}

function saveTarball(options = {last:false}) {
  let seq;
  if (options && options.last && state.tarSequence == 0) {
    seq = '';
  } else {
    seq = '_' + ('' + state.tarSequence++).padStart(3, '0');
  }
  saveBlob( tape.save(), state.tarFilename + seq + '.tar');
  state.tarDownloadedSize += tape.length;
  tape = new Tarball();
}


async function saveCanvasToPNG(canvas, filename) { // eslint-disable-line
  return new Promise(resolve => {
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
    canvas.toBlob(blob => {
      let url = URL.createObjectURL(blob);
      let link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      resolve(filename);
    }, 'image/png');
  });
}


async function addPNGToTarball(canvas, filename) {
  return canvasToBlob(canvas, 'image/png')
    .then(blobToArrayBuffer)
    .then(buffer => {
      tape.append(filename, buffer);
    });
}

async function canvasToBlob(canvas, type) {
  return new Promise(resolve => {
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
    canvas.toBlob(blob => resolve(blob), type);
  });
}

async function blobToArrayBuffer(blob) {
  return new Promise(resolve => {
    let f = new FileReader();
    f.onload = () => resolve(f.result);
    f.readAsArrayBuffer(blob);
  });
}

function saveURL(url, filename) {
  let link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

function saveBlob(blob, filename) {
  let url = URL.createObjectURL(blob);
  saveURL(url, filename);
  URL.revokeObjectURL(url);
}

let hud;

function createHUD() {
  if (hud) return;
  hud = document.createElement( 'div' );
  hud.id = "rec-hud";
  hud.style.position = 'absolute';
  hud.style.left = hud.style.top = 0;
  hud.style.backgroundColor = 'black';
  hud.style.fontFamily = 'system-ui, monospace';
  hud.style.fontVariantNumeric = 'tabular-nums';
  hud.style.fontSize = '12px';
  hud.style.padding = '5px';
  hud.style.color = 'orangered';
  hud.style.zIndex = 1;
  document.body.appendChild( hud );
}

function updateHUD() {
  hud.style.display = 'block';
  hud.style.color = state.recording ? 'orangered' : 'gainsboro';
  
  let frames = (state.currentFrame + '').padStart(7,'0');
  frames += state.totalFrames > 0 ? '/' + state.totalFrames : '';
  let clock = new Date(state.currentTime - state.startTime).toISOString().substr(14, 5);
  let intraSecondFrame = (state.currentFrame % state.frameRate + '').padStart(2, '0');
  let dataAmount = dataAmountString(state.tarDownloadedSize + tape.length);
  // eslint-disable-next-line no-irregular-whitespace
  hud.textContent = `●REC ${clock}.${intraSecondFrame} #${frames} ${dataAmount}`; // shows number of COMPLETE frames
}

function hideHUD(time = 0) {
  setTimeout(() => {
    hud.style.display = 'none';
  }, time);
}


function dataAmountString(numBytes, mbDecimals = 1, gbDecimals = 2) {
  let mb = numBytes / 1000000;
  let gb = mb / 1000;
  return gb < 1 ? mb.toFixed(mbDecimals) + ' MB': gb.toFixed(gbDecimals) + ' GB';
}
