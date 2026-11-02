# Building the board

Plan on a weekend: a day of printing in the background, an afternoon of soldering the sensor
matrix, an afternoon of mechanics. Parts: [BOM.md](BOM.md). Wiring: [WIRING.md](WIRING.md).

## 1. Print

Start the tiles and pieces first (they take longest); see `../3d-prints/README.md`.

## 2. Frame

1. Bolt the four 2020 extrusions into a 560 × 480 mm rectangle with corner brackets (the 440 mm
   sides fit between the 560 mm front and back). Check it's square: equal diagonals.
2. Push the four feet onto the corners and bolt them with M5 + T-nuts.
3. Slide T-nuts into the inner slots of all four extrusions now; you'll need about 20.

## 3. Gantry (CoreXY)

1. Motor mounts at the two back corners, motors shaft-up, GT2 pulleys on the shafts at the
   same height as the idler bearings.
2. Idler mounts at the two front corners, each with two F623 bearings stacked on an M3×25
   (washers between and around them).
3. Rod holders: two on each side extrusion, near the front and back. Put an LM8UU in each Y
   carriage, slide the carriages onto the Y rods, and clamp the rods in the holders.
4. X rods: put the four LM8UU into the centre carriage (two per rod), slide it onto both X
   rods, then push the rod ends into the Y carriages and tighten the clamp screws. The carriage should glide end to end with no tight spots; loosen a holder
   and re-tighten if it binds.
5. Belts. Each belt is a loop through six points, at its own height (belt A on the lower
   bearings, belt B on the upper ones):
   - **Belt A**: centre carriage (left clamp) → left Y carriage's idler → back to motor A's
     pulley (back left) → forward along the left side → front-left idler → across the front →
     front-right idler → back along the right side → right Y carriage's idler → centre carriage
     (right clamp).
   - **Belt B**: the mirror image: centre carriage (right clamp) → right Y carriage → motor B
     (back right) → front-right idler → front-left idler → left Y carriage → centre carriage
     (left clamp).

   Tension both evenly (they should twang at the same note) and check the carriage moves
   square: when both motors turn the same way it should travel straight along X.
6. Endstops: X at the far left of the centre carriage's travel, Y at the front of the left Y
   carriage's travel, wired to GND and GPIO32 / GPIO33.
7. Servo into the centre carriage, magnet arm on its horn, 15 × 4 mm magnet glued in the cup
   with the pole that **attracts** the piece magnets facing up (test with a piece before the
   glue sets).

## 4. Sensor matrix

1. Lay the four tiles face down in their final arrangement (a1 tile front-left).
2. In each square's centre groove: a reed switch. Bend its legs with pliers holding the leg
   close to the glass, never the glass itself. Diode in the small groove, band towards the rank
   wire.
3. Rank wires: one per row of squares, across all tiles in the long grooves. File wires: one
   per column. Solder each switch → diode → rank wire, and each switch's other leg → file wire.
   16 wires leave the board at the left edge, to the MCP23017.
4. Test now, before anything is glued: flash the firmware and watch *Board* in the app while you
   touch a magnet to every square.
5. Press filament pins into the tile edges, join the tiles, glue them onto the 3 mm sheet, put
   the capture strips beside the a- and h-files.

## 5. Electronics

Build the perfboard per [WIRING.md](WIRING.md): ESP32, two TMC2209 (with 100 µF on their motor
supply), the MCP23017 module, the buck converter to 5 V, the barrel jack. Set the driver current
before connecting motors. Mount the case to the frame.

## 6. Bring-up

1. Lay the board top (sheet + tiles) on the frame.
2. Power on, connect from the app (*Board*), then follow the firmware README's *First power-up*:
   home, find the servo angles, calibrate a1 and h8.
3. Put a piece on e2 and press *Test: e2→e4*. If the piece lags behind the magnet, slow
   `DRAG_SPEED` or raise the servo's up angle so the magnet touches the board; if it drags its
   neighbours, check the felt and that the pieces' magnets all face the same way.
4. Set up the pieces and start a game against the computer.
