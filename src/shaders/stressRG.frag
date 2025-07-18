#version 300 es
precision highp float;

/* UNIFORMS */
uniform float u_r0, u_lambda, u_S, u_beta;
uniform float u_gamma, u_kappa_m, u_kappa_p;
uniform int   u_component, u_hole;
uniform float u_zoom, u_aspect;
uniform vec2  u_pan;

/* VARYINGS & OUTPUTS */
in  vec2 v_ndc;
layout(location = 0) out vec2 outRG;

/* SHARED STRESS CALCULATION FUNCTION */
// This function is identical to the one in plate.frag
vec3 getStress(vec2 xy) {
    float r = length(xy), th = atan(xy.y, xy.x);
    float A, B;
    if(u_hole == 1) { A = 0.0; B = 0.0; }
    else {
        A = (1.0 + u_kappa_m) / (2.0 + u_gamma * (u_kappa_p - 1.0));
        B = (1.0 + u_kappa_m) / (u_gamma + u_kappa_m);
    }
    float S = u_S, lam = u_lambda;
    float c2b = cos(2.0 * u_beta), s2b = sin(2.0 * u_beta);
    float sxx, syy, txy;
    if (r <= u_r0) {
        sxx = 0.5*S*((lam+1.0)*A + (1.0-lam)*B*c2b);
        syy = 0.5*S*((lam+1.0)*A - (1.0-lam)*B*c2b);
        txy = 0.5*S*(1.0-lam)*B*s2b;
    } else {
        float rr2 = (u_r0 * u_r0) / (r*r), rr4 = rr2*rr2;
        float c2t = cos(2.0*th), s2t = sin(2.0*th);
        sxx = 0.5*S*(lam+1.0)*(1.0-(1.0-A)*rr2*c2t) + 0.5*S*(1.0-lam)*(c2b+(1.0-B)*(3.0*rr4*cos(4.0*th-2.0*u_beta)-4.0*rr2*cos(2.0*u_beta-3.0*th)*cos(th)));
        syy = 0.5*S*(lam+1.0)*(1.0+(1.0-A)*rr2*c2t) - 0.5*S*(1.0-lam)*(c2b+(1.0-B)*(3.0*rr4*cos(4.0*th-2.0*u_beta)-4.0*rr2*sin(2.0*u_beta-3.0*th)*sin(th)));
        txy = -0.5*S*(lam+1.0)*(1.0-A)*rr2*s2t + 0.5*S*(1.0-lam)*(s2b+(1.0-B)*(3.0*rr4-2.0*rr2)*sin(4.0*th-2.0*u_beta));
    }
    return vec3(sxx, syy, txy);
}

void main()
{
  vec2 xy = vec2(v_ndc.x * u_aspect, v_ndc.y);
  xy = (xy + u_pan) / u_zoom; // Use fixed pan/zoom for calculation pass

  vec3 stress = getStress(xy);
  float val = u_component == 0 ? stress.x : (u_component == 1 ? stress.y : stress.z);
  
  outRG = vec2(val, val);
}