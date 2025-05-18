/* src/main.ts
   WebGL + UI controller for the stress-field visualiser
   (c) 2024 — MIT licence
──────────────────────────────────────────────────────────────────────── */

import vertSrc from './shaders/plate.vert?raw';
import fragSrc from './shaders/plate.frag?raw';

/* ------------------------------------------------------------------ */
/*  WebGL boilerplate                                                 */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('glCanvas') as HTMLCanvasElement;
const glTmp  = canvas?.getContext('webgl2');
if (!glTmp) throw new Error('WebGL-2 not supported');
const gl = glTmp as WebGL2RenderingContext;

function compile(type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error');
  return s;
}

const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vertSrc));
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
  new Float32Array([ -1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1 ]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

/* ------------------------------------------------------------------ */
/*  Uniform handles                                                   */
/* ------------------------------------------------------------------ */
const U = {
  r0      : gl.getUniformLocation(prog,'u_r0')!,
  lambda  : gl.getUniformLocation(prog,'u_lambda')!,
  S       : gl.getUniformLocation(prog,'u_S')!,
  beta    : gl.getUniformLocation(prog,'u_beta')!,
  muM     : gl.getUniformLocation(prog,'u_muM')!,
  muP     : gl.getUniformLocation(prog,'u_muP')!,
  kappaM  : gl.getUniformLocation(prog,'u_kappaM')!,
  kappaP  : gl.getUniformLocation(prog,'u_kappaP')!,
  comp    : gl.getUniformLocation(prog,'u_component')!,
  cmap    : gl.getUniformLocation(prog,'u_cmap')!,
  minVal  : gl.getUniformLocation(prog,'u_minVal')!,
  maxVal  : gl.getUniformLocation(prog,'u_maxVal')!,
  zoom    : gl.getUniformLocation(prog,'u_zoom')!,
  pan     : gl.getUniformLocation(prog,'u_pan')!,
  aspect  : gl.getUniformLocation(prog,'u_aspect')!,
};

/* ------------------------------------------------------------------ */
/*  DOM handles                                                       */
/* ------------------------------------------------------------------ */
const inputs = {
  r0     : document.getElementById('r0')      as HTMLInputElement,
  lambda : document.getElementById('lambda')  as HTMLInputElement,
  beta   : document.getElementById('beta')    as HTMLInputElement,
  S      : document.getElementById('S')       as HTMLInputElement,
  muM    : document.getElementById('muM')     as HTMLInputElement,
  muP    : document.getElementById('muP')     as HTMLInputElement,
  kappaM : document.getElementById('kappaM')  as HTMLInputElement,
  kappaP : document.getElementById('kappaP')  as HTMLInputElement,
  compRad: document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
  cmap   : document.getElementById('cmap')    as HTMLSelectElement,
};

/* stress table cells */
const cur_xx = document.getElementById('cur_xx') as HTMLElement;
const cur_yy = document.getElementById('cur_yy') as HTMLElement;
const cur_xy = document.getElementById('cur_xy') as HTMLElement;
const min_xx = document.getElementById('min_xx') as HTMLElement;
const max_xx = document.getElementById('max_xx') as HTMLElement;
const min_yy = document.getElementById('min_yy') as HTMLElement;
const max_yy = document.getElementById('max_yy') as HTMLElement;
const min_xy = document.getElementById('min_xy') as HTMLElement;
const max_xy = document.getElementById('max_xy') as HTMLElement;

/* colour-legend */
const legendCanvas = document.getElementById('legendCanvas') as HTMLCanvasElement;
const legendCtx    = legendCanvas.getContext('2d')!;
const legendMinTxt = document.getElementById('legendMin') as HTMLElement;
const legendMaxTxt = document.getElementById('legendMax') as HTMLElement;

/* PNG button */
const btnSave = document.getElementById('btnSave') as HTMLButtonElement;

/* helpers */
const num = (el: HTMLInputElement, d = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;

/* ------------------------------------------------------------------ */
/*  Pan / zoom                                                        */
/* ------------------------------------------------------------------ */
let zoom = 1, panX = 0, panY = 0;
let dragging = false, lastX = 0, lastY = 0;

canvas.addEventListener('mousedown', e => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const asp = canvas.width / canvas.height;
  const dx  = (e.clientX - lastX) / canvas.height * 2 * asp / zoom;
  const dy  = (e.clientY - lastY) / canvas.height * 2 / zoom;
  panX -= dx; panY += dy; lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 1.1 : 0.9;
}, { passive:false });

/* ------------------------------------------------------------------ */
/*  Canvas resize                                                     */
/* ------------------------------------------------------------------ */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.uniform1f(U.aspect, canvas.width / canvas.height);
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ */
/*  Stress-field maths (CPU)                                          */
/* ------------------------------------------------------------------ */
function analyticStressAt(x:number,y:number):[number,number,number] {
  const lam  = num(inputs.lambda,1);
  const S    = num(inputs.S,1);
  const beta = num(inputs.beta,0)*Math.PI/180;
  const muM  = num(inputs.muM,1);
  const muP  = num(inputs.muP,5);
  const kM   = num(inputs.kappaM,1.33);
  const kP   = num(inputs.kappaP,1.33);
  const r0   = num(inputs.r0,1);

  const sf = muM/muP;
  const A  = (1+kM)/(2+sf*(kP-1));
  const B  = (1+kM)/(sf+kM);
  const c2b=Math.cos(2*beta), s2b=Math.sin(2*beta);

  const r = Math.hypot(x,y), th=Math.atan2(y,x);
  let sxx, syy, txy;

  if(r<=r0){
    sxx=0.5*S*((lam+1)*A+(lam-1)*B*c2b);
    syy=0.5*S*((lam+1)*A-(lam-1)*B*c2b);
    txy=0.5*S*(lam-1)*B*s2b;
  } else {
    const rr2=(r0*r0)/(r*r), rr4=rr2*rr2, c2t=Math.cos(2*th), s2t=Math.sin(2*th);
    sxx=0.5*S*(lam+1)*(1-(1-A)*rr2*c2t)
       +0.5*S*(lam-1)*(c2b+(1-B)*(3*rr4*c2b-4*rr2*Math.cos(2*beta-th)*Math.cos(th)));
    syy=0.5*S*(lam+1)*(1+(1-A)*rr2*c2t)
       -0.5*S*(lam-1)*(c2b+(1-B)*(3*rr4*c2b+4*rr2*Math.cos(2*beta-th)*Math.cos(th)));
    txy=-0.5*S*(lam+1)*(1-A)*rr2*s2t
        +0.5*S*(lam-1)*(s2b+(1-B)*(3*rr4*Math.sin(2*th-2*beta)-2*rr2*s2b));
  }
  return [sxx,syy,txy];
}

/* ------------------------------------------------------------------ */
/*  Min / max over current view                                       */
/* ------------------------------------------------------------------ */
function viewExtremes():[number,number] {
  const W=256,H=256; // smaller sampling for speed
  let vmin= Infinity,vmax=-Infinity;
  const asp=canvas.width/canvas.height;
  const comp= +[...inputs.compRad].find(r=>r.checked)!.value;
  const r0=num(inputs.r0,1);

  for(let j=0;j<H;j++){
    for(let i=0;i<W;i++){
      const u=(i+0.5)/W*2-1, v=(j+0.5)/H*2-1;
      const xw=(u*asp)/zoom-panX, yw=v/zoom-panY;
      const [sxx,syy,txy] = analyticStressAt(xw,yw);
      const val = comp===0?sxx:comp===1?syy:txy;
      if(val<vmin) vmin=val;
      if(val>vmax) vmax=val;
    }
  }
  return [vmin,vmax];
}

function computeGlobalExtremes() {
  const orig = +[...inputs.compRad].find(r=>r.checked)!.value;
  const out:number[]=[];
  for(let c=0;c<3;c++){
    inputs.compRad[c].checked=true;
    const [lo,hi]=viewExtremes();
    out.push(lo,hi);
  }
  inputs.compRad[orig].checked=true;
  return out;
}
function updateGlobalExtremesDisplay() {
  const [mnxx,mxxx,mnyy,mxyy,mnxy,mxxy] = computeGlobalExtremes();
  min_xx.textContent = mnxx.toFixed(2);
  max_xx.textContent = mxxx.toFixed(2);
  min_yy.textContent = mnyy.toFixed(2);
  max_yy.textContent = mxyy.toFixed(2);
  min_xy.textContent = mnxy.toFixed(2);
  max_xy.textContent = mxxy.toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Colour-bar legend                                                 */
/* ------------------------------------------------------------------ */
type RGB = [number,number,number];
const mix = (a:RGB,b:RGB,f:number):RGB =>
  [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];

function hsv2rgb(h:number,s=1,v=1):RGB{
  const c=v*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=v-c;
  let r=0,g=0,b=0;
  if(h<60){ r=c; g=x; }
  else if(h<120){ r=x; g=c; }
  else if(h<180){ g=c; b=x; }
  else if(h<240){ g=x; b=c; }
  else if(h<300){ r=x; b=c; }
  else { r=c; b=x; }
  return [r+m,g+m,b+m];
}
const jet = (t:number):RGB => {
  t=Math.min(1,Math.max(0,t));
  return [
    Math.max(0,1.5-Math.abs(4*t-3)),
    Math.max(0,1.5-Math.abs(4*t-2)),
    Math.max(0,1.5-Math.abs(4*t-1)),
  ];
};
const hot = (t:number):RGB =>{
  t=Math.min(1,Math.max(0,t));
  if(t<1/3)      return [3*t,0,0];
  else if(t<2/3) return [1,3*(t-1/3),0];
  else           return [1,1,3*(t-2/3)];
};
const coolWarm = (t:number):RGB =>
  t<.5?mix([0,0,1],[1,1,1],t/.5):mix([1,1,1],[1,0,0],(t-.5)/.5);
const coolWarmInv = (t:number):RGB =>
  t<.5?mix([1,0,0],[1,1,1],t/.5):mix([1,1,1],[0,0,1],(t-.5)/.5);

function cmap(t:number):RGB{
  switch(+inputs.cmap.value){
    case 1: return jet(t);
    case 2: return hot(t);
    case 3: return coolWarm(t);
    case 4: return coolWarmInv(t);
    default: return hsv2rgb(240*(1-t));
  }
}
function drawLegend(min:number,max:number){
  const w=legendCanvas.clientWidth||1, h=legendCanvas.clientHeight||1;
  if(legendCanvas.width!==w||legendCanvas.height!==h){
    legendCanvas.width=w; legendCanvas.height=h;
  }
  const img=legendCtx.createImageData(w,h);
  for(let x=0;x<w;x++){
    const t=x/(w-1);
    const [r,g,b]=cmap(t);
    for(let y=0;y<h;y++){
      const i=(y*w+x)*4;
      img.data[i]=r*255; img.data[i+1]=g*255; img.data[i+2]=b*255; img.data[i+3]=255;
    }
  }
  legendCtx.putImageData(img,0,0);
  legendMinTxt.textContent=min.toFixed(2);
  legendMaxTxt.textContent=max.toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Uniform update & draw                                             */
/* ------------------------------------------------------------------ */
function updateUniforms() {
  const [vmin,vmax]=viewExtremes();
  gl.uniform1f(U.minVal,vmin); gl.uniform1f(U.maxVal,vmax);

  gl.uniform1f(U.r0,num(inputs.r0,1));
  gl.uniform1f(U.lambda,num(inputs.lambda,1));
  gl.uniform1f(U.S,num(inputs.S,1));
  gl.uniform1f(U.beta,num(inputs.beta,0)*Math.PI/180);
  gl.uniform1f(U.muM,num(inputs.muM,1));
  gl.uniform1f(U.muP,num(inputs.muP,5));
  gl.uniform1f(U.kappaM,num(inputs.kappaM,1.33));
  gl.uniform1f(U.kappaP,num(inputs.kappaP,1.33));
  gl.uniform1i(U.comp,+[...inputs.compRad].find(r=>r.checked)!.value);
  gl.uniform1i(U.cmap,+inputs.cmap.value);
  gl.uniform1f(U.zoom,zoom);
  gl.uniform2f(U.pan,panX,panY);

  drawLegend(vmin,vmax);
}

Object.values(inputs).forEach(el=>{
  if(el instanceof NodeList)
    el.forEach(n=>n.addEventListener('input',()=>{updateUniforms();updateGlobalExtremesDisplay();}));
  else
    el.addEventListener('input',()=>{updateUniforms();updateGlobalExtremesDisplay();});
});

/* mouse-probe updates σ(x,y) cells */
canvas.addEventListener('mousemove',e=>{
  const rect=canvas.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*canvas.width/rect.width;
  const my=(e.clientY-rect.top )*canvas.height/rect.height;
  const ndcx=mx/canvas.width*2-1, ndcy=my/canvas.height*2-1;
  const asp=canvas.width/canvas.height;
  const xw=(ndcx*asp)/zoom-panX, yw=ndcy/zoom-panY;
  const [sxx,syy,txy]=analyticStressAt(xw,yw);
  cur_xx.textContent=sxx.toFixed(2);
  cur_yy.textContent=syy.toFixed(2);
  cur_xy.textContent=txy.toFixed(2);
});

/* save-PNG */
btnSave.addEventListener('click',()=>{
  const a=document.createElement('a');
  a.download='stress-field.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
});

/* render loop */
function draw(){
  updateUniforms();
  gl.drawArrays(gl.TRIANGLES,0,6);
  requestAnimationFrame(draw);
}
updateGlobalExtremesDisplay();
draw();
