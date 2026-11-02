import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// The 3D board page in an iframe (the web build). Messages go both ways with postMessage.
class Board3DView extends StatefulWidget {
  const Board3DView({super.key, required this.html, required this.onMessage, required this.onSender});
  final String html;
  final void Function(String message) onMessage;
  final void Function(void Function(String json) send) onSender;

  @override
  State<Board3DView> createState() => _Board3DViewState();
}

int _next = 0;

class _Board3DViewState extends State<Board3DView> {
  late final String _type = 'openrook-board3d-${_next++}';
  late final web.HTMLIFrameElement _frame;
  JSFunction? _listener;

  @override
  void initState() {
    super.initState();
    _frame = web.HTMLIFrameElement()
      ..srcdoc = widget.html.toJS
      ..style.border = 'none'
      ..style.width = '100%'
      ..style.height = '100%';
    ui_web.platformViewRegistry.registerViewFactory(_type, (int id) => _frame);
    _listener = ((web.MessageEvent e) {
      if (e.source != _frame.contentWindow) return;
      final data = e.data;
      if (data == null || !data.isA<JSObject>()) return;
      final s = (data as JSObject).getProperty<JSAny?>('openrook'.toJS);
      if (s != null && s.isA<JSString>()) widget.onMessage((s as JSString).toDart);
    }).toJS;
    web.window.addEventListener('message', _listener);
    widget.onSender((json) {
      final msg = JSObject()..setProperty('openrookIn'.toJS, json.toJS);
      _frame.contentWindow?.postMessage(msg, '*'.toJS);
    });
  }

  @override
  void dispose() {
    if (_listener != null) web.window.removeEventListener('message', _listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // A menu or dialog on top of the board is another route; while one is open the iframe
    // must not take the clicks meant for it (on the web a platform view sits above Flutter's
    // own hit testing).
    final onTop = ModalRoute.of(context)?.isCurrent ?? true;
    _frame.style.pointerEvents = onTop ? 'auto' : 'none';
    return HtmlElementView(viewType: _type);
  }
}
