# OpenRook

**A real chess board that plays people anywhere in the world.** An ESP32 senses the pieces on a
3D-printed board and moves them with a magnet underneath, and a phone app connects it to the
computer, a friend, a random opponent, lichess.org or your chess.com Daily games. You move a
piece by hand; on the other side of the world it glides across your opponent's board. No
servers: games travel through public relays, and nothing needs to be hosted.

```
 you ──move a piece──► reed switches ──► ESP32 ──BLE──► phone app ──relays / lichess──► their phone
                                                                                          │
 their move ◄──magnet drags the piece── CoreXY gantry ◄── ESP32 ◄──BLE── phone app ◄──────┘
```

## What's in here

| Folder | What |
| --- | --- |
| [`3d-prints/`](3d-prints/) | Every printable part: STLs ready to slice, plus parametric OpenSCAD sources. |
| [`hardware/`](hardware/) | What to buy ([BOM](hardware/BOM.md)), the [wiring / schematic](hardware/WIRING.md), and the [build guide](hardware/ASSEMBLY.md). |
| [`firmware/`](firmware/) | The ESP32 Arduino sketch and the [board protocol](firmware/PROTOCOL.md). |
| [`app/`](app/) | The cross-platform Flutter app (Android, iOS, desktop, web). |

## How it works

- **Sensing**: 64 reed switches (one under each square, each with a diode) in an 8×8 matrix,
  read by an MCP23017. Every piece has a small magnet in its base, so the board knows which squares
  are occupied. The app works out the move from that: lift e2, put it on e4, done. Captures,
  castling, en passant and promotion are all recognised.
- **Moving**: a CoreXY gantry (two NEMA17s, GT2 belts, 8 mm rods) under the board carries a
  magnet on a servo arm. To move a piece it raises the magnet, slides the piece along a clear line
  or along the gaps between squares, and drops it. Captured pieces are parked in slots beside the
  board.
- **Playing**: the app knows the rules, runs a chess engine on the phone, and connects you to other
  players through public Nostr relays (the same serverless approach as MagicTrek), lichess's
  official Board API, or chess.com's public API.

## Get started

1. Order the parts in [hardware/BOM.md](hardware/BOM.md) (about $110–150).
2. Print the parts in [3d-prints/](3d-prints/).
3. Build it with [hardware/ASSEMBLY.md](hardware/ASSEMBLY.md) and [hardware/WIRING.md](hardware/WIRING.md).
4. Flash the [firmware](firmware/README.md).
5. Install the app (Releases has the Android APK; iPhone via TestFlight), tap *No board connected*,
   connect, calibrate, and play.

No board yet? The app is fully playable on screen.

## Releases

A commit whose subject contains `build` (or `*u`), or a `v1.2.0` tag, makes CI publish
`OpenRook.apk` as a GitHub Release and upload the iOS app to TestFlight. Signing uses the shared
secrets installed by `Dev_deploy_setup` (*Actions → Set up app repo*). Every push also runs the app
tests, compiles the firmware and renders the STLs.

## License

MIT.
