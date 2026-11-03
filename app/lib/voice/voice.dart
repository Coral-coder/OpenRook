import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../app/settings.dart';
import 'neural_voice.dart';

/// Listening for spoken moves and announcing moves out loud. Both run on the device's own
/// speech engines (Apple / Google); nothing of ours is involved.
class Voice extends ChangeNotifier {
  Voice._();
  static final Voice shared = Voice._();

  final SpeechToText _stt = SpeechToText();
  final FlutterTts _tts = FlutterTts();
  bool _sttReady = false, _ttsReady = false;
  bool listening = false;
  String heard = '';
  String? error;

  Future<bool> _initStt() async {
    if (_sttReady) return true;
    try {
      _sttReady = await _stt.initialize(
        onError: (e) {
          // in an open-mic session silence and no-match are normal: just listen again
          final quiet = e.errorMsg.contains('no_match') || e.errorMsg.contains('speech_timeout') || e.errorMsg.contains('error_busy');
          error = e.permanent && !(session && quiet) ? 'Speech recognition: ${e.errorMsg}' : null;
          if (error != null && e.permanent && !quiet) session = false;
          listening = false;
          notifyListeners();
          _maybeRestart();
        },
        onStatus: (s) {
          if (s == 'done' || s == 'notListening') {
            listening = false;
            notifyListeners();
            _maybeRestart();
          }
        },
      );
      if (!_sttReady) error = 'Speech recognition is not available on this device (check microphone permission).';
    } catch (e) {
      error = 'Speech recognition is not available: $e';
      _sttReady = false;
    }
    notifyListeners();
    return _sttReady;
  }

  /// Listens for one phrase. [onResult] gets every alternative transcript once the phrase ends.
  Future<void> listen(void Function(List<String> transcripts) onResult) async {
    error = null;
    if (!await _initStt()) return;
    await stopSpeaking();
    heard = '';
    listening = true;
    notifyListeners();
    await _stt.listen(
      onResult: (SpeechRecognitionResult r) {
        heard = r.recognizedWords;
        notifyListeners();
        if (r.finalResult) {
          listening = false;
          notifyListeners();
          onResult([for (final a in r.alternates) a.recognizedWords]);
        }
      },
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
        listenMode: ListenMode.confirmation,
        listenFor: const Duration(seconds: 8),
        pauseFor: const Duration(milliseconds: 1800),
      ),
    );
  }

  Future<void> stopListening() async {
    session = false;
    _onPhrase = null;
    await _stt.stop();
    listening = false;
    notifyListeners();
  }

  // ------------------------------------------------------------------ always listening
  /// True while the mic stays on for the whole game: it listens phrase after phrase,
  /// steps aside while the board's voice speaks (so it doesn't hear itself), and comes back.
  bool session = false;
  void Function(List<String>)? _onPhrase;
  bool _speaking = false;
  Timer? _restart;

  /// Starts (or keeps) the open-mic session; every phrase goes to [onPhrase].
  Future<void> startSession(void Function(List<String> transcripts) onPhrase) async {
    _onPhrase = onPhrase;
    if (session) return;
    session = true;
    notifyListeners();
    await _listenOnce();
  }

  Future<void> _listenOnce() async {
    if (!session || _speaking || _stt.isListening) return;
    error = null;
    if (!await _initStt()) {
      session = false;
      notifyListeners();
      return;
    }
    heard = '';
    listening = true;
    notifyListeners();
    try {
      await _stt.listen(
        onResult: (SpeechRecognitionResult r) {
          heard = r.recognizedWords;
          notifyListeners();
          if (r.finalResult) {
            final cb = _onPhrase;
            if (cb != null && r.recognizedWords.trim().isNotEmpty) cb([for (final a in r.alternates) a.recognizedWords]);
          }
        },
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: false,
          listenMode: ListenMode.dictation,
          listenFor: const Duration(seconds: 50),
          pauseFor: const Duration(seconds: 3),
        ),
      );
    } catch (_) {}
  }

  /// The recogniser stopped (end of phrase, timeout or error): start again shortly.
  void _maybeRestart() {
    if (!session || _speaking) return;
    _restart?.cancel();
    _restart = Timer(const Duration(milliseconds: 400), _listenOnce);
  }

  // ------------------------------------------------------------------ the board's voice
  List<Map<String, String>> _voices = [];

  /// English text-to-speech voices on this device, best first: British voices at the top
  /// (premium / enhanced / neural ones first), then the rest.
  Future<List<Map<String, String>>> voices() async {
    if (_voices.isNotEmpty) return _voices;
    try {
      final raw = await _tts.getVoices as List? ?? const [];
      _voices = [
        for (final v in raw)
          if (v is Map) {for (final e in v.entries) '${e.key}': '${e.value}'},
      ];
    } catch (_) {
      _voices = [];
    }
    _voices = _voices.where((v) => (v['locale'] ?? '').toLowerCase().startsWith('en')).toList()
      ..sort((a, b) => voiceScore(b).compareTo(voiceScore(a)));
    return _voices;
  }

  /// How well a voice suits the castle, from what the platform tells us about it. A British
  /// voice always wins (the announcer is English), then the most natural-sounding one.
  static int voiceScore(Map<String, String> v) {
    final name = (v['name'] ?? '').toLowerCase();
    final id = (v['identifier'] ?? '').toLowerCase();
    final quality = (v['quality'] ?? '').toLowerCase();
    final locale = (v['locale'] ?? '').toLowerCase().replaceAll('_', '-');
    var s = 0;
    if (quality.contains('premium') || id.contains('premium')) s += 60;
    if (quality.contains('enhanced') || id.contains('enhanced')) s += 40;
    if (name.contains('neural') || id.contains('neural') || name.contains('wavenet')) s += 45;
    if (name.contains('network') || v['network_required'] == 'true' || v['network_required'] == '1') s += 30;
    if (quality.contains('very high') || quality == '500') s += 25;
    if (quality.contains('high') || quality == '400') s += 10;
    final british = locale == 'en-gb' || locale.startsWith('en-gb-') || name.startsWith('en-gb') || id.contains('en-gb');
    if (british) {
      s += 250; // above any quality bonus: even a plain British voice beats a premium American one
      // the well-spoken English voices: Apple's Daniel, Arthur, Oliver, Serena, Kate, Stephanie,
      // Jamie; Google's en-gb-x-rjs / gbd (male) and gba / gbc / gbg (female)
      const rp = ['daniel', 'arthur', 'oliver', 'serena', 'kate', 'stephanie', 'jamie', 'malcolm', 'martha'];
      if (rp.any((n) => name.contains(n) || id.contains(n))) s += 12;
      final male = (v['gender'] ?? '').toLowerCase() == 'male' ||
          ['daniel', 'arthur', 'oliver', 'malcolm', 'x-rjs', 'x-gbd'].any((n) => name.contains(n) || id.contains(n));
      if (male) s += 4; // a man's voice, like the neural announcer
    } else if (locale.startsWith('en-ie') || locale.startsWith('en-au') || locale.startsWith('en-nz') || locale.startsWith('en-za')) {
      s += 20; // closer to British than American
    } else if (locale == 'en-us') {
      s += 6;
    }
    if (id.contains('compact') || name.contains('local') && name.contains('x-')) s -= 5;
    if (id.contains('eloquence') || id.contains('speech.synthesis.voice.')) s -= 20; // novelty voices
    return s;
  }

  Future<void> _pickVoice() async {
    final s = Settings.shared;
    final list = await voices();
    Map<String, String>? v;
    if (s.voiceName.isNotEmpty) {
      for (final x in list) {
        if (x['name'] == s.voiceName && (s.voiceLocale.isEmpty || x['locale'] == s.voiceLocale)) v = x;
      }
    }
    v ??= list.isEmpty ? null : list.first;
    if (v == null) {
      // the platform didn't list its voices: at least ask for British English
      try {
        await _tts.setLanguage('en-GB');
      } catch (_) {}
      return;
    }
    try {
      await _tts.setVoice({'name': v['name']!, 'locale': v['locale'] ?? 'en-GB'});
    } catch (_) {}
  }

  /// Use a different voice (from settings); '' picks the best one automatically.
  Future<void> useVoice(String name, String locale) async {
    final s = Settings.shared;
    s.voiceName = name;
    s.voiceLocale = locale;
    await s.save();
    await _pickVoice();
  }

  Future<void> _initTts() async {
    if (_ttsReady) return;
    _ttsReady = true;
    try {
      await _tts.setSpeechRate(kIsWeb ? 0.95 : 0.5);
      await _tts.setPitch(0.9);
      await _tts.awaitSpeakCompletion(false);
      if (!kIsWeb) await _tts.setSharedInstance(true);
      _tts.setStartHandler(() => _speaking = true);
      _tts.setCompletionHandler(_doneSpeaking);
      _tts.setCancelHandler(_doneSpeaking);
      _tts.setErrorHandler((_) => _doneSpeaking());
      await _pickVoice();
    } catch (_) {}
  }

  Completer<void>? _utterance; // the device voice's current line, done when it finishes

  void _doneSpeaking() {
    _speaking = false;
    if (_utterance?.isCompleted == false) _utterance!.complete();
    _maybeRestart();
  }

  // Callouts wait their turn: a line starts only when the one before it has finished, so two
  // moves in quick succession are announced one after the other, never over each other.
  Future<void> _line = Future.value();
  int _gen = 0; // bumped by stopSpeaking: lines still waiting are dropped

  /// Done when everything queued so far has been said.
  Future<void> get quiet => _line;

  /// Says [text] after anything already queued; completes when it has been said.
  Future<void> say(String text) {
    final gen = _gen;
    final f = _line.then<void>((_) async {
      if (gen == _gen) await _sayNow(text);
    });
    _line = f.catchError((_) {});
    return _line;
  }

  Future<void> _sayNow(String text) async {
    await _initTts();
    if (session && _stt.isListening) {
      // don't let the open mic hear the announcement
      _speaking = true;
      await _stt.stop();
    }
    _speaking = true;
    final neural = NeuralVoice.shared;
    if (Settings.shared.voiceName.isEmpty && neural.canSay(text)) {
      // the board's own neural voice
      await _tts.stop();
      try {
        await neural.speak(text);
      } catch (_) {}
      _doneSpeaking();
      return;
    }
    _utterance = Completer<void>();
    try {
      await _tts.speak(text);
      // the completion handler ends the line (with a ceiling, in case it never comes)
      await _utterance!.future.timeout(Duration(milliseconds: 1500 + text.length * 120), onTimeout: () {});
    } catch (_) {
      _doneSpeaking();
    }
  }

  Future<void> stopSpeaking() async {
    _gen++;
    _line = Future.value();
    if (_utterance?.isCompleted == false) _utterance!.complete();
    await NeuralVoice.shared.stop();
    try {
      await _tts.stop();
    } catch (_) {}
  }
}
