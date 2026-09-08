<h1 align="center">
      V6 Engine Model Visualizer
   </h1>
<p align="center">
   A single self-contained web page about one 60° V6 engine: 155 individually named
   parts, a scroll-driven shatter-then-explode sequence, labelled callouts for every
   subsystem, and a live running engine you can start, rev, drain of fuel and refuel.
</p>

<p align="center">
   No frameworks, no CDN, no build step, no network calls. The 3D is a purpose-written
   WebGL2 renderer (`js/gl.js`) and the engine geometry is generated procedurally in the
   browser (`js/engine.js`) from the same parameters as the Blender source model.
</p>


<div align="center">
   
 ![WebGl2.0](https://img.shields.io/badge/-WebGL2.0-05122A?style=flat&logo=WebGL)&nbsp;
 ![Three.js](https://img.shields.io/badge/Three.js-000000?logo=three.js&logoColor=white) 
 ![License](https://img.shields.io/github/license/MuhammadAbbas010/V6-engine-site)
![Status](https://img.shields.io/badge/Status-Experimental-orange)
</div>

<br>

## Running it locally

Open `index.html` directly, or for a closer match to production:

```
python3 -m http.server 8000
# then visit http://127.0.0.1:8000
```

## Files

```
index.html        page structure and all written content
css/style.css     the whole visual design
js/gl.js          WebGL2 renderer: matrix maths, geometry builders, shader, picking
js/engine.js      the V6 — geometry, part metadata, and the kinematics solver
js/app.js         scroll choreography, camera keyframes, labels, live controls
.nojekyll         tells GitHub Pages not to run Jekyll
```

## How the engine moves

Nothing is keyframed. One number drives everything: crank angle, 0° to 720°, one
complete four-stroke cycle.

- **Piston position** is solved from the slider-crank relation
  `s = d + sqrt(L² − r² − dx² + d²)`, where `d` is the projection of the crank pin
  onto that bank's axis, `r` is the 43 mm crank radius and `L` the 150 mm rod.
  Measured stroke comes out at exactly 86.000 mm and the rod length stays constant
  to 5.6e-14 mm at every angle.
- **Connecting rods** are aimed by pointing them from their gudgeon pin at their
  crank pin, so they can never detach from either end.
- **Camshafts** turn at half crank speed. Valve lift is a cosine lobe 240° wide in
  crank degrees, centred on that cylinder's intake or exhaust event and offset by
  its place in the 1-4-2-5-3-6 firing order.
- **Fuel** burns in proportion to rpm. Below 18% in the tank the mixture goes lean,
  so rpm sags and oscillates; at zero the engine stalls.

## Controls

| Control | What it does |
|---|---|
| START / STOP ENGINE | Runs or halts the simulation |
| Target rpm | 600–7000; actual rpm falls short of it when fuel is low |
| REFUEL | Fills the tank back to 100% |
| Teardown | Manual override of the exploded view; **AUTO** hands it back to the scroll |
| Click any part | Opens a card naming it and explaining what it does |
