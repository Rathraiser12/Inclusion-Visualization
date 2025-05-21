/* src/main.ts – Stress-field visualiser (MIT, 2024)
   UI: r0, λ, β  |  Γ  |  νM, νP  |  plane-(strain | stress)
   Far-field stress S ≡ 1
   ------------------------------------------------------------------ */

import vertSrc from './shaders/plate.vert?raw';
import fragSrc from './shaders/plate.frag?raw';

/* ── defaults ─────────────────────────────────────────────────────── */
const DEF = {
  r0: 0.25,
  lambda: 1,
  beta: 0,
  rho: 0.1,
  nuM: 0.33,
  nuP: 0.33,
  plane: 'strain' as 'strain' | 'stress',
};

/* ── tiny helpers ─────────────────────────────────────────────────── */
const $ = <T = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;
const clampNu = (v: number) => (v < 0 ? 0 : v > 0.5 ? 0.5 : v);
const num = (el: HTMLInputElement, d = 0) => (Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : d);

/* ── DOM handles ──────────────────────────────────────────────────── */
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

/* ── WebGL bootstrap ─────────────────────────────────────────────── */
const canvas = $('glCanvas') as HTMLCanvasElement;
const glTmp  = canvas.getContext('webgl2');
if (!glTmp) throw new Error('WebGL2 not supported');
const gl = glTmp as WebGL2RenderingContext;

/* shader compile / link */
function compile(type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}
const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
  throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
gl.useProgram(prog);

/* fullscreen quad VAO */
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

/* uniform locations */
const U = {
  r0:     gl.getUniformLocation(prog,'u_r0')!,
  lambda: gl.getUniformLocation(prog,'u_lambda')!,
  beta:   gl.getUniformLocation(prog,'u_beta')!,
  gamma:  gl.getUniformLocation(prog,'u_gamma')!,     // Γ = μM/μP
  kM:     gl.getUniformLocation(prog,'u_kappaM')!,
  kP:     gl.getUniformLocation(prog,'u_kappaP')!,
  S:      gl.getUniformLocation(prog,'u_S')!,
  comp:   gl.getUniformLocation(prog,'u_component')!,
  cmap:   gl.getUniformLocation(prog,'u_cmap')!,
  minV:   gl.getUniformLocation(prog,'u_minVal')!,
  maxV:   gl.getUniformLocation(prog,'u_maxVal')!,
  zoom:   gl.getUniformLocation(prog,'u_zoom')!,
  pan:    gl.getUniformLocation(prog,'u_pan')!,
  asp:    gl.getUniformLocation(prog,'u_aspect')!,
};

/* κ(ν) */
const kappa = (nu:number,plane:'strain'|'stress') =>
  plane==='strain' ? 3-4*nu : (3-nu)/(1+nu);

/* material helper (returns Γ,kM,kP) */
function material(){
  const gamma = Math.max(0, num(inputs.rho, DEF.rho));   // allow Γ = 0
  const nuM   = clampNu(num(inputs.nuM,DEF.nuM));
  const nuP   = clampNu(num(inputs.nuP,DEF.nuP));
  const plane = [...inputs.plane].find(r=>r.checked)!.value as 'strain'|'stress';
  return {
    gamma,
    kM: kappa(nuM, plane),
    kP: kappa(nuP, plane),
  };
}

/* ── pan / zoom state ───────────────────────────────────────── */
let zoom=1, panX=0, panY=0, dragging=false, lastX=0, lastY=0;
canvas.addEventListener('mousedown',e=>{ dragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener('mouseup',()=>dragging=false);
window.addEventListener('mousemove',e=>{
  if(!dragging) return;
  const asp=canvas.width/canvas.height;
  panX -= (e.clientX-lastX)/canvas.height*2*asp/zoom;
  panY += (e.clientY-lastY)/canvas.height*2/zoom;
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  zoom *= e.deltaY>0 ? 1.1 : 0.9;
},{passive:false});

/* dynamic resize */
function resize(){
  const dpr = window.devicePixelRatio||1;
  canvas.width  = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight* dpr;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.uniform1f(U.asp, canvas.width/canvas.height);
}
window.addEventListener('resize',resize); resize();

/* analytic stress σxx,σyy,τxy ------------------------------------ */
function analyticStressAt(x:number,y:number){
  const {gamma,kM,kP} = material();
  const λ = num(inputs.lambda,DEF.lambda);
  const β = num(inputs.beta,DEF.beta)*Math.PI/180;
  const r0= num(inputs.r0,DEF.r0);
  const S = 1;

  const A = (1+kM)/(2+gamma*(kP-1));
  const B = (1+kM)/(gamma+kM);
  const c2β=Math.cos(2*β), s2β=Math.sin(2*β);

  const r = Math.hypot(x,y), θ=Math.atan2(y,x);
  let sxx, syy, txy;

  if(r<=r0){
    sxx=0.5*S*((λ+1)*A+(λ-1)*B*c2β);
    syy=0.5*S*((λ+1)*A-(λ-1)*B*c2β);
    txy=0.5*S*(λ-1)*B*s2β;
  }else{
    const rr2=(r0*r0)/(r*r), rr4=rr2*rr2, c2θ=Math.cos(2*θ), s2θ=Math.sin(2*θ);
    sxx=0.5*S*(λ+1)*(1-(1-A)*rr2*c2θ)
       +0.5*S*(λ-1)*(c2β+(1-B)*(3*rr4*c2β-4*rr2*Math.cos(2*β-θ)*Math.cos(θ)));
    syy=0.5*S*(λ+1)*(1+(1-A)*rr2*c2θ)
       -0.5*S*(λ-1)*(c2β+(1-B)*(3*rr4*c2β+4*rr2*Math.cos(2*β-θ)*Math.cos(θ)));
    txy=-0.5*S*(λ+1)*(1-A)*rr2*s2θ
        +0.5*S*(λ-1)*(s2β+(1-B)*(3*rr4*Math.sin(4*θ-2*β)-2*rr2*s2β));
  }
  txy = -txy;
  return [sxx,syy,txy] as const;
}

/* brute min/max over 256×256 sample -------------------------------- */
function viewExtremes():[number,number]{
  const W=256,H=256, asp=canvas.width/canvas.height;
  const comp = +[...inputs.compRad].find(r=>r.checked)!.value;
  let vmin=Infinity,vmax=-Infinity;
  for(let j=0;j<H;++j)for(let i=0;i<W;++i){
    const u=(i+0.5)/W*2-1, v=(j+0.5)/H*2-1;
    const xw=(u*asp)/zoom-panX, yw=v/zoom-panY;
    const [sxx,syy,txy]=analyticStressAt(xw,yw);
    const val = comp===0?sxx:comp===1?syy:txy;
    if(val<vmin) vmin=val;
    if(val>vmax) vmax=val;
  }
  return [vmin,vmax];
}

/* global extremes table ------------------------------------------- */
function computeGlobalExtremes(){
  const orig=+[...inputs.compRad].find(r=>r.checked)!.value;
  const out:number[]=[];
  for(let k=0;k<3;++k){
    inputs.compRad[k].checked = true;
    const [lo,hi]=viewExtremes();
    out.push(lo,hi);
  }
  inputs.compRad[orig].checked=true;
  return out;
}
function updateGlobalExtremesDisplay(){
  const [mnxx,mxxx,mnyy,mxyy,mnxy,mxxy]=computeGlobalExtremes();
  min_xx.textContent=mnxx.toFixed(2); max_xx.textContent=mxxx.toFixed(2);
  min_yy.textContent=mnyy.toFixed(2); max_yy.textContent=mxyy.toFixed(2);
  min_xy.textContent=mnxy.toFixed(2); max_xy.textContent=mxxy.toFixed(2);
}

/* ── NEW colour-map functions (rainbow, jet, hot, cool-warm) ─────── */
type RGB=[number,number,number];
const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,x:number)=>{
  const t=clamp01((x-a)/(b-a)); return t*t*(3-2*t);
};
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
function cmapRainbow(t:number):RGB{
  const h=260-240*t; return hsv2rgb(h,1,1);
}
function cmapJet(t: number): RGB {
  t = clamp01(t);
  const r = clamp01(1.5 - Math.abs(4 * t - 3));   // rises last
  const g = clamp01(1.5 - Math.abs(4 * t - 2));   // peaks centre
  const b = clamp01(1.5 - Math.abs(4 * t - 1));   // drops first
  return [r, g, b];
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
  if(t<0.5){
    const f=t*2;
    return cold.map((c,i)=>c+(white[i]-c)*f) as RGB;
  }else{
    const f=(t-0.5)*2;
    return white.map((c,i)=>c+(warm[i]-c)*f) as RGB;
  }
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

/* legend painter --------------------------------------------------- */
function drawLegend(min:number,max:number){
  const w=legendCanvas.clientWidth||1, h=legendCanvas.clientHeight||1;
  if(legendCanvas.width!==w||legendCanvas.height!==h){
    legendCanvas.width=w; legendCanvas.height=h;
  }
  const img=legendCtx.createImageData(w,h);
  for(let x=0;x<w;++x){
    const t=x/(w-1), [r,g,b]=mapColour(t);
    for(let y=0;y<h;++y){
      const i=(y*w+x)*4;
      img.data[i]=r*255; img.data[i+1]=g*255; img.data[i+2]=b*255; img.data[i+3]=255;
    }
  }
  legendCtx.putImageData(img,0,0);
  legendMinTxt.textContent=min.toFixed(2);
  legendMaxTxt.textContent=max.toFixed(2);
}

/* uniform push ----------------------------------------------------- */
function updateUniforms(){
  const {gamma,kM,kP}=material();
  const [vmin,vmax]=viewExtremes();

  gl.uniform1f(U.minV,vmin); gl.uniform1f(U.maxV,vmax);
  gl.uniform1f(U.r0,num(inputs.r0,DEF.r0));
  gl.uniform1f(U.lambda,num(inputs.lambda,DEF.lambda));
  gl.uniform1f(U.beta,num(inputs.beta,DEF.beta)*Math.PI/180);
  gl.uniform1f(U.gamma,gamma);
  gl.uniform1f(U.kM,kM); gl.uniform1f(U.kP,kP);
  gl.uniform1f(U.S,1);
  gl.uniform1i(U.comp,+[...inputs.compRad].find(r=>r.checked)!.value);
  gl.uniform1i(U.cmap,+inputs.cmap.value);
  gl.uniform1f(U.zoom,zoom);
  gl.uniform2f(U.pan,panX,panY);

  drawLegend(vmin,vmax);
}

/* listeners -------------------------------------------------------- */
(Object.values(inputs) as (HTMLInputElement|HTMLSelectElement|NodeListOf<HTMLInputElement>)[])
.forEach(el=>{
  if(el instanceof NodeList)
    el.forEach(n=>n.addEventListener('input',()=>{updateUniforms();updateGlobalExtremesDisplay();}));
  else
    el.addEventListener('input',()=>{
      if(el===inputs.nuM||el===inputs.nuP){
        const c=clampNu(el.valueAsNumber);
        if(el.valueAsNumber!==c) el.valueAsNumber=c;
      }
      updateUniforms(); updateGlobalExtremesDisplay();
    });
});

/* reset helpers */
const resetGeometryValues=()=>{
  inputs.r0.value=DEF.r0.toString();
  inputs.lambda.value=DEF.lambda.toString();
  inputs.beta.value=DEF.beta.toString();
};
const resetMaterialValues=()=>{
  inputs.rho.value=DEF.rho.toString();
  inputs.nuM.value=DEF.nuM.toString();
  inputs.nuP.value=DEF.nuP.toString();
  [...inputs.plane].forEach(r=>r.checked=r.value===DEF.plane);
};
resetGeometryValues(); resetMaterialValues();
resetGeom.addEventListener('click',()=>{resetGeometryValues();updateUniforms();updateGlobalExtremesDisplay();});
resetMat .addEventListener('click',()=>{resetMaterialValues();updateUniforms();updateGlobalExtremesDisplay();});

/* PNG */
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
updateGlobalExtremesDisplay(); draw();

/* mouse-probe */
canvas.addEventListener('mousemove',e=>{
  const r=canvas.getBoundingClientRect();
  const mx=(e.clientX-r.left)*canvas.width/r.width;
  const my=(e.clientY-r.top )*canvas.height/r.height;
  const ndcx=mx/canvas.width*2-1, ndcy=my/canvas.height*2-1;
  const asp=canvas.width/canvas.height;
  const xw=(ndcx*asp)/zoom-panX, yw=ndcy/zoom-panY;
  const [sxx,syy,txy]=analyticStressAt(xw,yw);
  cur_xx.textContent=sxx.toFixed(2);
  cur_yy.textContent=syy.toFixed(2);
  cur_xy.textContent=txy.toFixed(2);
});
