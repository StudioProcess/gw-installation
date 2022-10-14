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
uniform vec2      computeResolution;

uniform float c;
uniform float damping;

uniform vec3  pointPositions[NUM_POINTS];
uniform float pointSize;
uniform float pointEffect;

in  vec2 vUV;
out vec4 fragColor;

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
    float dist = distance( vUV, pointPositions[i].xy );
    float is_point = 1.0 - step( 1.0/1024.0, dist ); // 1.0 if dist < 1.0 else 0.0
    
    h = mix( h, pointPositions[i].z * pointEffect, is_point );
  }
  
  fragColor = vec4(h, h_vel, 0.0, 0.0);
}
`;