#!/usr/bin/env bash
# Renders every part to stl/ with OpenSCAD (sudo apt install openscad / brew install openscad).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p stl
r() { echo "-> stl/$1.stl"; openscad --export-format binstl -o "stl/$1.stl" "${@:3}" "src/$2.scad" 2>/dev/null; }
r board_tile board_tile
r dark_square_inlay dark_square_inlay
r capture_strip capture_strip
for p in pawn rook knight bishop queen king; do r "piece_$p" pieces -D "PIECE=\"$p\""; done
r pieces_preview_set pieces
r foot foot
r rod_holder rod_holder
r motor_mount_left motor_mount
r motor_mount_right motor_mount -D MIRROR=1
r idler_mount_left idler_mount
r idler_mount_right idler_mount -D MIRROR=1
r y_carriage_left y_carriage
r y_carriage_right y_carriage -D MIRROR=1
r xy_carriage xy_carriage
r magnet_arm magnet_arm
r electronics_case electronics_case
r electronics_case_lid electronics_case -D 'PART="lid"'
