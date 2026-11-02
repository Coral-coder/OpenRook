import 'package:flutter/material.dart';

import 'app/settings.dart';
import 'ui/home_screen.dart';
import 'voice/neural_voice.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Settings.shared.load();
  NeuralVoice.shared.ensure(); // fetch the announcer's voice in the background (first run only)
  runApp(const OpenRookApp());
}

class OpenRookApp extends StatelessWidget {
  const OpenRookApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: const Color(0xFFB08560), brightness: Brightness.dark);
    return MaterialApp(
      title: 'OpenRook',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: scheme,
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF1C1915),
        cardTheme: const CardThemeData(color: Color(0xFF2A251F)),
      ),
      home: const HomeScreen(),
    );
  }
}
