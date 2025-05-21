/* src/main.ts  – Stress-field visualiser (MIT, 2024)
   UI: r0, λ, β  |  Γ = μM/μP  |  νM, νP  | plane-(strain|stress)
   Far-field stress S := 1 (no input)
───────────────────────────────────────────────────────────────────── */

import vertSrc from './shaders/plate.vert?raw';
import fragSrc from './shaders/plate.frag?raw';

/* ── default values ───────────────────────────────────────────── */
const DEF = {
  r0: 0.25,
  lambda: 1,
  beta: 0,
  rho: 0.1,
  nuM: 0.33,
  nuP: 0.33,
  plane: 'strain' as 'strain' | 'stress',
};

/* ── HTML helpers ─────────────────────────────────────────────── */
const $ = <T = HTMLElement>(id: string) =>
  document.getElementById(id) as unknown as T;

/* clamp Poisson ratio */
const clampNu = (v: number) => (v < 0 ? 0 : v > 0.5 ? 0.5 : v);

/* ── DOM refs ─────────────────────────────────────────────────── */
const inputs = {
  r0: $('r0') as HTMLInputElement,
  lambda: $('lambda') as HTMLInputElement,
  beta: $('beta') as HTMLInputElement,

  rho: $('rho') as HTMLInputElement,
  nuM: $('nuM') as HTMLInputElement,
  nuP: $('nuP') as HTMLInputElement,
  plane: document.querySelectorAll<HTMLInputElement>('input[name="plane"]'),

  cmap: $('cmap') as HTMLSelectElement,
  compRad: document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
};

/* stress table cells */
const cur_xx = $('cur_xx');
const cur_yy = $('cur_yy');
const cur_xy = $('cur_xy');
const min_xx = $('min_xx');
const max_xx = $('max_xx');
const min_yy = $('min_yy');
const max_yy = $('max_yy');
const min_xy = $('min_xy');
const max_xy = $('max_xy');

/* legend */
const legendCanvas = $('legendCanvas') as HTMLCanvasElement;
const legendCtx = legendCanvas.getContext('2d')!;
const legendMinTxt = $('legendMin');
const legendMaxTxt = $('legendMax');

/* buttons */
const btnSave = $('btnSave') as HTMLButtonElement;
const resetGeom = $('resetGeom') as HTMLButtonElement;
const resetMat = $('resetMat') as HTMLButtonElement;

/* ── WebGL boilerplate ────────────────────────────────────────── */
const canvas = $('glCanvas') as HTMLCanvasElement;
const glTmp = canvas.getContext('webgl2');
if (!glTmp) throw new Error('WebGL-2 not supported');
const gl = glTmp as WebGL2RenderingContext;

function compile(type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile error');
  return sh;
}

const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
  throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
gl.useProgram(prog);

/* full-screen quad */
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

/* uniform handles */
const U = {
  r0:      gl.getUniformLocation(prog, 'u_r0')!,
  lambda:  gl.getUniformLocation(prog, 'u_lambda')!,
  beta:    gl.getUniformLocation(prog, 'u_beta')!,
  gamma:   gl.getUniformLocation(prog, 'u_gamma')!,   //  NEW
  kM:      gl.getUniformLocation(prog, 'u_kappaM')!,
  kP:      gl.getUniformLocation(prog, 'u_kappaP')!,
  S:       gl.getUniformLocation(prog, 'u_S')!,
  comp:    gl.getUniformLocation(prog, 'u_component')!,
  cmap:    gl.getUniformLocation(prog, 'u_cmap')!,
  minV:    gl.getUniformLocation(prog, 'u_minVal')!,
  maxV:    gl.getUniformLocation(prog, 'u_maxVal')!,
  zoom:    gl.getUniformLocation(prog, 'u_zoom')!,
  pan:     gl.getUniformLocation(prog, 'u_pan')!,
  asp:     gl.getUniformLocation(prog, 'u_aspect')!,
};

/* utils */
const num = (el: HTMLInputElement, d = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

/* κ from ν */
const kappa = (nu: number, plane: 'strain' | 'stress') =>
  plane === 'strain' ? 3 - 4 * nu : (3 - nu) / (1 + nu);

/* derived material constants */
function material() {
  const gamma = Math.max(0, num(inputs.rho, DEF.rho));  // allow Γ = 0
  const nuM   = clampNu(num(inputs.nuM, DEF.nuM));
  const nuP   = clampNu(num(inputs.nuP, DEF.nuP));
  const plane = [...inputs.plane].find(r => r.checked)!.value as 'strain'|'stress';

  const kM = kappa(nuM, plane);
  const kP = kappa(nuP, plane);
  return { gamma, kM, kP };
}

/* ── pan / zoom ─────────────────────────────────────────────── */
let zoom = 1,
  panX = 0,
  panY = 0,
  dragging = false,
  lastX = 0,
  lastY = 0;

canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const asp = canvas.width / canvas.height;
  const dx = ((e.clientX - lastX) / canvas.height) * 2 * asp / zoom;
  const dy = ((e.clientY - lastY) / canvas.height) * 2 / zoom;
  panX -= dx;
  panY += dy;
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoom *= e.deltaY > 0 ? 1.1 : 0.9;
  },
  { passive: false },
);

/* resize */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(U.asp, canvas.width / canvas.height);
}
window.addEventListener('resize', resize);
resize();

/* analytic stress (uses derived material constants) */
function analyticStressAt(x: number, y: number) {
  const { gamma, kM, kP } = material();
  const λ = num(inputs.lambda, DEF.lambda);
  const β = num(inputs.beta,   DEF.beta) * Math.PI / 180;
  const r0= num(inputs.r0,     DEF.r0);
  const S = 1;

  const sf = gamma;                       // μM/μP directly
  const A  = (1 + kM) / (2 + sf * (kP - 1));
  const B  = (1 + kM) / (sf + kM);
  const c2β = Math.cos(2 * β),
    s2β = Math.sin(2 * β);

  const r = Math.hypot(x, y),
    θ = Math.atan2(y, x);
  let σxx: number, σyy: number, τxy: number;

  if (r <= r0) {
    σxx = 0.5 * S * ((λ + 1) * A + (λ - 1) * B * c2β);
    σyy = 0.5 * S * ((λ + 1) * A - (λ - 1) * B * c2β);
    τxy = 0.5 * S * (λ - 1) * B * s2β;
  } else {
    const rr2 = (r0 * r0) / (r * r);
    const rr4 = rr2 * rr2;
    const c2θ = Math.cos(2 * θ);
    const s2θ = Math.sin(2 * θ);
    σxx =
      0.5 * S * (λ + 1) * (1 - (1 - A) * rr2 * c2θ) +
      0.5 *
        S *
        (λ - 1) *
        (c2β + (1 - B) * (3 * rr4 * c2β - 4 * rr2 * Math.cos(2 * β - θ) * Math.cos(θ)));
    σyy =
      0.5 * S * (λ + 1) * (1 + (1 - A) * rr2 * c2θ) -
      0.5 *
        S *
        (λ - 1) *
        (c2β + (1 - B) * (3 * rr4 * c2β + 4 * rr2 * Math.cos(2 * β - θ) * Math.cos(θ)));
    τxy =
      (-0.5 * S * (λ + 1) * (1 - A) * rr2 * s2θ) +
      0.5 *
        S *
        (λ - 1) *
        (s2β + (1 - B) * (3 * rr4 * Math.sin(4 * θ - 2 * β) - 2 * rr2 * s2β));
  }
  return [σxx, σyy, τxy] as const;
}

/* min / max sampling (uses analyticStressAt) */
function viewExtremes(): [number, number] {
  const W = 256,
    H = 256;
  let vmin = Infinity,
    vmax = -Infinity;
  const asp = canvas.width / canvas.height;
  const comp = +[...inputs.compRad].find((r) => r.checked)!.value;

  for (let j = 0; j < H; ++j) {
    for (let i = 0; i < W; ++i) {
      const u = (i + 0.5) / W * 2 - 1;
      const v = (j + 0.5) / H * 2 - 1;
      const xw = (u * asp) / zoom - panX;
      const yw = v / zoom - panY;
      const [σxx, σyy, τxy] = analyticStressAt(xw, yw);
      const val = comp === 0 ? σxx : comp === 1 ? σyy : τxy;
      if (val < vmin) vmin = val;
      if (val > vmax) vmax = val;
    }
  }
  return [vmin, vmax];
}

/* global extremes across the 3 components */
function computeGlobalExtremes() {
  const orig = +[...inputs.compRad].find((r) => r.checked)!.value;
  const out: number[] = [];
  for (let k = 0; k < 3; ++k) {
    inputs.compRad[k].checked = true;
    const [lo, hi] = viewExtremes();
    out.push(lo, hi);
  }
  inputs.compRad[orig].checked = true;
  return out;
}
function updateGlobalExtremesDisplay() {
  const [mnxx, mxxx, mnyy, mxyy, mnxy, mxxy] = computeGlobalExtremes();
  min_xx.textContent = mnxx.toFixed(2);
  max_xx.textContent = mxxx.toFixed(2);
  min_yy.textContent = mnyy.toFixed(2);
  max_yy.textContent = mxyy.toFixed(2);
  min_xy.textContent = mnxy.toFixed(2);
  max_xy.textContent = mxxy.toFixed(2);
}

/* colour-bar utilities (same as before, omitted for brevity) */
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, f: number): RGB => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
function hsv2rgb(h: number, s = 1, v = 1): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [r + m, g + m, b + m];
}
const jet = (t: number): RGB => {
  t = Math.max(0, Math.min(1, t));
  return [
    Math.max(0, 1.5 - Math.abs(4 * t - 3)),
    Math.max(0, 1.5 - Math.abs(4 * t - 2)),
    Math.max(0, 1.5 - Math.abs(4 * t - 1)),
  ];
};
const hot = (t: number): RGB => {
  t = Math.max(0, Math.min(1, t));
  if (t < 1 / 3) return [3 * t, 0, 0];
  if (t < 2 / 3) return [1, 3 * (t - 1 / 3), 0];
  return [1, 1, 3 * (t - 2 / 3)];
};
const coolWarm = (t: number): RGB =>
  t < 0.5 ? mix([0, 0, 1], [1, 1, 1], t / 0.5) : mix([1, 1, 1], [1, 0, 0], (t - 0.5) / 0.5);
const coolWarmInv = (t: number): RGB =>
  t < 0.5 ? mix([1, 0, 0], [1, 1, 1], t / 0.5) : mix([1, 1, 1], [0, 0, 1], (t - 0.5) / 0.5);

function mapColour(t: number): RGB {
  switch (+inputs.cmap.value) {
    case 1:
      return jet(t);
    case 2:
      return hot(t);
    case 3:
      return coolWarm(t);
    case 4:
      return coolWarmInv(t);
    default:
      return hsv2rgb(240 * (1 - t));
  }
}
function drawLegend(min: number, max: number) {
  const w = legendCanvas.clientWidth || 1;
  const h = legendCanvas.clientHeight || 1;
  if (legendCanvas.width !== w || legendCanvas.height !== h) {
    legendCanvas.width = w;
    legendCanvas.height = h;
  }
  const img = legendCtx.createImageData(w, h);
  for (let x = 0; x < w; ++x) {
    const t = x / (w - 1);
    const [r, g, b] = mapColour(t);
    for (let y = 0; y < h; ++y) {
      const i = (y * w + x) * 4;
      img.data[i] = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = 255;
    }
  }
  legendCtx.putImageData(img, 0, 0);
  legendMinTxt.textContent = min.toFixed(2);
  legendMaxTxt.textContent = max.toFixed(2);
}

/* ── uniform update & draw ───────────────────────────────────── */
function updateUniforms() {
  const { gamma, kM, kP } = material();
  const [vmin, vmax] = viewExtremes();

  gl.uniform1f(U.minV, vmin);
  gl.uniform1f(U.maxV, vmax);

  gl.uniform1f(U.r0,     num(inputs.r0, DEF.r0));
  gl.uniform1f(U.lambda, num(inputs.lambda, DEF.lambda));
  gl.uniform1f(U.beta,   num(inputs.beta, DEF.beta) * Math.PI / 180);

  gl.uniform1f(U.gamma,  gamma);          // NEW
  gl.uniform1f(U.kM,     kM);
  gl.uniform1f(U.kP,     kP);

  gl.uniform1f(U.S, 1);
  gl.uniform1i(U.comp, +[...inputs.compRad].find(r=>r.checked)!.value);
  gl.uniform1i(U.cmap, +inputs.cmap.value);
  gl.uniform1f(U.zoom, zoom);
  gl.uniform2f(U.pan,  panX, panY);

  drawLegend(vmin, vmax);
}

/* listeners (all inputs) */
(Object.values(inputs) as (HTMLInputElement | NodeListOf<HTMLInputElement> | HTMLSelectElement)[]).forEach((el) => {
  if (el instanceof NodeList)
    el.forEach((n) =>
      n.addEventListener('input', () => {
        updateUniforms();
        updateGlobalExtremesDisplay();
      }),
    );
  else
    el.addEventListener('input', () => {
      /* clamp ν live */
      if (el === inputs.nuM || el === inputs.nuP) {
        const c = clampNu(el.valueAsNumber);
        if (el.valueAsNumber !== c) el.valueAsNumber = c;
      }
      updateUniforms();
      updateGlobalExtremesDisplay();
    });
});

/* ── reset helpers ──────────────────────────────────────────── */
const resetGeometryValues = () => {
  inputs.r0.value     = DEF.r0.toString();
  inputs.lambda.value = DEF.lambda.toString();
  inputs.beta.value   = DEF.beta.toString();
};

const resetMaterialValues = () => {
  inputs.rho.value = DEF.rho.toString();
  inputs.nuM.value = DEF.nuM.toString();
  inputs.nuP.value = DEF.nuP.toString();
  [...inputs.plane].forEach(r => (r.checked = r.value === DEF.plane));
};

/* initialise with defaults */
resetGeometryValues();
resetMaterialValues();

/* button wiring */
resetGeom.addEventListener('click', () => {
  resetGeometryValues();
  updateUniforms();
  updateGlobalExtremesDisplay();
});

resetMat.addEventListener('click', () => {
  resetMaterialValues();
  updateUniforms();
  updateGlobalExtremesDisplay();
});

/* save PNG */
btnSave.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = 'stress-field.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

/* render loop */
function draw() {
  updateUniforms();
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(draw);
}
updateGlobalExtremesDisplay();
draw();

/* mouse probe */
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = ((e.clientX - r.left) * canvas.width) / r.width;
  const my = ((e.clientY - r.top) * canvas.height) / r.height;
  const ndcx = (mx / canvas.width) * 2 - 1;
  const ndcy = (my / canvas.height) * 2 - 1;
  const asp = canvas.width / canvas.height;
  const xw = (ndcx * asp) / zoom - panX;
  const yw = ndcy / zoom - panY;
  const [σxx, σyy, τxy] = analyticStressAt(xw, yw);
  cur_xx.textContent = σxx.toFixed(2);
  cur_yy.textContent = σyy.toFixed(2);
  cur_xy.textContent = τxy.toFixed(2);
});
