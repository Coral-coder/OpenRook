import 'package:flutter/material.dart';

import '../app/settings.dart';
import '../net/nostr_pool.dart';

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
        body: ListView(padding: const EdgeInsets.all(16), children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Your name (shown to opponents)', border: OutlineInputBorder())),
          const SizedBox(height: 24),
          Text('Relays', style: Theme.of(context).textTheme.titleMedium),
          const Text('Online games travel through these public Nostr relays (one per line). '
              'Both players need at least one relay in common. No OpenRook server exists.'),
          const SizedBox(height: 8),
          TextField(controller: _relays, maxLines: 6, decoration: const InputDecoration(border: OutlineInputBorder())),
          TextButton(onPressed: () => _relays.text = defaultRelays.join('\n'), child: const Text('Restore defaults')),
          const SizedBox(height: 24),
          Text('Board', style: Theme.of(context).textTheme.titleMedium),
          SwitchListTile(
            title: const Text('Wide build (two capture columns per side)'),
            subtitle: Text('${s.captureSlots} capture slots per side'),
            value: s.captureSlots == 16,
            onChanged: (v) => setState(() => s.captureSlots = v ? 16 : 8),
          ),
          const SizedBox(height: 24),
          Text('Your OpenRook ID: ${s.pool.publicKey.substring(0, 16)}…', style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
    );
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
