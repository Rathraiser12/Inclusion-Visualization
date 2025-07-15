// src/ui/dom.ts
/* ------------------------------------------------------------------ */
/* Safe element helpers                                               */
/* ------------------------------------------------------------------ */

/** Generic lookup that warns (instead of crashing) if the element is missing. */
const $ = <T extends HTMLElement = HTMLElement>(
  id: string,
  fallback: () => T,
): T => {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`[ui/dom] element #${id} not found – using dummy.`);
    return fallback();
  }
  return el as T;
};

/** Create a stand‑in <input> with a default value so `.valueAsNumber` etc. exist. */
const dummyInput = (val = '0'): HTMLInputElement => {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = val;
  return inp;
};

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export const canvas = $('glCanvas', () => {
  const c = document.createElement('canvas');
  c.width = c.height = 400;
  return c;
});

/* ------------------------------------------------------------------ */
/* Inputs & controls                                                   */
/* ------------------------------------------------------------------ */

export const inputs = {
  lambda: $('lambda', () => dummyInput('1')),
  beta  : $('beta',   () => dummyInput('0')),
  rho   : $('rho',    () => dummyInput('0.1')),
  nuM   : $('nuM',    () => dummyInput('0.17')),
  nuP   : $('nuP',    () => dummyInput('0.33')),

  cmap  : $('cmap',  () => {
    const s = document.createElement('select');
    s.value = '0';
    return s as HTMLSelectElement;
  }),
  plane: document.querySelectorAll<HTMLInputElement>('input[name="plane"]'),

  comp  : document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
};

/* misc singletons --------------------------------------------------- */
export const holeChk   = $('holeChk',   () => dummyInput('0'));
export const viewX     = $('viewX',     () => dummyInput('0'));
export const viewY     = $('viewY',     () => dummyInput('0'));
export const viewZoom  = $('viewZoom',  () => dummyInput('1'));
export const viewReset = $('viewReset', () => {
  const b = document.createElement('button');
  return b;
});
export const btnSave   = $('btnSave',   () => {
  const b = document.createElement('button');
  return b;
});

/* legend ------------------------------------------------------------ */
export const legendCanvas = $('legendCanvas', () => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 14;
  return c;
});
export const legendCtx    = legendCanvas.getContext('2d')!;
export const legendMinTxt = $('legendMin', () => document.createElement('span'));
export const legendMaxTxt = $('legendMax', () => document.createElement('span'));

/* stress table ------------------------------------------------------ */
export const cur_xx = $('cur_xx', () => document.createElement('span'));
export const cur_yy = $('cur_yy', () => document.createElement('span'));
export const cur_xy = $('cur_xy', () => document.createElement('span'));

export const min_xx = $('min_xx', () => document.createElement('span'));
export const max_xx = $('max_xx', () => document.createElement('span'));
export const min_yy = $('min_yy', () => document.createElement('span'));
export const max_yy = $('max_yy', () => document.createElement('span'));
export const min_xy = $('min_xy', () => document.createElement('span'));
export const max_xy = $('max_xy', () => document.createElement('span'));

export const stressCells = {
  cur_xx, cur_yy, cur_xy,
  min_xx, max_xx,
  min_yy, max_yy,
  min_xy, max_xy,
};
