// Arm for the servo horn with a cup for the 15x4 mm carriage magnet (print 1). Screw it to
// the single-arm horn. With the magnet up it should just kiss the underside of the board;
// tune the angles in the app (Board -> Calibration).
include <common.scad>
ARM = 26;
difference() {
  union() {
    hull() {
      cylinder(d = 9, h = 4);
      translate([ARM, 0, 0]) cylinder(d = CARRIAGE_MAG_D + 4, h = 4);
    }
    translate([ARM, 0, 0]) cylinder(d = CARRIAGE_MAG_D + 4, h = CARRIAGE_MAG_H + 1.2);
  }
  translate([0, 0, -1]) cylinder(d = 7.4, h = 2.6);                 // horn hub recess
  for (x = [7, 11, 15]) translate([x, 0, -1]) cylinder(d = 1.8, h = 6); // horn screw holes
  translate([ARM, 0, 1.2]) cylinder(d = CARRIAGE_MAG_D, h = 10);      // magnet cup
}
