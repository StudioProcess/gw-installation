import GUI from 'lil-gui';

// Get Controller by name
// Adds a function get() to the GUI prototype
// Takes one or more controller names, where the last one is the actual name of the controller and the preceding ones are names of (nested) folders the controller is in
GUI.prototype.get = function(...names) {
  for (const [i, name] of names.entries()) {
    if (i === names.length-1) { // the last path element
      // find element
      let el = this.controllers.find( c => c._name == name );
      if (el !== undefined) { return el; }
      el = this.folders.find( f => f._title == name ); // try folders instead
      if (el === undefined) { 
        throw { error: `GUI element not found: ${name}` };
      }
      return el;
    }
    // find folder
    let folder = this.folders.find( f => f._title == name );
    if (folder === undefined) { 
        throw { error: `GUI folder not found: ${name}` };
    }
    // recur
    return folder.get(...names.slice(1));
  }
};

// Update display of all controllers
GUI.prototype.updateDisplay = function(obj) {
  for (let c of this.controllersRecursive()) {
    c.updateDisplay();
  }
}

export function initGui(uniforms) {
  const keys = Object.keys(uniforms);

  const gui = new GUI();

  for (let i = 0, l = keys.length; i < l; i++) {
    const uniform = uniforms[keys[i]];

    if (uniform.hideinGui === true || uniform.type === undefined) {
      continue;
    }

    if (uniform.type === "f") {
      addSlider(gui, uniform, keys[i]);
    } else if (uniform.type.includes("fv")) {
      addArraySlider(gui, uniform, keys[i]);
    } else if (uniform.type === "v3v") {
      addV3ArraySlider(gui, uniform, keys[i])
    }
  }

  return gui;
}

export function addSlider(gui, uniform, name) {
  const slider =  gui.add(uniform, "value")
    .name(name);

  if (uniform.min !== undefined) {
    slider.min(uniform.min);
  }

  if (uniform.max !== undefined) {
    slider.max(uniform.max);
  }

  if (uniform.step !== undefined) {
    slider.step(uniform.step);
  }
}

export function addArraySlider(gui, uniform, name) {
  if (uniform.color === true) {
//     const target = {value: uniform.value};
// 
//     for (let i = 0, l = uniform.value.length; i < l; i++) {
//       target.value[i] = Math.round(target.value[i] * 255.0);
//     }

    gui.addColor(uniform, "value", 1.0)
      .name(name);

    // auto set colors
    // for (let i = 0, l = uniform.value.length; i < l; i++) {
    //   uniform.value[i] = uniform.value[i] / 255.0;
    // }

    return;
  }

  const folder = gui.addFolder(name).close();

  for (let i = 0, l = uniform.value.length; i < l; i++) {
    const index = i;

    const target = {value: uniform.value[i]};

    const slider = folder.add(uniform.value, i.toFixed(0))
      .name(uniform.gui ? uniform.gui[i].name : i);

    if (uniform.min !== undefined) {
      slider.min(uniform.min);
    }

    if (uniform.max !== undefined) {
      slider.max(uniform.max);
    }

    if (uniform.step !== undefined) {
      slider.step(uniform.step);
    }

    if (uniform.gui !== undefined) {
      if (uniform.gui[i].min !== undefined) {
        slider.min(uniform.gui[i].min);
      }

      if (uniform.gui[i].max !== undefined) {
        slider.max(uniform.gui[i].max);
      }

      if (uniform.gui[i].step !== undefined) {
        slider.step(uniform.gui[i].step);
      }
    }

    // slider.onChange(
    //   (value) => {
    //     console.log(value);
    //     uniform.value[i] = value;
    //   }
    // );
  }
}

export function addV3ArraySlider(gui, uniform, name) {
  const folder = gui.addFolder(name).close();

  for (let i = 0, l = uniform.value.length; i < l; i++) {
    const index = i;

    const itemFolder = folder.addFolder(i).close();

    // x
    itemFolder.add(uniform.value[i], "x")
      .name("x")
      .onChange(
        (value) => {
          uniform.value[i].x = value;
        }
      );

    // y
    itemFolder.add(uniform.value[i], "y")
      .name("y")
      .onChange(
        (value) => {
          uniform.value[i].y = value;
        }
      );

    // z
    itemFolder.add(uniform.value[i], "z")
      .name("z")
      .onChange(
        (value) => {
          uniform.value[i].z = value;
        }
      );
  }
}

export function addThreeV3Slider(gui, vector, name) {
  const folder = gui.addFolder(name).close();

  // x
  folder.add(vector, "x")
    .name("x")
    .onChange(
      (value) => {
        vector.x = value;
      }
    );

  // y
  folder.add(vector, "y")
    .name("y")
    .onChange(
      (value) => {
        vector.y = value;
      }
    );

  // z
  folder.add(vector, "z")
    .name("z")
    .onChange(
      (value) => {
        vector.z = value;
      }
    );
}