// Front corner idlers for the CoreXY belts (print 2; second one with -D MIRROR=1).
// Two F623 bearings stacked on an M3x25 bolt, one belt above the other (belts run at two
// heights so they cross without touching).
include <common.scad>
MIRROR = 0;
T = 5;
GAP = 2 * F623_W + 2;    // two bearings + washers
module mount() {
  difference() {
    union() {
      cube([40, 40, T]);                        // lower arm
      translate([0, 0, T + GAP]) cube([40, 40, T]);  // upper arm
      cube([40, T, 2 * T + GAP]);
      cube([T, 40, 2 * T + GAP]);
    }
    translate([24, 24, -1]) cylinder(d = M3, h = 2 * T + GAP + 2);
    translate([24, 24, -1]) m3_nut_trap(3);
    for (x = [14, 32]) translate([x, -1, (2 * T + GAP) / 2]) rotate([-90, 0, 0]) cylinder(d = M5, h = T + 2);
    for (y = [14, 32]) translate([-1, y, (2 * T + GAP) / 2]) rotate([0, 90, 0]) cylinder(d = M5, h = T + 2);
  }
}
if (MIRROR == 1) mirror([1, 0, 0]) mount(); else mount();
