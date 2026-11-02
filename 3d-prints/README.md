# Printable parts

`stl/` has every part ready to slice; `src/` has the OpenSCAD sources (all sizes are in
`src/common.scad`). After changing a source run `./render.sh` (needs OpenSCAD) to rebuild the
STLs; CI renders them on every push too.

| File | Qty | Material / notes |
| --- | --: | --- |
| `board_tile.stl` | 4 | Light colour. Flat side up (grooves down, no supports). 0.2 mm layers. For two-colour squares, pause at 2.8 mm (the recess) and swap to the dark colour, or print `dark_square_inlay.stl` ×32 in the dark colour and press them in. Needs a 170 mm bed. |
| `dark_square_inlay.stl` | 32 | Optional, dark colour. |
| `capture_strip.stl` | 4 | Two each side of the board for captured pieces. |
| `piece_pawn.stl` | 16 | 8 in each colour. Wizard Chess set, see below. |
| `piece_rook.stl`, `piece_knight.stl`, `piece_bishop.stl` | 4 each | 2 in each colour. |
| `piece_queen.stl`, `piece_king.stl` | 2 each | 1 in each colour. |
| `foot.stl` | 4 | PETG or PLA, 4 walls. |
| `rod_holder.stl` | 4 | Holds the Y rods. |
| `motor_mount_left.stl` / `_right.stl` | 1 + 1 | PETG preferred (motors get warm). |
| `idler_mount_left.stl` / `_right.stl` | 1 + 1 | |
| `y_carriage_left.stl` / `_right.stl` | 1 + 1 | 4 walls, 40 % infill. |
| `xy_carriage.stl` | 1 | 4 walls, 40 % infill. |
| `magnet_arm.stl` | 1 | Screws to the servo horn. |
| `electronics_case.stl` + `electronics_case_lid.stl` | 1 + 1 | |

Pieces: the Wizard Chess statues (Meyerhouse's remix on MakerWorld, see
[LICENSE-wizard-chess.md](../LICENSE-wizard-chess.md)), scaled so the widest base is 20 mm (the king
is 56 mm tall), with the magnet pocket cut in. They were made from the downloaded `.3mf` by
`app/board3d/tools/import-wizard.mjs`, which also puts the same statues in the app. Print standing
up with a 0.08–0.12 mm layer height, a brim and tree supports (the swords, staffs, shields and the
knight's rearing horse overhang). After printing, glue a 10×3 mm magnet
into the pocket under each piece **with the same pole facing down on every piece** (stack the
magnets on a steel rod to keep their orientation, mark the bottom face with a marker), then cover
the bottom with felt. The 20 mm bases are deliberately small: the board slides pieces along the
lines between squares, and a wider base would bump its neighbours.

Total filament is about 1.1 kg.

These parts are the first version of the design: print one tile, one piece and the centre
carriage first and check them against your hardware (bearing and magnet sizes vary a little
between suppliers; adjust the numbers in `common.scad`).
