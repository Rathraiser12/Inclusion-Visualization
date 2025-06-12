#version 300 es
precision highp float;

/* ---------- uniforms (same naming as plate.frag) ----------------- */
uniform float u_r0, u_lambda, u_S, u_beta;
uniform float u_gamma, u_kappaM, u_kappaP;
uniform int   u_component;              /* 0 σxx | 1 σyy | 2 τxy */
uniform float u_zoom, u_aspect;
uniform vec2  u_pan;
uniform int u_hole;
/* ---------- varyings --------------------------------------------- */
in  vec2 v_ndc;
layout(location = 0) out vec2 outRG;     /* R=min, G=max */

/* ---------- analytic stress component ---------------------------- */
float analyticComponent(vec2 ndc)
{
  /* screen → world */
  vec2 xy = vec2(ndc.x * u_aspect, ndc.y);
  xy = (xy + u_pan) / u_zoom;

  float r  = length(xy);
  float th = atan(xy.y, xy.x);

float A, B;
if(u_hole == 1){
  A = 0.0;
  B = 0.0;
}else{
  A = (1.0 + u_kappaM) / (2.0 + u_gamma * (u_kappaP - 1.0));
  B = (1.0 + u_kappaM) / (u_gamma + u_kappaM);
}

  float S = u_S, lam = u_lambda;
  float c2b = cos(2.0 * u_beta);
  float s2b = sin(2.0 * u_beta);

  float sxx, syy, txy;

  if (r <= u_r0) {
    sxx = 0.5 * S * ((lam + 1.0) * A + (lam - 1.0) * B * c2b);
    syy = 0.5 * S * ((lam + 1.0) * A - (lam - 1.0) * B * c2b);
    txy = 0.5 * S * (lam - 1.0) * B * s2b;
  } else {
    float rr2 = (u_r0 * u_r0) / (r * r);
    float rr4 = rr2 * rr2;
    float c2t = cos(2.0 * th);
    float s2t = sin(2.0 * th);

    sxx = 0.5 * S * (lam + 1.0) * (1.0 - (1.0 - A) * rr2 * c2t)
        + 0.5 * S * (lam - 1.0) *
          (c2b + (1.0 - B) *
           (3.0 * rr4 * cos(4.0*th - 2.0*u_beta) - 4.0 * rr2 *
            cos(2.0*u_beta -3.0*th) * cos(th)));

    syy = 0.5 * S * (lam + 1.0) * (1.0 + (1.0 - A) * rr2 * c2t)
        - 0.5 * S * (lam - 1.0) *
          (c2b + (1.0 - B) *
           (3.0 * rr4 * cos(4.0*th - 2.0*u_beta) - 4.0 * rr2 *
            sin(2.0 * u_beta - 3.0*th) * sin(th)));

    txy = -0.5 * S * (lam + 1.0) * (1.0 - A) * rr2 * s2t
        + 0.5 * S * (lam - 1.0) *
          (s2b + (1.0 - B) *
           (3.0 * rr4 - 2.0 * rr2) * sin(4.0 * th - 2.0 * u_beta));
  }
  return (u_component == 0) ? sxx : (u_component == 1) ? syy : -txy;
}

void main()
{
  float val = analyticComponent(v_ndc);
  outRG = vec2(val, val);        /* identical values: min = max = val */
}
