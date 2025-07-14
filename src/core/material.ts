// src/core/material.ts
import { clampNu, kappa } from './math';
import { inputs, holeChk } from '../ui/dom';

export interface Material {
  γ:  number;
  kM: number;
  kP: number;
}

export function currentMaterial(): Material {
  /* hole‑mode makes Γ irrelevant but keep a tiny number to avoid /0 */
  const holeMode = holeChk.checked;

  const rawΓ = inputs.rho.value.trim();
  const γ    = holeMode ? 0.1 : Math.max(0, parseFloat(rawΓ) || 0.1);

  const νM   = clampNu(parseFloat(inputs.nuM.value) || 0.17);
  const νP   = clampNu(parseFloat(inputs.nuP.value) || 0.33);

  /* -------------------------------------------------------------- */
  /* plane strain / plane stress radio buttons                      */
  /* -------------------------------------------------------------- */

  let plane: 'strain' | 'stress' = 'strain';          // sensible default

  const checked = Array.from(inputs.comp).find(r => r.checked);
  if (checked) {
    plane = checked.value === 'stress' ? 'stress' : 'strain';
  } else {
    console.warn('[material] no plane radio selected – defaulting to strain');
  }

  return { γ, kM: kappa(νM, plane), kP: kappa(νP, plane) };
}
