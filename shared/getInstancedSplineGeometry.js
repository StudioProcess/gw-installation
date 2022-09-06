export default function(
  subdivisions,
  count
) {
  const extrudes = [];
  const uvXs = [];
  const indices = [];

  const uvYs = [];

  let relI = 0.0;
  let baseIndex = 0;

  const uvXStep = 1.0 / (subdivisions + 1);

  for (let i = 1, l = subdivisions - 1; i < l; i++) {
    extrudes.push(
      -1.0, 1.0
    );

    relI = uvXStep + uvXStep  * i;
    uvXs.push(relI, relI);

    baseIndex = (i - 1) * 2;

    if (i > 1) {
      indices.push(baseIndex - 1, baseIndex, baseIndex + 1);
      indices.push(baseIndex, baseIndex - 2, baseIndex - 1);
    }
  }

  for (let i = 0; i < count; i++) {
    uvYs.push(i / count);
  }

  const geometry = new THREE.InstancedBufferGeometry();
  
  // Fix for three@latest (0.144)
  // geometry.addAttribute("extrude", new THREE.BufferAttribute(new Float32Array(extrudes), 1));
  // geometry.addAttribute("uvX", new THREE.BufferAttribute(new Float32Array(uvXs), 1));
  // geometry.addAttribute("uvY", new THREE.InstancedBufferAttribute(new Float32Array(uvYs), 1));
  geometry.setAttribute("extrude", new THREE.BufferAttribute(new Float32Array(extrudes), 1));
  geometry.setAttribute("uvX", new THREE.BufferAttribute(new Float32Array(uvXs), 1));
  geometry.setAttribute("uvY", new THREE.InstancedBufferAttribute(new Float32Array(uvYs), 1));
  // ---

  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

  return geometry;
}