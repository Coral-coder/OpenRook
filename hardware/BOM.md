# Parts to buy

Everything here is a common hobby part (AliExpress / Amazon / any 3D-printer shop). Prices are
rough 2026 USD for the cheapest sensible option; the whole board comes to about **$110–150**
plus filament.

## Electronics

| Qty | Part | Notes | ~$ |
| --: | --- | --- | --: |
| 1 | ESP32 DevKit V1 (ESP32-WROOM-32, 38-pin) | the brain; Bluetooth LE to the app | 5 |
| 2 | TMC2209 stepper driver module (or A4988) | TMC2209 is near-silent; set to 16 microsteps (MS1/MS2 per your module) | 8 |
| 2 | NEMA17 stepper motor, 40 mm body, ≥ 0.4 Nm | the CoreXY motors | 18 |
| 1 | MCP23017 module (I²C, address 0x20) | reads the 8×8 sensor matrix with two wires | 2 |
| 64 | Reed switch, 2×14 mm glass, normally open | one per square (buy 70: the glass breaks if you bend the legs at the glass) | 6 |
| 64 | 1N4148 diode (DO-35) | one per switch so several pieces read correctly | 2 |
| 1 | SG90 or MG90S micro servo | lifts the magnet (MG90S metal gear lasts longer) | 3 |
| 2 | Microswitch (KW12 / "3D printer endstop") | X and Y homing | 2 |
| 1 | WS2812B LED (single, or a 5 mm "NeoPixel") | status light; optional | 1 |
| 1 | Passive buzzer, 5 V | optional | 1 |
| 1 | 12 V 2 A power supply, 5.5×2.1 mm barrel | motors | 7 |
| 1 | Buck converter 12 V → 5 V, ≥ 2 A (MP1584 / LM2596 module) | ESP32 + servo | 2 |
| 1 | Barrel jack socket 5.5×2.1 mm | | 1 |
| 1 | 100 µF 25 V electrolytic capacitor ×2 | across each driver's motor supply | 1 |
| 1 | 70×90 mm perfboard, pin headers, Dupont wire, 0.2 mm² hookup wire | | 6 |
| ~6 m | Thin enamelled or 30 AWG wire | the matrix wiring inside the tile grooves | 3 |

## Magnets

| Qty | Part | Notes | ~$ |
| --: | --- | --- | --: |
| 32 | N52 disc magnet 10 × 3 mm | one under each piece, **all the same pole facing down** | 8 |
| 1 | N52 disc magnet 15 × 4 mm | on the lifting arm; must attract the pieces (test the side) | 1 |

## Mechanics

| Qty | Part | Notes | ~$ |
| --: | --- | --- | --: |
| 2 | 2020 aluminium extrusion, 560 mm | front and back of the frame | 8 |
| 2 | 2020 aluminium extrusion, 440 mm | sides (fit between front and back) | 6 |
| 4 | 2020 corner bracket + ~40 M5×10 screws and M5 T-nuts | | 6 |
| 2 | 8 mm smooth rod, 440 mm | Y rods (cut to fit between the rod holders) | 8 |
| 2 | 8 mm smooth rod, 470 mm | X rods (cut to fit between the Y carriages) | 8 |
| 6 | LM8UU linear bearing | 2 for the Y carriages, 4 for the centre carriage | 4 |
| 2 | GT2 pulley, 20 teeth, 5 mm bore, 6 mm belt | on the motors | 2 |
| 8 | F623ZZ flanged bearing (3×10×4 mm) | belt idlers, stacked in pairs | 3 |
| ~4 m | GT2 6 mm belt | two belts, each ~1.9 m | 4 |
| — | M3 screws (10–30 mm), nuts and washers | assorted kit | 4 |
| 1 | 3 mm sheet, 560 × 480 mm: hardboard, MDF, plywood or acrylic | the rigid board top; the printed tiles sit on it | 6 |
| 1 | Self-adhesive felt sheet | under every piece, so they glide | 3 |

## Printed (see `../3d-prints/`)

About 1.1 kg of PLA/PETG: 4 board tiles, 4 capture strips, 32 pieces (two colours), and the
gantry parts.

## Tools

Soldering iron, multimeter, 3D printer (bed ≥ 170 × 170 mm for the tiles), hex keys, a hacksaw
for the rods (or buy them cut), USB cable for flashing the ESP32.
