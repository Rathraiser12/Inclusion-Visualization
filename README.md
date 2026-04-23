### Visualization
The webapp visualizes the analytical stress field of an infinite plate with a circular inclusion at arbitrary far field loading by computing complex solid mechanics equations directly within WebGL2 fragment shaders for real-time rendering. Rather than relying on traditional discrete meshes or finite grids, the system utilizes a rectangular texture-based approach mapped to a fullscreen quad, allowing the analytical functions to be evaluated per-pixel at an effectively infinite resolution(play around with zooming). To accurately scale the visualization colormaps without sacrificing real-time performance, the backend extracts the global minimum and maximum stress bounds using a custom GPGPU ping-pong reduction algorithm that rapidly processes the generated texture through alternating framebuffers.

### Webpage 
 - the code is hostedd through gh-pages brranch and is availbe at [Inclusion Visualization](https://rathraiser12.github.io/Inclusion-Visualization/)

### Test run lcoally
- npm run dev
- need to remove the cdn and use the tailwind plugin for production 
### Bugs and Features
- maybe improve ui such that when the user hovers on the entry field it shows info on what it expects.
- make it professional with footnotes, copyright etc.

