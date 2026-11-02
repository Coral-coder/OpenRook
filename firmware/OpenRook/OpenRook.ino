// OpenRook: an ESP32 that senses and moves the pieces of a 3D-printed chess board.
//
// The board is deliberately simple: it knows which squares are occupied (64 reed switches)
// and it can drag a piece from one square to another (CoreXY gantry + magnet on a servo).
// All chess knowledge lives in the companion app, which talks to the board over Bluetooth LE
// (Nordic UART Service) or USB serial with the line protocol in PROTOCOL.md.
//
// Libraries (Arduino Library Manager): NimBLE-Arduino 2.x, ESP32Servo, Adafruit NeoPixel.
// Board: "ESP32 Dev Module" (esp32 core 3.x).

#include <Adafruit_NeoPixel.h>
#include <NimBLEDevice.h>
#include <Preferences.h>

#include "config.h"
#include "motion.h"
#include "sensors.h"

#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // app -> board (write)
#define NUS_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // board -> app (notify)

volatile bool g_abort = false;

Motion motion;
Sensors sensors;
Preferences prefs;
Adafruit_NeoPixel led(LED_COUNT, PIN_LED, NEO_GRB + NEO_KHZ800);
NimBLECharacteristic *txChar = nullptr;
bool bleConnected = false;
QueueHandle_t commandQueue;
uint64_t occupancy = 0;

// ------------------------------------------------------------------ output
void send(const String &line) {
  Serial.println(line);
  if (bleConnected && txChar) {
    // Notifications are limited by the MTU; long lines are split and the app reassembles
    // them up to the newline.
    String s = line + "\n";
    size_t mtu = NimBLEDevice::getMTU() > 23 ? NimBLEDevice::getMTU() - 3 : 20;
    for (size_t i = 0; i < s.length(); i += mtu) {
      String part = s.substring(i, min(s.length(), i + mtu));
      txChar->setValue((uint8_t *)part.c_str(), part.length());
      txChar->notify();
      delay(4);
    }
  }
}

String hex64(uint64_t v) {
  char buf[17];
  snprintf(buf, sizeof buf, "%08lx%08lx", (unsigned long)(v >> 32), (unsigned long)(v & 0xffffffff));
  return String(buf);
}

void reportBoard() { send("BOARD " + hex64(occupancy)); }

void setLed(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < LED_COUNT; i++) led.setPixelColor(i, led.Color(r, g, b));
  led.show();
}

void beep(int times) {
  for (int i = 0; i < times; i++) {
    tone(PIN_BUZZER, 2200, 70);
    delay(130);
  }
}

// ------------------------------------------------------------------ calibration
void loadCalibration() {
  prefs.begin("openrook", true);
  motion.cal.square = prefs.getFloat("sq", DEFAULT_SQUARE_MM);
  motion.cal.a1x = prefs.getFloat("a1x", DEFAULT_A1_X);
  motion.cal.a1y = prefs.getFloat("a1y", DEFAULT_A1_Y);
  motion.cal.servoUp = prefs.getInt("sup", DEFAULT_SERVO_UP);
  motion.cal.servoDown = prefs.getInt("sdn", DEFAULT_SERVO_DOWN);
  prefs.end();
}

void saveCalibration() {
  prefs.begin("openrook", false);
  prefs.putFloat("sq", motion.cal.square);
  prefs.putFloat("a1x", motion.cal.a1x);
  prefs.putFloat("a1y", motion.cal.a1y);
  prefs.putInt("sup", motion.cal.servoUp);
  prefs.putInt("sdn", motion.cal.servoDown);
  prefs.end();
}

String calibrationLine() {
  return "CAL " + String(motion.cal.square, 2) + " " + String(motion.cal.a1x, 2) + " " +
         String(motion.cal.a1y, 2) + " " + String(motion.cal.servoUp) + " " + String(motion.cal.servoDown);
}

// ------------------------------------------------------------------ squares
// "e4" -> (4, 3). Captured-piece slots: "W0".."W15" (white pieces, left of the board) and
// "B0".."B15" (black pieces, right of the board); slots 0-7 are the column next to the board,
// 8-15 a second column further out (only on the wide build).
bool parseCell(String s, int &col, int &row) {
  s.trim();
  if (s.length() == 2 && s[0] >= 'a' && s[0] <= 'h' && s[1] >= '1' && s[1] <= '8') {
    col = s[0] - 'a';
    row = s[1] - '1';
    return true;
  }
  if (s.length() >= 2 && (s[0] == 'W' || s[0] == 'B')) {
    int slot = s.substring(1).toInt();
    if (slot < 0 || slot > 15 || !isDigit(s[1])) return false;
    row = slot % 8;
    if (s[0] == 'W') col = slot < 8 ? -1 : -2;
    else col = slot < 8 ? 8 : 9;
    return true;
  }
  return false;
}

bool occupiedAt(int col, int row) {
  if (col < 0 || col > 7 || row < 0 || row > 7) return true;
  return (occupancy >> (row * 8 + col)) & 1;
}

// ------------------------------------------------------------------ commands
void execute(String line) {
  line.trim();
  if (line.isEmpty()) return;
  int sp = line.indexOf(' ');
  String verb = sp < 0 ? line : line.substring(0, sp);
  String args = sp < 0 ? "" : line.substring(sp + 1);
  verb.toUpperCase();
  args.trim();
  String a[6];
  int n = 0;
  for (int i = 0; i < 6 && args.length(); i++) {
    int s = args.indexOf(' ');
    a[n++] = s < 0 ? args : args.substring(0, s);
    args = s < 0 ? "" : args.substring(s + 1);
    args.trim();
  }

  if (verb == "HELLO" || verb == "VERSION") {
    send(String("HELLO OpenRook ") + FIRMWARE_VERSION + " sensors=" + (sensors.present ? "ok" : "missing") +
         " homed=" + (motion.homed ? "1" : "0"));
    send(calibrationLine());
    reportBoard();
  } else if (verb == "SCAN") {
    occupancy = sensors.read();
    reportBoard();
  } else if (verb == "HOME") {
    send("BUSY");
    bool ok = motion.home();
    send(ok ? "OK HOME" : "ERR HOME endstop not reached");
  } else if (verb == "MOVE") {
    // MOVE <from> <to> [<from> <to> ...]: several drags in one command (castling, captures).
    if (n < 2 || n % 2) {
      send("ERR MOVE needs pairs of squares");
      return;
    }
    send("BUSY");
    for (int i = 0; i + 1 < n; i += 2) {
      int fc, fr, tc, tr;
      if (!parseCell(a[i], fc, fr) || !parseCell(a[i + 1], tc, tr)) {
        send("ERR MOVE bad square " + a[i] + " " + a[i + 1]);
        return;
      }
      if (!motion.dragPiece(fc, fr, tc, tr, occupiedAt)) {
        send(g_abort ? "ERR MOVE stopped" : "ERR MOVE failed");
        return;
      }
      // Keep our idea of the board current so the next leg plans around this piece.
      if (fc >= 0 && fc < 8) occupancy &= ~(1ULL << (fr * 8 + fc));
      if (tc >= 0 && tc < 8) occupancy |= 1ULL << (tr * 8 + tc);
    }
    motion.goToCell(-0.5f, -0.5f, TRAVEL_SPEED);  // park the carriage off the playing area
    send("OK MOVE");
    sensors.forceReport();
  } else if (verb == "GOTO" && n >= 2) {
    send("BUSY");
    if (!motion.homed && !motion.home()) {
      send("ERR GOTO not homed");
      return;
    }
    send(motion.lineTo(a[0].toFloat(), a[1].toFloat(), TRAVEL_SPEED) ? "OK GOTO" : "ERR GOTO out of range");
  } else if (verb == "CELL" && n >= 1) {
    int c, r;
    if (!parseCell(a[0], c, r)) {
      send("ERR CELL bad square");
      return;
    }
    send("BUSY");
    if (!motion.homed && !motion.home()) {
      send("ERR CELL not homed");
      return;
    }
    send(motion.goToCell(c, r, TRAVEL_SPEED) ? "OK CELL" : "ERR CELL out of range");
  } else if (verb == "MAG") {
    a[0].toUpperCase();
    motion.magnet(a[0] == "UP");
    send("OK MAG");
  } else if (verb == "SERVO" && n >= 1) {
    motion.servoRaw(a[0].toInt());  // try an angle without saving it
    send("OK SERVO");
  } else if (verb == "CAL") {
    if (n >= 3) {
      motion.cal.square = a[0].toFloat();
      motion.cal.a1x = a[1].toFloat();
      motion.cal.a1y = a[2].toFloat();
      if (n >= 5) {
        motion.cal.servoUp = a[3].toInt();
        motion.cal.servoDown = a[4].toInt();
      }
      saveCalibration();
      motion.magnet(false);
    }
    send(calibrationLine());
  } else if (verb == "POS") {
    send("POS " + String(motion.x, 1) + " " + String(motion.y, 1));
  } else if (verb == "LED" && n >= 3) {
    setLed(a[0].toInt(), a[1].toInt(), a[2].toInt());
    send("OK LED");
  } else if (verb == "BEEP") {
    beep(n ? a[0].toInt() : 1);
    send("OK BEEP");
  } else if (verb == "OFF") {
    motion.magnet(false);
    motion.enable(false);
    motion.homed = false;
    send("OK OFF");
  } else {
    send("ERR unknown command " + verb);
  }
}

// Commands arrive on the BLE task; they are queued and run on the main loop so that a long
// move never blocks Bluetooth. STOP bypasses the queue.
void enqueue(const String &line) {
  String t = line;
  t.trim();
  if (t.equalsIgnoreCase("STOP")) {
    g_abort = true;
    return;
  }
  char *copy = strdup(t.c_str());
  if (xQueueSend(commandQueue, &copy, 0) != pdTRUE) {
    free(copy);
    send("ERR busy");
  }
}

// ------------------------------------------------------------------ BLE
String bleBuffer;

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c, NimBLEConnInfo &info) override {
    std::string v = c->getValue();
    for (char ch : v) {
      if (ch == '\n' || ch == '\r') {
        if (bleBuffer.length()) enqueue(bleBuffer);
        bleBuffer = "";
      } else if (bleBuffer.length() < 200) {
        bleBuffer += ch;
      }
    }
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *s, NimBLEConnInfo &info) override {
    bleConnected = true;
    s->updateConnParams(info.getConnHandle(), 12, 24, 0, 400);
  }
  void onDisconnect(NimBLEServer *s, NimBLEConnInfo &info, int reason) override {
    bleConnected = false;
    bleBuffer = "";
    NimBLEDevice::startAdvertising();
  }
};

void setupBle() {
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setMTU(185);
  NimBLEServer *server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  NimBLEService *svc = server->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic *rx = svc->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  svc->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->setName(DEVICE_NAME);
  adv->addServiceUUID(NUS_SERVICE);
  adv->enableScanResponse(true);
  adv->start();
}

// ------------------------------------------------------------------ main
String serialBuffer;

void setup() {
  Serial.begin(115200);
  led.begin();
  setLed(0, 0, 40);
  loadCalibration();
  motion.begin();
  sensors.begin();
  commandQueue = xQueueCreate(16, sizeof(char *));
  setupBle();
  beep(1);
  send(String("HELLO OpenRook ") + FIRMWARE_VERSION + (sensors.present ? "" : " (sensor board not found)"));
}

void loop() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (serialBuffer.length()) enqueue(serialBuffer);
      serialBuffer = "";
    } else if (serialBuffer.length() < 200) {
      serialBuffer += ch;
    }
  }

  char *cmd;
  if (xQueueReceive(commandQueue, &cmd, 0) == pdTRUE) {
    g_abort = false;
    execute(String(cmd));
    free(cmd);
    if (g_abort) {
      motion.magnet(false);
      motion.homed = false;  // steps were lost mid-move; re-home before the next one
      send("STOPPED");
      g_abort = false;
    }
    send("IDLE");
  }

  static uint32_t lastScan = 0;
  if (millis() - lastScan >= SCAN_INTERVAL_MS) {
    lastScan = millis();
    uint64_t stable;
    if (sensors.poll(stable)) {
      occupancy = stable;
      reportBoard();
    }
  }

  static bool wasConnected = false;
  if (bleConnected != wasConnected) {
    wasConnected = bleConnected;
    setLed(0, bleConnected ? 40 : 0, bleConnected ? 0 : 40);
    if (bleConnected) sensors.forceReport();
  }
}
