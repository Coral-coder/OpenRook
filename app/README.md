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

- **Battle view** (`lib/ui/board3d/`, scene in `board3d/src/`): a real 3D board rendered with
  three.js (WebGL) inside the app: a WebView on iPhone, Android and Mac, an iframe on the web.
  The pieces are little sculpted characters: foot soldiers with spears and shields, knights on
  horseback with lances, mitred bishops with crooks, walking stone towers, and a crowned queen
  and king in velvet capes, white marble against black obsidian, under real lights and shadows.
  They breathe and look around while they wait. A move is acted out: the piece turns, walks or
  gallops (knights leap), and a capture is a fight: the attacker closes in, winds up and
  strikes (spear thrust, sword blow, the tower's two-fisted slam, the horse rearing, bishops
  and queens hurling a glowing magic bolt). The camera swoops down for a close-up, the two
  trade blows with parries, sparks and the clang of steel, and the finishing blow knocks the
  victim back before it bursts into chunks of stone that bounce and scatter across the board,
  with dust, a flash, a camera shake, a crash and a haptic thump. Nearby pieces turn to watch,
  and between moves the army fidgets: soldiers shoulder spears, horses paw the ground.
  Sound effects are synthesised in the page (WebAudio, no audio files).
  Every piece has its own finisher, and the victim dies to match: the soldier's stab and
  trip (the victim topples), the knight's trample (crushed flat) or joust (thrown into the
  air), the bishop's lightning from the sky (charred, then crumbling to ash), the tower's
  ground-pound (a shockwave flings the victim up), the queen's whirlwind (lifted, spinning,
  bursting in mid-air) and the king's spinning slash. Defenders parry, dodge and stagger,
  weapons leave glowing trails, feet kick up dust, and the killing blow plays in slow motion.
  Castling rooks vault the king, promoted pawns transform in a shower of sparks, and a
  checkmated king topples and crumbles.
  **Camera**: the cinematic camera films each fight side-on, circling the fighters (Settings →
  Cinematic camera). Drag to orbit, pinch or mouse-wheel to zoom into the board, two fingers
  (or right-drag) to pan, double-tap to reset. Tap a piece, then a square.
- **Replay** (`lib/ui/replay_screen.dart`): from the game menu, or when a game ends, watch the
  whole game again with every battle acted out and the camera following each move. Play,
  pause, step, scrub, ½×/1×/2× speed, with the announcer calling the moves. The grid button switches to a flat board. Windows and Linux (no WebView) use a
  2.5D painted version (`lib/ui/battle_board.dart`).
  To change the scene: edit `board3d/src/*.js`, then `cd board3d && npm install && npm run build`
  rebuilds `assets/board3d/board3d.html` (commit it; the app doesn't need Node to build).
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
