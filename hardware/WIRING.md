# Wiring and schematic

All pin numbers are in `firmware/OpenRook/config.h`; change them there if you wire differently.

## Block diagram

```
 12 V 2 A ──┬──────────────► TMC2209 #A  VM ──► Motor A (back left)
 barrel     ├──────────────► TMC2209 #B  VM ──► Motor B (back right)
 jack       │  100 µF across each VM/GND
            └─► Buck 12→5 V ─┬─► ESP32 VIN (5 V)
                              └─► Servo + (5 V)   (servo GND to common GND)

 ESP32 3V3 ──► TMC2209 VIO (both), MCP23017 VCC, WS2812 VDD*
 GND everywhere is common (12 V, 5 V, ESP32, drivers, MCP23017, servo).
 *A WS2812 is happiest on 5 V; at 3.3 V a single LED works fine.
```

## ESP32 pin map

| ESP32 GPIO | Goes to | Notes |
| --: | --- | --- |
| 25 | Driver A STEP | |
| 26 | Driver A DIR | |
| 27 | Driver B STEP | |
| 14 | Driver B DIR | |
| 13 | Both drivers EN | low = motors on |
| 32 | X endstop | switch to GND (internal pull-up) |
| 33 | Y endstop | switch to GND (internal pull-up) |
| 18 | Servo signal | servo powered from 5 V |
| 21 | MCP23017 SDA | 4.7 kΩ pull-ups are on most modules |
| 22 | MCP23017 SCL | |
| 23 | WS2812 DIN | via 330 Ω |
| 19 | Buzzer + | buzzer − to GND |

TMC2209 modules: tie MS1/MS2 for 16 microsteps (on most modules both LOW = 8, check yours: the
firmware assumes 80 steps/mm, which is 16 microsteps with 20T pulleys; at 8 microsteps set
`STEPS_PER_MM` to 40). Set the current with the Vref pot to about 0.6 A (Vref ≈ 0.85 V on a
typical TMC2209 module); the load is tiny.

## The 8×8 sensor matrix

Each square has a reed switch and a diode in series between its **rank line** and its
**file line**. A piece's magnet closes the switch.

```
 MCP23017                                   squares (rank 1 shown)
 GPA0 ── rank 1 ──┬────────────┬────────────┬──── … (8 squares)
                  │            │            │
                 ─┴─ 1N4148   ─┴─          ─┴─        cathode (band) towards the rank line
                  ▲            ▲            ▲
                  │            │            │
                 reed         reed         reed
                  │            │            │
 GPB0 ── file a ──┘            │            │
 GPB1 ── file b ───────────────┘            │
 GPB2 ── file c ────────────────────────────┘
  …
 GPA0..GPA7 = ranks 1..8      GPB0..GPB7 = files a..h
 A0, A1, A2 → GND (address 0x20), RESET → 3V3, VCC → 3V3
```

The firmware drives one rank low at a time and reads the eight files (with pull-ups); a low
file means a piece on that square. The diodes stop current flowing backwards through other
closed switches ("ghosting"), so every combination of pieces reads correctly.

In the tiles the switch sits in the groove at the square's centre, along the file direction;
the diode sits in the small groove beside it; the rank wire runs in the long groove under
each row of squares and the file wire in the long groove beside each column. Use enamelled
wire for the long runs (scrape the enamel where you solder) and join the four tiles' wires at
their edges, then bring 16 wires to the MCP23017.

**Test before you glue anything down**: flash the firmware, open *Board* in the app and put a
piece on every square; each one should light up on the screen.

## The gantry

```
   back  ┌──────────────────────────────────────────┐
         │ [Motor A]                     [Motor B]  │
         │    ║                              ║      │
         │ ═══╬══════ X rods (2) ════════════╬═══   │    Y rods along the left and right
         │ [Y carriage]   [centre carriage]  [Y carriage]
         │    ║              magnet arm        ║      │
         │ [idlers]                       [idlers]  │
   front └──────────────────────────────────────────┘
```

CoreXY: both motors are fixed at the back; each belt runs from a motor around the idlers at
the front corner and on the Y carriages to one end of the centre carriage. Moving one motor
moves the carriage diagonally; both together move it along X or Y. The firmware does the
maths (A = X + Y, B = X − Y). If a direction comes out wrong, flip `INVERT_A_DIR` /
`INVERT_B_DIR` in `config.h` first; if X and Y are swapped, swap the motor connectors.

Endstops: X min on the left side (the carriage touches it at the far left), Y min at the
front. Home is front-left.
