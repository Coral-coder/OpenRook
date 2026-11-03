import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../board/board_link.dart';
import '../board/physical.dart';
import '../chess/engine.dart';
import '../chess/game.dart';
import '../chess/position.dart';
import '../net/chesscom.dart';
import '../net/lichess.dart';
import '../net/match.dart';
import '../ui/board3d/board3d.dart' show supports3D;
import '../voice/speech_moves.dart';
import '../voice/voice.dart';
import 'settings.dart';

enum Opponent { computer, sameBoard, friend, random, lichess, chessCom }

/// One game in progress: whose turn it is, where moves come from (the board's sensors, a tap
/// on the screen, the computer, a friend across the world, lichess or chess.com), and keeping
/// the physical board in step by dragging the other side's pieces.
class GameController extends ChangeNotifier {
  GameController._(this.opponent, {required this.myColor, String? fen, this.title = 'Game'}) : game = Game(fen: fen) {
    detector = MoveDetector(game.position.copy());
    _boardSub = board.occupancyChanges.listen(_onOccupancy);
    board.addListener(_onBoardChanged);
  }

  /// Against the phone. [color] is the human's colour.
  factory GameController.computer({required int color, required int level, String? fen, List<String> moves = const []}) {
    final c = GameController._(Opponent.computer, myColor: color, fen: fen, title: 'vs Computer');
    c.level = level;
    c.whiteName = color == white ? Settings.shared.name : 'Computer (${EngineLevel.levels[level].name})';
    c.blackName = color == black ? Settings.shared.name : 'Computer (${EngineLevel.levels[level].name})';
    for (final u in moves) {
      c.game.playUci(u);
    }
    c._positionChanged();
    c._maybeComputer();
    return c;
  }

  /// Two people at the same board.
  factory GameController.sameBoard() {
    final c = GameController._(Opponent.sameBoard, myColor: null, title: 'Over the board');
    c.whiteName = 'White';
    c.blackName = 'Black';
    c._positionChanged();
    return c;
  }

  /// A friend or random opponent through the relays.
  factory GameController.room(RoomMatch room, {bool random = false}) {
    final c = GameController._(random ? Opponent.random : Opponent.friend, myColor: null, title: random ? 'Online' : 'Friend · ${room.code}');
    c.room = room;
    c._roomSub = room.changes.listen((_) => c._syncRoom());
    room.open();
    c.status = 'Waiting for your opponent to join…';
    return c;
  }

  /// A lichess game by id (already started).
  factory GameController.lichess(Lichess api, String gameId) {
    final c = GameController._(Opponent.lichess, myColor: null, title: 'Lichess');
    c.lichess = api;
    c.lichessId = gameId;
    c.status = 'Connecting to lichess…';
    c._watchLichess();
    return c;
  }

  /// Mirror a chess.com Daily game.
  factory GameController.chessCom(ChessComGame g, String user) {
    final mine = g.colorOf(user) == 'black' ? black : white;
    final c = GameController._(Opponent.chessCom, myColor: mine, title: 'Chess.com Daily');
    c.chessComUser = user;
    c.chessComUrl = g.url;
    c.whiteName = g.white;
    c.blackName = g.black;
    c._applyChessCom(g);
    c._chessComTimer = Timer.periodic(const Duration(seconds: 20), (_) => c._pollChessCom());
    return c;
  }

  final Opponent opponent;
  int? myColor; // null: both sides are played here (same board) or not known yet
  String title;
  Game game;
  late MoveDetector detector;
  final BoardLink board = BoardLink.shared;

  String whiteName = 'White', blackName = 'Black';
  String status = '';
  String? error;
  int level = 2;
  bool thinking = false;
  bool boardMoving = false;
  Set<int> mismatch = {}; // squares where the physical board differs from the game
  List<Move> choices = []; // ambiguous move (promotion or two possibilities): ask the player
  String? drawOfferFrom; // 'me' or 'them'
  int? whiteMs, blackMs; // clocks (lichess)
  DateTime _clockAt = DateTime.now();
  String? pendingExternalMove; // chess.com: SAN the player must still enter on the website

  RoomMatch? room;
  Lichess? lichess;
  String? lichessId;
  String? chessComUser, chessComUrl;
  StreamSubscription? _boardSub, _roomSub, _lichessSub;
  Timer? _chessComTimer;
  bool _disposed = false;

  bool get over => game.result != GameResult.ongoing;
  bool get localTurn => !over && (myColor == null ? opponent == Opponent.sameBoard : game.turn == myColor);
  bool get canPlay => localTurn && !boardMoving && !thinking && (room == null || room!.started);
  bool get flipped => myColor == black;

  // ------------------------------------------------------------------ moves
  /// A move by the player here, from a tap on the screen or recognised on the board.
  Future<void> playLocal(Move m, {bool fromBoard = false}) async {
    if (!canPlay) return;
    final before = game.position.copy();
    final captured = [game.captured[0].length, game.captured[1].length];
    final san = game.position.san(m);
    if (!game.play(m)) return;
    choices = [];
    error = null;
    _announce(before, m, mine: true);
    _positionChanged();
    // Tell the other side.
    switch (opponent) {
      case Opponent.friend:
      case Opponent.random:
        room?.sendMove(m.uci);
      case Opponent.lichess:
        try {
          await lichess!.move(lichessId!, m.uci);
        } catch (e) {
          error = '$e';
          game.undo();
          _positionChanged();
          if (!fromBoard) return;
        }
      case Opponent.chessCom:
        pendingExternalMove = san;
      default:
    }
    if (!fromBoard) await _drag(before, m, captured);
    _saveLocal();
    _maybeComputer();
  }

  /// A move by the other side: apply it and make the board play it.
  Future<void> _playRemote(Move m) async {
    final before = game.position.copy();
    final captured = [game.captured[0].length, game.captured[1].length];
    if (!game.play(m)) return;
    choices = [];
    _announce(before, m);
    _positionChanged();
    await _drag(before, m, captured);
    _saveLocal();
  }

  Future<void> _drag(Position before, Move m, List<int> captured) async {
    if (!board.connected) return;
    final plan = physicalPlan(before, m, captured, slots: Settings.shared.captureSlots);
    boardMoving = true;
    notifyListeners();
    try {
      if (plan.removeByHand >= 0) {
        // Capture slots are full: the player lifts the taken piece off, then the board moves.
        status = 'Capture slots full: lift the piece off ${squareName(plan.removeByHand)}';
        notifyListeners();
        if (board.occupied?.contains(plan.removeByHand) ?? false) {
          await board.occupancyChanges
              .firstWhere((o) => !o.contains(plan.removeByHand))
              .timeout(const Duration(minutes: 5));
        }
        _updateStatus();
      }
      await board.drag(plan.drags);
      if (m.promotion != 0) {
        status = 'Swap the pawn on ${squareName(m.to)} for a ${const ['', '', 'knight', 'bishop', 'rook', 'queen'][m.promotion]}.';
      }
    } catch (e) {
      error = 'Board: ${e.toString().replaceFirst('Bad state: ', '')}. Move the piece by hand.';
    }
    boardMoving = false;
    detector.reset(game.position.copy());
    if (board.occupied != null) _onOccupancy(board.occupied!);
    notifyListeners();
  }

  void _positionChanged() {
    detector.reset(game.position.copy());
    mismatch = board.occupied == null ? {} : detector.mismatch(board.occupied!);
    _updateStatus();
    notifyListeners();
  }

  void _updateStatus() {
    if (over) {
      status = game.resultText;
      _onGameOver();
      return;
    }
    final side = game.turn == white ? 'White' : 'Black';
    if (room != null && !room!.started) {
      status = 'Waiting for your opponent to join…';
    } else if (localTurn) {
      status = opponent == Opponent.sameBoard ? '$side to move' : 'Your move';
      if (pendingExternalMove != null) status = 'Now play $pendingExternalMove on chess.com';
    } else {
      status = switch (opponent) {
        Opponent.computer => 'Computer is thinking…',
        Opponent.chessCom => pendingExternalMove != null ? 'Now play $pendingExternalMove on chess.com' : 'Waiting for $_opponentName on chess.com',
        _ => 'Waiting for $_opponentName…',
      };
    }
    if (game.position.inCheck) status += ' · Check!';
  }

  String get _opponentName => myColor == white ? blackName : whiteName;

  /// The player picked one of several candidate moves (from the board's sensors or a spoken
  /// move that could mean more than one thing).
  bool choicesFromBoard = true;
  void choose(Move m) => playLocal(m, fromBoard: choicesFromBoard);

  /// Square of a checkmated king (for the crumbling animation), or -1.
  int get matedKing => over && game.resultReason == 'checkmate' ? game.position.kingSquare(game.turn) : -1;

  void _announce(Position before, Move m, {bool mine = false}) {
    if (!Settings.shared.announce) return;
    // the player's own moves are only called out if they want them
    if (mine && !Settings.shared.announceOwn && !(over && game.resultReason == 'checkmate')) return;
    var text = spokenMove(before, m);
    if (over && game.resultReason == 'checkmate') {
      text += '. Checkmate!';
    } else if (game.position.inCheck) {
      text += '. Check!';
    }
    Voice.shared.say(text);
  }

  /// A move said out loud. Returns what happened, for the screen to show.
  String voiceMove(List<String> transcripts) {
    if (!canPlay) return 'Not your move';
    final found = movesFromTranscripts(transcripts, game.position);
    final heard = transcripts.isEmpty ? '' : transcripts.first;
    if (found.isEmpty) return 'Didn\'t catch a move in "$heard". Try "knight to f3".';
    if (found.length == 1) {
      playLocal(found.first);
      return '';
    }
    choices = found;
    choicesFromBoard = false;
    notifyListeners();
    return '';
  }

  // ------------------------------------------------------------------ physical board
  void _onBoardChanged() {
    if (_disposed) return;
    if (!board.connected) mismatch = {};
    notifyListeners();
  }

  void _onOccupancy(Set<int> occ) {
    if (_disposed || boardMoving || board.busy) return;
    mismatch = detector.mismatch(occ);
    if (mismatch.isEmpty || over) {
      choices = [];
      notifyListeners();
      return;
    }
    if (!canPlay) {
      notifyListeners(); // shown as "put it back" on the board view
      return;
    }
    final found = detector.feed(occ);
    choicesFromBoard = true;
    if (found.length == 1) {
      playLocal(found.first, fromBoard: true);
    } else if (found.length > 1) {
      choices = found;
      notifyListeners();
    } else {
      choices = [];
      notifyListeners();
    }
  }

  // ------------------------------------------------------------------ the show
  // The 3D board acts each move out (the march, the fight, the fall) and the voice calls it.
  // The computer waits for both to finish before it so much as thinks, so its reply is never
  // played or announced over the player's move.
  int _shownPly = -1;
  Completer<void>? _shownSignal;

  /// The 3D board has finished acting out the game up to [ply].
  void boardShown(int ply) {
    _shownPly = ply;
    _shownSignal?.complete();
    _shownSignal = null;
  }

  Future<void> _showFinished() async {
    if (Settings.shared.battleView && supports3D) {
      final target = game.ply;
      // a move takes a few seconds to act out (a capture with its slow motion, longer);
      // don't wait forever if the board isn't on screen to say it's done
      final deadline = DateTime.now().add(Duration(seconds: Settings.shared.battle == 'epic' ? 45 : 15)); // epic duels run ~25 s
      while (!_disposed && _shownPly < target && DateTime.now().isBefore(deadline)) {
        _shownSignal ??= Completer<void>();
        await _shownSignal!.future.timeout(const Duration(milliseconds: 400), onTimeout: () {});
      }
    }
    await Voice.shared.quiet.timeout(const Duration(seconds: 15), onTimeout: () {});
  }

  // ------------------------------------------------------------------ computer
  Future<void> _maybeComputer() async {
    if (opponent != Opponent.computer || over || game.turn == myColor || thinking) return;
    thinking = true; // (the player can't move meanwhile)
    notifyListeners();
    await _showFinished();
    if (_disposed || over || game.turn == myColor) {
      thinking = false;
      notifyListeners();
      return;
    }
    final started = DateTime.now();
    final m = await findBestMove(game.startFen, game.uciMoves, EngineLevel.levels[level]);
    // A short pause so an instant reply doesn't feel abrupt on the real board.
    final elapsed = DateTime.now().difference(started).inMilliseconds;
    if (elapsed < 600) await Future.delayed(Duration(milliseconds: 600 - elapsed));
    thinking = false;
    if (_disposed) return;
    if (m != null) await _playRemote(m);
    notifyListeners();
  }

  /// Takes back the last move pair (vs computer) or last move (same board).
  Future<void> takeBack() async {
    if (thinking || boardMoving) return;
    if (opponent == Opponent.computer) {
      if (game.ply == 0) return;
      game.undo();
      if (game.ply > 0 && game.turn != myColor) game.undo();
    } else if (opponent == Opponent.sameBoard) {
      game.undo();
    } else {
      return;
    }
    // Pieces aren't dragged back automatically: the board view shows what to put where.
    _positionChanged();
    _saveLocal();
  }

  void _saveLocal() {
    if (opponent != Opponent.computer) return;
    Settings.shared.savedComputerGame = over
        ? null
        : jsonEncode({'fen': game.startFen, 'moves': game.uciMoves, 'color': myColor, 'level': level});
    Settings.shared.save();
  }

  // ------------------------------------------------------------------ relays
  void _syncRoom() {
    final r = room!;
    if (r.started && myColor == null && r.amPlayer) {
      myColor = r.myColor == 'w' ? white : black;
      whiteName = r.names[r.white] ?? 'White';
      blackName = r.names[r.black] ?? 'Black';
      if (r.fen != null && r.fen != game.startFen) {
        game = Game(fen: r.fen);
      }
      for (final s in Settings.shared.rooms) {
        if (s.code == r.code) s.opponent = r.opponentName;
      }
      Settings.shared.save();
    }
    // Apply moves we don't have yet. Our own come back from the relays and are skipped.
    var changed = false;
    while (game.ply < r.moves.length && !over) {
      final uci = r.moves[game.ply];
      final m = game.position.parseUci(uci);
      if (m == null) break; // illegal: ignore it and everything after it
      final mine = myColor != null && game.turn == myColor;
      if (mine) {
        // A move of ours from history (resumed on this or another phone).
        game.play(m);
        changed = true;
      } else {
        _playRemote(m);
      }
    }
    if (changed) _positionChanged();
    if (r.resignedBy != null && !over) {
      final loser = r.resignedBy == r.white ? white : black;
      game.finish(loser == white ? GameResult.blackWins : GameResult.whiteWins, 'resignation');
    }
    if (r.drawAgreed && !over) game.finish(GameResult.draw, 'agreement');
    drawOfferFrom = r.drawOfferBy == null ? null : (r.drawOfferBy == r.me ? 'me' : 'them');
    _updateStatus();
    notifyListeners();
  }

  // ------------------------------------------------------------------ lichess
  void _watchLichess() {
    _lichessSub = lichess!.gameStream(lichessId!).listen((e) {
      switch (e['type']) {
        case 'gameFull':
          final me = Settings.shared.lichessUser;
          final w = e['white'] as Map? ?? {}, b = e['black'] as Map? ?? {};
          whiteName = (w['name'] ?? w['id'] ?? (w['aiLevel'] != null ? 'Stockfish level ${w['aiLevel']}' : 'White')).toString();
          blackName = (b['name'] ?? b['id'] ?? (b['aiLevel'] != null ? 'Stockfish level ${b['aiLevel']}' : 'Black')).toString();
          myColor = (w['id']?.toString().toLowerCase() == me.toLowerCase()) ? white : black;
          final fen = e['initialFen'] as String?;
          if (fen != null && fen != 'startpos' && fen != game.startFen) game = Game(fen: fen);
          _lichessState(e['state'] as Map<String, dynamic>);
        case 'gameState':
          _lichessState(e);
        case 'opponentGone':
          status = (e['gone'] == true) ? 'Opponent left; you can claim victory on lichess' : status;
          notifyListeners();
      }
    }, onError: (Object e) {
      error = '$e';
      notifyListeners();
    });
  }

  void _lichessState(Map<String, dynamic> s) {
    final moves = (s['moves'] as String? ?? '').split(' ').where((x) => x.isNotEmpty).toList();
    final ours = game.uciMoves;
    final prefix = ours.length <= moves.length && List.generate(ours.length, (i) => ours[i] == moves[i]).every((x) => x);
    if (!prefix) {
      // A takeback or a different history: rebuild; the board view shows what to fix.
      game = Game.fromUci(moves, fen: game.startFen);
      _positionChanged();
    } else {
      for (var i = ours.length; i < moves.length; i++) {
        final m = game.position.parseUci(moves[i]);
        if (m == null) break;
        if (game.turn == myColor) {
          game.play(m);
          _positionChanged();
        } else {
          _playRemote(m);
        }
      }
    }
    whiteMs = s['wtime'] as int?;
    blackMs = s['btime'] as int?;
    _clockAt = DateTime.now();
    final st = s['status'] as String? ?? 'started';
    if (st != 'started' && st != 'created' && !over) {
      final winner = s['winner'] as String?;
      game.finish(winner == 'white' ? GameResult.whiteWins : (winner == 'black' ? GameResult.blackWins : GameResult.draw), st);
    }
    final wDraw = s['wdraw'] == true, bDraw = s['bdraw'] == true;
    drawOfferFrom = (wDraw || bDraw) ? (((wDraw && myColor == white) || (bDraw && myColor == black)) ? 'me' : 'them') : null;
    _updateStatus();
    notifyListeners();
  }

  /// Remaining clock in ms for [color], counting down locally between lichess updates.
  int? clockOf(int color) {
    final base = color == white ? whiteMs : blackMs;
    if (base == null) return null;
    if (over || game.ply < 2 || game.turn != color) return base;
    return (base - DateTime.now().difference(_clockAt).inMilliseconds).clamp(0, 1 << 31);
  }

  // ------------------------------------------------------------------ chess.com
  void _applyChessCom(ChessComGame g) {
    final remote = gameFromPgn(g.pgn) ?? Game(fen: g.fen.isNotEmpty ? g.fen : null);
    final r = remote.uciMoves, ours = game.uciMoves;
    bool isPrefix(List<String> a, List<String> b) => a.length <= b.length && List.generate(a.length, (i) => a[i] == b[i]).every((x) => x);
    if (game.ply == 0 && game.startFen != remote.startFen) game = Game(fen: remote.startFen);
    if (isPrefix(r, ours)) {
      // We're ahead: our move hasn't been entered on chess.com yet.
      if (r.length == ours.length) pendingExternalMove = null;
    } else if (isPrefix(ours, r)) {
      for (var i = ours.length; i < r.length; i++) {
        final m = game.position.parseUci(r[i]);
        if (m == null) break;
        if (game.turn == myColor) {
          game.play(m);
          _positionChanged();
        } else {
          _playRemote(m);
        }
      }
      pendingExternalMove = null;
    } else {
      game = Game.fromUci(r, fen: remote.startFen);
      pendingExternalMove = null;
      _positionChanged();
    }
    _updateStatus();
    notifyListeners();
  }

  Future<void> _pollChessCom() async {
    try {
      final games = await ChessCom.dailyGames(chessComUser!);
      final g = games.where((x) => x.url == chessComUrl).firstOrNull;
      if (g == null) {
        status = 'This game is no longer in progress on chess.com';
        _chessComTimer?.cancel();
        notifyListeners();
        return;
      }
      _applyChessCom(g);
    } catch (_) {}
  }

  // ------------------------------------------------------------------ actions
  Future<void> resign() async {
    if (over) return;
    switch (opponent) {
      case Opponent.friend:
      case Opponent.random:
        room?.resign();
      case Opponent.lichess:
        await lichess?.resign(lichessId!);
      default:
        final loser = myColor ?? game.turn;
        game.finish(loser == white ? GameResult.blackWins : GameResult.whiteWins, 'resignation');
    }
    _updateStatus();
    _saveLocal();
    notifyListeners();
  }

  Future<void> offerDraw() async {
    switch (opponent) {
      case Opponent.friend:
      case Opponent.random:
        drawOfferFrom == 'them' ? room?.acceptDraw() : room?.offerDraw();
      case Opponent.lichess:
        await lichess?.draw(lichessId!, true);
      case Opponent.sameBoard:
        game.finish(GameResult.draw, 'agreement');
        _updateStatus();
      default:
    }
    notifyListeners();
  }

  void declineDraw() {
    if (opponent == Opponent.lichess) lichess?.draw(lichessId!, false);
    room?.declineDraw();
  }

  bool _overHandled = false;
  void _onGameOver() {
    if (_overHandled) return;
    _overHandled = true;
    if (room != null) {
      for (final s in Settings.shared.rooms) {
        if (s.code == room!.code) s.finished = true;
      }
      Settings.shared.save();
    }
    if (board.connected) board.send('BEEP 3');
  }

  @override
  void dispose() {
    _disposed = true;
    board.removeListener(_onBoardChanged);
    _boardSub?.cancel();
    _roomSub?.cancel();
    _lichessSub?.cancel();
    _chessComTimer?.cancel();
    room?.close();
    super.dispose();
  }
}
