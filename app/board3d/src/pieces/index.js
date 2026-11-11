// The six pieces, one file each (so they can be sculpted independently).
import { king } from './king.js';
import { queen } from './queen.js';
import { bishop } from './bishop.js';
import { knight } from './knight.js';
import { rook } from './rook.js';
import { pawn } from './pawn.js';

export const BUILD = { 1: pawn, 2: knight, 3: bishop, 4: rook, 5: queen, 6: king };
