/* ============================================================================
   content.js — every word on the scrolling section, and the camera pose that
   goes with it. One entry per step. Steps that share a `chapter` are numbered
   against each other in the marker, e.g. ROTATING ASSEMBLY 2/2.
   ========================================================================== */
'use strict';

/* cam: tgt = look-at point (m), r = distance, th = azimuth°, ph = polar°,
        sx = lateral framing offset as a fraction of r (positive = engine left)
   mode: 'assembled' | 'sandwich' | 'exploded'
   focus: part group held at full material; everything else drops to context   */

const STEPS = [
  {
    chapter: 'Overview', bg: 'bg-stage', env: 'light',
    cam: { tgt: [0, 0, 0.15], r: 1.92, th: 228, ph: 68, sx: -0.20 },
    mode: 'assembled', focus: null, run: true, hero: true,
    eyebrow: '3.2 L · 60° V6 · DOHC 24v',
    title: 'A V6, drawn\nfrom its own\nnumbers.',
    lede: 'Every component on this page is generated from eleven dimensions — '
        + '89 mm bore, 86 mm stroke, 150 mm rods, 60° included angle. Nothing is '
        + 'positioned by hand.',
    body: '<b data-partcount>167</b> parts, and a single crank angle that drives '
        + 'all of them at once.',
    notes: []
  },

  {
    chapter: 'Decomposition', bg: 'bg-plane', env: 'cool',
    cam: { tgt: [0, 0, 0.16], r: 3.05, th: 206, ph: 70, sx: 0.13 },
    mode: 'sandwich', focus: null, run: false,
    title: 'Sliced on one plane.',
    body: 'The assembly is cut by a single plane inclined 45° to the crankshaft '
        + 'axis, and every part is drawn out along that plane\'s normal in the '
        + 'order it sits. Parts sharing a slice travel together.',
    body2: 'It is the quickest way to read depth: what lies behind what, and in '
        + 'roughly what sequence you would have to remove it.',
    notes: []
  },

  {
    chapter: 'Decomposition', bg: 'bg-blueprint', env: 'navy',
    cam: { tgt: [0, 0, 0.24], r: 3.05, th: 200, ph: 74, sx: -0.13 },
    mode: 'exploded', focus: null, run: false,
    title: 'Spaced by assembly order.',
    body: 'Now each part moves along its own axis of installation instead of a '
        + 'shared plane. The crankshaft is the datum; every other position is '
        + 'measured from it.',
    body2: 'Rods reach up out of the crank into pistons, pistons run in liners '
        + 'inside the block, heads cap the liners, camshafts sit on the heads. '
        + 'Induction fills the valley between the banks; exhaust leaves outboard.',
    notes: []
  },

  {
    chapter: 'Block', bg: 'bg-graph', env: 'cool',
    cam: { tgt: [0, 0, 0.04], r: 2.10, th: 122, ph: 72, sx: 0.15 },
    mode: 'exploded', focus: 'block', run: false,
    title: 'Cylinder block.',
    body: 'Aluminium, open-deck, with pressed-in cast iron liners at 89 mm bore '
        + 'and 114 mm bore spacing. Four bulkheads carry the crankshaft. The banks '
        + 'sit 60° apart and are offset 21 mm along the crank so opposing rods '
        + 'clear each other on a shared pin.',
    body2: 'The block makes no power. Its entire job is to hold every other part '
        + 'in the same place relative to every other part, while the assembly is '
        + 'shaken thousands of times a second and heated unevenly from the inside.',
    notes: [
      { part: 'V6_EngineBlock', title: 'Open-deck casting',
        body: 'The bore barrels stand free of the outer wall, so coolant surrounds '
            + 'each one. Cheaper to cast and better at shedding heat, at some cost '
            + 'in top-end rigidity.' },
      { part: 'V6_Liner_1', title: 'Cast iron liner',
        body: 'Aluminium is far too soft to be a running surface. The bore the rings '
            + 'actually slide on is a separate iron sleeve, 6 mm wall.' },
      { part: 'V6_MainCap_2', title: 'Main bearing cap',
        body: 'Clamps the crank journal through a plain bearing shell. The crank never '
            + 'touches metal here — it floats on a pressurised oil film a few microns thick.' }
    ]
  },

  {
    chapter: 'Rotating assembly', bg: 'bg-rotary', env: 'navy',
    cam: { tgt: [0, 0, -0.05], r: 1.58, th: 148, ph: 78, sx: -0.14 },
    mode: 'exploded', focus: 'crank', run: false,
    title: 'Crankshaft.',
    body: 'Forged steel, three throws at 120°, 43 mm crank radius, four main '
        + 'journals. Each throw carries two connecting rods side by side — one '
        + 'from each bank — which is why six cylinders need only three throws.',
    body2: 'The counterweights opposite each throw are not there to store energy. '
        + 'They balance the mass of the pistons and rods, each of which changes '
        + 'direction 200 times a second at 6000 rpm under roughly two tonnes of load.',
    notes: [
      { part: 'V6_Crankshaft', title: 'Three throws, 120° apart',
        body: 'Combined with the 60° bank angle this gives an even 120° firing '
            + 'interval, so the engine delivers power at regular intervals rather '
            + 'than in an uneven pattern.' },
      { part: 'V6_Flywheel', title: 'Flywheel',
        body: 'Six power strokes per two revolutions still arrive as six separate '
            + 'impulses. The flywheel stores energy between them so the output feels '
            + 'like torque rather than hammering.' },
      { part: 'V6_CrankPulley', title: 'Damper pulley',
        body: 'The crank twists and springs back each time a cylinder fires. A rubber '
            + 'ring between hub and rim absorbs that oscillation before it cracks the nose.' }
    ]
  },

  {
    chapter: 'Rotating assembly', bg: 'bg-stroke', env: 'light',
    cam: { tgt: [0.02, 0, 0.26], r: 1.80, th: 172, ph: 66, sx: 0.15 },
    mode: 'exploded', focus: 'piston', run: false,
    title: 'Pistons and rods.',
    body: 'Forged pistons on 150 mm rods — a rod/stroke ratio of 1.74. Two '
        + 'compression rings and one oil control ring each. The gudgeon pin is '
        + 'fully floating, retained by a circlip at either end.',
    body2: 'Because the rod swings as it travels, the piston does not move as a '
        + 'clean sine wave. It lingers near the bottom of the bore and hurries '
        + 'through the top, which gives combustion pressure more crank angle to '
        + 'push against on the way down.',
    notes: [
      { part: 'V6_Piston_1', title: 'Piston and ring pack',
        body: 'Two compression rings hold roughly 60 bar of burning gas above the '
            + 'piston; the oil ring below scrapes the bore clean so oil never reaches '
            + 'the flame.' },
      { part: 'V6_ConRod_1', title: 'Connecting rod',
        body: '150 mm between centres, I-beam section. The split big end is what allows '
            + 'the crankshaft to be a single solid forging.' },
      { part: 'V6_WristPin_3', title: 'Gudgeon pin',
        body: 'The hinge between piston and rod. Fully floating — free to turn in both '
            + 'the piston and the rod, which spreads wear over the whole surface.' }
    ]
  },

  {
    chapter: 'Cylinder head', bg: 'bg-sketch', env: 'warm',
    cam: { tgt: [0, 0, 0.50], r: 2.20, th: 196, ph: 62, sx: -0.14 },
    mode: 'exploded', focus: 'head', run: false,
    title: 'Cylinder heads.',
    body: 'Aluminium, four valves per cylinder in a pentroof chamber with the plug '
        + 'in the centre. Intake ports face into the vee, exhaust ports outboard. '
        + 'Head bolts are torque-to-yield: stretched past their elastic limit on '
        + 'assembly and replaced every time.',
    body2: 'Displacement says how much air an engine could take in. The head decides '
        + 'how much it actually gets — and because fuel is burned in proportion to '
        + 'air, the head is what sets the ceiling on power.',
    notes: [
      { part: 'V6_Head_A', title: 'Pentroof chamber',
        body: 'Two valves per side, angled to form a shallow roof. Plug at the apex, '
            + 'so the flame front reaches every part of the bore at about the same time.' },
      { part: 'V6_HeadGasket_A', title: 'Multi-layer steel gasket',
        body: 'A shim under 4 mm thick that has to seal combustion pressure, coolant '
            + 'and oil across one joint, through every heat cycle. It is what fails '
            + 'when an engine overheats.' },
      { part: 'V6_ValveCover_A', title: 'Cam cover',
        body: 'Encloses the camshafts and returns splash oil to the sump. Mounted on '
            + 'rubber grommets so the thin panel does not drum with valvetrain noise.' }
    ]
  },

  {
    chapter: 'Cylinder head', bg: 'bg-timing', env: 'cool',
    cam: { tgt: [0, 0, 0.60], r: 2.20, th: 222, ph: 60, sx: 0.14 },
    mode: 'exploded', focus: 'valve', run: false,
    title: 'Valvetrain.',
    body: 'Four camshafts turning at exactly half crank speed, acting on bucket '
        + 'tappets. 10.5 mm lift, 240° duration measured in crank degrees; the '
        + 'intake lobe is centred 450° after firing TDC and the exhaust lobe 270°.',
    body2: 'Nothing pulls a valve shut — a spring does. Past a certain rpm the spring '
        + 'can no longer accelerate the valve fast enough to follow the lobe. The valve '
        + '“floats”, cylinder filling collapses, and that limit is usually what sets '
        + 'an engine\'s redline.',
    notes: [
      { part: 'V6_Cam_A_IN', title: 'Camshaft, half crank speed',
        body: 'A four-stroke cycle takes two crank revolutions, so each valve must open '
            + 'once every two — hence the 2:1 reduction in the timing chain.' },
      { part: 'V6_Valve_1_IN_1', title: 'Intake valve',
        body: 'Larger than the exhaust valve, because drawing air in against nothing but '
            + 'atmospheric pressure is harder than pushing burnt gas out under pressure.' },
      { part: 'V6_Spring_1_EX_1', title: 'Valve spring',
        body: 'Must close the valve and keep the tappet on the lobe at every speed. Too '
            + 'soft and the valve floats; too stiff and it eats power and wears the cam.' }
    ]
  },

  {
    chapter: 'Gas exchange', bg: 'bg-flow', env: 'cool',
    cam: { tgt: [0, 0, 0.58], r: 2.10, th: 252, ph: 56, sx: -0.14 },
    mode: 'exploded', focus: 'intake', run: false,
    title: 'Induction.',
    body: 'One throttle body feeding a shared plenum in the vee, then six '
        + 'individually tuned runners. The manifold is moulded composite rather '
        + 'than cast aluminium: lighter, and it keeps intake air cooler because '
        + 'plastic conducts far less heat from the engine.',
    body2: 'Air does not flow smoothly into an engine — it arrives in pulses, one per '
        + 'cylinder. The plenum evens those out, and the runners exploit them: the '
        + 'pressure wave reflected from the plenum returns to the valve just before '
        + 'it closes and packs in extra air, at no cost. Long runners suit low rpm, '
        + 'short ones high.',
    notes: [
      { part: 'V6_IntakePlenum', title: 'Plenum',
        body: 'A shared volume large enough that one cylinder drawing in does not starve '
            + 'the next one in the firing order.' },
      { part: 'V6_ThrottleBody', title: 'Throttle body',
        body: 'A single butterfly plate meters air for all six cylinders. Everything the '
            + 'driver calls throttle happens here — the fuel simply follows the air.' },
      { part: 'V6_Runner_3', title: 'Tuned runner',
        body: 'Length is calculated, not routed. It sets the rpm at which the returning '
            + 'pressure wave arrives in time to help, which is where the torque peak lands.' }
    ]
  },

  {
    chapter: 'Gas exchange', bg: 'bg-heat', env: 'warm',
    cam: { tgt: [0.08, 0, 0.02], r: 2.32, th: 286, ph: 68, sx: 0.15 },
    mode: 'exploded', focus: 'exhaust', run: false,
    title: 'Exhaust.',
    body: 'Equal-length primaries, three per bank, merging into one collector. The '
        + 'exhaust valve opens while cylinder pressure is still around 4 bar, so '
        + 'the first gas out — the blowdown pulse — leaves at close to the speed '
        + 'of sound.',
    body2: 'That fast slug leaves a low-pressure wave behind it. If the primary is the '
        + 'right length, the low pressure arrives back at the valve during overlap, the '
        + 'brief window when both valves are open, and helps draw the next intake charge '
        + 'in. Get the lengths wrong and one cylinder pushes its exhaust into another\'s pipe.',
    notes: [
      { part: 'V6_Header_1', title: 'Equal-length primary',
        body: 'Matched lengths mean every cylinder gets the same scavenging pulse at the '
            + 'same rpm, so all six make the same torque.' },
      { part: 'V6_Collector_A', title: 'Collector',
        body: 'Where three primaries merge. The oxygen sensor screwed in here reads what '
            + 'actually burned, and the ECU trims injector pulse width from it.' }
    ]
  },

  {
    chapter: 'Fuel & ignition', bg: 'bg-ignition', env: 'navy',
    cam: { tgt: [0, 0, 0.44], r: 2.00, th: 316, ph: 62, sx: -0.14 },
    mode: 'exploded', focus: 'fuel', run: false,
    title: 'Fuel and ignition.',
    body: 'Port injection — one injector per cylinder spraying into the intake '
        + 'port, fed from two rails held at regulated pressure. Pulse width runs '
        + 'from about 2 ms at idle to 12 ms at full load. Spark occurs before top '
        + 'dead centre and advances as rpm rises.',
    body2: 'The ECU never measures fuel. It measures air, then holds each injector open '
        + 'for a calculated number of milliseconds. Ignition is early because flame needs '
        + 'time to cross the chamber — fire exactly at the top and peak pressure arrives '
        + 'too late to push on anything.',
    notes: [
      { part: 'V6_FuelRail_A', title: 'Fuel rail',
        body: 'Holds petrol at a regulated pressure so that identical opening times give '
            + 'identical fuel quantities to all six cylinders.' },
      { part: 'V6_Injector_2', title: 'Injector',
        body: 'A solenoid valve opening for a few milliseconds per cycle. That opening '
            + 'time is the entire fuel system, and it is what the fuel control below scales.' },
      { part: 'V6_SparkPlug_4', title: 'Spark plug',
        body: 'Central in the chamber so the flame travels the same distance in every '
            + 'direction. Fires several degrees early; the faster the engine turns, the '
            + 'earlier it has to fire.' }
    ]
  },

  {
    chapter: 'Drive', bg: 'bg-belt', env: 'light',
    cam: { tgt: [-0.04, 0, 0.06], r: 2.00, th: 348, ph: 70, sx: 0.15 },
    mode: 'exploded', focus: 'drive', run: false,
    title: 'Drive and accessories.',
    body: 'Flywheel and 96-tooth starter ring at the rear; damper pulley and '
        + 'serpentine belt at the front. Behind the timing cover, a chain keeps '
        + 'all four camshafts in phase with the crankshaft.',
    body2: 'An engine never keeps all of its own output — the belt takes some for the '
        + 'water pump, alternator and air conditioning. One jumped tooth on the timing '
        + 'chain and valve timing is wrong on every cylinder at once.',
    notes: [
      { part: 'V6_RingGear', title: 'Starter ring gear',
        body: '96 teeth shrunk onto the flywheel rim. The starter engages here, and the '
            + 'crank position sensor counts these same teeth to know where the engine is.' },
      { part: 'V6_DriveBelt', title: 'Serpentine belt',
        body: 'One belt, several accessories. It is the only part on this engine designed '
            + 'to be replaced on a schedule rather than on failure.' },
      { part: 'V6_TimingCover', title: 'Timing cover',
        body: 'Seals the chain drive and carries the front crank seal. Behind it, the 2:1 '
            + 'reduction that makes the camshafts turn at half crank speed.' }
    ]
  },

  {
    chapter: 'Running', bg: 'bg-stage', env: 'light',
    cam: { tgt: [0, 0, 0.13], r: 1.78, th: 392, ph: 69, sx: -0.17 },
    mode: 'assembled', focus: null, run: true,
    title: 'One number drives all of it.',
    body: 'Crank angle, 0° to 720°, one complete four-stroke cycle. Piston position '
        + 'is solved from the slider-crank relation; each rod is aimed from its '
        + 'gudgeon pin at its crank pin; valve lift is a raised-cosine lobe offset '
        + 'by the 1-4-2-5-3-6 firing order.',
    body2: 'No part carries an animation of its own, so nothing can drift out of '
        + 'agreement however you change the speed. Set the rpm below, watch the tank '
        + 'drain, refuel it. Under 18% the mixture runs lean and rpm sags; at zero it '
        + 'stalls until you refill.',
    notes: []
  }
];
