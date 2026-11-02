// NEMA17 mount for the two CoreXY motors at the back corners (print 2; the second one
// mirrored: openscad -D MIRROR=1). Motor shaft points up; the plate bolts to the back and
// side extrusions' inner faces.
include <common.scad>
MIRROR = 0;
T = 5;
module mount() {
  difference() {
    union() {
      translate([0, 0, 0]) cube([NEMA + 12, NEMA + 12, T]);          // motor plate
      cube([NEMA + 12, T, 30]);                                       // wall to back extrusion
      cube([T, NEMA + 12, 30]);                                       // wall to side extrusion
      for (p = [[NEMA + 12 - T, 0], [0, NEMA + 12 - T]]) hull() {     // gussets
        translate([p[0] == 0 ? 0 : NEMA + 12 - T, p[1] == 0 ? 0 : NEMA + 12 - T, 0]) cube([T, T, 30]);
        translate([T, T, 0]) cube([T, T, T]);
      }
    }
    translate([6 + NEMA / 2, 6 + NEMA / 2, -1]) {
      cylinder(d = NEMA_BOSS + 1, h = T + 2);
      for (x = [-1, 1], y = [-1, 1]) translate([x * NEMA_HOLES / 2, y * NEMA_HOLES / 2, 0]) hull() {
        cylinder(d = M3, h = T + 2);
        translate([x * 1.5, y * 1.5, 0]) cylinder(d = M3, h = T + 2); // a little slot to tension
      }
    }
    for (z = [20]) {
      for (x = [15, 40]) translate([x, -1, z]) rotate([-90, 0, 0]) cylinder(d = M5, h = T + 2);
      for (y = [15, 40]) translate([-1, y, z]) rotate([0, 90, 0]) cylinder(d = M5, h = T + 2);
    }
  }
}
if (MIRROR == 1) mirror([1, 0, 0]) mount(); else mount();
