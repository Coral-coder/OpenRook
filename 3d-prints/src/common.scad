// OpenRook: shared dimensions for every printed part. Change a number here and re-run
// ../render.sh. Keep SQUARE in step with DEFAULT_SQUARE_MM in firmware/OpenRook/config.h.

$fn = 64;

// ---------------------------------------------------------------- board
SQUARE = 40;            // square pitch (mm)
TILE_SQUARES = 4;       // a playing tile is 4x4 squares; four tiles make the board
TILE_T = 3.4;           // tile thickness
INLAY_D = 0.6;          // dark-square recess depth for a second colour (0 = flat tile)
REED_L = 15;            // reed switch glass length (2x14 mm glass + margin)
REED_W = 2.6;           // groove width for glass body
GROOVE_D = 2.2;         // depth of wire/switch grooves on the tile underside
WIRE_W = 1.6;           // groove width for legs and wires
DIODE_L = 4.5;          // 1N4148 body (DO-35)
DIODE_W = 2.2;

// ---------------------------------------------------------------- pieces
PIECE_BASE = 20;        // base diameter: must stay <= SQUARE/2 so pieces pass between others
PIECE_MAG_D = 10.3;     // pocket for a 10x3 mm N52 disc magnet (+ clearance)
PIECE_MAG_H = 3.2;
FELT = 0;               // stick 0.5-1 mm felt under each piece; no geometry needed

// ---------------------------------------------------------------- hardware
EXTRUSION = 20;         // 2020 aluminium profile
M5 = 5.4;               // M5 clearance
M3 = 3.3;               // M3 clearance
M3_NUT = 6.4;           // across flats + clearance
ROD = 8;                // smooth rods
ROD_FIT = 8.15;
LM8UU_D = 15.2;
LM8UU_L = 24;
F623_D = 10.4;          // F623ZZ flanged bearing: 10 mm OD, 4 mm wide, 11.5 mm flange
F623_W = 4;
F623_FLANGE = 11.6;
NEMA = 42.3;
NEMA_HOLES = 31;
NEMA_BOSS = 22.5;
BELT_W = 6;             // GT2 6 mm
SERVO_W = 12.6;         // SG90 / MG90S body
SERVO_L = 23.2;
SERVO_TAB = 32.5;       // tab-to-tab length
CARRIAGE_MAG_D = 15.3;  // 15x4 mm N52 magnet on the lifting arm
CARRIAGE_MAG_H = 4.2;

// ---------------------------------------------------------------- frame
// Inside the frame: magnet travel 425 x 335 mm plus the gantry around it.
FRAME_X = 560;          // outer size of the 2020 rectangle (front/back extrusions)
FRAME_Y = 480;          // outer size (side extrusions are FRAME_Y - 40 long)
ROD_SPACING_X = 40;     // the two X rods, centre to centre

module rounded_box(size, r = 2) {
  hull() for (x = [r, size[0] - r], y = [r, size[1] - r]) translate([x, y, 0]) cylinder(r = r, h = size[2]);
}

module m3_nut_trap(h = 3) { cylinder(d = M3_NUT / cos(30), h = h, $fn = 6); }
