// Corner foot for the 2020 frame (print 4). Raises the frame so the gantry under the board
// clears the table. Slides onto the end of an extrusion corner and bolts with M5 + T-nut.
include <common.scad>
H = 60; // the gantry hangs about 45 mm below the top of the frame
difference() {
  union() {
    rounded_box([40, 40, H + 20], 4);
  }
  // Pocket for the corner where two extrusions meet (the frame sits on top of the legs).
  translate([-1, -1, H]) cube([EXTRUSION + 1, 41, 21]);
  translate([-1, -1, H]) cube([41, EXTRUSION + 1, 21]);
  translate([30, 30, -1]) cylinder(d = 14, h = H - 4); // lighten
  for (p = [[10, 30], [30, 10]]) translate([p[0], p[1], H - 10]) cylinder(d = M5, h = 12);
  for (p = [[10, 30], [30, 10]]) translate([p[0], p[1], -1]) cylinder(d = 10, h = H - 9);
}
