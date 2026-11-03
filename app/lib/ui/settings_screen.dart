import 'package:flutter/material.dart';

import '../app/settings.dart';
import '../net/nostr_pool.dart';
import '../voice/neural_voice.dart';
import '../voice/voice.dart';
import 'board3d/iterations.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final s = Settings.shared;
  late final _name = TextEditingController(text: s.name);
  late final _relays = TextEditingController(text: s.relays.join('\n'));

  @override
  Widget build(BuildContext context) {
    return PopScope(
      onPopInvokedWithResult: (_, _) => _save(),
      child: Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Your name (shown to opponents)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            SwitchListTile(
              title: const Text('Battle view'),
              subtitle: const Text('3D board where the armies march, fight and fall'),
              value: s.battleView,
              onChanged: (v) => setState(() => s.battleView = v),
            ),
            ListTile(
              title: const Text('Armies'),
              subtitle: Text(
                s.style == 'toon'
                    ? 'Toon: friendly cartoon heroes and skeletons (for kids)'
                    : 'Wizard: stone chess statues that grind across the board and smash each other to rubble',
              ),
              trailing: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'wizard', label: Text('Wizard')),
                  ButtonSegment(value: 'toon', label: Text('Toon')),
                ],
                selected: {s.style},
                onSelectionChanged: (v) => setState(() => s.style = v.first),
              ),
            ),
            ListTile(
              title: const Text('Room'),
              subtitle: Text(
                s.room == 'tower'
                    ? 'Astronomy tower: telescopes, star charts and books under a moonlit sky'
                    : 'Apothecary cabin: jars and bottles, drying herbs and candlelight',
              ),
              trailing: SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'apothecary', label: Text('Cabin')),
                  ButtonSegment(value: 'tower', label: Text('Tower')),
                ],
                selected: {s.room},
                onSelectionChanged: (v) => setState(() => s.room = v.first),
              ),
            ),
            ListTile(
              title: const Text('Battle board version'),
              subtitle: Text(boardIteration(s.boardIteration).blurb),
              trailing: DropdownButton<String>(
                value: boardIteration(s.boardIteration).id,
                items: [
                  for (final i in boardIterations) DropdownMenuItem(value: i.id, child: Text(i.label)),
                ],
                onChanged: (v) => setState(() => s.boardIteration = v ?? 'latest'),
              ),
            ),
            SwitchListTile(
              title: const Text('Top-down view'),
              subtitle: const Text('Look straight down on the board (easier to read the position)'),
              value: s.topDown,
              onChanged: (v) => setState(() => s.topDown = v),
            ),
            const Divider(),
            SwitchListTile(
              title: const Text('Announce moves'),
              subtitle: const Text('Say every move out loud ("Knight takes bishop on E5")'),
              value: s.announce,
              onChanged: (v) => setState(() => s.announce = v),
            ),
            SwitchListTile(
              title: const Text('Announce my own moves too'),
              subtitle: const Text('Off: only your opponent\'s moves are called out'),
              value: s.announceOwn,
              onChanged: s.announce ? (v) => setState(() => s.announceOwn = v) : null,
            ),
            ListTile(
              title: const Text('Announcer voice'),
              subtitle: ListenableBuilder(
                listenable: NeuralVoice.shared,
                builder: (context, _) {
                  final v = NeuralVoice.shared.voice;
                  return Text('${v.name}: ${v.about}\n${_neuralStatus()}');
                },
              ),
              isThreeLine: true,
              trailing: const Icon(Icons.campaign),
              onTap: _pickAnnouncer,
            ),
            ListTile(
              title: const Text('Voice'),
              subtitle: ListenableBuilder(
                listenable: NeuralVoice.shared,
                builder: (context, _) => Text(s.voiceName.isNotEmpty ? s.voiceName : 'The announcer (${NeuralVoice.shared.voice.name})'),
              ),
              trailing: const Icon(Icons.record_voice_over),
              onTap: _pickVoice,
            ),
            SwitchListTile(
              title: const Text('Keep the mic on all game'),
              subtitle: const Text(
                'Tap the mic once and just call your moves; it pauses while the board speaks. '
                'Also hears "top view", "battle view" and "flip".',
              ),
              value: s.alwaysListen,
              onChanged: (v) => setState(() => s.alwaysListen = v),
            ),
            const Divider(),
            SwitchListTile(
              title: const Text('Cinematic camera'),
              subtitle: const Text('Swoop in close for every fight'),
              value: s.cinematic,
              onChanged: (v) => setState(() => s.cinematic = v),
            ),
            SwitchListTile(
              title: const Text('Battle sounds'),
              subtitle: const Text('Clashing steel, crumbling stone, footsteps'),
              value: s.moveSounds,
              onChanged: (v) => setState(() => s.moveSounds = v),
            ),
            SwitchListTile(title: const Text('Vibrate on captures'), value: s.haptics, onChanged: (v) => setState(() => s.haptics = v)),
            const SizedBox(height: 24),
            Text('Relays', style: Theme.of(context).textTheme.titleMedium),
            const Text(
              'Online games travel through these public Nostr relays (one per line). '
              'Both players need at least one relay in common. No OpenRook server exists.',
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _relays,
              maxLines: 6,
              decoration: const InputDecoration(border: OutlineInputBorder()),
            ),
            TextButton(onPressed: () => _relays.text = defaultRelays.join('\n'), child: const Text('Restore defaults')),
            const SizedBox(height: 24),
            Text('Smart board (optional)', style: Theme.of(context).textTheme.titleMedium),
            SwitchListTile(
              title: const Text('Wide build (two capture columns per side)'),
              subtitle: Text('${s.captureSlots} capture slots per side'),
              value: s.captureSlots == 16,
              onChanged: (v) => setState(() => s.captureSlots = v ? 16 : 8),
            ),
            const SizedBox(height: 24),
            Text('Your OpenRook ID: ${s.pool.publicKey.substring(0, 16)}…', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(
              '3D characters: KayKit Adventurers and Skeletons by Kay Lousberg (kaylousberg.com), CC0, carved into stone for the Wizard armies. ${NeuralVoice.credit}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }

  String _neuralStatus() {
    final n = NeuralVoice.shared;
    if (!n.supported) return 'Not available here (the phone\'s voice speaks instead)';
    return switch (n.status) {
      'ready' => 'Ready (neural voice, works offline)',
      'downloading' => 'Downloading the announcer voice… ${(n.progress * 100).round()}%',
      'unpacking' => 'Installing the announcer voice…',
      'failed' => 'Announcer voice will download when online (system voice for now)',
      _ => 'Getting the announcer voice ready…',
    };
  }

  /// Picks which neural voice the announcer uses; a voice not on the phone yet downloads now.
  Future<void> _pickAnnouncer() async {
    final n = NeuralVoice.shared;
    final installed = {for (final v in announcerVoices) v.id: await n.installed(v)};
    if (!mounted) return;
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(title: Text('Who announces the moves')),
            for (final v in announcerVoices)
              ListTile(
                leading: Icon(v.id == n.voice.id ? Icons.radio_button_checked : Icons.radio_button_unchecked),
                title: Text(v.name),
                subtitle: Text('${v.about}\n${installed[v.id]! ? 'On this phone' : 'Downloads ${v.megabytes} MB once'}'),
                isThreeLine: true,
                onTap: () => Navigator.pop(context, v.id),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    if (s.voiceName.isNotEmpty) await Voice.shared.useVoice('', ''); // the announcer, not the phone's voice
    if (mounted) setState(() {});
    await n.use(picked);
    if (!mounted || picked != n.voice.id) return;
    setState(() {});
    if (n.ready) await Voice.shared.say('Knight takes bishop on E 5. Check!');
  }

  Future<void> _pickVoice() async {
    final voices = await Voice.shared.voices();
    if (!mounted) return;
    final picked = await showModalBottomSheet<Map<String, String>>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          children: [
            const ListTile(title: Text('Voice that calls the moves')),
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: Text('The announcer: ${NeuralVoice.shared.voice.name} (neural, built in)'),
              subtitle: Text(_neuralStatus()),
              trailing: IconButton(
                icon: const Icon(Icons.play_arrow),
                onPressed: () async {
                  await Voice.shared.useVoice('', '');
                  await Voice.shared.say('Knight takes bishop on E 5. Check!');
                },
              ),
              onTap: () => Navigator.pop(context, const {'name': '', 'locale': ''}),
            ),
            const ListTile(dense: true, title: Text('Or one of the phone\'s own voices:')),
            for (final v in voices)
              ListTile(
                title: Text(v['name'] ?? ''),
                subtitle: Text([v['locale'], if ((v['quality'] ?? '').isNotEmpty) v['quality']].join(' · ')),
                trailing: IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: () async {
                    await Voice.shared.useVoice(v['name'] ?? '', v['locale'] ?? '');
                    await Voice.shared.say('Knight takes bishop on e5. Check!');
                  },
                ),
                onTap: () => Navigator.pop(context, v),
              ),
            if (voices.isEmpty) const ListTile(title: Text('No voices reported by this device')),
          ],
        ),
      ),
    );
    if (picked != null) await Voice.shared.useVoice(picked['name'] ?? '', picked['locale'] ?? '');
    if (mounted) setState(() {});
  }

  void _save() {
    s.name = _name.text.trim().isEmpty ? s.name : _name.text.trim();
    final relays = _relays.text.split('\n').map((x) => x.trim()).where((x) => x.startsWith('wss://')).toList();
    if (relays.isNotEmpty && relays.join() != s.relays.join()) {
      s.relays = relays;
      s.resetPool();
    }
    s.save();
  }
}
