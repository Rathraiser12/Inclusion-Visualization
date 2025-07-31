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

// --- Reset button ---
viewReset.addEventListener('click', () => {
  zoom = 1; panX = 0; panY = 0; updateInputs();
});

// --- Mouse controls for pan/zoom ---
canvas.addEventListener('wheel', e => {
  e.preventDefault();

  // 1. Get mouse position in Normalized Device Coordinates (NDC) [-1, 1]
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const ndcX = (mouseX / canvas.clientWidth) * 2 - 1;
  const ndcY = 1 - (mouseY / canvas.clientHeight) * 2;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const mouseNdcXWithAspect = ndcX * aspect;
  
  // 2. Calculate the zoom ratio
  const oldZoom = zoom;
  const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
  zoom = clamp(oldZoom * zoomFactor, 0.10, 1e6);
  
  // 3. Calculate the pan shift needed to keep the mouse point stationary
  // This formula finds the difference in the world position of the mouse before and after the zoom
  // and applies it as a pan correction.
  panX += (panX + mouseNdcXWithAspect) * (zoom / oldZoom - 1);
  panY += (panY + ndcY) * (zoom / oldZoom - 1);

  // 4. Update the input fields
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

  const panLimit = Math.max(zoom, 1.0); 
 panX = clamp(
    panX - (e.clientX - lastX) / canvas.height * 2 * asp,
   -panLimit, panLimit
  );
  panY = clamp(
    panY + (e.clientY - lastY) / canvas.height * 2,
   -panLimit, panLimit
  );

  lastX = e.clientX; 
  lastY = e.clientY;
  updateInputs();
});


// --- Manual text input for pan/zoom ---
viewX.addEventListener('input', () => {
  const v = parseFloat(viewX.value);
  if (Number.isFinite(v)) {
    panX = clamp(v, -1, 1);
    viewX.value = panX.toFixed(2);
  }
});

viewY.addEventListener('input', () => {
  const v = parseFloat(viewY.value);
  if (Number.isFinite(v)) {
    panY = clamp(v, -1, 1);
    viewY.value = panY.toFixed(2);
  }
});

viewZoom.addEventListener('input', () => {
  const v = parseFloat(viewZoom.value);
  if (Number.isFinite(v)) {
    zoom = clamp(v, 0.10, 1e6);
    viewZoom.value = zoom.toFixed(2);
  }
});
canvas.addEventListener('dblclick', () => {
  zoom = 1;
  panX = 0;
  panY = 0;
  updateInputs();
});