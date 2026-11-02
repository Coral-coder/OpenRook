import 'voice_lexicon.dart';

/// Turns an announcement into Piper phonemes, one list of code points per sentence, from the
/// built-in lexicon. Returns null if any word isn't in it (then the system voice says it).
List<List<int>>? announcementPhonemes(String text) {
  final sentences = <List<int>>[];
  final buf = StringBuffer();
  void endSentence() {
    final s = buf.toString().trim();
    if (s.isNotEmpty) sentences.add(s.runes.toList());
    buf.clear();
  }

  final tokens = RegExp(r"[A-Za-z0-9']+|[.,!?;:]").allMatches(text).map((m) => m.group(0)!);
  for (final t in tokens) {
    if (RegExp(r'^[.,!?;:]$').hasMatch(t)) {
      final s = buf.toString().trimRight();
      buf
        ..clear()
        ..write('$s$t ');
      if ('.!?'.contains(t)) endSentence();
      continue;
    }
    final p = (t.length == 1 && RegExp('[A-H]').hasMatch(t)) ? voiceLexicon[t] : voiceLexicon[t.toLowerCase()];
    if (p == null) return null;
    buf.write('$p ');
  }
  endSentence();
  return sentences.isEmpty ? null : sentences;
}
