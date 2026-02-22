// src/ui/tooltips.ts

import tippy, { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';
import 'tippy.js/themes/translucent.css';

const geomLoadContent = document.createElement('div');
geomLoadContent.innerHTML = `
  <div style="max-width:90vw; text-align:center;">
    <img src="./schematic-plate-circular-inclusion.svg"
         alt="Schematic of the plate geometry and loading"
         style="max-width:500px; width:100%; height:auto; background:#fff;"/>
  </div>
`;

const tooltipContent: Record<string, any> = {
  '#geom-load-card-info': {
    content: geomLoadContent,
    allowHTML: true,
    theme: 'white-tip',
    trigger: 'mouseenter focus',
    arrow: false,
    placement: 'right',
    appendTo: document.body,
    maxWidth: 'none',   //  let your content define the width
    getReferenceClientRect: () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        width: 0,
        height: 0,
        top: vh / 2,
        bottom: vh / 2,
        left: vw / 2,
        right: vw / 2,
        x: vw / 2,
        y: vh / 2,
        toJSON: () => {},
      };
    },
  },
  '#material-card-info': {
    content:
      'Γ: Shear modulus ratio (Matrix/Inclusion)<br>ν<sub>M</sub>: Poisson\'s ratio of the matrix<br>ν<sub>P</sub>: Poisson\'s ratio of the inclusion',
    allowHTML: true,
  },
  '#view-card-info': {
    content:
      '<b>Pan:</b> Click and drag on the canvas.<br><b>Zoom:</b> Use the mouse wheel.<br><b>Reset View:</b> Double-click the canvas.',
    allowHTML: true,
  },
  '#stress-card-info': {
    content:
      'The dots on the canvas indicate the locations of the maximum and minimum stress values.',
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
      ...props,
    });
  }
}
