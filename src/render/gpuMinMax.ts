/*
    CPU-based stress field calculation + analytic edge scan
*/
import { canvas, inputs, holeChk } from "../ui/dom";
import { currentMaterial }         from "../core/material";
import * as view                   from "./panzoom";

const r0  = 0.25;
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
    let sxx, syy, txy;
    if (r <= r0) {
        sxx = 0.5 * S * ((lambda + 1) * A + (1 - lambda) * B * c2b);
        syy = 0.5 * S * ((lambda + 1) * A - (1 - lambda) * B * c2b);
        txy = 0.5 * S * (1 - lambda) * B * s2b;
    } else {
        const rr2 = (r0 * r0) / (r * r), rr4 = rr2 * rr2;
        const c2t = Math.cos(2 * theta), s2t = Math.sin(2 * theta);
        sxx = 0.5 * S * (lambda + 1) * (1 - (1 - A) * rr2 * c2t) + 0.5 * S * (1 - lambda) * (c2b + (1 - B) * (3 * rr4 * Math.cos(4 * theta - 2 * beta) - 4 * rr2 * Math.cos(2 * beta - 3 * theta) * Math.cos(theta)));
        // *** FIX: Changed a '+' to a '-' in the syy formula to match the original shader. ***
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

  let vmin = Infinity, vmax = -Infinity;
  let ixMin = 0, iyMin = 0;
  let ixMax = 0, iyMax = 0;

  const aspect = canvas.width / canvas.height;

  // --- Pass 1: Scan a grid on the CPU using the analytic formula ---
  for (let iy = 0; iy < SCAN_GRID_SIZE; iy++) {
    for (let ix = 0; ix < SCAN_GRID_SIZE; ix++) {
      // Convert grid index to world coordinates
      const ndcX = (ix / (SCAN_GRID_SIZE - 1)) * 2.0 - 1.0;
      const ndcY = 1.0 - (iy / (SCAN_GRID_SIZE - 1)) * 2.0;
      const worldX = ndcX * aspect;
      const worldY = ndcY;

      const [sxx, syy, txy] = analyticStressAt(worldX, worldY);
      const val = comp === 0 ? sxx : comp === 1 ? syy : txy;
      
      if (val < vmin) {
        vmin = val;
        ixMin = ix;
        iyMin = iy;
      }
      if (val > vmax) {
        vmax = val;
        ixMax = ix;
        iyMax = iy;
      }
    }
  }
  
  // --- Pass 2: Augment with precise boundary scan for color scale accuracy ---
  // This loop only updates the vmin/vmax values, not the dot locations.
  const N = 900;
  for (let i = 0; i < N; ++i) {
    const theta = (i / N) * 2 * Math.PI;
    const [sxx, syy, txy] = analyticStressAt(r0 * Math.cos(theta), r0 * Math.sin(theta));
    const val = comp === 0 ? sxx : comp === 1 ? syy : txy;

    if (val < vmin) vmin = val;
    if (val > vmax) vmax = val;
  }
  
  const result: MinMaxLoc = {
    vmin, vmax,
    ixMin, iyMin,
    ixMax, iyMax,
  };

  memoCache.set(key, result);
  if (memoCache.size > 50) {
    memoCache.delete(memoCache.keys().next().value!);
  }
  return result;
}

// This function now converts from our CPU scan grid coordinates to canvas coordinates
export function texelToCanvas(ix: number, iy: number) {
  const ndc0x = (ix / (SCAN_GRID_SIZE - 1)) * 2.0 - 1.0;
  const ndc0y = 1.0 - (iy / (SCAN_GRID_SIZE - 1)) * 2.0;
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
