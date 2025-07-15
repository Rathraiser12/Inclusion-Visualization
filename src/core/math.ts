// src/core/math.ts
export const clamp  = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const clampNu = (nu: number) => clamp(nu, 0, 0.5);

export const kappa = (nu: number, plane: 'strain' | 'stress') =>
  plane === 'strain' ? 3 - 4 * nu : (3 - nu) / (1 + nu);
