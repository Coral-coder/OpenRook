# OpenRook app

One Flutter codebase for Android, iOS, macOS, Windows, Linux and the web. It connects to the
board over Bluetooth LE, knows the rules, recognises your moves from the board's sensors and
tells the board how to play your opponent's.

## Ways to play

| Mode | How it works | Needs |
| --- | --- | --- |
| **Computer** | Alpha-beta engine on the phone, six strengths (Beginner to Master). | nothing |
| **Two players, one board** | Over-the-board game; the app keeps the score and the PGN. | nothing |
| **Friend** | One phone makes a 6-letter code, the other types it. | internet |
| **Random opponent** | Matchmaking with other OpenRook players who are looking right now. | internet |
| **Lichess** | Real lichess.org games (random seek, a friend, or lichess's Stockfish) via the official Board API. | a lichess account + personal token |
| **Chess.com Daily** | Mirrors your Daily games: the board plays your opponent's moves; you enter yours on chess.com (chess.com has no API for making moves). | a chess.com username |

## On the phone

- **Battle view** (`lib/ui/battle_board.dart`): a tilted stone board with carved pieces
  (`lib/ui/stone_pieces.dart`, vector drawings, no fonts). Pieces march to their squares and
  knights leap; a capture is a fight: the attacker advances, rears back and strikes, and the
  victim bursts into stone shards and dust with a flash, a board shake and a haptic thump.
  Castling rooks vault the king, promotions burst into golden light, and a checkmated king
  crumbles. The grid button in the game toolbar switches to a flat board.
- **Say a move**: press the mic and say "knight to f3", "e4", "bishop takes c6", "castle
  kingside", "a8 queen". The phone's own speech recogniser does the listening;
  `lib/voice/speech_moves.dart` turns the words (and common mishearings like "night" and
  "before") into the legal move. If it could mean two moves, the app asks which.
- **Announcer**: every move is said out loud ("Bishop takes knight on C 6. Check!"). Settings
  can turn it, the battle view and the vibration off.

## No server

Online play works the way MagicTrek's does: moves are signed events sent through several public
**Nostr relays** at once (`lib/net/nostr_pool.dart`). A friend game is a "room" whose name and
encryption key both come from the code, so only the two players can read or write it
(`RoomCipher`). Every message is idempotent (a move carries its ply number) and relays keep the
events, so a game survives app restarts, flaky connections and even being continued days later:
open it again from the home screen and it catches up.

Random matchmaking uses a public lobby tag on the same relays with a three-step offer → accept →
confirm handshake (`lib/net/lobby.dart`), so nobody is ever left alone in a room.

Lichess and chess.com are called directly from the phone. Nothing of ours runs anywhere.

## How the board and the app split the work

The board reports which squares are occupied (`BOARD <hex>`). `MoveDetector` (in
`lib/board/physical.dart`) watches those reports: every square lifted or set down since the last
position is remembered, and the legal moves that leave exactly the current occupancy (and touched
the right squares) are the candidates. One candidate: that's your move. A promotion or a rare
ambiguity: the app asks. Anything else: the squares that don't match are outlined in red.

For the other side's moves, `physicalPlan` turns a chess move into drags for the board: the
captured piece to its capture slot first, then the move (castling moves the rook, then the king).

## Code map

| Path | What |
| --- | --- |
| `lib/chess/` | Rules (`position.dart`: move generation, FEN, SAN, UCI), games and PGN (`game.dart`), the computer player (`engine.dart`). |
| `lib/board/` | Bluetooth link to the board, move recognition and drag planning. |
| `lib/voice/` | Spoken moves (speech to move) and the move announcer. |
| `lib/net/` | Nostr relays, friend rooms, random matchmaking, lichess, chess.com. |
| `lib/app/` | Settings and the game controller that ties a game to the board and the opponent. |
| `lib/ui/` | Screens. |
| `test/` | Rules (perft-verified), move recognition, spoken moves, engine and crypto tests. |
| `test_live/` | An end-to-end test over the real public relays: matchmaking, a game, an outsider trying to move, resuming from history. Run it by hand: `flutter test test_live/relay_live_test.dart`. |

## Build

```sh
cd app
flutter pub get
flutter test
flutter run                # phone or desktop
flutter build apk          # Android
flutter build ios          # iOS (needs signing)
flutter build web          # browser (no Bluetooth: play on screen)
```

Releases are automatic: put `build` (or `*u`) in a commit subject, or push a `v1.2.0` tag, and CI
publishes `OpenRook.apk` as a GitHub Release and uploads the iOS build to TestFlight.
