#version 300 es
/* Two-triangle fullscreen quad */

layout(location = 0) in vec2 a_position;
out vec2 v_ndc;

void main() {
  v_ndc       = a_position;         /* NDC in (−1,1)² */
  gl_Position = vec4(a_position, 0.0, 1.0);
}
