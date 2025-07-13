/*  GPU reduction pyramid + analytic edge scan
    ---------------------------------------------------------
    Responsible for:
    • building an RG32F mip‑pyramid (1024² → 1×1)
    • computing vmin / vmax for one stress component
    • giving back texel locations of those extrema      */

import { canvas, inputs, holeChk }          from "../ui/dom";
import { currentMaterial }                  from "../core/material";
import { getContext, link }                 from "../core/gl";
import * as view                            from "./panzoom";
import { vertSrc,
         stressRGSrc,
         reduceFragSrc }                    from "../shaders";

/* ------------------------------------------------------------------ */
const gl  = getContext(canvas);
const r0  = 0.25;                           // inclusion radius
const DEF = { lambda: 1, beta: 0 };         // fall‑back UI values

const stressProg = link(gl, vertSrc, stressRGSrc);
const reduceProg = link(gl, vertSrc, reduceFragSrc);

/* shader uniforms --------------------------------------------------- */
const US = {
  r0     : gl.getUniformLocation(stressProg, "u_r0")!,
  lambda : gl.getUniformLocation(stressProg, "u_lambda")!,
  beta   : gl.getUniformLocation(stressProg, "u_beta")!,
  gamma  : gl.getUniformLocation(stressProg, "u_gamma")!,
  kM     : gl.getUniformLocation(stressProg, "u_kappaM")!,
  kP     : gl.getUniformLocation(stressProg, "u_kappaP")!,
  S      : gl.getUniformLocation(stressProg, "u_S")!,
  comp   : gl.getUniformLocation(stressProg, "u_component")!,
  zoom   : gl.getUniformLocation(stressProg, "u_zoom")!,
  pan    : gl.getUniformLocation(stressProg, "u_pan")!,
  asp    : gl.getUniformLocation(stressProg, "u_aspect")!,
  hole   : gl.getUniformLocation(stressProg, "u_hole")!,
};
const UR = {
  src  : gl.getUniformLocation(reduceProg, "u_src")!,
  step : gl.getUniformLocation(reduceProg, "u_step")!,
};

/* full‑screen quad (one VAO shared by every pass) ------------------- */
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

/* RG32F pyramid ------------------------------------------------------ */
interface Level { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
const levels: Level[] = [];
let w = 1024, h = 1024;
for (;;) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, h, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  levels.push({ tex, fbo, w, h });
  if (w === 1 && h === 1) break;
  w = Math.max(1, w >> 1);
  h = Math.max(1, h >> 1);
}
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.bindTexture(gl.TEXTURE_2D,  null);

/* helpers ------------------------------------------------------------ */
const num = (el: HTMLInputElement, d = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

/* analytic closed‑form (same as shader) ----------------------------- */
function analyticStressAt(x: number, y: number) {
  const { γ, kM, kP } = currentMaterial();
  const λ   = num(inputs.lambda, DEF.lambda);
  const β   = num(inputs.beta,   DEF.beta) * Math.PI / 180;
  const S   = 1;
  const A   = holeChk.checked ? 0 : (1 + kM) / (2 + γ * (kP - 1));
  const B   = holeChk.checked ? 0 : (1 + kM) / (γ + kM);
  const c2β = Math.cos(2 * β), s2β = Math.sin(2 * β);

  const r = Math.hypot(x, y), θ = Math.atan2(y, x);
  let sxx, syy, txy;

  if (r <= r0) {
    sxx = 0.5 * S * ((λ + 1) * A + (λ - 1) * B * c2β);
    syy = 0.5 * S * ((λ + 1) * A - (λ - 1) * B * c2β);
    txy = 0.5 * S * (λ - 1) * B * s2β;
  } else {
    const rr2 = (r0 * r0) / (r * r);
    const rr4 = rr2 * rr2;
    const c2θ = Math.cos(2 * θ), s2θ = Math.sin(2 * θ);
    sxx = 0.5 * S * (λ + 1) * (1 - (1 - A) * rr2 * c2θ)
        + 0.5 * S * (λ - 1) *
          ( c2β
          + (1 - B) *
            (3 * rr4 * Math.cos(4 * θ - 2 * β)
             -4 * rr2 * Math.cos(2 * β - 3 * θ) * Math.cos(θ)));
    syy = 0.5 * S * (λ + 1) * (1 + (1 - A) * rr2 * c2θ)
        - 0.5 * S * (λ - 1) *
          ( c2β
          + (1 - B) *
            (3 * rr4 * Math.cos(4 * θ - 2 * β)
             -4 * rr2 * Math.sin(2 * β - 3 * θ) * Math.sin(θ)));
    txy =-0.5 * S * (λ + 1) * (1 - A) * rr2 * s2θ
        + 0.5 * S * (λ - 1) *
          ( s2β + (1 - B) * (3 * rr4 - 2 * rr2) * Math.sin(4 * θ - 2 * β));
  }
  return [sxx, syy, txy] as const;
}

/* public API --------------------------------------------------------- */
export interface MinMaxLoc {
  vmin: number; vmax: number;
  ixMin: number; iyMin: number;
  ixMax: number; iyMax: number;
}

/** Stress‑component extrema in a single call (GPU + analytic edge scan). */
export function computeMinMax(comp: 0 | 1 | 2): MinMaxLoc {
  const { γ, kM, kP } = currentMaterial();

  /* pass 0 – analytic field → RG32F ---------------------------------- */
  const root = levels[0];
  gl.bindFramebuffer(gl.FRAMEBUFFER, root.fbo);
  gl.viewport(0, 0, root.w, root.h);
  gl.useProgram(stressProg);

  gl.uniform1f(US.r0,     r0);
  gl.uniform1f(US.lambda, num(inputs.lambda, DEF.lambda));
  gl.uniform1f(US.beta,   num(inputs.beta,   DEF.beta) * Math.PI / 180);
  gl.uniform1f(US.gamma,  γ);
  gl.uniform1f(US.kM,     kM);
  gl.uniform1f(US.kP,     kP);
  gl.uniform1f(US.S,      1);
  gl.uniform1i(US.comp,   comp);
  gl.uniform1f(US.zoom,   1);                 // fixed
  gl.uniform2f(US.pan,    0, 0);              // fixed
  gl.uniform1f(US.asp,    canvas.width / canvas.height);
  gl.uniform1i(US.hole,   holeChk.checked ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  /* reduction passes ------------------------------------------------- */
  gl.useProgram(reduceProg);
  for (let i = 1; i < levels.length; i++) {
    const src = levels[i - 1], dst = levels[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(UR.src, 0);
    gl.uniform2f(UR.step, 1 / src.w, 1 / src.h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* last level is 1×1 RG32F ----------------------------------------- */
  const last = levels[levels.length - 1];
  gl.bindFramebuffer(gl.FRAMEBUFFER, last.fbo);
  const rg = new Float32Array(2);
  gl.readPixels(0, 0, 1, 1, gl.RG, gl.FLOAT, rg);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let vmin = rg[0];
  let vmax = rg[1];

  /* edge samples (closed form) -------------------------------------- */
  const N = 900;                              // 0.4 ° steps
  for (let i = 0; i < N; ++i) {
    const θ = (i / N) * 2 * Math.PI;
    const [sxx, syy, txy] = analyticStressAt(
      r0 * Math.cos(θ),
      r0 * Math.sin(θ),
    );
    const val = comp === 0 ? sxx : comp === 1 ? syy : txy;
    if (val < vmin) vmin = val;
    if (val > vmax) vmax = val;
  }

  /* whole‑texture scan for texel locations -------------------------- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, root.fbo);
  const px = new Float32Array(root.w * root.h * 2);
  gl.readPixels(0, 0, root.w, root.h, gl.RG, gl.FLOAT, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let imin = 0, imax = 0, vminLoc =  Infinity, vmaxLoc = -Infinity;
  for (let i = 0; i < root.w * root.h; ++i) {
    const v = px[i * 2];                      // R channel
    if (v < vminLoc) { vminLoc = v; imin = i; }
    if (v > vmaxLoc) { vmaxLoc = v; imax = i; }
  }
  return {
    vmin, vmax,
    ixMin: imin % root.w, iyMin: (imin / root.w) | 0,
    ixMax: imax % root.w, iyMax: (imax / root.w) | 0,
  };
}

/* texel → CSS‑pixel -------------------------------------------------- */
export function texelToCanvas(ix: number, iy: number) {
  const root = levels[0];                       // 1024²
  const ndc0x = (ix + 0.5) / root.w * 2.0 - 1.0;
  const ndc0y = 1.0 - (iy + 0.5) / root.h * 2.0;
  const asp   = canvas.width / canvas.height;

  const wx    = ndc0x * asp;
  const wy    = ndc0y;

  const ndc1x = (wx * view.zoom - view.panX) / asp;
  const ndc1y =  wy * view.zoom - view.panY;

  const dpr   = window.devicePixelRatio || 1;
  return {
    cx: (ndc1x + 1) * 0.5 * canvas.width  / dpr,
    cy: (1 - ndc1y) * 0.5 * canvas.height / dpr,
  };
}
