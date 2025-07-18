/*
    GPU-based stress field calculation + conditional analytic edge scan
    -------------------------------------------------------------------
    Responsible for:
    • building an RG32F texture of the stress field
    • scanning the texture for min/max locations and values
    • conditionally refining the min/max range with an edge scan for the hole case
*/

import { canvas, inputs, holeChk } from "../ui/dom";
import { currentMaterial }         from "../core/material";
import { getContext, link }        from "../core/gl";
import * as view                   from "./panzoom";
import { vertSrc, stressRGSrc }    from "../shaders";

const gl  = getContext(canvas);
const r0  = 0.25;
const DEF = { lambda: 1, beta: 0 };

const stressProg = link(gl, vertSrc, stressRGSrc);

const US = {
  r0:       gl.getUniformLocation(stressProg, "u_r0")!,
  lambda:   gl.getUniformLocation(stressProg, "u_lambda")!,
  beta:     gl.getUniformLocation(stressProg, "u_beta")!,
  gamma:    gl.getUniformLocation(stressProg, "u_gamma")!,
  kappa_m:  gl.getUniformLocation(stressProg, "u_kappa_m")!,
  kappa_p:  gl.getUniformLocation(stressProg, "u_kappa_p")!,
  S:        gl.getUniformLocation(stressProg, "u_S")!,
  comp:     gl.getUniformLocation(stressProg, "u_component")!,
  zoom:     gl.getUniformLocation(stressProg, "u_zoom")!,
  pan:      gl.getUniformLocation(stressProg, "u_pan")!,
  asp:      gl.getUniformLocation(stressProg, "u_aspect")!,
  hole:     gl.getUniformLocation(stressProg, "u_hole")!,
};

const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const texSize = 1024;
const stressTex = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_2D, stressTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, texSize, texSize, 0, gl.RG, gl.FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

const stressFBO = gl.createFramebuffer()!;
gl.bindFramebuffer(gl.FRAMEBUFFER, stressFBO);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stressTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

const num = (el: HTMLInputElement, d = 0) => Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

// Using the (1 - lambda) convention as confirmed correct.
export function analyticStressAt(x: number, y: number) {
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    const lambda = num(inputs.lambda, DEF.lambda);
    const beta = num(inputs.beta, DEF.beta) * Math.PI / 180;
    const S = 1;
    const A = holeChk.checked ? 0 : (1 + kappa_m) / (2 + gamma * (kappa_p - 1));
    const B = holeChk.checked ? 0 : (1 + kappa_m) / (gamma + kappa_m);
    const c2b = Math.cos(2 * beta), s2b = Math.sin(2 * beta);
    const r = Math.hypot(x, y), theta = Math.atan2(y, x);
    let sxx, syy, txy;
    if (r <= r0) {
        sxx = 0.5 * S * ((lambda + 1) * A + (1 - lambda) * B * c2b);
        syy = 0.5 * S * ((lambda + 1) * A - (1 - lambda) * B * c2b);
        txy = 0.5 * S * (1 - lambda) * B * s2b;
    } else {
        const rr2 = (r0 * r0) / (r * r), rr4 = rr2 * rr2;
        const c2t = Math.cos(2 * theta), s2t = Math.sin(2 * theta);
        sxx = 0.5 * S * (lambda + 1) * (1 - (1 - A) * rr2 * c2t) + 0.5 * S * (1 - lambda) * (c2b + (1 - B) * (3 * rr4 * Math.cos(4 * theta - 2 * beta) - 4 * rr2 * Math.cos(2 * beta - 3 * theta) * Math.cos(theta)));
        syy = 0.5 * S * (lambda + 1) * (1 + (1 - A) * rr2 * c2t) - 0.5 * S * (1 - lambda) * (c2b + (1 - B) * (3 * rr4 * Math.cos(4 * theta - 2 * beta) - 4 * rr2 * Math.sin(2 * beta - 3 * theta) * Math.sin(theta)));
        txy = -0.5 * S * (lambda + 1) * (1 - A) * rr2 * s2t + 0.5 * S * (1 - lambda) * (s2b + (1 - B) * (3 * rr4 - 2 * rr2) * Math.sin(4 * theta - 2 * beta));
    }
    return [sxx, syy, txy] as const;
}

export interface MinMaxLoc {
  vmin: number; vmax: number;
  ixMin: number; iyMin: number;
  ixMax: number; iyMax: number;
}

const memoCache = new Map<string, MinMaxLoc>();

function getCacheKey(comp: 0 | 1 | 2): string {
  const { gamma, kappa_m, kappa_p } = currentMaterial();
  const values = [comp, num(inputs.lambda, DEF.lambda), num(inputs.beta, DEF.beta), gamma, kappa_m, kappa_p, holeChk.checked];
  return values.join('|');
}

export function computeMinMax(comp: 0 | 1 | 2): MinMaxLoc {
  const key = getCacheKey(comp);
  if (memoCache.has(key)) {
    return memoCache.get(key)!;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, stressFBO);
  gl.viewport(0, 0, texSize, texSize);
  gl.useProgram(stressProg);

  const { gamma, kappa_m, kappa_p } = currentMaterial();
  gl.uniform1f(US.r0,       r0);
  gl.uniform1f(US.lambda,   num(inputs.lambda, DEF.lambda));
  gl.uniform1f(US.beta,     num(inputs.beta, DEF.beta) * Math.PI / 180);
  gl.uniform1f(US.gamma,    gamma);
  gl.uniform1f(US.kappa_m,  kappa_m);
  gl.uniform1f(US.kappa_p,  kappa_p);
  gl.uniform1f(US.S,        1);
  gl.uniform1i(US.comp,     comp);
  gl.uniform1f(US.zoom,     1);
  gl.uniform2f(US.pan,      0, 0);
  gl.uniform1f(US.asp,      canvas.width / canvas.height);
  gl.uniform1i(US.hole,     holeChk.checked ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const px = new Float32Array(texSize * texSize * 2);
  gl.readPixels(0, 0, texSize, texSize, gl.RG, gl.FLOAT, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let imin = 0, imax = 0;
  let vminTexture = Infinity, vmaxTexture = -Infinity;
  for (let i = 0; i < texSize * texSize; ++i) {
    const v = px[i * 2];
    if (v < vminTexture) { vminTexture = v; imin = i; }
    if (v > vmaxTexture) { vmaxTexture = v; imax = i; }
  }

  let vmin = vminTexture;
  let vmax = vmaxTexture;
  
  
  // Only run the analytic edge scan if the "Hole" checkbox is checked.
  if (holeChk.checked) {
    const N = 900;
    for (let i = 0; i < N; ++i) {
      const theta = (i / N) * 2 * Math.PI;
      const [sxx, syy, txy] = analyticStressAt(r0 * Math.cos(theta), r0 * Math.sin(theta));
      const val = comp === 0 ? sxx : comp === 1 ? syy : txy;
      if (val < vmin) vmin = val;
      if (val > vmax) vmax = val;
    }
  }
  
  const result: MinMaxLoc = {
    vmin, vmax,
    ixMin: imin % texSize, iyMin: Math.floor(imin / texSize),
    ixMax: imax % texSize, iyMax: Math.floor(imax / texSize),
  };

  memoCache.set(key, result);
  if (memoCache.size > 50) {
    memoCache.delete(memoCache.keys().next().value!);
  }
  return result;
}

export function texelToCanvas(ix: number, iy: number) {
  const ndc0x = (ix + 0.5) / texSize * 2.0 - 1.0;
  const ndc0y = 1.0 - (iy + 0.5) / texSize * 2.0;
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