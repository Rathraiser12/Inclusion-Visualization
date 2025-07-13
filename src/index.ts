// src/index.ts
import { setupUI }      from './ui/controls';
import { initRender }   from './render/draw';

setupUI();         // wires up DOM → state
initRender();      // allocates WebGL & starts the loop
