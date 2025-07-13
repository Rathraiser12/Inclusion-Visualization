// src/core/material.ts
import { clampNu, kappa } from './math';
import { inputs, holeChk } from '../ui/dom';

export interface Material {
  γ:  number;
  kM: number;
  kP: number;
}

export function currentMaterial(): Material {
  const holeMode = holeChk.checked;

  const rawΓ  = inputs.rho.value.trim();
  const γ     = holeMode ? 0.1                 // ignored but non‑zero
                         : Math.max(0, parseFloat(rawΓ) || 0.1);

  const νM    = clampNu(parseFloat(inputs.nuM.value) || 0.17);
  const νP    = clampNu(parseFloat(inputs.nuP.value) || 0.33);
type Plane = 'strain' | 'stress';          // (optional helper)

const plane =
  (document.querySelector(
     'input[name="plane"]:checked') as HTMLInputElement).value as Plane;                              // <-- parentheses

  return { γ, kM: kappa(νM, plane), kP: kappa(νP, plane) };
}
