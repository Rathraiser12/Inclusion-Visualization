/* eslint-disable @typescript-eslint/consistent-type-imports */
import vertSrc from './shaders/plate.vert?raw';
import fragSrc from './shaders/plate.frag?raw';

/* ── canvas & GL context ────────────────────────────────────────────── */
const canvas = document.getElementById('glCanvas') as HTMLCanvasElement;
const glTmp = canvas.getContext('webgl2');                  // may be null
if (!glTmp) throw new Error('WebGL 2 not supported');
const gl = glTmp as WebGL2RenderingContext;

/* ── compile/link ───────────────────────────────────────────────────── */
function compile(kind: number, src: string): WebGLShader {
  const sh = gl.createShader(kind)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}
const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vertSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
  throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
gl.useProgram(prog);

/* ── fullscreen quad ───────────────────────────────────────────────── */
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);

const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([ -1,-1,  +1,-1,  -1,+1,   -1,+1,  +1,-1,  +1,+1 ]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

/* ── uniform helpers ───────────────────────────────────────────────── */
const u = (name: string) => gl.getUniformLocation(prog, name)!;
const U = {
  r0: u('u_r0'), lambda: u('u_lambda'), S: u('u_S'), beta: u('u_beta'),
  muM: u('u_muM'), muP: u('u_muP'), kM: u('u_kappaM'), kP: u('u_kappaP'),
  comp: u('u_component'), cmap: u('u_cmap'),
  minVal: u('u_minVal'), maxVal: u('u_maxVal'),
  zoom: u('u_zoom'), pan: u('u_pan'), aspect: u('u_aspect'),
};

/* ── DOM inputs ────────────────────────────────────────────────────── */
const inputs = {
  r0      : document.getElementById('r0')      as HTMLInputElement,
  lambda  : document.getElementById('lambda')  as HTMLInputElement,
  beta    : document.getElementById('beta')    as HTMLInputElement,
  S       : document.getElementById('S')       as HTMLInputElement,
  muM     : document.getElementById('muM')     as HTMLInputElement,
  muP     : document.getElementById('muP')     as HTMLInputElement,
  kM      : document.getElementById('kappaM')  as HTMLInputElement,
  kP      : document.getElementById('kappaP')  as HTMLInputElement,
  compRad : document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
  cmapSel : document.getElementById('cmap')    as HTMLSelectElement,
};

/* helper: safe number read */
const num = (el: HTMLInputElement, def = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : def;

/* ── view transform (pan / zoom) ───────────────────────────────────── */
const PAN_SENS = 0.4;          // 1 = old speed, 0.5 = half as sensitive

let zoom = 1.0, panX = 0, panY = 0;
let dragging = false, lastX = 0, lastY = 0;

canvas.addEventListener('mousedown', e => {
  dragging = true;
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const asp = canvas.width / canvas.height;
  const dx = PAN_SENS * (e.clientX - lastX) / canvas.height * 2 * asp / zoom;
  const dy = PAN_SENS * (e.clientY - lastY) / canvas.height * 2 / zoom;
  panX -= dx; panY += dy;
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 1.1 : 0.9;
}, { passive: false });

/* ── resize sync ───────────────────────────────────────────────────── */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(U.aspect, canvas.width / canvas.height);
}
window.addEventListener('resize', resize);
resize();

/* ── CPU probe grid for true min / max in current view ─────────────── */
function viewExtremes(): [number, number] {
  const W = 256, H = 256;          /* probe resolution */
  let vmin =  Infinity, vmax = -Infinity;

  /* read once per frame */
  const lam  = num(inputs.lambda, 1);
  const S    = num(inputs.S, 1);
  const beta = num(inputs.beta, 0) * Math.PI/180;
  const muM  = num(inputs.muM, 1);
  const muP  = num(inputs.muP, 5);
  const kM   = num(inputs.kM, 1.33);
  const kP   = num(inputs.kP, 1.33);
  const r0   = num(inputs.r0, 1);

  const sf = muM / muP;
  const A  = (1 + kM) / (2 + sf * (kP - 1));
  const B  = (1 + kM) / (sf + kM);
  const c2b = Math.cos(2*beta);
  const s2b = Math.sin(2*beta);

  const comp = +[...inputs.compRad].find(r => r.checked)!.value;

  const asp = canvas.width / canvas.height;

  for (let j = 0; j < H; ++j) {
    for (let i = 0; i < W; ++i) {
      const u = (i + 0.5) / W * 2 - 1;
      const v = (j + 0.5) / H * 2 - 1;
      const xw = (u * asp) / zoom - panX;
      const yw =  v / zoom - panY;
      const r  = Math.hypot(xw, yw);
      const th = Math.atan2(yw, xw);

      let sxx, syy, txy;

      if (r <= r0) {
        sxx = 0.5*S*((lam+1)*A + (lam-1)*B*c2b);
        syy = 0.5*S*((lam+1)*A - (lam-1)*B*c2b);
        txy = 0.5*S*(lam-1)*B*s2b;
      } else {
        const rr2 = (r0*r0)/(r*r);
        const rr4 = rr2*rr2;
        const c2t = Math.cos(2*th);
        const s2t = Math.sin(2*th);

        sxx =
          0.5*S*(lam+1)*(1 - (1-A)*rr2*c2t) +
          0.5*S*(lam-1)*( c2b +
            (1-B)*(3*rr4*c2b - 4*rr2*Math.cos(2*beta-th)*Math.cos(th)));

        syy =
          0.5*S*(lam+1)*(1 + (1-A)*rr2*c2t) -
          0.5*S*(lam-1)*( c2b +
            (1-B)*(3*rr4*c2b + 4*rr2*Math.cos(2*beta-th)*Math.cos(th)));

        txy =
         -0.5*S*(lam+1)*(1-A)*rr2*s2t +
          0.5*S*(lam-1)*( s2b +
            (1-B)*(3*rr4*Math.sin(2*th-2*beta) - 2*rr2*s2b));
      }

      const val = comp===0 ? sxx : (comp===1 ? syy : txy);
      if (val < vmin) vmin = val;
      if (val > vmax) vmax = val;
    }
  }
  return [vmin, vmax];
}

/* ── push UI state → uniforms ───────────────────────────────────────── */
function updateUniforms() {
  const [vmin, vmax] = viewExtremes();
  gl.uniform1f(U.minVal, vmin);
  gl.uniform1f(U.maxVal, vmax);

  gl.uniform1f(U.r0,     num(inputs.r0, 1));
  gl.uniform1f(U.lambda, num(inputs.lambda, 1));
  gl.uniform1f(U.S,      num(inputs.S, 1));
  gl.uniform1f(U.beta,   num(inputs.beta, 0) * Math.PI/180);
  gl.uniform1f(U.muM,    num(inputs.muM, 1));
  gl.uniform1f(U.muP,    num(inputs.muP, 5));
  gl.uniform1f(U.kM,     num(inputs.kM, 1.33));
  gl.uniform1f(U.kP,     num(inputs.kP, 1.33));

  gl.uniform1i(U.comp, +[...inputs.compRad].find(r => r.checked)!.value);
  gl.uniform1i(U.cmap, +inputs.cmapSel.value);

  gl.uniform1f(U.zoom, zoom);
  gl.uniform2f(U.pan, panX, panY);
}

/* any UI change triggers redraw */
for (const el of Object.values(inputs)) {
  if (el instanceof NodeList) el.forEach(n => n.addEventListener('input', updateUniforms));
  else                         el.addEventListener('input', updateUniforms);
}

/* ── render loop ────────────────────────────────────────────────────── */
function render() {
  updateUniforms();
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(render);
}
render();
