// src/ui/controls.ts
import { btnSave, canvas } from './dom';
import { clamp }           from '../core/math';
import { zoom }            from '../render/panzoom';

export function setupUI() {
  /* Reset buttons just mutate the input DOM elements.
     The render loop reads them every frame, so no extra action needed. */

  btnSave.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'stress-field.png';
    a.href     = canvas.toDataURL('image/png');
    a.click();
  });
}
