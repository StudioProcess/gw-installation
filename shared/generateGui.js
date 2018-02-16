export default function init(uniforms) {
  const keys = Object.keys(uniforms);

  const gui = new dat.GUI();

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
    const target = {value: uniform.value};

    for (let i = 0, l = uniform.value.length; i < l; i++) {
      target.value[i] = Math.round(target.value[i] * 255.0);
    }

    gui.addColor(target, "value")
      .name(name)
      .onChange((value) => {
        for (let i = 0, l = uniform.value.length; i < l; i++) {
          uniform.value[i] = value[i] / 255.0;
        }
      });

    // auto set colors
    for (let i = 0, l = uniform.value.length; i < l; i++) {
      uniform.value[i] = uniform.value[i] / 255.0;
    }

    return;
  }

  const folder = gui.addFolder(name);

  for (let i = 0, l = uniform.value.length; i < l; i++) {
    const index = i;

    const target = {value: uniform.value[i]};

    const slider = folder.add(target, "value")
      .name(uniform.gui ? uniform.gui[i].name : i);

    // if (uniform.gui[i].min !== undefined) {
    //   slider.min(uniform.gui[i].min);
    // }

    // if (uniform.gui[i].max !== undefined) {
    //   slider.max(uniform.gui[i].max);
    // }

    // if (uniform.gui[i].step !== undefined) {
    //   slider.step(uniform.gui[i].step);
    // }

    slider.onChange(
      (value) => {
        uniform.value[i] = value;
      }
    );
  }
}

export function addV3ArraySlider(gui, uniform, name) {
  const folder = gui.addFolder(name);

  for (let i = 0, l = uniform.value.length; i < l; i++) {
    const index = i;

    const itemFolder = folder.addFolder(i);

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