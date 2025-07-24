// src/render/legend.ts
import { legendCanvas, legendCtx,
         legendMinTxt, legendMaxTxt, inputs } from '../ui/dom';
type RGB = [number, number, number]; 

//const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const hsv2rgb = (h: number, s = 1, v = 1): RGB => {
  const c = v * s, h6 = h / 60, x = c * (1 - Math.abs(h6 % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h6 < 1)      { r = c; g = x; }
  else if (h6 < 2) { r = x; g = c; }
  else if (h6 < 3) { g = c; b = x; }
  else if (h6 < 4) { g = x; b = c; }
  else if (h6 < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  return [r + m, g + m, b + m];
};

/* ───────── colour‑map helpers ───────── */

/** Rainbow (HSV 0→270°) */
function cmapRainbow(t: number): RGB {
  return hsv2rgb(270 * (1 - t));          // violet → red
}

/** Classic “JET” from MATLAB / OpenCV */
function cmapJet(t: number): RGB {
  const f = (x: number) => Math.max(0, Math.min(1, x));
  return [
    f(1.5 - Math.abs(4 * t - 3)),
    f(1.5 - Math.abs(4 * t - 2)),
    f(1.5 - Math.abs(4 * t - 1)),
  ];
}

/** HOT: black → red → yellow → white */
function cmapHot(t: number): RGB {
  return [
    Math.min(1, 3 * t),
    Math.min(1, 3 * (t - 1 / 3)),
    Math.min(1, 3 * (t - 2 / 3)),
  ].map(v => Math.max(0, v)) as RGB;
}

/** Cool‑Warm diverging palette (blue ↔ red) */
function cmapCoolWarm(t:number):RGB{
  const cold:[number,number,number]=[0.23,0.30,0.75];
  const white:[number,number,number]=[0.86,0.87,0.91];
  const warm:[number,number,number]=[0.70,0.02,0.15];
  return t<0.5
    ? cold.map((c,i)=>c+(white[i]-c)*t*2) as RGB
    : white.map((c,i)=>c+(warm[i]-c)*(t-0.5)*2) as RGB;
}

export const mapColour = (t: number): RGB => {
  switch (+inputs.cmap.value) {
    case 1: return cmapJet(t);
    case 2: return cmapHot(t);
    case 3: return cmapCoolWarm(t);
    case 4: return cmapCoolWarm(1 - t);
    default: return cmapRainbow(t);
  }
};

let lastLegendMin: number | undefined = undefined;
let lastLegendMax: number | undefined = undefined;

export function drawLegend(min: number, max: number) {
  // --- Add this check at the beginning of the function ---
  // If the min/max values haven't changed, do nothing.
  if (min === lastLegendMin && max === lastLegendMax) {
    return;
  }

  const w = legendCanvas.clientWidth || 1,
        h = legendCanvas.clientHeight || 1;
  if (legendCanvas.width !== w || legendCanvas.height !== h) {
    legendCanvas.width = w;
    legendCanvas.height = h;
  }
  const img = legendCtx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1), [r, g, b] = mapColour(t);
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i]     = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = 255;
    }
  }
  legendCtx.putImageData(img, 0, 0);
  legendMinTxt.textContent = min.toFixed(2);
  legendMaxTxt.textContent = max.toFixed(2);
  
  // --- Update the cache with the new values ---
  lastLegendMin = min;
  lastLegendMax = max;
}
