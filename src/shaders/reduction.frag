#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform int u_op; // This new uniform tells the shader what to do: 0=MIN, 1=MAX

in vec2 v_ndc;

out vec4 out_val; // Now has only one output

vec4 op_min(vec4 a, vec4 b) {
    if (a.a < 0.5) return b; // a is invalid
    if (b.a < 0.5) return a; // b is invalid
    return a.r < b.r ? a : b;
}

vec4 op_max(vec4 a, vec4 b) {
    if (a.a < 0.5) return b;
    if (b.a < 0.5) return a;
    return a.r > b.r ? a : b;
}

void main() {
    // Fetch the 4 data points from the 2x2 block in the source texture
    ivec2 src_coord_BL = ivec2(gl_FragCoord.xy) * 2;
    vec4 p00 = texelFetch(u_source, src_coord_BL, 0);
    vec4 p10 = texelFetch(u_source, src_coord_BL + ivec2(1, 0), 0);
    vec4 p01 = texelFetch(u_source, src_coord_BL + ivec2(0, 1), 0);
    vec4 p11 = texelFetch(u_source, src_coord_BL + ivec2(1, 1), 0);

    if (u_op == 0) { // Find Minimum
        vec4 result = op_min(p00, p10);
        result = op_min(result, p01);
        result = op_min(result, p11);
        out_val = result;
    } else { // Find Maximum
        vec4 result = op_max(p00, p10);
        result = op_max(result, p01);
        result = op_max(result, p11);
        out_val = result;
    }
}