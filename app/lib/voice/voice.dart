import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

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
          error = e.permanent ? 'Speech recognition: ${e.errorMsg}' : null;
          listening = false;
          notifyListeners();
        },
        onStatus: (s) {
          if (s == 'done' || s == 'notListening') {
            listening = false;
            notifyListeners();
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
    await _stt.stop();
    listening = false;
    notifyListeners();
  }

  Future<void> _initTts() async {
    if (_ttsReady) return;
    _ttsReady = true;
    try {
      await _tts.setSpeechRate(kIsWeb ? 0.95 : 0.48);
      await _tts.setPitch(0.85); // a little deeper, for the stone pieces
      await _tts.awaitSpeakCompletion(false);
    } catch (_) {}
  }

  Future<void> say(String text) async {
    await _initTts();
    try {
      await _tts.speak(text);
    } catch (_) {}
  }

  Future<void> stopSpeaking() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }
}
