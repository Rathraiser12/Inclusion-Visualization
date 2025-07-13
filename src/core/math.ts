// src/core/math.ts
export const clamp  = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const clampNu = (v: number) => clamp(v, 0, 0.5);

export const kappa = (ν: number, plane: 'strain' | 'stress') =>
  plane === 'strain' ? 3 - 4 * ν : (3 - ν) / (1 + ν);
