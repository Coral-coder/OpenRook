// Optional: a dark square to press into the tile's recess (print 32 in a dark colour), for
// single-colour printers. Skip it if you swap filament at the recess height instead.
include <common.scad>
cube([SQUARE - 0.3, SQUARE - 0.3, INLAY_D - 0.05]);
