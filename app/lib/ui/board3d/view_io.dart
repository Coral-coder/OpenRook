import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// The 3D board page in a native WebView (iOS, Android, macOS).
class Board3DView extends StatefulWidget {
  const Board3DView({super.key, required this.html, required this.onMessage, required this.onSender});
  final String html;
  final void Function(String message) onMessage;
  final void Function(void Function(String json) send) onSender;

  @override
  State<Board3DView> createState() => _Board3DViewState();
}

class _Board3DViewState extends State<Board3DView> {
  late final WebViewController _c;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF15110E))
      ..addJavaScriptChannel('OpenRook', onMessageReceived: (m) => widget.onMessage(m.message))
      ..loadHtmlString(widget.html);
    widget.onSender((json) => _c.runJavaScript('window.openrook && window.openrook.receive(${jsonEncode(json)})'));
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(
        controller: _c,
        // The board takes every touch in its area: taps pick squares, drags turn the camera.
        gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())},
      );
}
