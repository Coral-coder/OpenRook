// The centre carriage: slides on both X rods (LM8UU each), clamps the belt ends and holds
// the SG90 servo that lifts the magnet arm up to the underside of the board.
include <common.scad>
L = ROD_SPACING_X + 26;  // along Y
W = 52;                  // along X
H = 20;
difference() {
  union() {
    cube([W, L, H]);
    // servo tower on top, between the rods
    translate([W / 2 - SERVO_TAB / 2 - 2, L / 2 - SERVO_W / 2 - 3, H]) cube([SERVO_TAB + 4, SERVO_W + 6, 14]);
  }
  for (y = [L / 2 - ROD_SPACING_X / 2, L / 2 + ROD_SPACING_X / 2]) {
    translate([-1, y, H / 2]) rotate([0, 90, 0]) cylinder(d = LM8UU_D, h = W + 2);
    translate([-1, y - 1, -1]) cube([W + 2, 2, H / 2]);
  }
  // servo pocket (body down into the tower) and tab screws
  translate([W / 2 - SERVO_L / 2, L / 2 - SERVO_W / 2, H - 6]) cube([SERVO_L, SERVO_W, 30]);
  for (x = [-1, 1]) translate([W / 2 + x * (SERVO_TAB / 2 - 2.3), L / 2, H]) cylinder(d = 2, h = 20);
  // belt clamps: four slots, two at each end, at two heights (one per belt)
  for (x = [4, W - 10], z = [3, H - 3 - BELT_W]) {
    translate([x, -1, z]) cube([6, 8, BELT_W + 0.6]);
    translate([x, L - 7, z]) cube([6, 8, BELT_W + 0.6]);
  }
  for (x = [7, W - 7], y = [9, L - 9]) translate([x, y, -1]) cylinder(d = M3, h = H + 2);
}
