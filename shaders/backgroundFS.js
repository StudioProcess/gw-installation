export default `
// #version 300 es
// Note: Version specified via THREE.RawShaderMaterial

precision mediump float;

uniform vec3 backgroundColor;

out vec4 fragColor;

void main()	{
  fragColor = vec4(backgroundColor, 1.0);
}
`;