#version 300 es
precision highp float;

/* ── uniforms ───────────────────────────────────────────────────────── */
uniform float u_r0, u_lambda, u_S, u_beta;
uniform float u_muM, u_muP, u_kappaM, u_kappaP;

/* 0→rainbow | 1→jet | 2→hot | 3→cool-warm | 4→inverted cool-warm */
uniform int   u_cmap;

uniform int   u_component;    /* 0 σxx | 1 σyy | 2 τxy */
uniform float u_minVal, u_maxVal;
uniform float u_zoom;
uniform vec2  u_pan;
uniform float u_aspect;

/* ── varyings ────────────────────────────────────────────────────────── */
in  vec2 v_ndc;
out vec4 fragColor;

/* ── existing color functions ───────────────────────────────────────── */

/* HSV → RGB (used by rainbow) */
vec3 hsv2rgb(float h, float s, float v) {
  float c = v * s;
  float x = c * (1.0 - abs(mod(h/60.0, 2.0) - 1.0));
  vec3 rgb;
       if (h <  60.0) rgb = vec3(c, x, 0);
  else if (h < 120.0) rgb = vec3(x, c, 0);
  else if (h < 180.0) rgb = vec3(0, c, x);
  else if (h < 240.0) rgb = vec3(0, x, c);
  else if (h < 300.0) rgb = vec3(x, 0, c);
  else                rgb = vec3(c, 0, x);
  return rgb + (v - c);
}

/* 0 – Rainbow (blue→red via HSV) */
vec3 rainbow(float t) {
  t = clamp(t, 0.0, 1.0);
  float h = 240.0 * (1.0 - t);
  return hsv2rgb(h, 1.0, 1.0);
}

/* 1 – Jet */
vec3 jet(float t) {
  t = clamp(t, 0.0, 1.0);
  return vec3(
    clamp(1.5 - abs(4.0*t - 3.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*t - 2.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*t - 1.0), 0.0, 1.0)
  );
}

/* 2 – Hot */
vec3 hot(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 1.0/3.0)      return vec3(3.0*t, 0.0, 0.0);
  else if (t < 2.0/3.0) return vec3(1.0, 3.0*(t - 1.0/3.0), 0.0);
  else                  return vec3(1.0, 1.0, 3.0*(t - 2.0/3.0));
}

/* 3 – Cool–Warm: simple linear blend blue↔white↔red */
vec3 coolWarm(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) {
    // blue → white
    float f = t / 0.5;
    return mix(vec3(0.0, 0.0, 1.0), vec3(1.0), f);
  } else {
    // white → red
    float f = (t - 0.5) / 0.5;
    return mix(vec3(1.0), vec3(1.0, 0.0, 0.0), f);
  }
}

/* 4 – Inverted Cool–Warm: red↔white↔blue */
vec3 coolWarmInv(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) {
    // red → white
    float f = t / 0.5;
    return mix(vec3(1.0, 0.0, 0.0), vec3(1.0), f);
  } else {
    // white → blue
    float f = (t - 0.5) / 0.5;
    return mix(vec3(1.0), vec3(0.0, 0.0, 1.0), f);
  }
}

/* ── apply the selected colormap ────────────────────────────────────── */
vec3 applyCMap(float v) {
  float t = (v - u_minVal) / (u_maxVal - u_minVal);
  if      (u_cmap == 0) return rainbow(t);
  else if (u_cmap == 1) return jet(t);
  else if (u_cmap == 2) return hot(t);
  else if (u_cmap == 3) return coolWarm(t);
  else                  return coolWarmInv(t);
}

/* ── main shader body ───────────────────────────────────────────────── */
void main() {
  // NDC → world
  vec2 xy = vec2(v_ndc.x * u_aspect, v_ndc.y);
  xy = (xy + u_pan) / u_zoom;

  float r  = length(xy),
        th = atan(xy.y, xy.x);

  // material constants
  float sf = u_muM/u_muP;
  float A  = (1.0+u_kappaM)/(2.0 + sf*(u_kappaP-1.0));
  float B  = (1.0+u_kappaM)/(sf + u_kappaM);

  float S   = u_S,
        lam = u_lambda,
        c2b = cos(2.0*u_beta),
        s2b = sin(2.0*u_beta);

  float sxx, syy, txy;
  if (r <= u_r0) {
    sxx = 0.5*S*((lam+1.0)*A + (lam-1.0)*B*c2b);
    syy = 0.5*S*((lam+1.0)*A - (lam-1.0)*B*c2b);
    txy = 0.5*S*(lam-1.0)*B*s2b;
  } else {
    float rr2 = (u_r0*u_r0)/(r*r),
          rr4 = rr2*rr2,
          c2t = cos(2.0*th),
          s2t = sin(2.0*th);

    sxx = 0.5*S*(lam+1.0)*(1.0-(1.0-A)*rr2*c2t)
         +0.5*S*(lam-1.0)*(c2b + (1.0-B)*(3.0*rr4*c2b - 4.0*rr2*cos(2.0*u_beta-th)*cos(th)));

    syy = 0.5*S*(lam+1.0)*(1.0+(1.0-A)*rr2*c2t)
         -0.5*S*(lam-1.0)*(c2b + (1.0-B)*(3.0*rr4*c2b + 4.0*rr2*cos(2.0*u_beta-th)*cos(th)));

    txy = -0.5*S*(lam+1.0)*(1.0-A)*rr2*s2t
          +0.5*S*(lam-1.0)*(s2b + (1.0-B)*(3.0*rr4*sin(2.0*th-2.0*u_beta) - 2.0*rr2*s2b));
  }

  float val = (u_component==0)?sxx:(u_component==1)?syy:txy;
  fragColor = vec4(applyCMap(val), 1.0);
}
