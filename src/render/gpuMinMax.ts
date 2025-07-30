/*
    CPU-based stress field calculation + analytic edge scan
*/
import { canvas, inputs, holeChk } from "../ui/dom";
import { currentMaterial }         from "../core/material";
import * as view                   from "./panzoom";
import { R0 } from '../core/constants';


const DEF = { lambda: 1, beta: 0 };
// The size of the grid to scan on the CPU. 256x256 is a good balance
// between performance and accuracy for finding the dot locations.
const SCAN_GRID_SIZE = 256;

const num = (el: HTMLInputElement, d = 0) => Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

export function analyticStressAt(x: number, y: number) {
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    const lambda = num(inputs.lambda, DEF.lambda);
    const beta = num(inputs.beta, DEF.beta) * Math.PI / 180;
    const S = 1;
    const A = holeChk.checked ? 0 : (1 + kappa_m) / (2 + gamma * (kappa_p - 1));
    const B = holeChk.checked ? 0 : (1 + kappa_m) / (gamma + kappa_m);
    const c2b = Math.cos(2 * beta), s2b = Math.sin(2 * beta);
    const r = Math.hypot(x, y), theta = Math.atan2(y, x);
    const epsilon = 1e-9;

    //if (r < 0.26 && r > 0.24) console.log(`JS check: r=${r}, r0=${R0}`);
    const r0 = R0;
    let sxx, syy, txy;
    if (r < r0 - epsilon) {
        sxx = 0.5 * S * ((lambda + 1) * A + (1 - lambda) * B * c2b);
        syy = 0.5 * S * ((lambda + 1) * A - (1 - lambda) * B * c2b);
        txy = 0.5 * S * (1 - lambda) * B * s2b;
    } else {
        const rr2 = (R0 * R0) / (r * r), rr4 = rr2 * rr2;
        const c2t = Math.cos(2 * theta), s2t = Math.sin(2 * theta);
        
        sxx = 0.5 * S * (lambda + 1) * (1 - (1 - A) * rr2 * c2t) + 0.5 * S * (1 - lambda) * (c2b + (1 - B) * (3 * rr4 * Math.cos(4 * theta - 2 * beta) - 4 * rr2 * Math.cos(2 * beta - 3 * theta) * Math.cos(theta)));
        syy = 0.5 * S * (lambda + 1) * (1 + (1 - A) * rr2 * c2t) - 0.5 * S * (1 - lambda) * (c2b + (1 - B) * (3 * rr4 * Math.cos(4 * theta - 2 * beta) - 4 * rr2 * Math.sin(2 * beta - 3 * theta) * Math.sin(theta)));
        txy = -0.5 * S * (lambda + 1) * (1 - A) * rr2 * s2t + 0.5 * S * (1 - lambda) * (s2b + (1 - B) * (3 * rr4 - 2 * rr2) * Math.sin(4 * theta - 2 * beta));
    }
    return [sxx, syy, txy] as const;
}

export interface MinMaxLoc {
  vmin: number; vmax: number;
  xMin: number; yMin: number;
  xMax: number; yMax: number;
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

  const initialStress = analyticStressAt(1e5, 1e5);
  let vmin = initialStress[comp];
  let vmax = initialStress[comp];
  let xMin = 0, yMin = 0;
  let xMax = 0, yMax = 0;

  const aspect = canvas.width / canvas.height;

  // --- Pass 1: Scan a grid on the CPU using the analytic formula ---
  for (let iy = 0; iy < SCAN_GRID_SIZE; iy++) {
    for (let ix = 0; ix < SCAN_GRID_SIZE; ix++) {
      // Convert grid index to world coordinates
      const ndcX = (ix / (SCAN_GRID_SIZE - 1)) * 2.0 - 1.0;
      const ndcY = 1.0 - (iy / (SCAN_GRID_SIZE - 1)) * 2.0;
      const worldX = ndcX * aspect;
      const worldY = ndcY;
       // --- If in hole mode, skip points inside the hole's radius ---
      if (holeChk.checked && (worldX * worldX + worldY * worldY) < (R0 * R0)) {
        continue; // Skip to the next grid point
      }
      const [sxx, syy, txy] = analyticStressAt(worldX, worldY);
      const val = comp === 0 ? sxx : comp === 1 ? syy : txy;
      
      if (val < vmin) {
        vmin = val;
        xMin = worldX;
        yMin = worldY;
      }
      if (val > vmax) {
        vmax = val;
        xMax = worldX;
        yMax = worldY;
      }
    }
  }
  
  // --- Pass 2: Augment with precise boundary scan for color scale accuracy ---
  // This loop only updates the vmin/vmax values, not the dot locations.
 const N = 900;
  for (let i = 0; i < N; ++i) {
    const theta = (i / N) * 2 * Math.PI;
    const x = R0 * Math.cos(theta);
    const y = R0 * Math.sin(theta);
    const val = analyticStressAt(x, y)[comp];

    if (val < vmin) {
      vmin = val;
      xMin = x;
      yMin = y;
    }
    if (val > vmax) {
      vmax = val;
      xMax = x;
      yMax = y;
    }
  }
  
  const result: MinMaxLoc = {
    vmin, vmax,
    xMin, yMin,
    xMax, yMax,
  };

  memoCache.set(key, result);
  if (memoCache.size > 50) {
    memoCache.delete(memoCache.keys().next().value!);
  }
  return result;
}
// --- To convert world coordinates to canvas CSS pixels ---
export function worldToCanvas(worldX: number, worldY: number) {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  
  // Apply view transform (zoom and pan)
  const finalNdcY = worldY * view.zoom - view.panY;
  const finalNdcX = (worldX * view.zoom - view.panX) / aspect;

  // Convert from NDC space [-1, 1] to CSS pixel space [0, width/height]
  const cssX = (finalNdcX + 1) * 0.5 * canvas.clientWidth;
  const cssY = (1 - finalNdcY) * 0.5 * canvas.clientHeight;

  return { cx: cssX, cy: cssY };
}


