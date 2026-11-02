import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:web_socket_channel/web_socket_channel.dart';

/// Online play with nobody running a server (the approach from MagicTrek): messages travel as
/// signed events through several public Nostr relays at once. Relays store events, so a game
/// survives the app closing, a phone going offline, or the other player answering tomorrow.
const defaultRelays = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

const kindRoom = 4142; // encrypted messages inside a game room
const kindLobby = 4143; // public "looking for a game" and pairing messages

/// A fresh identity for this install (hex secret key).
String newIdentity() => nostr.Keys.generate().secret;
String publicKeyOf(String secret) => nostr.Keys(secret).public;

class NostrEvent {
  NostrEvent(this.id, this.pubkey, this.kind, this.createdAt, this.tags, this.content);
  final String id, pubkey, content;
  final int kind, createdAt;
  final List<List<String>> tags;

  String? tag(String name) {
    for (final t in tags) {
      if (t.length > 1 && t[0] == name) return t[1];
    }
    return null;
  }
}

/// Connections to a set of relays, shared by the lobby and game rooms.
class NostrPool {
  NostrPool({required this.secretKey, List<String>? relays}) : relays = relays ?? defaultRelays {
    publicKey = publicKeyOf(secretKey);
    for (final url in this.relays) {
      _connect(url);
    }
  }

  final String secretKey;
  late final String publicKey;
  final List<String> relays;
  final Map<String, WebSocketChannel> _channels = {};
  final Set<String> _ready = {};
  final Map<String, Map<String, dynamic>> _subs = {}; // id -> filter json
  final Map<String, StreamController<NostrEvent>> _subStreams = {};
  final Map<String, Set<String>> _seen = {};
  final List<String> _outbox = [];
  final _status = StreamController<int>.broadcast();
  bool _closed = false;
  final _rand = Random();

  /// Number of relays currently connected.
  Stream<int> get status => _status.stream;
  int get connected => _ready.length;

  final Set<String> _retrying = {};
  static void Function(String)? debug;

  void _connect(String url) {
    if (_closed) return;
    try {
      final ch = WebSocketChannel.connect(Uri.parse(url));
      _channels[url] = ch;
      ch.ready.then((_) {
        if (_closed || !identical(_channels[url], ch)) return;
        _ready.add(url);
        _status.add(_ready.length);
        debug?.call('$url ready, ${_subs.length} subs');
        for (final e in _subs.entries) {
          ch.sink.add(jsonEncode(['REQ', e.key, e.value]));
        }
        for (final m in _outbox) {
          ch.sink.add(m);
        }
      }).catchError((_) => _retry(url, ch));
      ch.stream.listen(_onMessage, onError: (_) => _retry(url, ch), onDone: () => _retry(url, ch), cancelOnError: true);
    } catch (_) {
      _retry(url, null);
    }
  }

  // One reconnect per failed connection, however many of its callbacks report the failure.
  void _retry(String url, WebSocketChannel? ch) {
    if (_closed) return;
    if (ch != null && !identical(_channels[url], ch)) return;
    if (!_retrying.add(url)) return;
    final wasReady = _ready.remove(url);
    _channels.remove(url);
    if (wasReady) _status.add(_ready.length);
    Timer(Duration(seconds: 4 + _rand.nextInt(4)), () {
      _retrying.remove(url);
      _connect(url);
    });
  }

  void _onMessage(dynamic raw) {
    if (raw is! String) return;
    List<dynamic> frame;
    try {
      frame = jsonDecode(raw) as List<dynamic>;
    } catch (_) {
      return;
    }
    debug?.call(raw.length > 100 ? raw.substring(0, 100) : raw);
    if (frame.length < 3 || frame[0] != 'EVENT') return;
    final subId = frame[1] as String;
    final ctrl = _subStreams[subId];
    if (ctrl == null) return;
    try {
      final e = frame[2] as Map<String, dynamic>;
      final id = e['id'] as String;
      final seen = _seen.putIfAbsent(subId, () => {});
      if (!seen.add(id)) return; // the same event arrives from every relay
      ctrl.add(NostrEvent(
        id,
        e['pubkey'] as String,
        e['kind'] as int,
        e['created_at'] as int,
        [for (final t in e['tags'] as List) [for (final x in t as List) x.toString()]],
        e['content'] as String? ?? '',
      ));
    } catch (_) {}
  }

  /// Subscribes on every relay (now and after reconnects) and returns the merged stream.
  Stream<NostrEvent> subscribe({required List<int> kinds, Map<String, List<String>> tags = const {}, int? since, int limit = 500}) {
    final id = 'or${_rand.nextInt(1 << 30)}';
    final filter = <String, dynamic>{
      'kinds': kinds,
      for (final t in tags.entries) '#${t.key}': t.value,
      'since': ?since,
      'limit': limit,
    };
    _subs[id] = filter;
    final ctrl = StreamController<NostrEvent>.broadcast(onCancel: () => unsubscribe(id));
    _subStreams[id] = ctrl;
    for (final url in _ready) {
      _channels[url]?.sink.add(jsonEncode(['REQ', id, filter]));
    }
    return ctrl.stream;
  }

  void unsubscribe(String id) {
    _subs.remove(id);
    _subStreams.remove(id)?.close();
    _seen.remove(id);
    for (final url in _ready) {
      try {
        _channels[url]?.sink.add(jsonEncode(['CLOSE', id]));
      } catch (_) {}
    }
  }

  /// Signs and publishes an event to every relay (queued for relays not yet connected).
  void publish({required int kind, required String content, List<List<String>> tags = const []}) {
    if (_closed) return;
    final event = nostr.Event.from(kind: kind, content: content, secretKey: secretKey, tags: tags);
    final frame = jsonEncode(['EVENT', jsonDecode(event.serialize())[1]]);
    _outbox.add(frame);
    if (_outbox.length > 200) _outbox.removeAt(0);
    for (final url in _ready) {
      try {
        _channels[url]?.sink.add(frame);
      } catch (_) {}
    }
  }

  void close() {
    _closed = true;
    for (final id in List.of(_subs.keys)) {
      unsubscribe(id);
    }
    for (final ch in _channels.values) {
      unawaited(ch.sink.close().timeout(const Duration(seconds: 2), onTimeout: () {}).catchError((_) {}));
    }
    _channels.clear();
  }
}

/// A keystream cipher with an HMAC tag, both derived from the room code. Keeps moves private
/// from relay operators and lets only holders of the code write into the room.
class RoomCipher {
  RoomCipher(String code)
      : _key = sha256.convert(utf8.encode('openrook:key:${code.toUpperCase()}')).bytes,
        _mac = sha256.convert(utf8.encode('openrook:mac:${code.toUpperCase()}')).bytes;
  final List<int> _key, _mac;
  final _rand = Random.secure();

  static String roomTag(String code) =>
      sha256.convert(utf8.encode('openrook:room:${code.toUpperCase()}')).toString().substring(0, 32);

  List<int> _stream(List<int> nonce, List<int> data) {
    final out = Uint8List(data.length);
    for (var i = 0; i < data.length; i += 32) {
      final block = Hmac(sha256, _key).convert([...nonce, i ~/ 32 & 0xFF, (i ~/ 32 >> 8) & 0xFF]).bytes;
      for (var j = 0; j < 32 && i + j < data.length; j++) {
        out[i + j] = data[i + j] ^ block[j];
      }
    }
    return out;
  }

  String encrypt(String plaintext) {
    final nonce = List<int>.generate(12, (_) => _rand.nextInt(256));
    final body = _stream(nonce, utf8.encode(plaintext));
    final tag = Hmac(sha256, _mac).convert([...nonce, ...body]).bytes.sublist(0, 16);
    return base64Encode([...nonce, ...body, ...tag]);
  }

  String? decrypt(String encoded) {
    List<int> all;
    try {
      all = base64Decode(encoded);
    } catch (_) {
      return null;
    }
    if (all.length < 28) return null;
    final nonce = all.sublist(0, 12), body = all.sublist(12, all.length - 16), tag = all.sublist(all.length - 16);
    final expected = Hmac(sha256, _mac).convert([...nonce, ...body]).bytes.sublist(0, 16);
    var diff = 0;
    for (var i = 0; i < 16; i++) {
      diff |= tag[i] ^ expected[i];
    }
    if (diff != 0) return null;
    return utf8.decode(_stream(nonce, body), allowMalformed: true);
  }
}

/// A short, easy-to-read match code (no 0/O, 1/I).
String newMatchCode([int length = 6]) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final r = Random.secure();
  return List.generate(length, (_) => alphabet[r.nextInt(alphabet.length)]).join();
}
