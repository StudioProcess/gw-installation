export default `
precision mediump float;

uniform sampler2D pingPongInMap;

uniform vec3 pointPositions[NUM_POINTS];
uniform float aspectRatio;
uniform vec2 computeResolution;

uniform float attack;
uniform float decay;
uniform float energyReduce;

uniform float dotEffect;

uniform float pointSize;

uniform float cornerEffect;
uniform float averageDivider;

varying vec2 vUV;

void main()
{
  vec4 prevData = texture2D(pingPongInMap, vUV);

  // prevData.r = 1.0 - prevData.r;

  float prevHeight = prevData.r;
  float prevVel = prevData.g;

  vec2 uvXOffset = vec2(computeResolution.x / aspectRatio, 0.0);
  vec2 uvYOffset = vec2(0.0, computeResolution.y);

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


  // vec2 minEdges = computeResolution;
  // minEdges *= 1.0;
  
  // vec2 maxEdges = computeResolution;
  // maxEdges *= 4.0;

  // float outerEdges = smoothstep(minEdges.x, maxEdges.x, vUV.x);
  // outerEdges *= smoothstep(1.0 - minEdges.x, 1.0 - maxEdges.x, vUV.x);

  // outerEdges *= smoothstep(minEdges.y, maxEdges.y, vUV.y);
  // outerEdges *= smoothstep(1.0 - minEdges.y, 1.0 - maxEdges.y, vUV.y);

  // outerAverage = mix(
  //   prevData.r,
  //   outerAverage,
  //   outerEdges
  // );


  prevData.r += (prevVel + (attack * (outerAverage - prevData.r))) * decay;
  prevData.r *= energyReduce;

  vec2 dist;
  for (int i = 0; i < NUM_POINTS; i++) {
    dist.x = vUV.x - pointPositions[i].x;
    dist.y = vUV.y - pointPositions[i].y;

    dist.x *= aspectRatio;

    dist /= pointSize;

    dist.x *= dist.x;
    dist.y *= dist.y;

    prevData.r += pointPositions[i].z * mix(
      dotEffect,
      0.0,
      clamp(dist.x + dist.y, 0.0, 1.0)
    );
  }

  vec3 norm;
  norm.x = l - r;
  norm.y = b - t;
  norm.z = 2.0;
  norm = normalize(norm);

  prevData.g = (prevData.r - prevHeight); // velocity

  // prevData.b = norm.x; // y normal
  // prevData.a = norm.y; // y normal

  // prevData.r = outerEdges;

	gl_FragColor = vec4(prevData.rg, norm);
}
`;