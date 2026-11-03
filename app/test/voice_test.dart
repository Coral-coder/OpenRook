import 'package:flutter_test/flutter_test.dart';
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
}
