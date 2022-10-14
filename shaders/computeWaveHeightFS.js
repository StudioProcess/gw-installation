export default `
// #version 300 es
// Note: Version specified via THREE.RawShaderMaterial

// Wave Equation
// u_tt = ∆u
// https://en.wikipedia.org/wiki/Wave_equation
// 
// Laplace-Operator
// ∆u = u_xx + u_yy

precision mediump float;

uniform sampler2D pingPongInMap;
uniform vec2      computeResolution; // typically vec2( 1.0/1024.0 )
uniform float     border; // [0.0, 1.0]

uniform float c;
uniform float damping;

uniform vec3  pointPositions[NUM_POINTS];
uniform float pointSize;
uniform float pointEffect;

in  vec2 vUV;
out vec4 fragColor;

// Returns [0.0, 1.0]
// 0.0 ... outer border, 1.0 ... inner border
float border_dist(vec2 uv) {
  float b = min(
    min(uv.x, 1.0-uv.x),
    min(uv.y, 1.0-uv.y)
  );
  return clamp(b, 0.0, border) / border;
}

// Christophe Schlick: Fast Alternatives to Perlin's Bias and Gain Functions; Graphics Gems 4, 1994
// t: [0, 1], a: ]0, 1[
// Returns: [0, 1]
float bias(float t, float a) {
  return t / ( (1.0/a - 2.0) * (1.0 - t) + 1.0 );
}

void main()
{
  vec4  prevData   = texture(pingPongInMap, vUV);
  float prev_h     = prevData[0];
  float prev_h_vel = prevData[1];

  vec2  uv_ox  = vec2(computeResolution.x, 0.0);
  vec2  uv_oy  = vec2(0.0, computeResolution.y);
  
  // Discrete Laplace-Operator
  // https://stackoverflow.com/a/22442251
  // https://en.wikipedia.org/wiki/Discrete_Laplace_operator#Image_processing
  // ∆u = u(x+1,y) + u(x-1,y) + u(x,y+1) + u(x,y-1) - 4*u(x,y)
  float h_acc = 0.0
    + texture(pingPongInMap, vUV - uv_ox)[0]  // L
    + texture(pingPongInMap, vUV + uv_ox)[0]  // R
    + texture(pingPongInMap, vUV + uv_oy)[0]  // T
    + texture(pingPongInMap, vUV - uv_oy)[0]  // B
    - 4.0 * prev_h;

  float h_vel = (prev_h_vel + h_acc * c*c ) * damping;
  float h = prev_h + h_vel;
  
  // agitation points
  // -> override height/vel
  for (int i = 0; i < NUM_POINTS; i++) {
    float dist = distance( vUV, pointPositions[i].xy ); // distance from current pos to point (in uv space)
    dist /= computeResolution.x; // distance in "px"
    dist = clamp(dist, 0.0, pointSize) / pointSize; // parameter inside the point from 0 (center) .. 1 (outside)
    h = mix( pointPositions[i].z * pointEffect, h, dist ); // linear blend from point to base value from point center outwards
  }
  
  // damp down displacement towards the boundaries to avoid reflections
  float border_scale = bias( border_dist(vUV), 0.95 ); // falls off from 1.0 to 0.0 on the border
  h *= border_scale;
  
  fragColor = vec4(h, h_vel, 0.0, 0.0);
}
`;