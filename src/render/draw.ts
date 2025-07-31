/* Frame orchestrator
    ------------------
    • ties UI → GPU
    • paints final colour pass
    • updates legend, table, and min/max dots           */

import {
    canvas, inputs, holeChk,
    cur_xx, cur_yy, cur_xy,
    min_xx, max_xx, min_yy, max_yy, min_xy, max_xy
} from "../ui/dom";
import { getContext, link } from "../core/gl";
import { vertSrc, stressSrc } from "../shaders";
import { currentMaterial } from "../core/material";
import { zoom, panX, panY } from "./panzoom";
import { drawLegend } from "./legend";
import { R0 } from "../core/constants";
import { GpuReducer, MinMaxResult } from './gpuReducer';
import { worldToCanvas, analyticStressAt } from "./utils";

const gl = getContext(canvas);

// --- GPU Reducer for Min/Max ---
const gpuReducer = new GpuReducer(gl);

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
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);


// --- Uniform Locations ---
const UF = {
    r0: gl.getUniformLocation(finalProg, "u_r0")!,
    lambda: gl.getUniformLocation(finalProg, "u_lambda")!,
    beta: gl.getUniformLocation(finalProg, "u_beta")!,
    gamma: gl.getUniformLocation(finalProg, "u_gamma")!,
    kappa_m: gl.getUniformLocation(finalProg, "u_kappa_m")!,
    kappa_p: gl.getUniformLocation(finalProg, "u_kappa_p")!,
    S: gl.getUniformLocation(finalProg, "u_S")!,
    comp: gl.getUniformLocation(finalProg, "u_component")!,
    cmap: gl.getUniformLocation(finalProg, "u_cmap")!,
    minV: gl.getUniformLocation(finalProg, "u_minVal")!,
    maxV: gl.getUniformLocation(finalProg, "u_maxVal")!,
    zoom: gl.getUniformLocation(finalProg, "u_zoom")!,
    pan: gl.getUniformLocation(finalProg, "u_pan")!,
    asp: gl.getUniformLocation(finalProg, "u_aspect")!,
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
canvas.parentElement!.append(maxDot, minDot);


const num = (el: HTMLInputElement, d = 0) => Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

// --- Caching for Min/Max results ---
const minMaxCache = new Map<string, MinMaxResult>();
let lastCacheKey = '';

// Helper to get a unique key for the current simulation parameters
function getCacheKey(comp: 0 | 1 | 2): string {
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    const values = [
        comp,
        num(inputs.lambda, 1),
        num(inputs.beta, 0),
        gamma, kappa_m, kappa_p,
        holeChk.checked
    ];
    return values.join('|');
}

// Helper to get a result from the cache or compute it with the GPU reducer
function getOrComputeMinMax(comp: 0 | 1 | 2): MinMaxResult {
    const key = getCacheKey(comp);
    if (minMaxCache.has(key)) {
        return minMaxCache.get(key)!;
    }

    // If not in cache, run the GPU reducer
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    const uniforms = {
        r0: R0,
        lambda: num(inputs.lambda, 1),
        beta: num(inputs.beta, 0) * Math.PI / 180,
        gamma,
        kappa_m,
        kappa_p,
        comp,
        hole: holeChk.checked ? 1 : 0,
    };
    const result = gpuReducer.findMinMax(uniforms);
    minMaxCache.set(key, result);

    // Keep the cache from growing too large
    if (minMaxCache.size > 50) {
        minMaxCache.delete(minMaxCache.keys().next().value!);
    }
    return result;
}

function pushFinalRenderUniforms(vmin: number, vmax: number) {
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    gl.useProgram(finalProg);
    gl.uniform1f(UF.r0, R0);
    gl.uniform1f(UF.lambda, num(inputs.lambda, 1));
    gl.uniform1f(UF.beta, num(inputs.beta, 0) * Math.PI / 180);
    gl.uniform1f(UF.gamma, gamma);
    gl.uniform1f(UF.kappa_m, kappa_m);
    gl.uniform1f(UF.kappa_p, kappa_p);
    gl.uniform1f(UF.S, 1);
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
    const sxx = getOrComputeMinMax(0);
    const syy = getOrComputeMinMax(1);
    const txy = getOrComputeMinMax(2);

    min_xx.textContent = sxx.vmin.toFixed(2);
    max_xx.textContent = sxx.vmax.toFixed(2);
    min_yy.textContent = syy.vmin.toFixed(2);
    max_yy.textContent = syy.vmax.toFixed(2);
    min_xy.textContent = txy.vmin.toFixed(2);
    max_xy.textContent = txy.vmax.toFixed(2);
}

function frame() {
    const comp = +[...inputs.comp].find(r => r.checked)!.value as 0 | 1 | 2;

    // Clear the cache if core parameters have changed
    const currentParamKey = getCacheKey(comp).split('|').slice(1).join('|');
    if (currentParamKey !== lastCacheKey) {
        minMaxCache.clear();
        lastCacheKey = currentParamKey;
    }

    // Get the min/max for the currently selected component from the cache.
    // This will compute it via the GPU if it's not already cached.
    let { vmin, vmax, xMin, yMin, xMax, yMax } = getOrComputeMinMax(comp);

    // If the min/max point is found inside the inclusion, move the dot to the center.
    if (!holeChk.checked) {
        const epsilon = 1e-9;
        if (Math.hypot(xMax, yMax) < R0 - epsilon) {
            xMax = 0;
            yMax = 0;
        }
        if (Math.hypot(xMin, yMin) < R0 - epsilon) {
            xMin = 0;
            yMin = 0;
        }
    }

    // --- Draw the main stress field visualization ---
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindVertexArray(vao);
    pushFinalRenderUniforms(vmin, vmax);
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
    updateGlobalTable(); // This now just updates text from the (now populated) cache

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

    // `analyticStressAt` now comes from `utils.ts` but needs `currentMaterial`
    // to be available. Ensure `utils.ts` imports it or receives it as a parameter.
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
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

export function initRender() {
    resize();
    requestAnimationFrame(frame);
}