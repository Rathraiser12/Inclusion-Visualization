/* src/main.ts – Stress-field visualiser (MIT, 2025)
   UI: r0, λ, β | Γ | νM, νP | plane | hole
   ---------------------------------------------------------------- */

import vertSrc       from './shaders/plate.vert?raw';
import fragSrc       from './shaders/plate.frag?raw';
import stressRGSrc   from './shaders/stressRG.frag?raw';
import reduceFragSrc from './shaders/reduceMinMax.frag?raw';



/* ── defaults ─────────────────────────────────────────────────── */
const r0   = 0.25;
const DEF = {
  lambda: 1, beta: 0,
  rho: 0.1, nuM: 0.17, nuP: 0.33,
  plane: 'strain' as 'strain' | 'stress',
};

/* ── tiny helpers ─────────────────────────────────────────────── */
const $ = <T = HTMLElement>(id: string) =>
  document.getElementById(id)! as unknown as T;
const clampNu = (v: number) => v < 0 ? 0 : v > 0.5 ? 0.5 : v;
const num = (el: HTMLInputElement, d = 0) =>
  Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d;
const clamp = (v:number, lo:number, hi:number) =>
  v < lo ? lo : v > hi ? hi : v;


/* ── DOM handles ─────────────────────────────────────────────── */
const inputs = {
  /* geometry & load */
  lambda: $('lambda') as HTMLInputElement,
  beta: $('beta') as HTMLInputElement,
  /* material */
  rho: $('rho') as HTMLInputElement,
  nuM: $('nuM') as HTMLInputElement,
  nuP: $('nuP') as HTMLInputElement,
  plane: document.querySelectorAll<HTMLInputElement>('input[name="plane"]'),
  /* misc */
  cmap: $('cmap') as HTMLSelectElement,
  compRad: document.querySelectorAll<HTMLInputElement>('input[name="comp"]'),
};
const holeChk   = $('holeChk')   as HTMLInputElement;

/* View widget */
const viewX    = $('viewX')    as HTMLInputElement;
const viewY    = $('viewY')    as HTMLInputElement;
const viewZoom = $('viewZoom') as HTMLInputElement;
const viewReset = $('viewReset') as HTMLButtonElement;


/* stress-table cells */
const cur_xx = $('cur_xx'), cur_yy = $('cur_yy'), cur_xy = $('cur_xy');
const min_xx = $('min_xx'), max_xx = $('max_xx');
const min_yy = $('min_yy'), max_yy = $('max_yy');
const min_xy = $('min_xy'), max_xy = $('max_xy');

/* legend canvas */
const legendCanvas = $('legendCanvas') as HTMLCanvasElement;
const legendCtx    = legendCanvas.getContext('2d')!;
const legendMinTxt = $('legendMin');
const legendMaxTxt = $('legendMax');

/* buttons */
const btnSave   = $('btnSave')   as HTMLButtonElement;
const resetGeom = $('resetGeom') as HTMLButtonElement;
const resetMat  = $('resetMat')  as HTMLButtonElement;

/* inclusion kind flag */
let holeMode = false;



viewX.addEventListener('input', () => {
  const v = parseFloat(viewX.value);
  if (Number.isFinite(v)){ 
    panX = clamp(v, -1, 1);
   viewX.value = panX.toFixed(2); }
});

// update pan when the user edits y
viewY.addEventListener('input', () => {
  const v = parseFloat(viewY.value);
  if (Number.isFinite(v)){ 
    panY = clamp(v, -1, 1);
   viewY.value = panY.toFixed(2);}
})
// update zoom (clamp to something positive)
viewZoom.addEventListener('input', () => {
  const v = parseFloat(viewZoom.value);
  if (Number.isFinite(v)){
    zoom = clamp(v, 0.10, 1e6);
   viewZoom.value = zoom.toFixed(2);
  }
});

/* ── WebGL bootstrap ─────────────────────────────────────────── */
const canvas = $('glCanvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
if (!gl) throw new Error('WebGL2 not supported');
if (!gl.getExtension('EXT_color_buffer_float'))
  throw new Error('EXT_color_buffer_float required');

/* compile / link helpers */
function compile(type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}
function link(vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}

/* programs */
const finalProg  = link(vertSrc, fragSrc);
const stressProg = link(vertSrc, stressRGSrc);
const reduceProg = link(vertSrc, reduceFragSrc);

/* fullscreen quad */
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);
const vbo = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1]),
  gl.STATIC_DRAW
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

/* ── uniform locations (UF / US / UR) ────────────────────────── */
const UF = {
  r0:gl.getUniformLocation(finalProg,'u_r0')!,
  lambda:gl.getUniformLocation(finalProg,'u_lambda')!,
  beta:gl.getUniformLocation(finalProg,'u_beta')!,
  gamma:gl.getUniformLocation(finalProg,'u_gamma')!,
  kM:gl.getUniformLocation(finalProg,'u_kappaM')!,
  kP:gl.getUniformLocation(finalProg,'u_kappaP')!,
  S:gl.getUniformLocation(finalProg,'u_S')!,
  comp:gl.getUniformLocation(finalProg,'u_component')!,
  cmap:gl.getUniformLocation(finalProg,'u_cmap')!,
  minV:gl.getUniformLocation(finalProg,'u_minVal')!,
  maxV:gl.getUniformLocation(finalProg,'u_maxVal')!,
  zoom:gl.getUniformLocation(finalProg,'u_zoom')!,
  pan:gl.getUniformLocation(finalProg,'u_pan')!,
  asp:gl.getUniformLocation(finalProg,'u_aspect')!,
  hole:gl.getUniformLocation(finalProg,'u_hole')!,
};
const US = {
  r0:gl.getUniformLocation(stressProg,'u_r0')!,
  lambda:gl.getUniformLocation(stressProg,'u_lambda')!,
  beta:gl.getUniformLocation(stressProg,'u_beta')!,
  gamma:gl.getUniformLocation(stressProg,'u_gamma')!,
  kM:gl.getUniformLocation(stressProg,'u_kappaM')!,
  kP:gl.getUniformLocation(stressProg,'u_kappaP')!,
  S:gl.getUniformLocation(stressProg,'u_S')!,
  comp:gl.getUniformLocation(stressProg,'u_component')!,
  zoom:gl.getUniformLocation(stressProg,'u_zoom')!,
  pan:gl.getUniformLocation(stressProg,'u_pan')!,
  asp:gl.getUniformLocation(stressProg,'u_aspect')!,
  hole:gl.getUniformLocation(stressProg,'u_hole')!,
};
const UR = {
  src:  gl.getUniformLocation(reduceProg,'u_src')!,
  step: gl.getUniformLocation(reduceProg,'u_step')!,
};

/* κ(ν) */
const kappa = (ν:number,pl:'strain'|'stress') =>
  pl==='strain' ? 3-4*ν : (3-ν)/(1+ν);

/* material parameters */
function material(){
   const raw = inputs.rho.value.trim();
 const γ   = holeMode               // Γ is irrelevant in hole mode
            ? DEF.rho              // (A = B = 0 anyway)
             : ( () => {            // otherwise, parse the text box
                 const g = parseFloat(raw);
                 return Number.isFinite(g) && g >= 0 ? g : DEF.rho;
               })();
  const νM = clampNu(num(inputs.nuM, DEF.nuM));
  const νP = clampNu(num(inputs.nuP, DEF.nuP));
  const pl = [...inputs.plane].find(r=>r.checked)!.value as 'strain'|'stress';
  return { γ, kM:kappa(νM,pl), kP:kappa(νP,pl) };
}

/* ── reduction pyramid (256² → 1×1) ─────────────────────────── */
interface Level{ tex:WebGLTexture; fbo:WebGLFramebuffer; w:number; h:number }
const levels:Level[] = [];
let w=2048, h=2048;
for(;;){
  const tex=gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,w,h,0,gl.RG,gl.FLOAT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const fbo=gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,
                          gl.TEXTURE_2D,tex,0);
  levels.push({tex,fbo,w,h});
  if(w===1&&h===1) break;
  w=Math.max(1,w>>1); h=Math.max(1,h>>1);
}
gl.bindFramebuffer(gl.FRAMEBUFFER,null);
gl.bindTexture (gl.TEXTURE_2D,null);

/* ── pan / zoom ─────────────────────────────────────────────── */
let zoom=1, panX=0, panY=0, dragging=false, lastX=0, lastY=0;
canvas.addEventListener('mousedown',e=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener('mouseup',()=>dragging=false);
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const asp = canvas.width / canvas.height;
  panX = clamp(
    panX - (e.clientX - lastX) / canvas.height * 2 * asp / zoom,
   -1, 1
  );
  panY = clamp(
    panY + (e.clientY - lastY) / canvas.height * 2 / zoom,
   -1, 1
  );
  lastX = e.clientX;
  lastY = e.clientY;
   updateViewDisplay();              // keep inputs in sync
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  zoom *= e.deltaY>0?1.1:0.9;
   zoom = clamp(zoom, 0.10, 1e6);   // 0.10 ≤ zoom
    updateViewDisplay();              //  reflect zoom change
},{passive:false});

/* resize */
function resize(){
  const dpr=window.devicePixelRatio||1;
  canvas.width  = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight* dpr;
  gl.viewport(0,0,canvas.width,canvas.height);
}
window.addEventListener('resize',resize); resize();



/* ── GPU min/max for component ─────────────────────────────── */
function gpuMinMax(comp: number): [number, number] {
  const { γ, kM, kP } = material();

  /* pass 0 – analytic stress → RG32F (viewport‑independent) */
  const root = levels[0];
  gl.bindFramebuffer(gl.FRAMEBUFFER, root.fbo);
  gl.viewport(0, 0, root.w, root.h);
  gl.useProgram(stressProg);

  gl.uniform1f(US.r0, r0);
  gl.uniform1f(US.lambda, num(inputs.lambda, DEF.lambda));
  gl.uniform1f(US.beta,   num(inputs.beta,   DEF.beta) * Math.PI / 180);
  gl.uniform1f(US.gamma,  γ);
  gl.uniform1f(US.kM, kM);
  gl.uniform1f(US.kP, kP);
  gl.uniform1f(US.S, 1);
  gl.uniform1i(US.comp, comp);
  gl.uniform1f(US.zoom, 1);          // fixed
  gl.uniform2f(US.pan,  0, 0);       // fixed
  gl.uniform1f(US.asp, canvas.width / canvas.height);
  gl.uniform1i(US.hole, holeMode ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  /* reduction passes (unchanged) */
  gl.useProgram(reduceProg);
  for (let i = 1; i < levels.length; i++) {
    const src = levels[i - 1], dst = levels[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(UR.src, 0);
    gl.uniform2f(UR.step, 1 / src.w, 1 / src.h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* read 1×1 RG from last level */
  const last = levels[levels.length - 1];
  gl.bindFramebuffer(gl.FRAMEBUFFER, last.fbo);
  const buf = new Float32Array(2);
  gl.readPixels(0, 0, 1, 1, gl.RG, gl.FLOAT, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  /* ----- analytic edge extrema (720 samples) ------------------ */
  let vmin = buf[0];
  let vmax = buf[1];
  const N = 720;                               // 0.5° steps
  for (let i = 0; i < N; ++i) {
    const θ = (i / N) * 2 * Math.PI;
    const [sxx, syy, txy] = analyticStressAt(
      r0 * Math.cos(θ),
      r0 * Math.sin(θ)
    );
    const val = comp === 0 ? sxx : comp === 1 ? syy : txy;
    if (val < vmin) vmin = val;
    if (val > vmax) vmax = val;
  }

  return [vmin, vmax];
}


/* ── colour-map helpers (unchanged) ─────────────────────────── */
type RGB=[number,number,number];
const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
function hsv2rgb(h:number,s=1,v=1):RGB{
  const c=v*s, h6=h/60, x=c*(1-Math.abs(h6%2-1)), m=v-c;
  let r=0,g=0,b=0;
  if(h6<1){ r=c; g=x; }
  else if(h6<2){ r=x; g=c; }
  else if(h6<3){ g=c; b=x; }
  else if(h6<4){ g=x; b=c; }
  else if(h6<5){ r=x; b=c; }
  else         { r=c; b=x; }
  return [r+m,g+m,b+m];
}
const cmapRainbow=(t:number):RGB=>hsv2rgb(260-240*clamp01(t));
function cmapJet(t:number):RGB{
  t=clamp01(t);
  const r=clamp01(1.5-Math.abs(4*t-3));
  const g=clamp01(1.5-Math.abs(4*t-2));
  const b=clamp01(1.5-Math.abs(4*t-1));
  return [r,g,b];
}
function cmapHot(t:number):RGB{
  t=clamp01(t);
  return [
    Math.min(1,3*t),
    t<1/3?0:Math.min(1,3*(t-1/3)),
    t<2/3?0:3*(t-2/3)
  ];
}
function cmapCoolWarm(t:number):RGB{
  const cold:[number,number,number]=[0.23,0.30,0.75];
  const white:[number,number,number]=[0.86,0.87,0.91];
  const warm:[number,number,number]=[0.70,0.02,0.15];
  return t<0.5
    ? cold.map((c,i)=>c+(white[i]-c)*t*2) as RGB
    : white.map((c,i)=>c+(warm[i]-c)*(t-0.5)*2) as RGB;
}
function mapColour(t:number):RGB{
  switch(+inputs.cmap.value){
    case 1: return cmapJet(t);
    case 2: return cmapHot(t);
    case 3: return cmapCoolWarm(t);
    case 4: return cmapCoolWarm(1-t);
    default:return cmapRainbow(t);
  }
}

/* legend painter */
function drawLegend(min:number,max:number){
  const w=legendCanvas.clientWidth||1, h=legendCanvas.clientHeight||1;
  if(legendCanvas.width!==w||legendCanvas.height!==h){
    legendCanvas.width=w; legendCanvas.height=h;
  }
  const img=legendCtx.createImageData(w,h);
  for(let x=0;x<w;x++){
    const t=x/(w-1), [r,g,b]=mapColour(t);
    for(let y=0;y<h;y++){
      const i=(y*w+x)*4;
      img.data[i]=r*255; img.data[i+1]=g*255;
      img.data[i+2]=b*255; img.data[i+3]=255;
    }
  }
  legendCtx.putImageData(img,0,0);
  legendMinTxt.textContent=min.toFixed(2);
  legendMaxTxt.textContent=max.toFixed(2);
}

/* push uniforms for final colour pass */
function pushFinalUniforms(vmin:number,vmax:number){
  const {γ,kM,kP}=material();
  gl.useProgram(finalProg);

  gl.uniform1f(UF.minV,vmin); gl.uniform1f(UF.maxV,vmax);
  gl.uniform1f(UF.r0,r0);
  gl.uniform1f(UF.lambda,num(inputs.lambda,DEF.lambda));
  gl.uniform1f(UF.beta,num(inputs.beta,DEF.beta)*Math.PI/180);
  gl.uniform1f(UF.gamma,γ);
  gl.uniform1f(UF.kM,kM); gl.uniform1f(UF.kP,kP);
  gl.uniform1f(UF.S,1);
  gl.uniform1i(UF.comp,+[...inputs.compRad].find(r=>r.checked)!.value);
  gl.uniform1i(UF.cmap,+inputs.cmap.value);
  gl.uniform1f(UF.zoom,zoom);
  gl.uniform2f(UF.pan,panX,panY);
  gl.uniform1f(UF.asp,canvas.width/canvas.height);
  gl.uniform1i(UF.hole,holeMode?1:0);
}

/* update global min/max table */
function updateGlobalExtremesDisplay(){
  const [mnxx,mxxx]=gpuMinMax(0);
  const [mnyy,mxyy]=gpuMinMax(1);
  const [mnxy,mxxy]=gpuMinMax(2);
  min_xx.textContent=mnxx.toFixed(2); max_xx.textContent=mxxx.toFixed(2);
  min_yy.textContent=mnyy.toFixed(2); max_yy.textContent=mxyy.toFixed(2);
  min_xy.textContent=mnxy.toFixed(2); max_xy.textContent=mxxy.toFixed(2);
}

/* inclusion-kind checkbox */
holeChk.addEventListener('input', () => {
  holeMode = holeChk.checked;
  if(holeMode){
    inputs.rho.value = '∞';
    inputs.nuP.value = '0';
    inputs.nuP.disabled = true;
  }else{
    inputs.rho.value = DEF.rho.toString();
    inputs.nuP.value = DEF.nuP.toString();
    inputs.nuP.disabled = false;
  }
});

/* manual edits of Γ or νP exit hole mode */
inputs.rho.addEventListener('input',()=>{ holeMode=false; holeChk.checked=false; });
inputs.nuP.addEventListener('input',()=>{ holeMode=false; holeChk.checked=false; });

/* reset helpers */
const resetGeometryValues=()=>{
  inputs.lambda.value=DEF.lambda.toString();
  inputs.beta.value=DEF.beta.toString();
};
const resetMaterialValues=()=>{
  inputs.rho.value=DEF.rho.toString();
  inputs.nuM.value=DEF.nuM.toString();
  inputs.nuP.value=DEF.nuP.toString();
  inputs.nuP.disabled=false;
  holeMode=false; holeChk.checked=false;
  [...inputs.plane].forEach(r=>r.checked=r.value===DEF.plane);
};

/* buttons */
resetGeom.addEventListener('click',()=>{
  resetGeometryValues();
});
resetMat.addEventListener('click',()=>{
  resetMaterialValues();
});
btnSave.addEventListener('click',()=>{
  const a=document.createElement('a');
  a.download='stress-field.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
});
function updateViewDisplay(){
  viewX.value    = panX.toFixed(2);
  viewY.value    = panY.toFixed(2);
  viewZoom.value = zoom.toFixed(2);
}
function resetPanZoom(){
  zoom = 1;
  panX = 0;
  panY = 0;
  updateViewDisplay();
}
viewReset.addEventListener('click', resetPanZoom);

/* Call updateViewDisplay() inside draw() each frame */
updateViewDisplay();
/* ── render loop ─────────────────────────────────────────────── */
function draw(){
  const comp = +[...inputs.compRad].find(r=>r.checked)!.value;
 const [vmin, vmax] = gpuMinMax(comp);
 

  
  drawLegend(vmin,vmax);

  updateGlobalExtremesDisplay();
  pushFinalUniforms(vmin,vmax);

  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.drawArrays(gl.TRIANGLES,0,6);

  requestAnimationFrame(draw);
}


/* analytic probe (matches shader pan/zoom) */
function analyticStressAt(x:number,y:number){
  const {γ,kM,kP}=material();
  const λ=num(inputs.lambda,DEF.lambda);
  const β=num(inputs.beta,DEF.beta)*Math.PI/180;
  const S=1;

  const A = holeMode ? 0 : (1+kM)/(2+γ*(kP-1));
  const B = holeMode ? 0 : (1+kM)/(γ+kM);
  const c2β=Math.cos(2*β), s2β=Math.sin(2*β);

  const r=Math.hypot(x,y), θ=Math.atan2(y,x);
 
 
  let sxx,syy,txy;

  if(r<=r0){
    sxx=0.5*S*((λ+1)*A+(λ-1)*B*c2β);
    syy=0.5*S*((λ+1)*A-(λ-1)*B*c2β);
    txy=0.5*S*(λ-1)*B*s2β;
  }else{
    const rr2=(r0*r0)/(r*r), rr4=rr2*rr2;
    const c2θ=Math.cos(2*θ), s2θ=Math.sin(2*θ);
    sxx=0.5*S*(λ+1)*(1-(1-A)*rr2*c2θ)
       +0.5*S*(λ-1)*(c2β+(1-B)*(3*rr4*Math.cos(4*θ-2*β)-4*rr2*Math.cos(2*β-3*θ)*Math.cos(θ)));
    syy=0.5*S*(λ+1)*(1+(1-A)*rr2*c2θ)
       -0.5*S*(λ-1)*(c2β+(1-B)*(3*rr4*Math.cos(4*θ-2*β)-4*rr2*Math.sin(2*β-3*θ)*Math.sin(θ)));
    txy=-0.5*S*(λ+1)*(1-A)*rr2*s2θ
        +0.5*S*(λ-1)*(s2β+(1-B)*(3*rr4-2*rr2)*Math.sin(4*θ-2*β));
  }
  return [sxx,syy,-txy] as const;
}
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  const mx=(e.clientX-r.left)*canvas.width /r.width;
  const my=(e.clientY-r.top )*canvas.height/r.height;
  const ndcx= mx/canvas.width *2-1;
  const ndcy= 1-my/canvas.height*2;          // flip Y
  const asp = canvas.width/canvas.height;
  const xw  = (ndcx*asp + panX) / zoom;
  const yw  = (ndcy      + panY) / zoom;
  const [sxx,syy,txy]=analyticStressAt(xw,yw);
  cur_xx.textContent=sxx.toFixed(2);
  cur_yy.textContent=syy.toFixed(2);
  cur_xy.textContent=txy.toFixed(2);
});

/* kick-off */
resetGeometryValues(); resetMaterialValues();
updateGlobalExtremesDisplay(); draw();
