import '../chess/position.dart';

/// Turns what a player says ("knight to f3", "e4", "queen takes d5", "castle kingside",
/// "pawn to e8 promote to queen", "echo two echo four") into the legal moves it could mean.
///
/// Speech recognisers mishear chess a lot ("night", "before" for b4, "see" for c), so the
/// text is normalised word by word first, then matched against the legal moves; anything that
/// isn't contradicted by what was said stays a candidate.
class SpeechParse {
  SpeechParse({this.piece, this.from, this.to, this.capture = false, this.castle, this.promotion});
  final int? piece; // piece type named, if any
  final int? from, to; // squares named
  final bool capture;
  final String? castle; // 'king' or 'queen'
  final int? promotion;

  @override
  String toString() => 'piece=$piece from=$from to=$to capture=$capture castle=$castle promo=$promotion';
}

const _pieceWords = {
  'pawn': pawn, 'pawns': pawn, 'porn': pawn, 'pond': pawn, 'paul': pawn, 'prawn': pawn,
  'knight': knight, 'night': knight, 'nite': knight, 'horse': knight, 'knights': knight, 'nights': knight, 'nate': knight,
  'bishop': bishop, 'bishops': bishop,
  'rook': rook, 'rooks': rook, 'brook': rook, 'rock': rook, 'ruk': rook, 'rookie': rook, 'tower': rook,
  'queen': queen, 'queens': queen, 'clean': queen, 'green': queen,
  'king': king, 'kings': king,
};

const _fileWords = {
  'a': 0, 'alpha': 0, 'ay': 0, 'eh': 0,
  'b': 1, 'be': 1, 'bee': 1, 'bravo': 1,
  'c': 2, 'see': 2, 'sea': 2, 'charlie': 2, 'si': 2,
  'd': 3, 'dee': 3, 'delta': 3, 'the': 3,
  'e': 4, 'echo': 4, 'ee': 4,
  'f': 5, 'ef': 5, 'eff': 5, 'foxtrot': 5, 'fox': 5,
  'g': 6, 'gee': 6, 'golf': 6, 'ji': 6,
  'h': 7, 'aitch': 7, 'age': 7, 'hotel': 7, 'each': 7,
};

const _rankWords = {
  '1': 0, 'one': 0, 'won': 0, 'first': 0,
  '2': 1, 'two': 1, 'to': 1, 'too': 1, 'second': 1,
  '3': 2, 'three': 2, 'tree': 2, 'free': 2, 'third': 2,
  '4': 3, 'four': 3, 'for': 3, 'fore': 3, 'fourth': 3,
  '5': 4, 'five': 4, 'fifth': 4,
  '6': 5, 'six': 5, 'sex': 5, 'sixth': 5,
  '7': 6, 'seven': 6, 'seventh': 6,
  '8': 7, 'eight': 7, 'ate': 7, 'eighth': 7,
};

// Words that sound like a file and a rank together ("before" = b4, "beef ive"...).
const _squareWords = {
  'before': 'b4', 'bee4': 'b4', 'defour': 'd4', 'eat': 'e8', 'heat': 'h8', 'hate': 'h8',
  'gate': 'g8', 'ceefor': 'c4', 'seafood': 'c4', 'efore': 'f4', 'deep': 'd3',
};

SpeechParse parseSpeech(String text) {
  var t = text.toLowerCase();
  t = t.replaceAll(RegExp(r'[^a-z0-9 ]'), ' ');
  // "e4" and "e 4" both become tokens we can pair up.
  t = t.replaceAllMapped(RegExp(r'\b([a-h])([1-8])\b'), (m) => '${m[1]} ${m[2]}');
  final words = t.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

  int? piece, promotion;
  String? castle;
  var capture = false;
  final squares = <int>[];
  var promoNext = false;

  if (RegExp(r'\b(castle|castles|castling|o o)\b').hasMatch(t) || t.contains('king side') || t.contains('queen side')) {
    if (RegExp(r'\b(long|queen ?side|queens side|o o o)\b').hasMatch(t)) {
      castle = 'queen';
    } else if (RegExp(r'\b(short|king ?side|kings side)\b').hasMatch(t) || RegExp(r'\b(castle|castles|castling)\b').hasMatch(t)) {
      castle = 'king';
    }
    if (castle != null) return SpeechParse(castle: castle);
  }

  for (var i = 0; i < words.length; i++) {
    final w = words[i];
    if (const {'takes', 'take', 'captures', 'capture', 'x', 'by', 'times', 'eats', 'kills', 'destroys', 'smash', 'smashes'}.contains(w)) {
      capture = true;
      continue;
    }
    if (const {'promote', 'promotes', 'promoting', 'promotion', 'equals', 'becomes', 'queening'}.contains(w)) {
      promoNext = true;
      if (w == 'queening') promotion = queen;
      continue;
    }
    if (_squareWords.containsKey(w)) {
      squares.add(parseSquare(_squareWords[w]!));
      continue;
    }
    // A file word followed by a rank word is a square. "to" between two squares is a rank
    // word too, so only take a rank right after a file.
    if (_fileWords.containsKey(w) && i + 1 < words.length && _rankWords.containsKey(words[i + 1])) {
      // "the" is only d when a rank follows and nothing more likely fits.
      squares.add(_rankWords[words[i + 1]]! * 8 + _fileWords[w]!);
      i++;
      continue;
    }
    final p = _pieceWords[w];
    if (p != null) {
      // A piece named after the square ("e8 queen") is a promotion; the move filter falls back
      // to treating it as the moving piece when no promotion fits.
      if (promoNext || (squares.isNotEmpty && p != king && p != pawn)) {
        promotion = p;
      } else {
        piece ??= p;
      }
    }
  }
  return SpeechParse(
    piece: piece,
    from: squares.length >= 2 ? squares[squares.length - 2] : null,
    to: squares.isNotEmpty ? squares.last : null,
    capture: capture,
    promotion: promotion,
  );
}

/// The legal moves the words could mean, best first. Empty if nothing fits.
List<Move> movesFromSpeech(String text, Position p) {
  final s = parseSpeech(text);
  final legal = p.legalMoves();
  if (s.castle != null) {
    return legal.where((m) => m.isCastle && ((m.flags & Move.castleKing != 0) == (s.castle == 'king'))).toList();
  }
  if (s.to == null) return const [];
  var c = legal.where((m) => m.to == s.to).toList();
  if (s.from != null) c = c.where((m) => m.from == s.from).toList();
  var piece = s.piece;
  if (piece == null && s.promotion != null && !c.any((m) => m.promotion != 0)) piece = s.promotion;
  if (piece != null) c = c.where((m) => typeOf(p.board[m.from]) == piece).toList();
  if (s.capture && c.any((m) => m.isCapture)) c = c.where((m) => m.isCapture).toList();
  if (c.any((m) => m.promotion != 0)) {
    final promo = s.promotion ?? queen;
    c = c.where((m) => m.promotion == promo).toList();
  }
  // "e4" with no piece named means the pawn when a pawn can go there.
  if (s.piece == null && c.length > 1 && c.any((m) => typeOf(p.board[m.from]) == pawn)) {
    c = c.where((m) => typeOf(p.board[m.from]) == pawn).toList();
  }
  return c;
}

/// Tries every alternative transcript the recogniser offered and returns the first that
/// gives exactly one move, else the candidates from the best one that gave any.
List<Move> movesFromTranscripts(List<String> transcripts, Position p) {
  List<Move> fallback = const [];
  for (final t in transcripts) {
    final m = movesFromSpeech(t, p);
    if (m.length == 1) return m;
    if (fallback.isEmpty && m.isNotEmpty) fallback = m;
  }
  return fallback;
}

const pieceNames = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/// What the announcer says for a move: "Knight to F3", "Bishop takes pawn on E5", "Castles kingside".
String spokenMove(Position before, Move m) {
  if (m.isCastle) return m.flags & Move.castleKing != 0 ? 'Castles king side' : 'Castles queen side';
  final mover = pieceNames[typeOf(before.board[m.from])];
  final sq = squareName(m.to).toUpperCase().split('').join(' ');
  var s = m.isCapture ? '${_cap(mover)} takes ${pieceNames[typeOf(m.captured)]} on $sq' : '${_cap(mover)} to $sq';
  if (m.promotion != 0) s += ', and becomes a ${pieceNames[m.promotion]}';
  return s;
}

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
