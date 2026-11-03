import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:openrook/voice/neural_voice.dart';
import 'package:openrook/voice/voice.dart';

void main() {
  test('natural voices rank above robotic ones', () {
    final premium = {'name': 'Zoe (Premium)', 'locale': 'en-US', 'identifier': 'com.apple.voice.premium.en-US.Zoe'};
    final compact = {'name': 'Samantha', 'locale': 'en-US', 'identifier': 'com.apple.voice.compact.en-US.Samantha'};
    final network = {'name': 'en-gb-x-gbd-network', 'locale': 'en-GB', 'network_required': '1'};
    final local = {'name': 'en-gb-x-gbd-local', 'locale': 'en-GB'};
    expect(Voice.voiceScore(premium), greaterThan(Voice.voiceScore(compact)));
    expect(Voice.voiceScore(network), greaterThan(Voice.voiceScore(local)));
  });

  test('British voices always come first', () {
    final daniel = {'name': 'Daniel', 'locale': 'en-GB', 'identifier': 'com.apple.voice.compact.en-GB.Daniel'};
    final danielPremium = {'name': 'Daniel (Premium)', 'locale': 'en-GB', 'identifier': 'com.apple.voice.premium.en-GB.Daniel'};
    final zoe = {'name': 'Zoe (Premium)', 'locale': 'en-US', 'identifier': 'com.apple.voice.premium.en-US.Zoe'};
    final usNetwork = {'name': 'en-us-x-iom-network', 'locale': 'en-US', 'network_required': '1', 'quality': '500'};
    final gbAndroid = {'name': 'en-gb-x-rjs-local', 'locale': 'en_GB'};
    final rocko = {'name': 'Rocko', 'locale': 'en-GB', 'identifier': 'com.apple.eloquence.en-GB.Rocko'};
    expect(Voice.voiceScore(daniel), greaterThan(Voice.voiceScore(zoe)));
    expect(Voice.voiceScore(gbAndroid), greaterThan(Voice.voiceScore(usNetwork)));
    expect(Voice.voiceScore(danielPremium), greaterThan(Voice.voiceScore(daniel)));
    expect(Voice.voiceScore(daniel), greaterThan(Voice.voiceScore(rocko)));
  });

  test('announcer voices', () {
    expect(announcerVoices.first.id, 'obadiah');
    expect(announcerVoice('nobody').id, 'obadiah');
    expect(announcerVoice('alan').onnx, 'en_GB-alan-medium.onnx');
    expect(announcerVoice('obadiah').onnx, 'en_GB-semaine-medium.onnx');
    expect(announcerVoice('obadiah').speaker, 2);
    expect(announcerVoice('obadiah').url, 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-semaine-medium.tar.bz2');
    expect({for (final v in announcerVoices) v.id}.length, announcerVoices.length);
  });

  test('quiet voices are brought up to a common loudness', () {
    final quiet = Float32List.fromList([0.0, 0.3, -0.15]);
    normalizeLoudness(quiet);
    expect(quiet[1], closeTo(0.9, 1e-6));
    expect(quiet[2], closeTo(-0.45, 1e-6));
    final loud = Float32List.fromList([0.95, -0.5]);
    normalizeLoudness(loud);
    expect(loud[0], closeTo(0.95, 1e-6));
    final silent = Float32List(4);
    normalizeLoudness(silent);
    expect(silent.every((x) => x == 0), isTrue);
  });
}
