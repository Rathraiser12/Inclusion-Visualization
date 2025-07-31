import { link } from '../core/gl';
import { vertSrc, stressSrc } from '../shaders';
import { default as reductionFragSrc } from '../shaders/reduction.frag?raw';

const STRESS_TEX_SIZE = 1024;

export interface MinMaxResult {
  vmin: number; vmax: number;
  xMin: number; yMin: number;
  xMax: number; yMax: number;
}

export class GpuReducer {
  private gl: WebGL2RenderingContext;
  
  private stressProg: WebGLProgram;
  private reduceProg: WebGLProgram;

  private fboA: WebGLFramebuffer;
  private fboB: WebGLFramebuffer;

  private stressTex: WebGLTexture;
  private pongTexA: WebGLTexture;
  private pongTexB: WebGLTexture;
  
  private vao: WebGLVertexArrayObject;
  private reduceOpLoc: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    
    this.stressProg = link(gl, vertSrc, stressSrc);
    this.reduceProg = link(gl, vertSrc, reductionFragSrc);
    this.reduceOpLoc = gl.getUniformLocation(this.reduceProg, "u_op")!;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fboA = gl.createFramebuffer()!;
    this.fboB = gl.createFramebuffer()!;

    this.stressTex = this.createFloatTexture(STRESS_TEX_SIZE, STRESS_TEX_SIZE);
    this.pongTexA = this.createFloatTexture(STRESS_TEX_SIZE / 2, STRESS_TEX_SIZE / 2);
    this.pongTexB = this.createFloatTexture(STRESS_TEX_SIZE / 2, STRESS_TEX_SIZE / 2);
  }

  private createFloatTexture(width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return tex;
  }

  public findMinMax(uniforms: Record<string, any>): MinMaxResult {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    // Pass 1: Render full stress field to a texture
    gl.useProgram(this.stressProg);
    this.setAllUniforms(this.stressProg, uniforms);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.stressTex, 0);
    gl.viewport(0, 0, STRESS_TEX_SIZE, STRESS_TEX_SIZE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Setup for reduction passes
    gl.useProgram(this.reduceProg);
    gl.uniform1i(gl.getUniformLocation(this.reduceProg, "u_source"), 0);

    // --- MIN REDUCTION ---
    const finalMinFbo = this.runReduction(0);
    const minData = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, finalMinFbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, minData);

    // --- MAX REDUCTION ---
    const finalMaxFbo = this.runReduction(1);
    const maxData = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, finalMaxFbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, maxData);

    // Cleanup
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);

    return {
      vmin: minData[0], xMin: minData[1], yMin: minData[2],
      vmax: maxData[0], xMax: maxData[1], yMax: maxData[2],
    };
  }

  private runReduction(op: 0 | 1): WebGLFramebuffer {
    const gl = this.gl;
    gl.uniform1i(this.reduceOpLoc, op);

    let readTex = this.stressTex;
    let writeFbo: WebGLFramebuffer;
    let currentSize = STRESS_TEX_SIZE;
    let iteration = 0;

    while (currentSize > 1) {
        currentSize /= 2;
        
        // Alternate between pongTexA/fboA and pongTexB/fboB
        const writeTex = (iteration % 2 === 0) ? this.pongTexA : this.pongTexB;
        writeFbo = (iteration % 2 === 0) ? this.fboA : this.fboB;

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.viewport(0, 0, currentSize, currentSize);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // The texture we just wrote to becomes the source for the next pass
        readTex = writeTex;
        iteration++;
    }

    // The final result is in the last FBO we wrote to
    return (iteration % 2 === 1) ? this.fboA : this.fboB;
  }
    
  private setAllUniforms(prog: WebGLProgram, uniforms: Record<string, any>) {
      const gl = this.gl;
      gl.uniform1f(gl.getUniformLocation(prog, "u_r0"), uniforms.r0);
      gl.uniform1f(gl.getUniformLocation(prog, "u_lambda"), uniforms.lambda);
      gl.uniform1f(gl.getUniformLocation(prog, "u_beta"), uniforms.beta);
      gl.uniform1f(gl.getUniformLocation(prog, "u_gamma"), uniforms.gamma);
      gl.uniform1f(gl.getUniformLocation(prog, "u_kappa_m"), uniforms.kappa_m);
      gl.uniform1f(gl.getUniformLocation(prog, "u_kappa_p"), uniforms.kappa_p);
      gl.uniform1i(gl.getUniformLocation(prog, "u_component"), uniforms.comp);
      gl.uniform1i(gl.getUniformLocation(prog, "u_hole"), uniforms.hole);
      gl.uniform1f(gl.getUniformLocation(prog, "u_aspect"), 1.0);
      gl.uniform1f(gl.getUniformLocation(prog, "u_S"), 1.0);
  }
}