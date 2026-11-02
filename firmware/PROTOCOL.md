# Board protocol

Plain text lines, ending in `\n`, over Bluetooth LE (Nordic UART Service) or USB serial at
115200 baud. Commands are case-insensitive. The board answers each command with an `OK <verb>`
or `ERR <verb> <reason>` line (`HELLO`, `SCAN` and `CAL` answer with their data instead) and
sends `BUSY` before and `IDLE` after anything that moves.

| UUID | Use |
| --- | --- |
| `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | service |
| `6E400002-…` | RX: the app writes commands |
| `6E400003-…` | TX: the board notifies lines (split to the MTU; join until `\n`) |

## Squares

`a1` … `h8`, and the capture slots beside the board: `W0`–`W15` for captured white pieces (left
of the a-file) and `B0`–`B15` for black ones (right of the h-file). Slots 0–7 are the column
next to the board, rank 1 to 8; 8–15 the column further out (wide build only).

## Commands

| Command | Does |
| --- | --- |
| `HELLO` | `HELLO OpenRook <version> sensors=ok|missing homed=0|1`, then `CAL …` and `BOARD …` |
| `SCAN` | reads the sensors now: `BOARD <16 hex digits>` |
| `MOVE <from> <to> [<from> <to> …]` | drags pieces, in order. Uses a straight or diagonal line when the squares in between are empty, otherwise travels along the lines between squares. Homes first if needed. |
| `HOME` | homes X then Y on the endstops |
| `CELL <square>` | moves the carriage under a square (magnet down), for calibration |
| `GOTO <x> <y>` | moves the carriage to x, y mm from home |
| `MAG UP` / `MAG DOWN` | raises / lowers the magnet |
| `SERVO <angle>` | sets the servo angle without saving (to find the up/down angles) |
| `CAL <square> <a1x> <a1y> [<up> <down>]` | saves square size, a1 position (mm from home) and servo angles to flash; with no arguments prints them |
| `POS` | `POS <x> <y>` |
| `LED <r> <g> <b>` | status LED colour |
| `BEEP [n]` | beeps n times |
| `STOP` | stops a move at once (over Bluetooth; the board then needs `HOME` again) |
| `OFF` | magnet down, motors off |

## Reports

`BOARD <hex>`: which squares hold a piece, sent whenever the reading changes and has been
steady for about 60 ms. Bit *n* of the 64-bit number is square *n* with a1 = 0, b1 = 1 … h8 = 63
(rank × 8 + file). The start position reads `ffff00000000ffff`.

The board knows nothing about chess: the app recognises moves from these reports and tells
the board which pieces to drag.
