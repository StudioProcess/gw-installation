export default `
precision mediump float;

// uniform float time;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUV;

void main()	{

  vUV = uv;

  vec4 transformed = vec4(1.0);
  transformed.xy = position.xy;

	gl_Position = transformed;
}`;