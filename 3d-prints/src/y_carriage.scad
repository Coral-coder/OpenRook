// Rides on a Y rod (one LM8UU) and holds the two X rods (print 2; second with -D MIRROR=1).
// Carries two F623 idler stacks that turn the belts towards the centre carriage.
include <common.scad>
MIRROR = 0;
L = 60;              // along Y
W = 34;              // along X
H = 22;
module carriage() {
  difference() {
    union() {
      translate([0, 0, 0]) cube([W, L, H]);
      // idler posts
      for (y = [6, L - 6]) translate([W + 6, y, 0]) cylinder(d = 10, h = H);
      translate([W - 1, 0, 0]) cube([8, L, 6]);
    }
    // LM8UU along Y
    translate([10, -1, H / 2]) rotate([-90, 0, 0]) cylinder(d = LM8UU_D, h = L + 2);
    translate([10 - 1, -1, -1]) cube([2, L + 2, H / 2]);           // pinch slot
    // X rod sockets (blind), centred in the block's height
    for (y = [L / 2 - ROD_SPACING_X / 2, L / 2 + ROD_SPACING_X / 2])
      translate([20, y, H / 2]) rotate([0, 90, 0]) cylinder(d = ROD_FIT, h = W);
    // rod clamp screws
    for (y = [L / 2 - ROD_SPACING_X / 2, L / 2 + ROD_SPACING_X / 2])
      translate([27, y, -1]) cylinder(d = M3, h = H + 2);
    // idler bolts
    for (y = [6, L - 6]) translate([W + 6, y, -1]) cylinder(d = M3, h = H + 2);
  }
}
if (MIRROR == 1) mirror([1, 0, 0]) carriage(); else carriage();
