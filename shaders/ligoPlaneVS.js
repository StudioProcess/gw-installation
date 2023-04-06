export default `
// #version 300 es
// Note: Version specified via THREE.RawShaderMaterial

precision mediump float;

uniform sampler2D pingPongOutMap;
uniform vec2 computeResolution;
// uniform float time;

uniform float displaceGain;
uniform float displaceHeight;
uniform float displaceLimit;
uniform float waveSmoothing;

uniform float numLines;

uniform vec2 extent;

uniform float lineWeight;

uniform vec2 uvScale;
uniform float uvRotate;
uniform vec2 uvTranslate;

uniform float walzeLeft;
uniform float walzeRight;
uniform float walzeWidth;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in float extrude;
in float uvX;
in float uvY;

out vec2 vUV;
out float lineBase;

// https://iquilezles.org/articles/functions/
// float gain(float x, float k) {
//   x = min(1.0, x); // Clamp input value to 1.0 (Fixes rendering gaps on iOS)
//   float a = 0.5 * pow(2.0 * ((x<0.5) ? x : 1.0-x), k);
//   return (x<0.5) ? a : 1.0 - a;
// }

// // Perlin and Hoffert: Hypertexture; Computer Graphics, Vol. 3, No. 3, 1989
// float bias(float t, float a) {
//   return pow(t, -log(a)/log(2.0));
// }
// float gain(float t, float a) {
//   t = clamp(t, 0.0, 1.0);
//   return t < 0.5 ? 0.5 * bias(2.0*t, a) : 1.0 - 0.5 * bias(2.0-2.0*t, a);
// }

// Christophe Schlick: Fast Alternatives to Perlin's Bias and Gain Functions; Graphics Gems 4, 1994
float bias(float t, float a) {
  return t / ( (1.0/a - 2.0) * (1.0 - t) + 1.0 );
}
float gain(float t, float a) {
  // t = clamp(t, 0.0, 1.0);
  return t < 0.5 ?
    t / ( (1.0/a - 2.0) * (1.0 - 2.0*t) + 1.0 ) :
    ((1.0/a - 2.0)*(1.0 - 2.0*t) - t) / ((1.0/a - 2.0)*(1.0 - 2.0*t) - 1.0);	
}

float limit(float t, float l) {
  return max( min(t, l), -l);
}

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, -s, s, c);
	return m * v;
}

vec2 getNormal(vec2 p0, vec2 p1, vec2 p2) {
  vec2 prevTang = normalize(p1 - p0);
  vec2 nextTang = normalize(p2 - p1);

  vec2 tangent = normalize(prevTang + nextTang);

  vec2 perp = vec2(-prevTang.y, prevTang.x);
  vec2 miter = vec2(-tangent.y, tangent.x);
  vec2 dir = tangent;
  float len = 1.0 / dot(miter, perp);

  vec2 normal = vec2(-dir.y, dir.x);
  normal *= len/2.0;

  return normal;
}

vec2 getTransformedUV(vec2 uv) {
  uv -= 0.5;
  uv *= uvScale;
  uv = rotate(uv, uvRotate);
  uv -= uvTranslate;
  uv += 0.5;
  return uv;
}

// sample wave height with a 3x3 gauss kernel
// filter_level ... [0.0, 1.0]
float wave_height_filtered(vec2 uv_, float filter_level) {
  vec2 uvm = uv_ - computeResolution;
  vec2 uvp = uv_ + computeResolution;
  return
      mix(0.0, 0.0625, filter_level) * texture(pingPongOutMap, vec2(uvm.s, uvm.t)).r
    + mix(0.0, 0.125,  filter_level) * texture(pingPongOutMap, vec2(uv_.s, uvm.t)).r
    + mix(0.0, 0.0625, filter_level) * texture(pingPongOutMap, vec2(uvp.s, uvm.t)).r
    + mix(0.0, 0.125,  filter_level) * texture(pingPongOutMap, vec2(uvm.s, uv_.t)).r
    + mix(1.0, 0.25,   filter_level) * texture(pingPongOutMap, vec2(uv_.s, uv_.t)).r
    + mix(0.0, 0.125,  filter_level) * texture(pingPongOutMap, vec2(uvp.s, uv_.t)).r
    + mix(0.0, 0.0625, filter_level) * texture(pingPongOutMap, vec2(uvm.s, uvp.t)).r
    + mix(0.0, 0.125,  filter_level) * texture(pingPongOutMap, vec2(uv_.s, uvp.t)).r
    + mix(0.0, 0.0625, filter_level) * texture(pingPongOutMap, vec2(uvp.s, uvp.t)).r;
}

void main()	{

  vec2 prevUV = vec2(uvX - computeResolution.x, uvY);
  vUV = vec2(uvX, uvY);
  vec2 nextUV = vec2(uvX + computeResolution.x, uvY);

  vec4 vPositionPrev = vec4(prevUV, 0.0, 1.0);
  vec4 vPosition = vec4(vUV, 0.0, 1.0);
  vec4 vPositionNext = vec4(nextUV, 0.0, 1.0);

  vPositionPrev.xy -= 0.5;
  vPositionPrev.xy *= extent;
  vPosition.xy -= 0.5;
  vPosition.xy *= extent;
  vPositionNext.xy -= 0.5;
  vPositionNext.xy *= extent;

  prevUV = getTransformedUV(prevUV);
  vUV = getTransformedUV(vUV);
  nextUV = getTransformedUV(nextUV);

  float heightMultiplier = smoothstep(walzeLeft, walzeLeft + walzeWidth, vUV.x);
  heightMultiplier *= smoothstep(walzeRight, walzeRight - walzeWidth, vUV.x);

  // float waveDataPrev = texture(pingPongOutMap, prevUV).r;
  float waveDataPrev = wave_height_filtered(prevUV, waveSmoothing);
  waveDataPrev *= heightMultiplier;
  vPositionPrev.z += displaceHeight * waveDataPrev * gain(abs(waveDataPrev), displaceGain);
  vPositionPrev.z = limit(vPositionPrev.z, displaceLimit);
  vPositionPrev = modelViewMatrix * vPositionPrev;

  // float waveData = texture(pingPongOutMap, vUV).r;
  float waveData = wave_height_filtered(vUV, waveSmoothing);
  waveData *= heightMultiplier;
  vPosition.z += displaceHeight * waveData * gain(abs(waveData), displaceGain);
  vPosition.z = limit(vPosition.z, displaceLimit);
  vPosition = modelViewMatrix * vPosition;

  // float waveDataNext = texture(pingPongOutMap, nextUV).r;
  float waveDataNext = wave_height_filtered(nextUV, waveSmoothing);
  waveDataNext *= heightMultiplier;
  vPositionNext.z += displaceHeight * waveDataNext * gain(abs(waveDataNext), displaceGain);
  vPositionNext.z = limit(vPositionNext.z, displaceLimit);
  vPositionNext = modelViewMatrix * vPositionNext;

  vec2 extrudeV = getNormal(
    vPositionPrev.xy,
    vPosition.xy,
    vPositionNext.xy
  );

  vPosition.xy += (extrude * lineWeight * vPosition.w) * extrudeV;

	gl_Position = projectionMatrix * vPosition;
}
`;