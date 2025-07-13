// src/ui/dom.ts
const $ = <T = HTMLElement>(id: string) =>
  document.getElementById(id)! as unknown as T;

export const canvas      = $('glCanvas') as HTMLCanvasElement;

/* geometry & load */
export const inputs = {
  lambda : $('lambda') as HTMLInputElement,
  beta   : $('beta')   as HTMLInputElement,
  rho    : $('rho')    as HTMLInputElement,
  nuM    : $('nuM')    as HTMLInputElement,
  nuP    : $('nuP')    as HTMLInputElement,
  cmap   : $('cmap')   as HTMLSelectElement,
  comp   : document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
};

/* misc singletons */
export const holeChk   = $('holeChk')   as HTMLInputElement;
export const viewX     = $('viewX')     as HTMLInputElement;
export const viewY     = $('viewY')     as HTMLInputElement;
export const viewZoom  = $('viewZoom')  as HTMLInputElement;
export const viewReset = $('viewReset') as HTMLButtonElement;
export const btnSave   = $('btnSave')   as HTMLButtonElement;


export const legendCanvas = $('legendCanvas') as HTMLCanvasElement;
export const legendCtx    = legendCanvas.getContext('2d')!; 
export const legendMinTxt = $('legendMin');
export const legendMaxTxt = $('legendMax');


// per‑component current value (at cursor) and global extrema
export const cur_xx = $('cur_xx');
export const cur_yy = $('cur_yy');
export const cur_xy = $('cur_xy');

export const min_xx = $('min_xx');
export const max_xx = $('max_xx');
export const min_yy = $('min_yy');
export const max_yy = $('max_yy');
export const min_xy = $('min_xy');
export const max_xy = $('max_xy');

export const stressCells = {
  cur_xx, cur_yy, cur_xy,
  min_xx, max_xx,
  min_yy, max_yy,
  min_xy, max_xy,
};