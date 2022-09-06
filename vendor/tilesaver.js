let renderer, scene, camera;
let NUM_TILES = 2;


export function init(_renderer, _scene, _camera, _tiles) {
  renderer = _renderer;
  scene = _scene;
  camera = _camera;
  if (_tiles > 0) NUM_TILES = _tiles;
}


export function saveCanvas(canvas, filename) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      let url = URL.createObjectURL(blob);
      let link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      resolve(filename);
    });
  });
}


export function save(num_tiles) {
  // assume rendering is halted
  
  num_tiles = num_tiles !== undefined ? num_tiles : NUM_TILES;
  
  if (!renderer || !scene || !camera) {
    console.warn('tilesaver: Please use init() to set up renderer, scene and camera');
    return;
  }
  
  if (num_tiles < 1) {
    console.warn('tilesaver: number of tiles needs to be > 0');
    return;
  }
  
  let timestamp  = new Date().toISOString();
  let tileWidth  = renderer.domElement.width;
  let tileHeight = renderer.domElement.height;
  let fullWidth  = tileWidth  * num_tiles;
  let fullHeight = tileHeight * num_tiles;
  console.log(tileWidth, tileHeight, fullWidth, fullHeight);
  
  let targetCanvas = document.createElement("canvas");
  targetCanvas.width = fullWidth;
  targetCanvas.height = fullHeight;
  let targetContext = targetCanvas.getContext("2d");
  
  for (let ty=0; ty<num_tiles; ty++) {
    for (let tx=0; tx<num_tiles; tx++) {
      let offsetX = tx * tileWidth;
      let offsetY = ty * tileHeight;
      camera.setViewOffset( fullWidth, fullHeight, offsetX, offsetY, tileWidth, tileHeight );
      renderer.render( scene, camera );
      // save current tile
      targetContext.drawImage(renderer.domElement, offsetX, offsetY);
    }
  }
  
  camera.clearViewOffset();
  return saveCanvas(targetCanvas, `${timestamp}_${fullWidth}x${fullHeight}.png`);
}
