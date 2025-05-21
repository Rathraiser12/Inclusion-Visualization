#version 300 es
precision highp float;

uniform sampler2D u_src;   /* previous level */
uniform vec2      u_step;  /* 1 / srcSize */

in  vec2 v_ndc;            /* [-1,1]² */
layout(location = 0) out vec2 outRG;

void main()
{
  vec2 uv  = v_ndc * 0.5 + 0.5;          /* → [0,1]² */

  vec4 v00 = texture(u_src, uv);
  vec4 v10 = texture(u_src, uv + vec2(u_step.x, 0.0));
  vec4 v01 = texture(u_src, uv + vec2(0.0, u_step.y));
  vec4 v11 = texture(u_src, uv + u_step);

  float mn = min(min(v00.r, v10.r), min(v01.r, v11.r));
  float mx = max(max(v00.g, v10.g), max(v01.g, v11.g));

  outRG = vec2(mn, mx);
}
