// src/core/gl.ts
export function getContext(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
  if (!gl)       throw new Error('WebGL2 not supported');
  if (!gl.getExtension('EXT_color_buffer_float'))
    throw new Error('EXT_color_buffer_float extension required');
  return gl;
}

export function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}

export function link(gl: WebGL2RenderingContext,
                     vs: string, fs: string) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER,   vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
  return prog;
}
