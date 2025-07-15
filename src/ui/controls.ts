// src/ui/controls.ts
import { btnSave, canvas, holeChk, inputs, resetGeom, resetMat } from './dom';

// Default values needed for reset and hole mode logic
const DEFAULTS = {
  lambda: 1,
  beta: 0,
  rho: 0.1,
  nuM: 0.17,
  nuP: 0.33,
  plane: 'strain',
};

export function setupUI() {
  // Save PNG button
  btnSave.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'stress-field.png';
    a.href     = canvas.toDataURL('image/png');
    a.click();
  });

  // --- Reset Buttons ---
  resetGeom.addEventListener('click', () => {
    inputs.lambda.value = DEFAULTS.lambda.toString();
    inputs.beta.value   = DEFAULTS.beta.toString();
  });

  resetMat.addEventListener('click', () => {
    inputs.rho.value    = DEFAULTS.rho.toString();
    inputs.nuM.value    = DEFAULTS.nuM.toString();
    inputs.nuP.value    = DEFAULTS.nuP.toString();
    inputs.nuP.disabled = false;
    holeChk.checked     = false;
    [...inputs.plane].forEach(r => r.checked = r.value === DEFAULTS.plane);
  });

  // --- Interactive "Hole" Mode Logic ---
  holeChk.addEventListener('input', () => {
    if (holeChk.checked) {
      inputs.rho.value = '∞'; // Display infinity as a visual cue
      inputs.nuP.value = '0';
      inputs.nuP.disabled = true;
    } else {
      // Restore defaults if unchecked
      inputs.rho.value = DEFAULTS.rho.toString();
      inputs.nuP.value = DEFAULTS.nuP.toString();
      inputs.nuP.disabled = false;
    }
  });

  // Editing material properties automatically un-checks the "Hole" mode
  inputs.rho.addEventListener('input', () => {
    holeChk.checked = false;
    inputs.nuP.disabled = false;
  });
  inputs.nuP.addEventListener('input', () => {
    holeChk.checked = false;
  });
}