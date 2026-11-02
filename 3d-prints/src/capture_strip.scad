// A strip of 4 capture slots that sits beside the board (print 4: two per side). Captured
// pieces are parked here by the magnet. Same thickness as the tiles, no sensors.
include <common.scad>
difference() {
  cube([SQUARE, 4 * SQUARE, TILE_T]);
  for (r = [0:3]) translate([SQUARE / 2, (r + 0.5) * SQUARE, TILE_T - 0.6]) cylinder(d = PIECE_BASE + 4, h = 1);
}
