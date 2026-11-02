// Holds the end of an 8 mm Y rod against the inside face of a side extrusion (print 4).
// The rod axis sits 30 mm below the top of the frame and 14 mm in from the extrusion face.
include <common.scad>
DROP = 30;   // rod axis below the frame top
INSET = 14;  // rod axis away from the extrusion face
difference() {
  union() {
    cube([6, 30, DROP + 12]);                         // plate against the extrusion
    translate([0, 0, 0]) cube([INSET + 10, 30, 14]);  // arm under the rod
  }
  // M5 into the extrusion slot (centre of a 2020's inner face is 10 mm below the top).
  translate([-1, 15, DROP + 12 - 10]) rotate([0, 90, 0]) cylinder(d = M5, h = 8);
  translate([5, 15, DROP + 12 - 10]) rotate([0, 90, 0]) cylinder(d = 10, h = 30);
  // Rod socket from the inner side, with a pinch slot and an M3 clamp screw.
  translate([INSET, -1, 14 - (DROP + 12 - DROP)]) rotate([-90, 0, 0]) cylinder(d = ROD_FIT, h = 26);
  translate([INSET - 0.75, -1, -1]) cube([1.5, 26, 6]);
  translate([INSET - 8, 12, 2.5]) rotate([0, 90, 0]) cylinder(d = M3, h = 20);
}
