import {  canvas, inputs, holeChk } from "../ui/dom";
import { currentMaterial }         from "../core/material";
import * as view from "./panzoom";
import { R0 } from '../core/constants';

const DEF = { lambda: 1, beta: 0 };
// The size of the grid to scan on the CPU. 256x256 is a good balance
// between performance and accuracy for finding the dot locations.


const num = (el: HTMLInputElement, d = 0) => Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

export function worldToCanvas(worldX: number, worldY: number) {
  const aspect = canvas.clientWidth / canvas.clientHeight;

  const finalNdcY = worldY * view.zoom - view.panY;
  const finalNdcX = (worldX * view.zoom - view.panX) / aspect;

  const cssX = (finalNdcX + 1) * 0.5 * canvas.clientWidth;
  const cssY = (1 - finalNdcY) * 0.5 * canvas.clientHeight;

  return { cx: cssX, cy: cssY };
}
export function analyticStressAt(x: number, y: number) {
    const { gamma, kappa_m, kappa_p } = currentMaterial();
    const lambda = num(inputs.lambda, DEF.lambda);
    const beta = num(inputs.beta, DEF.beta) * Math.PI / 180;
    const S = 1;
    const A = holeChk.checked ? 0 : (1 + kappa_m) / (2 + gamma * (kappa_p - 1));
    const B = holeChk.checked ? 0 : (1 + kappa_m) / (gamma + kappa_m);
    const c2b = Math.cos(2 * beta), s2b = Math.sin(2 * beta);
    let r = Math.hypot(x, y), theta = Math.atan2(y, x);
    const epsilon = 1e-9;

    //if (r < 0.26 && r > 0.24) console.log(`JS check: r=${r}, r0=${R0}`);
    const r0 = R0;
    if (Math.abs(r - r0) < epsilon) { r = r0; }
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