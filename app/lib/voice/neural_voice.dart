import 'dart:async';
import 'dart:io';
import 'dart:isolate';

import 'package:archive/archive_io.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:sherpa_onnx/sherpa_onnx.dart' as sherpa;

import 'phonemes.dart';

/// The board's own voice: a neural text-to-speech voice (Piper "Alan", British English) that
/// runs entirely on the phone with sherpa-onnx. The model (about 67 MB) is downloaded once,
/// the first time the app starts, from sherpa-onnx's public model releases on GitHub; after
/// that it works offline. Until it's ready (and on the web) the system voice stands in.
class NeuralVoice extends ChangeNotifier {
  NeuralVoice._();
  static final NeuralVoice shared = NeuralVoice._();

  static const model = 'vits-piper-en_GB-alan-medium';
  static const url = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$model.tar.bz2';
  static const credit = 'Neural voice: Piper "Alan" (en_GB, from the Mimic 3 voice by Alan Pope) via sherpa-onnx.';

  /// 'idle', 'downloading', 'unpacking', 'ready' or 'failed'.
  String status = 'idle';
  double progress = 0; // download progress 0..1
  String? error;
  bool get ready => status == 'ready';
  bool get supported => !kIsWeb && (Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isLinux || Platform.isWindows);

  SendPort? _worker;
  final _player = AudioPlayer();
  int _seq = 0;
  final _pending = <int, Completer<String?>>{};
  Future<void>? _starting;

  /// Downloads the voice if needed and starts it. Called at startup; safe to call again.
  Future<void> ensure() => _starting ??= _start();

  Future<void> _start() async {
    if (!supported) return;
    try {
      final base = await getApplicationSupportDirectory();
      final dir = Directory('${base.path}/voices');
      final root = '${dir.path}/$model';
      final done = File('$root/.complete');
      if (!done.existsSync()) {
        await dir.create(recursive: true);
        final tmp = File('${dir.path}/$model.tar.bz2');
        status = 'downloading';
        notifyListeners();
        await _download(tmp);
        status = 'unpacking';
        notifyListeners();
        final out = dir.path;
        await Isolate.run(() => extractFileToDisk(tmp.path, out));
        await tmp.delete();
        // the words come pre-phonemised (phonemes.dart), so espeak's data isn't needed
        final espeak = Directory('$root/espeak-ng-data');
        if (espeak.existsSync()) await espeak.delete(recursive: true);
        await done.writeAsString('ok');
      }
      await _spawn(root);
      status = 'ready';
      error = null;
    } catch (e) {
      status = 'failed';
      error = '$e';
      _starting = null; // try again next time
    }
    notifyListeners();
  }

  Future<void> _download(File to) async {
    final client = http.Client();
    try {
      final res = await client.send(http.Request('GET', Uri.parse(url)));
      if (res.statusCode != 200) throw 'voice download failed (HTTP ${res.statusCode})';
      final total = res.contentLength ?? 67000000;
      final sink = to.openWrite();
      var got = 0, shown = 0.0;
      await for (final chunk in res.stream) {
        sink.add(chunk);
        got += chunk.length;
        progress = got / total;
        if (progress - shown > 0.01) {
          shown = progress;
          notifyListeners();
        }
      }
      await sink.close();
    } finally {
      client.close();
    }
  }

  Future<void> _spawn(String root) async {
    final fromWorker = ReceivePort();
    final tmp = (await getTemporaryDirectory()).path;
    await Isolate.spawn(_workerMain, [fromWorker.sendPort, root, tmp]);
    final ready = Completer<void>();
    fromWorker.listen((msg) {
      if (msg is SendPort) {
        _worker = msg;
      } else if (msg == 'ready') {
        ready.complete();
      } else if (msg is List && msg.first == 'error' && !ready.isCompleted) {
        ready.completeError(msg[1] as Object);
      } else if (msg is List) {
        _pending.remove(msg[0] as int)?.complete(msg[1] as String?);
      }
    });
    await ready.future;
  }

  /// Whether the neural voice can say [text] (every word is in its lexicon).
  bool canSay(String text) => ready && announcementPhonemes(text) != null;

  /// Says [text]; completes when the voice has finished speaking.
  Future<void> speak(String text) async {
    final w = _worker;
    final phonemes = announcementPhonemes(text);
    if (w == null || phonemes == null) return;
    final id = ++_seq;
    final c = Completer<String?>();
    _pending[id] = c;
    w.send([id, phonemes]);
    final path = await c.future;
    if (path == null || id != _seq) return; // a newer announcement replaced this one
    final finished = _player.onPlayerComplete.first;
    await _player.play(DeviceFileSource(path));
    await finished.timeout(const Duration(seconds: 20), onTimeout: () {});
  }

  Future<void> stop() async {
    _seq++;
    await _player.stop();
  }
}

// The synthesiser runs in its own isolate so the battle never stutters while it talks.
void _workerMain(List<Object> args) {
  final out = args[0] as SendPort, root = args[1] as String, tmp = args[2] as String;
  final inbox = ReceivePort();
  out.send(inbox.sendPort);
  sherpa.OfflineTts tts;
  try {
    sherpa.initBindings();
    tts = sherpa.OfflineTts(
      sherpa.OfflineTtsConfig(
        model: sherpa.OfflineTtsModelConfig(
          vits: sherpa.OfflineTtsVitsModelConfig(
            model: '$root/en_GB-alan-medium.onnx',
            tokens: '$root/tokens.txt',
            lengthScale: 1.08, // a touch slower: an announcer, not a newsreader
          ),
          numThreads: 2,
        ),
      ),
    );
  } catch (e) {
    out.send(['error', '$e']);
    return;
  }
  out.send('ready');
  var n = 0;
  inbox.listen((msg) {
    final m = msg as List;
    try {
      final phonemes = [for (final s in m[1] as List) (s as List).cast<int>()];
      final audio = tts.generateWithConfig(
        text: '',
        config: sherpa.OfflineTtsGenerationConfig(phonemeCodepoints: phonemes),
      );
      final path = '$tmp/openrook_say_${n++ % 4}.wav';
      sherpa.writeWave(filename: path, samples: audio.samples, sampleRate: audio.sampleRate);
      out.send([m[0], path]);
    } catch (_) {
      out.send([m[0], null]);
    }
  });
}
