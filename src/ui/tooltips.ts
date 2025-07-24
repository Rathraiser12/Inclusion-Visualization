import tippy, { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';
import 'tippy.js/themes/translucent.css';

// Define the content for each tooltip
const tooltipContent = {
  '#lambda-info': 'Biaxial load ratio (σ_yy / σ_xx). 1.0 is uniaxial, -1.0 is pure shear.',
  '#beta-info': 'Angle of the principal far-field stress, in degrees.',
  '#gamma-info': 'Shear modulus ratio of the matrix to the inclusion (μM / μP).',
  '#num-info': "Poisson's ratio of the matrix material.",
  '#nup-info': "Poisson's ratio of the inclusion material.",
};

export function setupTooltips() {
  for (const [selector, content] of Object.entries(tooltipContent)) {
    tippy(selector, {
      content: content,
      placement: 'top',
      animation: 'shift-away',
      arrow: roundArrow,
      theme: 'translucent',
    });
  }
}