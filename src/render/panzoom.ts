// src/render/panzoom.ts
import { canvas, viewX, viewY, viewZoom, viewReset } from '../ui/dom';
import { clamp } from '../core/math';

export let zoom = 1;
export let panX = 0;
export let panY = 0;

const updateInputs = () => {
  viewX.value    = panX.toFixed(2);
  viewY.value    = panY.toFixed(2);
  viewZoom.value = zoom.toFixed(2);
};

viewReset.addEventListener('click', () => {
  zoom = 1; panX = 0; panY = 0; updateInputs();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 1.1 : 0.9;
  zoom  = clamp(zoom, 0.10, 1e6);
  updateInputs();
}, { passive: false });

let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', e => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup',   () => dragging = false);
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
  lastX = e.clientX; lastY = e.clientY;
  updateInputs();
});
