import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:archive/archive_io.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:sherpa_onnx/sherpa_onnx.dart' as sherpa;

import '../app/settings.dart';
import 'phonemes.dart';

/// One of the announcer's neural voices: a Piper model from sherpa-onnx's model releases,
/// and (for models with several speakers) which speaker. All of them were trained on espeak-ng's
/// `en-gb-x-rp` phonemes, the same ones the built-in lexicon (voice_lexicon.dart) holds.
class AnnouncerVoice {
  const AnnouncerVoice({
    required this.id,
    required this.name,
    required this.about,
    required this.model,
    required this.megabytes,
    required this.credit,
    this.speaker = 0,
    this.lengthScale = 1.08,
    this.noiseScale = 0.667,
    this.noiseScaleW = 0.8,
  });
  final String id; // stored in settings
  final String name, about, credit;
  final String model; // release name, e.g. 'vits-piper-en_GB-semaine-medium'
  final int megabytes; // download size
  final int speaker; // speaker id in a multi-speaker model
  final double lengthScale, noiseScale, noiseScaleW;

  String get url => 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$model.tar.bz2';
  String get onnx => '${model.replaceFirst('vits-piper-', '')}.onnx';
}

/// The voices the announcer can use, the default first.
const announcerVoices = [
  AnnouncerVoice(
    id: 'alan',
    name: 'Alan',
    about: 'Calm, measured British English (male); the original announcer',
    model: 'vits-piper-en_GB-alan-medium',
    megabytes: 67,
    lengthScale: 1.15, // unhurried
    noiseScale: 0.5, // even, steady delivery: no excited swings in pitch
    noiseScaleW: 0.6,
    credit: 'Piper "Alan" voice (from the Mimic 3 voice by Alan Pope)',
  ),
  AnnouncerVoice(
    id: 'obadiah',
    name: 'Obadiah',
    about: 'Deep, grave Received Pronunciation (male); louder and more dramatic',
    model: 'vits-piper-en_GB-semaine-medium',
    speaker: 2, // semaine: prudence 0, spike 1, obadiah 2, poppy 3
    megabytes: 80,
    lengthScale: 1.2, // slow and stately
    noiseScale: 0.45, // steadier than the expressive training default
    noiseScaleW: 0.5,
    credit: 'Piper "semaine" voice (Obadiah / Prudence), from the DFKI SEMAINE corpus, CC BY-NC-SA 4.0',
  ),
  AnnouncerVoice(
    id: 'prudence',
    name: 'Prudence',
    about: 'Crisp Received Pronunciation (female); shares Obadiah\'s download',
    model: 'vits-piper-en_GB-semaine-medium',
    speaker: 0,
    megabytes: 80,
    lengthScale: 1.12,
    noiseScale: 0.5,
    noiseScaleW: 0.6,
    credit: 'Piper "semaine" voice (Obadiah / Prudence), from the DFKI SEMAINE corpus, CC BY-NC-SA 4.0',
  ),
  AnnouncerVoice(
    id: 'jenny',
    name: 'Jenny',
    about: 'Soft southern English (female)',
    model: 'vits-piper-en_GB-jenny_dioco-medium',
    megabytes: 67,
    credit: 'Piper "Jenny" voice (Jenny TTS dataset by Dioco)',
  ),
];

AnnouncerVoice announcerVoice(String id) => announcerVoices.firstWhere((v) => v.id == id, orElse: () => announcerVoices.first);

/// The board's own voice: a neural text-to-speech voice (British English, see [announcerVoices])
/// that runs entirely on the phone with sherpa-onnx. The chosen model (70 to 80 MB) is downloaded
/// once, from sherpa-onnx's public model releases on GitHub; after that it works offline. Until
/// it's ready (and on the web) the system voice stands in.
class NeuralVoice extends ChangeNotifier {
  NeuralVoice._();
  static final NeuralVoice shared = NeuralVoice._();

  /// The voice in use (from settings).
  AnnouncerVoice get voice => announcerVoice(Settings.shared.announcer);

  /// Who made the voices, for the credits.
  static String get credit =>
      'Neural voices via sherpa-onnx: ${announcerVoices.map((v) => v.credit).toSet().join('; ')}.';

  /// 'idle', 'downloading', 'unpacking', 'ready' or 'failed'.
  String status = 'idle';
  double progress = 0; // download progress 0..1
  String? error;
  bool get ready => status == 'ready';
  bool get supported => !kIsWeb && (Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isLinux || Platform.isWindows);

  SendPort? _worker;
  Isolate? _isolate;
  final _player = AudioPlayer();
  int _seq = 0;
  final _pending = <int, Completer<String?>>{};
  Future<void>? _starting;
  int _gen = 0; // bumped when the voice changes: older downloads and workers give up

  /// Downloads the chosen voice if needed and starts it. Called at startup; safe to call again.
  Future<void> ensure() => _starting ??= _start(_gen);

  /// Switches the announcer to [id], downloading that voice if it isn't on the phone yet.
  /// Voices downloaded before stay on the phone, so switching back is instant.
  Future<void> use(String id) async {
    final s = Settings.shared;
    if (s.announcer == id && (ready || _starting != null)) return;
    s.announcer = id;
    await s.save();
    final previous = _starting;
    final gen = ++_gen;
    await stop();
    _stopWorker();
    status = 'idle';
    progress = 0;
    notifyListeners();
    // wait for the previous start to give up (it may be unpacking), so two never write at once
    _starting = Future<void>(() async {
      if (previous != null) await previous.catchError((_) {});
      if (gen == _gen) await _start(gen);
    });
    await _starting;
  }

  /// Whether [v]'s model is already on the phone.
  Future<bool> installed(AnnouncerVoice v) async {
    if (!supported) return false;
    final base = await getApplicationSupportDirectory();
    return File('${base.path}/voices/${v.model}/.complete').exists();
  }

  void _stopWorker() {
    _isolate?.kill(priority: Isolate.immediate);
    _isolate = null;
    _worker = null;
    for (final c in _pending.values) {
      if (!c.isCompleted) c.complete(null);
    }
    _pending.clear();
  }

  Future<void> _start(int gen) async {
    if (!supported) return;
    final v = voice;
    try {
      final base = await getApplicationSupportDirectory();
      final dir = Directory('${base.path}/voices');
      final root = '${dir.path}/${v.model}';
      final done = File('$root/.complete');
      if (!done.existsSync()) {
        await dir.create(recursive: true);
        final tmp = File('${dir.path}/${v.model}.$gen.tar.bz2');
        status = 'downloading';
        progress = 0;
        notifyListeners();
        try {
          await _download(v, tmp, gen);
        } catch (_) {
          if (tmp.existsSync()) await tmp.delete();
          rethrow;
        }
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
      if (gen != _gen) return; // the voice was changed meanwhile
      await _spawn(root, v, gen);
      if (gen != _gen) return;
      status = 'ready';
      error = null;
    } catch (e) {
      if (gen != _gen) return;
      status = 'failed';
      error = '$e';
      _starting = null; // try again next time
    }
    notifyListeners();
  }

  Future<void> _download(AnnouncerVoice v, File to, int gen) async {
    final client = http.Client();
    try {
      final res = await client.send(http.Request('GET', Uri.parse(v.url)));
      if (res.statusCode != 200) throw 'voice download failed (HTTP ${res.statusCode})';
      final total = res.contentLength ?? v.megabytes * 1000000;
      final sink = to.openWrite();
      var got = 0, shown = 0.0;
      await for (final chunk in res.stream) {
        if (gen != _gen) {
          await sink.close();
          throw 'voice download cancelled';
        }
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

  Future<void> _spawn(String root, AnnouncerVoice v, int gen) async {
    final fromWorker = ReceivePort();
    final tmp = (await getTemporaryDirectory()).path;
    final isolate = await Isolate.spawn(_workerMain, [
      fromWorker.sendPort,
      '$root/${v.onnx}',
      '$root/tokens.txt',
      tmp,
      v.speaker,
      v.lengthScale,
      v.noiseScale,
      v.noiseScaleW,
    ], onExit: fromWorker.sendPort);
    if (gen != _gen) {
      isolate.kill(priority: Isolate.immediate);
      fromWorker.close();
      return;
    }
    _isolate = isolate;
    final ready = Completer<void>();
    fromWorker.listen((msg) {
      if (gen != _gen || msg == null) {
        // the voice was changed, or the worker stopped (null is its exit notice)
        fromWorker.close();
        if (!ready.isCompleted) {
          ready.completeError('voice worker stopped');
        } else if (gen == _gen) {
          // it crashed after starting: let the system voice stand in, and start again next time
          _stopWorker();
          status = 'failed';
          error = 'voice worker stopped';
          _starting = null;
          notifyListeners();
        }
      } else if (msg is SendPort) {
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
  final out = args[0] as SendPort, model = args[1] as String, tokens = args[2] as String, tmp = args[3] as String;
  final speaker = args[4] as int;
  final inbox = ReceivePort();
  out.send(inbox.sendPort);
  sherpa.OfflineTts tts;
  try {
    sherpa.initBindings();
    tts = sherpa.OfflineTts(
      sherpa.OfflineTtsConfig(
        model: sherpa.OfflineTtsModelConfig(
          vits: sherpa.OfflineTtsVitsModelConfig(
            model: model,
            tokens: tokens,
            lengthScale: args[5] as double, // a touch slower: an announcer, not a newsreader
            noiseScale: args[6] as double,
            noiseScaleW: args[7] as double,
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
        config: sherpa.OfflineTtsGenerationConfig(sid: speaker, phonemeCodepoints: phonemes),
      );
      final samples = audio.samples;
      normalizeLoudness(samples);
      final path = '$tmp/openrook_say_${n++ % 4}.wav';
      sherpa.writeWave(filename: path, samples: samples, sampleRate: audio.sampleRate);
      out.send([m[0], path]);
    } catch (_) {
      out.send([m[0], null]);
    }
  });
}

/// Some voices come out much quieter or louder than others (the semaine ones peak around a third
/// of full scale, Alan near full scale): bring every line to the same calm, moderate peak, at
/// most 3x louder and never more than about 3x quieter.
@visibleForTesting
void normalizeLoudness(Float32List samples, {double peak = 0.6}) {
  var top = 0.0;
  for (final x in samples) {
    final a = x.abs();
    if (a > top) top = a;
  }
  if (top <= 0) return;
  final gain = (peak / top).clamp(0.3, 3.0);
  if ((gain - 1.0).abs() < 0.02) return;
  for (var i = 0; i < samples.length; i++) {
    samples[i] *= gain;
  }
}
