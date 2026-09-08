# Inside a V6 — v1.0

An interactive teardown of one 3.2 litre, 60° V6 engine. 167 individually named
parts, solved kinematics, a scroll-driven decomposition, and documentation of
what each component is for.

No framework, no build step, no 3D library. The renderer is purpose-written
WebGL2 (`js/gl.js`); the engine geometry is generated in the browser
(`js/engine.js`) from the same eleven parameters as the Blender source model.

The one external request is a Google Fonts stylesheet for Fraunces, Space Grotesk
and Space Mono. If it fails, or you are offline, the page falls back to system
serif / sans / mono stacks and everything still works. To remove the third-party
request entirely, delete the two `<link rel="preconnect">` lines and the
`fonts.googleapis.com` link from `index.html`.

## Publishing to GitHub Pages

1. Create a repository.
2. Copy the contents of this folder into the repository root — `index.html` must
   sit at the top level — then commit and push.
3. **Settings → Pages**, source *Deploy from a branch*, branch `main`, folder
   `/ (root)`.
4. The site appears at `https://<user>.github.io/<repo>/` within a minute.

`.nojekyll` is included so GitHub serves every file as-is.

Locally: `python3 -m http.server 8000`, then open `http://127.0.0.1:8000`.

## Files

```
index.html        page shell and the reference section
css/style.css     palette, dark mode, type, and the chapter backdrops
js/gl.js          WebGL2 renderer — maths, geometry, surface shader, picking
js/engine.js      the V6 — geometry, materials, part copy, kinematics solver
js/content.js     every word of the scrolling section, and its camera pose
js/app.js         scroll choreography, backdrops, annotations, controls
.nojekyll         tells GitHub Pages not to run Jekyll
```

To change the writing or the framing of any step, edit `js/content.js` only.
Each entry is one step: camera pose, backdrop, focus group, copy, and callouts.

## How the scroll works

Thirteen steps, grouped into chapters. Steps in the same chapter are numbered
against each other — `CYLINDER HEAD 1/2` — in the header and on the card.

Each step owns a scroll block. The camera performs its entire move inside the
first third of that block on an exponential ease, then holds **completely
still** for the remaining two thirds, which is where the card and the callouts
appear. Nothing drifts while you are reading.

Every step has its own backdrop and its own lighting environment, which the
shader uses for reflections, so the metal belongs to the surface it sits on.

Parts outside the current subsystem are not hidden — they are drawn in flat
slate, keeping the silhouette of the whole engine visible while making it
obvious which components the text is about.

On screens narrower than 980px the floating callouts are replaced by a full
list inside the card, and each step's copy is split across two scroll slots so
only part of it is on screen at a time. Progress dots at the foot of the card
show which slot you are in.

## Decomposition

Two different separations, deliberately:

- **Sliced on one plane.** The assembly is cut by a plane inclined 45° to the
  crank axis. Parts are sorted into 52 mm slices along that plane's normal and
  drawn apart in order, like a sandwich. Parts sharing a slice travel together,
  so depth order is directly readable.
- **Spaced by assembly order.** Each part moves along its own axis of
  installation instead, which is the conventional exploded diagram.

## Surfaces

Materials are not flat colours. The fragment shader carries a value-noise field
and ten finish types — sand cast, machined, cast iron, brushed, powder coat,
shot peened, ribbed, heat tinted, forged, polished — each driving a normal
perturbation and a roughness variation. These match the procedural node
materials in the Blender source model one for one.

## How the engine moves

One number drives everything: crank angle, 0°–720°, one four-stroke cycle.

- **Piston position** from the slider-crank relation
  `s = d + sqrt(L² − r² − dx² + d²)`, where `d` is the projection of the crank
  pin onto that bank's axis, `r` the 43 mm crank radius, `L` the 150 mm rod and
  `dx` the 21 mm bank offset. Rod length holds constant to 5.6 × 10⁻¹⁴ mm at
  every angle; measured stroke is exactly 86.000 mm.
- **Connecting rods** are aimed from their own gudgeon pin at their own crank
  pin, so they cannot separate from either end.
- **Camshafts** turn at half crank speed. Valve lift is a raised-cosine lobe
  240° wide in crank degrees, offset by the 1-4-2-5-3-6 firing order — the same
  ordering that sequences the combustion events.
- **Fuel** burns in proportion to rpm. Below 18% the mixture leans out, so
  delivered rpm sags and oscillates; at zero the engine stalls.

## Controls

| Control | What it does |
|---|---|
| Start / Stop | Runs or halts the simulation |
| rpm | 600–7000; delivered rpm falls short of target when fuel is low |
| Refuel | Fills the tank to 100% |
| Teardown | Manual override of the exploded view; **Auto** returns it to the scroll |
| Click a part | Opens a card naming it and explaining what it does |
| Theme | Toggle top right; the choice is remembered |
| ^ | Back to top, appears after the first screen |

## Browser support

Needs WebGL2 — every current desktop and mobile browser. If it is unavailable
the page says so and the written content still reads normally.
