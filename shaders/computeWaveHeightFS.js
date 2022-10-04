export default `
precision mediump float;

uniform sampler2D pingPongInMap;

uniform vec2  computeResolution;
uniform float aspectRatio;

uniform float cornerEffect;
uniform float averageDivider;

uniform float attack;
uniform float energyReduce;

uniform vec3  pointPositions[NUM_POINTS];
uniform float pointSize;
uniform float pointEffect;

varying vec2 vUV;

void main() 
{
  vec4  prevData   = texture2D(pingPongInMap, vUV);
  float prevHeight = prevData[0];
  float prevVel    = prevData[1];

  vec2  uvXOffset  = vec2(computeResolution.x / aspectRatio, 0.0);
  vec2  uvYOffset  = vec2(0.0, computeResolution.y);

  float l = texture2D(pingPongInMap, vUV - uvXOffset).r;
  float r = texture2D(pingPongInMap, vUV + uvXOffset).r;
  float t = texture2D(pingPongInMap, vUV + uvYOffset).r;
  float b = texture2D(pingPongInMap, vUV - uvYOffset).r;

  float outerAverage = l + r + t + b;

  outerAverage += texture2D(pingPongInMap, vUV + uvYOffset - uvXOffset).r * cornerEffect; // TL
  outerAverage += texture2D(pingPongInMap, vUV + uvYOffset + uvXOffset).r * cornerEffect; // TR
  outerAverage += texture2D(pingPongInMap, vUV - uvYOffset - uvXOffset).r * cornerEffect; // BL
  outerAverage += texture2D(pingPongInMap, vUV - uvYOffset + uvXOffset).r * cornerEffect; // BR

  outerAverage /= averageDivider;

  float height = prevHeight + prevVel + (attack * (outerAverage - prevHeight));
  height *= energyReduce;

  vec2 dist;
  for (int i = 0; i < NUM_POINTS; i++) {
    dist.x = vUV.x - pointPositions[i].x;
    dist.y = vUV.y - pointPositions[i].y;

    dist.x *= aspectRatio;

    dist /= pointSize;

    dist.x *= dist.x;
    dist.y *= dist.y;

    height += pointPositions[i].z * mix(
      pointEffect,
      0.0,
      clamp(dist.x + dist.y, 0.0, 1.0)
    );
  }

  float vel = height - prevHeight; // velocity
  
  gl_FragColor = vec4(height, vel, 0.0, 0.0);
}
`;