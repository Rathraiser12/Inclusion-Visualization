// src/ui/tooltips.ts

import tippy, { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';
import 'tippy.js/themes/translucent.css';

const geomLoadContent = document.createElement('div');
geomLoadContent.innerHTML = `<img src="/schematic.png" alt="Schematic of the plate geometry and loading" style="max-width: 300px;"/>`;

const tooltipContent = {
  '#geom-load-card-info': {
    content: geomLoadContent,
    allowHTML: true,
  },
  '#material-card-info': {
    content: 'Γ: Shear modulus ratio (Matrix/Inclusion)<br>ν<sub>M</sub>: Poisson\'s ratio of the matrix<br>ν<sub>P</sub>: Poisson\'s ratio of the inclusion',
    allowHTML: true,
  },
  '#view-card-info': {
    content: '<b>Pan:</b> Click and drag on the canvas.<br><b>Zoom:</b> Use the mouse wheel.<br><b>Reset View:</b> Double-click the canvas.',
    allowHTML: true,
  },
  // ADD THIS NEW TOOLTIP
  '#stress-card-info': {
    content: 'The dots on the canvas indicate the locations of the maximum and minimum stress values.',
    allowHTML: true,
  },
};

export function setupTooltips() {
  for (const [selector, props] of Object.entries(tooltipContent)) {
    tippy(selector, {
      placement: 'top',
      animation: 'shift-away',
      arrow: roundArrow,
      theme: 'translucent',
      ...props
    });
  }
}