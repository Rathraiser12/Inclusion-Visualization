// src/index.ts
import { setupUI }      from './ui/controls';
import { initRender }   from './render/draw';
import { setupTooltips } from './ui/tooltips';

setupUI();         // wires up DOM → state
initRender();      // allocates WebGL & starts the loop
setupTooltips();  // initializes tooltips for UI elements
