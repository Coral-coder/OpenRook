// Chess pieces. Each has a pocket under the base for a 10x3 mm magnet (glue it in, all
// magnets the SAME way up: north facing down, and mark it). Stick felt over the bottom.
// Render one piece: openscad -D 'PIECE="queen"' -o queen.stl pieces.scad
// Print 16 of each colour: 8 pawns, 2 rooks, 2 knights, 2 bishops, 1 queen, 1 king.
// Pieces are small (20 mm base) so they can slide between others along the square edges.
include <common.scad>

PIECE = "set"; // pawn, rook, knight, bishop, queen, king, or "set" for one of each

R = PIECE_BASE / 2;

module base(h = 5) {
  difference() {
    rotate_extrude() polygon([[0, 0], [R, 0], [R, 1.4], [R - 0.8, 2.4], [R - 1.2, h], [0, h]]);
    translate([0, 0, -0.01]) cylinder(d = PIECE_MAG_D, h = PIECE_MAG_H);
  }
}

// Turned profile [radius, height] pairs from the base up; closed to the axis.
module turned(profile) {
  rotate_extrude() polygon(concat([[0, 0]], profile, [[0, profile[len(profile) - 1][1]]]));
}

module pawn() {
  base();
  translate([0, 0, 5]) turned([[7.5, 0], [6, 2], [4, 4], [3.2, 12], [5, 13], [5, 14], [3.5, 15]]);
  translate([0, 0, 25]) sphere(r = 5);
}

module rook() {
  base();
  translate([0, 0, 5]) difference() {
    turned([[8, 0], [6.5, 2], [5.5, 6], [5.2, 18], [7, 20], [7, 27]]);
    translate([0, 0, 24.5]) cylinder(r = 4.6, h = 5);
    for (a = [0, 60, 120]) rotate([0, 0, a]) translate([-1.3, -10, 24]) cube([2.6, 20, 5]);
  }
}

module bishop() {
  base();
  translate([0, 0, 5]) turned([[8, 0], [6.5, 2], [4.5, 5], [3.5, 18], [5.5, 19.5], [5.5, 20.5], [3.8, 21.5]]);
  translate([0, 0, 32]) difference() {
    scale([1, 1, 1.45]) sphere(r = 5.2);
    rotate([0, 0, 45]) translate([0, -5, 2]) rotate([0, 35, 0]) cube([1.6, 10, 10], center = false);
  }
  translate([0, 0, 40.5]) sphere(r = 1.8);
}

module queen() {
  base();
  translate([0, 0, 5]) turned([[8.5, 0], [7, 2], [5, 5], [3.8, 22], [6, 24], [6, 25], [4.2, 26], [6.2, 33]]);
  translate([0, 0, 38]) difference() {
    cylinder(r1 = 6.2, r2 = 6.6, h = 3);
    for (a = [0:30:330]) rotate([0, 0, a]) translate([6.6, 0, 1.5]) sphere(r = 1.6);
  }
  translate([0, 0, 42]) sphere(r = 2.4);
}

module king() {
  base();
  translate([0, 0, 5]) turned([[8.5, 0], [7, 2], [5, 5], [4, 24], [6.2, 26], [6.2, 27], [4.4, 28], [6.4, 35], [5, 37]]);
  translate([0, 0, 42]) {
    translate([-1.4, -1.4, 0]) cube([2.8, 2.8, 9]);
    translate([-4, -1.4, 4]) cube([8, 2.8, 2.6]);
  }
}

module knight() {
  base();
  translate([0, 0, 5]) turned([[8, 0], [6.5, 2], [5.5, 5], [5.5, 6]]);
  // Head: a profile extruded to 9 mm and smoothed with a slight taper.
  translate([0, 0, 10]) rotate([90, 0, 0]) translate([0, 0, -4.5])
    linear_extrude(height = 9, scale = 1)
      offset(r = 0.8) offset(delta = -0.8)
        polygon([[-6, 0], [6, 0], [5.5, 6], [4, 14], [3, 20], [1, 26], [-2, 28], [-4, 27],
                 [-9, 21], [-10, 18], [-8, 16.5], [-4, 18.5], [-2, 16], [-5, 9], [-6, 4]]);
  // Mane ridge
  translate([4.5, 0, 22]) rotate([0, -25, 0]) scale([0.5, 1, 2.5]) sphere(r = 2.6);
}

module piece(name) {
  if (name == "pawn") pawn();
  else if (name == "rook") rook();
  else if (name == "knight") knight();
  else if (name == "bishop") bishop();
  else if (name == "queen") queen();
  else if (name == "king") king();
}

if (PIECE == "set") {
  names = ["pawn", "rook", "knight", "bishop", "queen", "king"];
  for (i = [0:5]) translate([(i % 3) * 26, floor(i / 3) * 26, 0]) piece(names[i]);
} else {
  piece(PIECE);
}
