// src/core/material.ts
import { clampNu, kappa } from './math';
import { inputs, holeChk } from '../ui/dom';

export interface Material {
  gamma:  number;
  kappa_m: number;
  kappa_p: number;
}

export function currentMaterial(): Material {
  /* hole‑mode makes Γ irrelevant but keep a tiny number to avoid 0 */
  const holeMode = holeChk.checked;

  const rawGamma = inputs.rho.value.trim();
  const gamma    = holeMode ? 0.1 : Math.max(0, parseFloat(rawGamma) || 0.00000000001);
 // AFTER
// The specific gamma value doesn't matter in hole mode, as its contribution is cancelled out.
  const nu_m   = clampNu(parseFloat(inputs.nuM.value) || 0.17);
  const nu_p   = clampNu(parseFloat(inputs.nuP.value) || 0.33);

  /* -------------------------------------------------------------- */
  /* plane strain / plane stress radio buttons                      */
  /* -------------------------------------------------------------- */

  let plane: 'strain' | 'stress' = 'strain';          // sensible default

  const checked = Array.from(inputs.plane).find(r => r.checked);
  if (checked) {
    plane = checked.value as 'strain' | 'stress';
  } else {
    console.warn('[material] no plane radio selected - defaulting to strain');
  }

  return { gamma, kappa_m: kappa(nu_m, plane), kappa_p: kappa(nu_p, plane) };
}
