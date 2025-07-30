/* Frame orchestrator
    ------------------
    • ties UI → GPU
    • paints final colour pass
    • updates legend, table, and min/max dots           */

import { canvas, inputs, holeChk,
         cur_xx, cur_yy, cur_xy,
         min_xx, max_xx, min_yy, max_yy, min_xy, max_xy }   from "../ui/dom";
import { getContext, link }               from "../core/gl";
import { vertSrc, stressSrc }             from "../shaders";
import { currentMaterial }                from "../core/material";
import { zoom, panX, panY }               from "./panzoom";
import { computeMinMax, worldToCanvas, analyticStressAt }   from "./gpuMinMax";
import { drawLegend }                     from "./legend";
import { R0 } from "../core/constants";

const gl = getContext(canvas);


// --- Main visualization program ---
const fragSrcLines = stressSrc.split('\n');
const finalFragSrcWithDefine = [
    fragSrcLines[0],
    '#define IS_PLATE_FRAG',
    ...fragSrcLines.slice(1)
].join('\n');
const finalProg = link(gl, vertSrc, finalFragSrcWithDefine);

// --- GL Buffers ---
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);


// --- Uniform Locations ---
const UF = {
  r0: gl.getUniformLocation(finalProg, "u_r0")!, lambda: gl.getUniformLocation(finalProg, "u_lambda")!,
  beta: gl.getUniformLocation(finalProg, "u_beta")!, gamma: gl.getUniformLocation(finalProg, "u_gamma")!,
  kappa_m: gl.getUniformLocation(finalProg, "u_kappa_m")!, kappa_p: gl.getUniformLocation(finalProg, "u_kappa_p")!,
  S: gl.getUniformLocation(finalProg, "u_S")!, comp: gl.getUniformLocation(finalProg, "u_component")!,
  cmap: gl.getUniformLocation(finalProg, "u_cmap")!, minV: gl.getUniformLocation(finalProg, "u_minVal")!,
  maxV: gl.getUniformLocation(finalProg, "u_maxVal")!, zoom: gl.getUniformLocation(finalProg, "u_zoom")!,
  pan: gl.getUniformLocation(finalProg, "u_pan")!, asp: gl.getUniformLocation(finalProg, "u_aspect")!,
  hole: gl.getUniformLocation(finalProg, "u_hole")!,
};

// --- HTML Divs for Min/Max Dots ---
const maxDot = document.createElement("div");
const minDot = document.createElement("div");
for (const d of [maxDot, minDot]) {
  Object.assign(d.style, {
    position: "absolute",
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
    pointerEvents: "none",
  });
}
maxDot.style.background = "#d00"; // red = max
minDot.style.background = "#00d"; // blue = min
// The parent now has `position: relative` from the HTML file
canvas.parentElement!.append(maxDot, minDot);


const num = (el: HTMLInputElement, d = 0) => Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

function pushUniforms(vmin: number, vmax: number) {
  const { gamma, kappa_m, kappa_p } = currentMaterial();
  gl.useProgram(finalProg);
  console.log("GPU gets:", { pan: [panX, panY], zoom: zoom, aspect: canvas.width / canvas.height });
  gl.uniform1f(UF.r0, R0);
  gl.uniform1f(UF.lambda, num(inputs.lambda, 1));
  gl.uniform1f(UF.beta,   num(inputs.beta,   0) * Math.PI / 180);
  gl.uniform1f(UF.gamma,  gamma);
  gl.uniform1f(UF.kappa_m, kappa_m);
  gl.uniform1f(UF.kappa_p, kappa_p);
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
  const { vmin: mnxx, vmax: mxxx } = computeMinMax(0);
  const { vmin: mnyy, vmax: mxyy } = computeMinMax(1);
  const { vmin: mnxy, vmax: mxxy } = computeMinMax(2);
  min_xx.textContent = mnxx.toFixed(2); max_xx.textContent = mxxx.toFixed(2);
  min_yy.textContent = mnyy.toFixed(2); max_yy.textContent = mxyy.toFixed(2);
  min_xy.textContent = mnxy.toFixed(2); max_xy.textContent = mxxy.toFixed(2);
}

function frame() {
  const comp = +[...inputs.comp].find(r => r.checked)!.value as 0 | 1 | 2;
  // --- Get the computed locations ---
  let { vmin, vmax, xMin, yMin, xMax, yMax } = computeMinMax(comp);

  // --- NEW: Check if dots are inside the inclusion and move to center ---
  // This check only runs when the "Hole" checkbox is off.
  if (!holeChk.checked) {
    // Check if the max point is inside the inclusion's radius (r0)
    if ((xMax * xMax + yMax * yMax) < (R0 * R0)) {
      xMax = 0;
      yMax = 0;
    }
    // Check if the min point is inside the inclusion's radius (r0)
    if ((xMin * xMin + yMin * yMin) < (R0 * R0)) {
      xMin = 0;
      yMin = 0;
    }
  }

  // --- Draw the main stress field visualization ---
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.bindVertexArray(vao);
  pushUniforms(vmin, vmax);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);

  // --- Update HTML Dot Positions using final coordinates ---
  const ptMax = worldToCanvas(xMax, yMax);
  const ptMin = worldToCanvas(xMin, yMin);
  maxDot.style.left = `${ptMax.cx - 6}px`;
  maxDot.style.top = `${ptMax.cy - 6}px`;
  minDot.style.left = `${ptMin.cx - 6}px`;
  minDot.style.top = `${ptMin.cy - 6}px`;

  // --- Update UI elements ---
  drawLegend(vmin, vmax);
  updateGlobalTable();

  requestAnimationFrame(frame);
}

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;
  const ndcX = (cssX / canvas.clientWidth) * 2 - 1;
  const ndcY = 1 - (cssY / canvas.clientHeight) * 2;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const worldX = (ndcX * aspect + panX) / zoom;
  const worldY = (ndcY + panY) / zoom;
  console.log("JS uses:", { pan: [panX, panY], zoom: zoom, aspect: aspect, world: [worldX, worldY] });

  const [sxx, syy, txy] = analyticStressAt(worldX, worldY);
  cur_xx.textContent = sxx.toFixed(2);
  cur_yy.textContent = syy.toFixed(2);
  cur_xy.textContent = txy.toFixed(2);
});

canvas.addEventListener('mouseleave', () => {
  cur_xx.textContent = '‑';
  cur_yy.textContent = '‑';
  cur_xy.textContent = '‑';
});

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

export function initRender() {
  resize();
  requestAnimationFrame(frame);
}
