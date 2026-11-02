# Parts to buy

Two orders get you everything: one Mouser cart for the electronics, and a short list from Amazon
(or AliExpress / Misumi) for the mechanical bits Mouser doesn't sell. Roughly **$150 on Mouser +
$90 for the rest**, plus about 1.1 kg of filament.

## 1. Mouser: one upload

[`mouser-bom.csv`](mouser-bom.csv) has every electronic part with quantities (spares included).

1. Go to <https://www.mouser.com/bom/> (Mouser's **BOM Tool**; a free account is needed).
2. *Upload a file* → choose `mouser-bom.csv` → map the columns when asked: **Mouser Part Number**,
   **Manufacturer Part Number**, **Manufacturer**, **Quantity**.
3. Mouser matches each line by its part number. Lines without a Mouser number are matched by the
   manufacturer part number; if one shows as "not found" or "obsolete", pick the suggested
   equivalent (resistors, diodes, headers and the like have dozens of identical alternatives).
4. *Add all to cart* → check out.

What's in it:

| Ref | Part | Qty |
| --- | --- | --: |
| U2 | Espressif **ESP32-DevKitC-32E** | 1 |
| U5 | Microchip **MCP23017-E/SP** + 28-pin socket | 1 |
| — | Adafruit **324** NEMA-17 stepper, 12 V 350 mA | 2 |
| J2 | Adafruit **169** SG92R micro servo | 1 |
| SW | Littelfuse **FLEX-14-10-15** reed switch, 14 mm, normally open | 70 |
| D | onsemi **1N4148** | 75 |
| U1 | TRACO **TSR 2-2450** 5 V 2 A regulator | 1 |
| J1 | Adafruit **798** 12 V power supply + Switchcraft **RAPC722X** jack | 1 + 1 |
| | Capacitors, resistors, 2N3904, buzzer, NeoPixel LED, two Omron SS-5GL endstops, headers and screw terminals | see CSV |

## 2. Everything else

Mouser doesn't stock the cheap StepStick-style TMC2209 driver modules, magnets or frame
hardware. Search terms that find the right thing:

| Qty | Part | Search for | ~$ |
| --: | --- | --- | --: |
| 2 | TMC2209 stepper driver module, **StepStick pinout** (with its small heatsink) | "BIGTREETECH TMC2209 V1.3" (usually a 2- or 4-pack) | 12 |
| 40 | N52 disc magnet **10 × 3 mm** (under each piece; spares) | "10x3mm N52 neodymium disc magnet 50 pack" (or supermagnete.com S-10-03-N52N) | 8 |
| 2 | N52 disc magnet **15 × 4 mm** (on the lifting arm; one spare) | "15x4mm N52 magnet" | 4 |
| 2 + 2 | 2020 aluminium extrusion, cut to **560 mm** ×2 and **440 mm** ×2 | "2020 V-slot extrusion 560mm" (or Misumi HFS5-2020 cut to length) | 22 |
| 1 kit | 2020 corner brackets ×4, M5×10 screws and M5 T-nuts ×40 | "2020 corner bracket kit M5 T nut" | 8 |
| 2 + 2 | 8 mm smooth rod, **440 mm** ×2 (Y) and **470 mm** ×2 (X) | "8mm linear rod 440mm" (or Misumi PSFJ8-440 / PSFJ8-470) | 16 |
| 6 | LM8UU linear bearing | "LM8UU 10 pack" | 6 |
| 2 | GT2 pulley, 20 teeth, 5 mm bore, 6 mm belt | "GT2 20T pulley 5mm bore" | 4 |
| 8 | F623ZZ flanged bearing 3×10×4 mm | "F623ZZ 10 pack" | 6 |
| 5 m | GT2 6 mm belt | "GT2 belt 6mm 5m" | 6 |
| 1 kit | M3 screws 8–30 mm, nuts, washers | "M3 screw assortment kit" | 8 |
| 1 | 3 mm hardboard / MDF / acrylic, 560 × 480 mm | hardware store, cut to size | 6 |
| 1 | Self-adhesive felt sheet | "adhesive felt sheet" | 4 |
| 1 | Perfboard 70 × 90 mm | "70x90 perfboard double sided" | 5 |
| 1 | 30 AWG enamelled wire (matrix) + 22 AWG hook-up wire | "30 AWG magnet wire", "22 AWG solid hookup wire kit" | 10 |
| 1 | Dupont jumper wires, female–female | "dupont jumper wires 40 pack" | 4 |

## 3. Printed

About 1.1 kg of PLA or PETG: see [`../3d-prints/README.md`](../3d-prints/README.md).

## Tools

Soldering iron and solder, multimeter (to set the driver current), small screwdriver, hex keys,
a hacksaw if your rods/extrusions come uncut, a USB cable that fits the ESP32 board (micro-USB or USB-C,
depending on the board revision).
