// src/ui/controls.ts
declare function html2canvas(element: HTMLElement, options?: any): Promise<HTMLCanvasElement>;

import { clampNu } from '../core/math';
import { btnSave,  holeChk, inputs, resetGeom, resetMat, minDot, maxDot } from './dom';

const DEFAULTS = {
  lambda: 1,
  beta: 0,
  rho: 0.1,
  nuM: 0.17,
  nuP: 0.33,
  plane: 'strain',
};

export function setupUI() {
  
  const saveModal = document.querySelector<HTMLElement>('#save-modal')!;
  const cancelSaveBtn = document.querySelector<HTMLButtonElement>('#cancel-save-btn')!;
  const confirmSaveBtn = document.querySelector<HTMLButtonElement>('#confirm-save-btn')!;
  const resolutionSelect = document.querySelector<HTMLSelectElement>('#resolution-select')!;
  const dotsCheckbox = document.querySelector<HTMLInputElement>('#dots-checkbox')!;
  const visualizationContainer = document.querySelector<HTMLElement>('#visualization-container');

  btnSave.addEventListener('click', () => {
    saveModal.classList.remove('hidden');
  });

  cancelSaveBtn.addEventListener('click', () => {
    saveModal.classList.add('hidden');
  });

  confirmSaveBtn.addEventListener('click', async () => {
    if (!visualizationContainer) return;

    // --- NEW LOGIC FOR CALCULATING SCALE ---
    const targetWidth = parseInt(resolutionSelect.value, 10);
    const currentWidth = visualizationContainer.clientWidth;
    const scale = targetWidth / currentWidth;
    // --- END OF NEW LOGIC ---

    const includeDots = dotsCheckbox.checked;

    if (!includeDots) {
      minDot.style.display = 'none';
      maxDot.style.display = 'none';
    }

    try {
      const capturedCanvas = await html2canvas(visualizationContainer, {
        scale: scale, // Use the dynamically calculated scale
        useCORS: true,
        backgroundColor: null
      });

      const a = document.createElement('a');
      a.download = `stress-field-${targetWidth}px.png`;
      a.href = capturedCanvas.toDataURL('image/png');
      a.click();

    } catch (error) {
      console.error("Failed to save canvas:", error);
    } finally {
      if (!includeDots) {
        minDot.style.display = 'block';
        maxDot.style.display = 'block';
      }
      saveModal.classList.add('hidden');
    }
  });

  // --- Reset Buttons and other logic... (rest of file is unchanged) ---
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

  holeChk.addEventListener('input', () => {
    if (holeChk.checked) {
      inputs.rho.value = '∞';
      inputs.nuP.value = '0';
      inputs.nuP.disabled = true;
    } else {
      inputs.rho.value = DEFAULTS.rho.toString();
      inputs.nuP.value = DEFAULTS.nuP.toString();
      inputs.nuP.disabled = false;
    }
  });

  inputs.rho.addEventListener('input', () => {
    holeChk.checked = false;
    inputs.nuP.disabled = false;
  });
  inputs.nuP.addEventListener('input', () => {
    holeChk.checked = false;
  });

  inputs.nuM.addEventListener('blur', () => {
    const value = parseFloat(inputs.nuM.value);
    if (Number.isFinite(value)) {
      inputs.nuM.value = clampNu(value).toString();
    } else {
      inputs.nuM.value = DEFAULTS.nuM.toString();
    }
  });

  inputs.nuP.addEventListener('blur', () => {
    const value = parseFloat(inputs.nuP.value);
    if (Number.isFinite(value)) {
      inputs.nuP.value = clampNu(value).toString();
    } else {
      inputs.nuP.value = DEFAULTS.nuP.toString();
    }
  });
}