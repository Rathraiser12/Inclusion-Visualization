#version 300 es
precision highp float;

/* UNIFORMS */
uniform float u_r0, u_lambda, u_S, u_beta;
uniform float u_gamma, u_kappa_m, u_kappa_p;
uniform int   u_component, u_cmap, u_hole;
uniform float u_minVal, u_maxVal, u_zoom, u_aspect;
uniform vec2  u_pan;

/* VARYINGS & OUTPUTS */
in  vec2 v_ndc;
out vec4 fragColor;

/* COLORMAPS (Only used in final plate render) */
#ifdef IS_PLATE_FRAG
  vec3 hsv2rgb(float h, float s, float v) {
    float c = v * s, h6 = h / 60.0;
    float x = c * (1.0 - abs(mod(h6, 2.0) - 1.0));
    vec3 rgb = vec3(0.0);
    if      (h6 < 1.0) rgb = vec3(c, x, 0);
    else if (h6 < 2.0) rgb = vec3(x, c, 0);
    else if (h6 < 3.0) rgb = vec3(0, c, x);
    else if (h6 < 4.0) rgb = vec3(0, x, c);
    else if (h6 < 5.0) rgb = vec3(x, 0, c);
    else               rgb = vec3(c, 0, x);
    return rgb + (v - c);
  }
  vec3 rainbow(float t) { return hsv2rgb(270.0 - 270.0 * clamp(t, 0.0, 1.0), 1.0, 1.0); }
  vec3 jet(float t) { t = clamp(t, 0.0, 1.0); return vec3(clamp(1.5-abs(4.0*t-3.0),0.0,1.0),clamp(1.5-abs(4.0*t-2.0),0.0,1.0),clamp(1.5-abs(4.0*t-1.0),0.0,1.0)); }
  vec3 hot(float t) { t=clamp(t,0.0,1.0); return vec3(min(1.0,3.0*t), t<1.0/3.0?0.0:min(1.0,3.0*(t-1.0/3.0)), t<2.0/3.0?0.0:min(1.0,3.0*(t-2.0/3.0)));}
  vec3 coolWarm(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 cold = vec3(0.23, 0.30, 0.75);
  vec3 neutral = vec3(0.86, 0.87, 0.91);
  vec3 warm = vec3(0.70, 0.02, 0.15);

  if (t < 0.5) {
    return mix(cold, neutral, t * 2.0);
  } else {
    return mix(neutral, warm, (t - 0.5) * 2.0);
  }
}

  vec3 applyCMap(float v) {
    float t = (v - u_minVal) / (u_maxVal - u_minVal);
    if (u_cmap == 1) return jet(t);
    if (u_cmap == 2) return hot(t);
    if (u_cmap == 3) return coolWarm(t);
    if (u_cmap == 4) return coolWarm(1.0 - t);
    return rainbow(t);
  }
#endif

/* STRESS CALCULATION (Used by both passes) */
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
    if (r < u_r0-1e-9) {
        sxx = 0.5*S*((lam+1.0)*A + (1.0-lam)*B*c2b); // <-- FIX: was (lam-1.0)
        syy = 0.5*S*((lam+1.0)*A - (1.0-lam)*B*c2b); // <-- FIX: was (lam-1.0)
        txy = 0.5*S*(1.0-lam)*B*s2b;                 // <-- FIX: was (lam-1.0)
    } else {
        float rr2 = (u_r0*u_r0)/(r*r), rr4 = rr2*rr2;
        float c2t = cos(2.0*th), s2t = sin(2.0*th);
        sxx = 0.5*S*(lam+1.0)*(1.0-(1.0-A)*rr2*c2t) + 0.5*S*(1.0-lam)*(c2b+(1.0-B)*(3.0*rr4*cos(4.0*th-2.0*u_beta)-4.0*rr2*cos(2.0*u_beta-3.0*th)*cos(th)));
        syy = 0.5*S*(lam+1.0)*(1.0+(1.0-A)*rr2*c2t) - 0.5*S*(1.0-lam)*(c2b+(1.0-B)*(3.0*rr4*cos(4.0*th-2.0*u_beta)-4.0*rr2*sin(2.0*u_beta-3.0*th)*sin(th)));
        txy = -0.5*S*(lam+1.0)*(1.0-A)*rr2*s2t + 0.5*S*(1.0-lam)*(s2b+(1.0-B)*(3.0*rr4-2.0*rr2)*sin(4.0*th-2.0*u_beta));
    }
    return vec3(sxx, syy, txy);
}

void main() {
  // Convert NDC to world coordinates, applying pan/zoom for the final render pass
  vec2 xy = vec2(v_ndc.x * u_aspect, v_ndc.y);
  #ifdef IS_PLATE_FRAG
    xy = (xy + u_pan) / u_zoom;
  #endif

  // Calculate the stress at that point
  vec3 stress = getStress(xy);
  float val = u_component == 0 ? stress.x : (u_component == 1 ? stress.y : stress.z);

  #ifdef IS_PLATE_FRAG
    // Final Render Pass: Apply colormap, or white for the hole
    if (u_hole == 1 && length(xy) <= u_r0) {
      fragColor = vec4(1.0);
    } else {
      fragColor = vec4(applyCMap(val), 1.0);
    }
  #else
    // Min/Max Calculation Pass: Output raw stress value to RG channels
    fragColor = vec4(val, val, 0.0, 1.0);
  #endif
}