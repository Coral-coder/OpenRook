// One playing tile: 4x4 squares (160 x 160 mm). Print 4 (one is a1-d4, the others the same
// part rotated). Underside: a groove at each square centre for a reed switch and its diode,
// and channels for the rank wires (along X) and file wires (along Y).
// Two-colour option: print with a filament swap at the INLAY_D height, or print the
// dark_square_inlay.scad pieces and press them in.
include <common.scad>

module tile() {
  n = TILE_SQUARES;
  difference() {
    cube([n * SQUARE, n * SQUARE, TILE_T]);
    // Dark squares recessed from the top (a1 is dark: (file + rank) even).
    if (INLAY_D > 0)
      for (f = [0:n - 1], r = [0:n - 1])
        if ((f + r) % 2 == 0)
          translate([f * SQUARE + 0.01, r * SQUARE + 0.01, TILE_T - INLAY_D]) cube([SQUARE - 0.02, SQUARE - 0.02, 1]);
    for (f = [0:n - 1], r = [0:n - 1]) {
      cx = (f + 0.5) * SQUARE;
      cy = (r + 0.5) * SQUARE;
      // Reed switch along Y, centred on the square so a piece's magnet sits over the glass.
      translate([cx - REED_W / 2, cy - REED_L / 2, -0.01]) cube([REED_W, REED_L, GROOVE_D]);
      // Diode beside it, towards the rank wire.
      translate([cx + 3, cy - REED_L / 2 - DIODE_L, -0.01]) cube([DIODE_W, DIODE_L, GROOVE_D]);
      // Leg channel from the switch to the diode.
      translate([cx - WIRE_W / 2, cy - REED_L / 2 - 2, -0.01]) cube([4 + DIODE_W, WIRE_W, GROOVE_D]);
    }
    // Rank wires (one per rank, along X, just below each square's switch).
    for (r = [0:n - 1])
      translate([-1, (r + 0.5) * SQUARE - REED_L / 2 - DIODE_L - 1.5, -0.01]) cube([n * SQUARE + 2, WIRE_W, GROOVE_D]);
    // File wires (one per file, along Y, beside each switch).
    for (f = [0:n - 1])
      translate([(f + 0.5) * SQUARE - REED_W / 2 - 3, -1, -0.01]) cube([WIRE_W, n * SQUARE + 2, GROOVE_D]);
    // Square-to-square leg channel from the switch top to the file wire.
    for (f = [0:n - 1], r = [0:n - 1])
      translate([(f + 0.5) * SQUARE - 3, (r + 0.5) * SQUARE + REED_L / 2 - WIRE_W, -0.01]) cube([3, WIRE_W, GROOVE_D]);
    // Alignment holes for 1.75 mm filament pins between tiles.
    for (p = [0.25, 0.75] * n * SQUARE) {
      translate([-0.01, p, TILE_T / 2 - 0.4]) rotate([0, 90, 0]) cylinder(d = 1.9, h = 6, $fn = 16);
      translate([n * SQUARE - 6 + 0.01, p, TILE_T / 2 - 0.4]) rotate([0, 90, 0]) cylinder(d = 1.9, h = 6, $fn = 16);
      translate([p, -0.01, TILE_T / 2 - 0.4]) rotate([-90, 0, 0]) cylinder(d = 1.9, h = 6, $fn = 16);
      translate([p, n * SQUARE - 6 + 0.01, TILE_T / 2 - 0.4]) rotate([-90, 0, 0]) cylinder(d = 1.9, h = 6, $fn = 16);
    }
  }
}

tile();
