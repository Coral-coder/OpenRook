// Case for the electronics perfboard (70 x 90 mm): ESP32 DevKit, two TMC2209 drivers,
// MCP23017 and the 12 V input. Screws to the frame's inner face with two M5 + T-nuts.
// Print the box and the lid (-D PART="lid").
include <common.scad>
PART = "box";
IN = [96, 76, 36];
T = 2.4;
module box() {
  difference() {
    rounded_box([IN[0] + 2 * T, IN[1] + 2 * T, IN[2] + T], 3);
    translate([T, T, T]) cube([IN[0], IN[1], IN[2] + 1]);
    translate([-1, T + 10, T + 6]) cube([T + 2, 12, 8]);              // USB
    translate([-1, T + 34, T + 6]) rotate([0, 90, 0]) cylinder(d = 8.2, h = T + 2); // 5.5x2.1 barrel jack
    translate([IN[0] + T - 1, T + 8, T + 10]) cube([T + 2, IN[1] - 16, 12]);       // cable exit
    for (x = [T + 20, T + IN[0] - 20]) translate([x, IN[1] + T - 1, T + IN[2] / 2]) rotate([-90, 0, 0]) cylinder(d = M5, h = T + 2);
    for (i = [0:7]) translate([T + 20 + i * 8, -1, T + 20]) cube([3, T + 2, 12]); // vents for the drivers
  }
  // perfboard standoffs (70 x 90 board, 2.5 mm from each edge)
  for (x = [T + 3 + 2.5, T + 3 + 87.5], y = [T + 3 + 2.5, T + 3 + 67.5])
    translate([x, y, T]) difference() { cylinder(d = 6, h = 5); cylinder(d = 2.6, h = 6); }
}
module lid() {
  difference() {
    union() {
      rounded_box([IN[0] + 2 * T, IN[1] + 2 * T, T], 3);
      translate([T + 0.3, T + 0.3, T]) difference() {
        cube([IN[0] - 0.6, IN[1] - 0.6, 3]);
        translate([1.6, 1.6, -1]) cube([IN[0] - 3.8, IN[1] - 3.8, 5]);
      }
    }
    translate([(IN[0] + 2 * T) / 2, (IN[1] + 2 * T) / 2, -1]) cylinder(d = 5.2, h = T + 2); // status LED
  }
}
if (PART == "lid") lid(); else box();
