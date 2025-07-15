/*  Frame orchestrator
    ------------------
    • ties UI → GPU
    • paints final colour pass
    • updates legend, table, and min/max dots           */

import { canvas,
         legendCanvas, legendMinTxt, legendMaxTxt,
         inputs,holeChk,
         cur_xx, cur_yy, cur_xy,
         min_xx, max_xx, min_yy, max_yy, min_xy, max_xy }   from "../ui/dom";
import { getContext, link }               from "../core/gl";
import { vertSrc, fragSrc }               from "../shaders";
import { currentMaterial }                from "../core/material";
import { zoom, panX, panY }               from "./panzoom";
import { computeMinMax, texelToCanvas }   from "./gpuMinMax";
import { drawLegend }                     from "./legend";

/* ------------------------------------------------------------------ */
const gl = getContext(canvas);
const r0 = 0.25;

/* programmes & fullscreen quad ------------------------------------- */
const finalProg = link(gl, vertSrc, fragSrc);

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

/* uniforms ---------------------------------------------------------- */
const UF = {
  r0   : gl.getUniformLocation(finalProg, "u_r0")!,
  lambda:gl.getUniformLocation(finalProg, "u_lambda")!,
  beta :gl.getUniformLocation(finalProg, "u_beta")!,
  gamma:gl.getUniformLocation(finalProg, "u_gamma")!,
  kappa_m   :gl.getUniformLocation(finalProg, "u_kappa_m")!,
  kappa_p   :gl.getUniformLocation(finalProg, "u_kappa_p")!,
  S    :gl.getUniformLocation(finalProg, "u_S")!,
  comp :gl.getUniformLocation(finalProg, "u_component")!,
  cmap :gl.getUniformLocation(finalProg, "u_cmap")!,
  minV :gl.getUniformLocation(finalProg, "u_minVal")!,
  maxV :gl.getUniformLocation(finalProg, "u_maxVal")!,
  zoom :gl.getUniformLocation(finalProg, "u_zoom")!,
  pan  :gl.getUniformLocation(finalProg, "u_pan")!,
  asp  :gl.getUniformLocation(finalProg, "u_aspect")!,
  hole :gl.getUniformLocation(finalProg, "u_hole")!,
};

/* helper ------------------------------------------------------------ */
const num = (el: HTMLInputElement, d = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

/* screen‑space extrema dots ---------------------------------------- */
const maxDot = document.createElement("div");
const minDot = document.createElement("div");
for (const d of [maxDot, minDot]) {
  Object.assign(d.style, {
    position: "absolute",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    border: "2px solid #fff",
    pointerEvents: "none",
  });
}
maxDot.style.background = "#d00";            // red  = max
minDot.style.background = "#00d";            // blue = min
const holder = canvas.parentElement as HTMLElement;
holder.style.position = "relative";
holder.append(maxDot, minDot);

/* paint helpers ----------------------------------------------------- */
function pushUniforms(vmin: number, vmax: number) {
  const { gamma, kappa_m, kappa_p } = currentMaterial();
  gl.useProgram(finalProg);

  gl.uniform1f(UF.r0, r0);
  gl.uniform1f(UF.lambda, num(inputs.lambda, 1));
  gl.uniform1f(UF.beta,   num(inputs.beta,   0) * Math.PI / 180);
  gl.uniform1f(UF.gamma,  gamma);
  gl.uniform1f(UF.kappa_m,     kappa_m);
  gl.uniform1f(UF.kappa_p,     kappa_p);
  gl.uniform1f(UF.S,      1);
  gl.uniform1i(UF.comp, +[...inputs.comp].find(r => r.checked)!.value);
  gl.uniform1i(UF.cmap, +inputs.cmap.value);
  gl.uniform1f(UF.minV, vmin);
  gl.uniform1f(UF.maxV, vmax);
  gl.uniform1f(UF.zoom, zoom);
  gl.uniform2f(UF.pan, panX, panY);
  gl.uniform1f(UF.asp, canvas.width / canvas.height);
  gl.uniform1i(UF.hole, holeChk.checked ? 1 : 0);
}

function updateGlobalTable() {
  const [mnxx, mxxx] = [computeMinMax(0).vmin, computeMinMax(0).vmax];
  const [mnyy, mxyy] = [computeMinMax(1).vmin, computeMinMax(1).vmax];
  const [mnxy, mxxy] = [computeMinMax(2).vmin, computeMinMax(2).vmax];
  min_xx.textContent = mnxx.toFixed(2); max_xx.textContent = mxxx.toFixed(2);
  min_yy.textContent = mnyy.toFixed(2); max_yy.textContent = mxyy.toFixed(2);
  min_xy.textContent = mnxy.toFixed(2); max_xy.textContent = mxxy.toFixed(2);
}

/* main frame -------------------------------------------------------- */
function frame() {
  const comp = +[...inputs.comp].find(r => r.checked)!.value as 0 | 1 | 2;
  const { vmin, vmax, ixMin, iyMin, ixMax, iyMax } = computeMinMax(comp);

  /* update dot positions */
  const ptMax = texelToCanvas(ixMax, iyMax);
  const ptMin = texelToCanvas(ixMin, iyMin);
  maxDot.style.left = `${ptMax.cx - 4}px`; maxDot.style.top = `${ptMax.cy - 4}px`;
  minDot.style.left = `${ptMin.cx - 4}px`; minDot.style.top = `${ptMin.cy - 4}px`;

  drawLegend(vmin, vmax);
  updateGlobalTable();
  pushUniforms(vmin, vmax);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(frame);
}

/* DPR resize -------------------------------------------------------- */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

/* kick‑off ---------------------------------------------------------- */
export function initRender() {
  resize();                   // make sure canvas fits DPR on first call
  requestAnimationFrame(frame);
}