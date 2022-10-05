export default `
// #version 300 es
// Note: Version specified via THREE.RawShaderMaterial

precision mediump float;

in vec3 position;
in vec2 uv;

out vec2 vUV;

void main() {
  vUV = uv;

  vec4 transformed = vec4(1.0);
  transformed.xy = position.xy;

  gl_Position = transformed;
}
`;