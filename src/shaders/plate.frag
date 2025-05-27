#version 300 es
precision highp float;

/* ── uniforms ───────────────────────────────────────────────────────── */
uniform float u_r0, u_lambda, u_S, u_beta;
uniform float u_gamma;              /*  NEW  Γ = μM / μP  (μP=1) */
uniform float u_kappaM, u_kappaP;

/* 0→rainbow | 1→jet | 2→hot | 3→cool-warm | 4→inverted cool-warm */
uniform int   u_cmap;

uniform int   u_component;    /* 0 σxx | 1 σyy | 2 τxy */
uniform float u_minVal, u_maxVal;
uniform float u_zoom;
uniform vec2  u_pan;
uniform float u_aspect;
uniform int u_hole;
/* ── varyings ────────────────────────────────────────────────────────── */
in  vec2 v_ndc;
out vec4 fragColor;

/* ── existing color functions ───────────────────────────────────────── */

/* HSV → RGB (used by rainbow) */
/* ── helpers ──────────────────────────────────────────────── */
vec3 hsv2rgb(float h, float s, float v) {
  float c = v * s;
  float h6 = h / 60.0;                 /* 0..6 */
  float x = c * (1.0 - abs(mod(h6, 2.0) - 1.0));
  vec3 rgb;

  if      (h6 < 1.0) rgb = vec3(c, x, 0);
  else if (h6 < 2.0) rgb = vec3(x, c, 0);
  else if (h6 < 3.0) rgb = vec3(0, c, x);
  else if (h6 < 4.0) rgb = vec3(0, x, c);
  else if (h6 < 5.0) rgb = vec3(x, 0, c);
  else               rgb = vec3(c, 0, x);

  return rgb + (v - c);
}

/* 0 – Rainbow (HSV hue 260°→20°, avoids oversaturated reds) */
vec3 rainbow(float t) {
  t = clamp(t, 0.0, 1.0);
  float h = 260.0 - 240.0 * t;   /* 260 → 20 deg */
  return hsv2rgb(h, 1.0, 1.0);
}

/* 1 – Jet (black-free) */
vec3 jet(float t)
{
  t = clamp(t, 0.0, 1.0);
  float r = clamp(1.5 - abs(4.0 * t - 3.0), 0.0, 1.0);
  float g = clamp(1.5 - abs(4.0 * t - 2.0), 0.0, 1.0);
  float b = clamp(1.5 - abs(4.0 * t - 1.0), 0.0, 1.0);
  return vec3(r, g, b);
}

/* 2 – Hot (black→red→yellow→white, γ-correct) */
vec3 hot(float t) {
  t = clamp(t, 0.0, 1.0);
  float r = min(1.0, 3.0 * t);
  float g = t < 1.0/3.0 ? 0.0 : min(1.0, 3.0 * (t - 1.0/3.0));
  float b = t < 2.0/3.0 ? 0.0 : 3.0 * (t - 2.0/3.0);
  return vec3(r, g, b);
}

/* 3 – Cool-Warm (blue↔white↔red) */
vec3 coolWarm(float t) {
  t = clamp(t, 0.0, 1.0);
  return mix(vec3(0.23,0.30,0.75), vec3(0.86,0.87,0.91), t*2.0)
       * step(t,0.5)
       + mix(vec3(0.86,0.87,0.91), vec3(0.70,0.02,0.15), (t-0.5)*2.0)
       * step(0.5,t);
}

/* 4 – Inverted Cool-Warm */
vec3 coolWarmInv(float t) { return coolWarm(1.0 - t); }


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
  /* screen → world */
  vec2 xy = vec2(v_ndc.x * u_aspect, v_ndc.y);
  xy = (xy + u_pan) / u_zoom;

  float r = length(xy);
  float th = atan(xy.y, xy.x);

  /* material constants */
  float sf = u_gamma;    
  float A, B;                            /* μM/μP directly */
 if(u_hole == 1){
  A = 0.0;
  B = 0.0;
}else{
  A = (1.0 + u_kappaM) / (2.0 + u_gamma * (u_kappaP - 1.0));
  B = (1.0 + u_kappaM) / (u_gamma + u_kappaM);
}

  float S   = u_S;
  float lam = u_lambda;
  float c2b = cos(2.0 * u_beta);
  float s2b = sin(2.0 * u_beta);

  float sxx, syy, txy;

  if (r <= u_r0) {
    sxx = 0.5*S*((lam+1.0)*A + (lam-1.0)*B*c2b);
    syy = 0.5*S*((lam+1.0)*A - (lam-1.0)*B*c2b);
    txy = 0.5*S*(lam-1.0)*B*s2b;
  } else {
    float rr2 = (u_r0*u_r0)/(r*r);
    float rr4 = rr2*rr2;
    float c2t = cos(2.0*th);
    float s2t = sin(2.0*th);

    sxx = 0.5*S*(lam+1.0)*(1.0-(1.0-A)*rr2*c2t)
        + 0.5*S*(lam-1.0)*(c2b+(1.0-B)*(3.0*rr4*c2b-4.0*rr2*cos(2.0*u_beta-th)*cos(th)));

    syy = 0.5*S*(lam+1.0)*(1.0+(1.0-A)*rr2*c2t)
        - 0.5*S*(lam-1.0)*(c2b+(1.0-B)*(3.0*rr4*c2b+4.0*rr2*cos(2.0*u_beta-th)*cos(th)));

    txy = -0.5*S*(lam+1.0)*(1.0-A)*rr2*s2t
          +0.5*S*(lam-1.0)*(s2b + (1.0-B)*(3.0*rr4*sin(4.0*th-2.0*u_beta) - 2.0*rr2*s2b));
  }

  float val = (u_component==0)?sxx:(u_component==1)?syy:txy;
  fragColor = vec4(applyCMap(val), 1.0);
}