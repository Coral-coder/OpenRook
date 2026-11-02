// CoreXY motion: straight-line moves with a trapezoidal speed profile, homing, and the
// path planner that drags pieces along the lines between squares.
#pragma once
#include <Arduino.h>
#include <ESP32Servo.h>
#include <math.h>

#include "config.h"

extern volatile bool g_abort;  // set by STOP; checked every step

struct Calibration {
  float square = DEFAULT_SQUARE_MM;
  float a1x = DEFAULT_A1_X;
  float a1y = DEFAULT_A1_Y;
  int servoUp = DEFAULT_SERVO_UP;
  int servoDown = DEFAULT_SERVO_DOWN;
};

class Motion {
 public:
  Calibration cal;
  bool homed = false;
  bool magnetUp = false;
  float x = 0, y = 0;  // mm from home

  void begin() {
    pinMode(PIN_A_STEP, OUTPUT);
    pinMode(PIN_A_DIR, OUTPUT);
    pinMode(PIN_B_STEP, OUTPUT);
    pinMode(PIN_B_DIR, OUTPUT);
    pinMode(PIN_STEPPER_EN, OUTPUT);
    pinMode(PIN_X_MIN, INPUT_PULLUP);
    pinMode(PIN_Y_MIN, INPUT_PULLUP);
    enable(false);
    servo_.setPeriodHertz(50);
    servo_.attach(PIN_SERVO, 500, 2400);
    servo_.write(cal.servoDown);
  }

  void enable(bool on) { digitalWrite(PIN_STEPPER_EN, on ? LOW : HIGH); }

  void magnet(bool up) {
    servo_.write(up ? cal.servoUp : cal.servoDown);
    if (up != magnetUp) delay(SERVO_SETTLE_MS);
    magnetUp = up;
  }

  void servoRaw(int angle) { servo_.write(angle); }

  bool xMin() { return digitalRead(PIN_X_MIN) == LOW; }
  bool yMin() { return digitalRead(PIN_Y_MIN) == LOW; }

  // Moves in a straight line to (tx, ty). Returns false if aborted or out of range.
  bool lineTo(float tx, float ty, float speed) {
    if (tx < 0 || ty < 0 || tx > MAX_X || ty > MAX_Y) return false;
    long ax0 = lroundf((x + y) * STEPS_PER_MM), bx0 = lroundf((x - y) * STEPS_PER_MM);
    long ax1 = lroundf((tx + ty) * STEPS_PER_MM), bx1 = lroundf((tx - ty) * STEPS_PER_MM);
    bool ok = steps(ax1 - ax0, bx1 - bx0, speed, hypotf(tx - x, ty - y), nullptr);
    if (ok) {
      x = tx;
      y = ty;
    }
    return ok;
  }

  // Homes X then Y against the min endstops; position becomes (0, 0).
  bool home() {
    enable(true);
    magnet(false);
    homed = false;
    if (!homeAxis(true)) return false;
    if (!homeAxis(false)) return false;
    x = 0;
    y = 0;
    homed = true;
    return true;
  }

  // ------------------------------------------------------------ board geometry
  // Columns -2..-1 hold captured white pieces, 0..7 are files a..h, 8..9 captured black pieces.
  float colX(float col) { return cal.a1x + col * cal.square; }
  float rowY(float row) { return cal.a1y + row * cal.square; }

  bool goToCell(float col, float row, float speed) { return lineTo(colX(col), rowY(row), speed); }

  // Drags the piece at (fc, fr) to (tc, tr). occupied(c, r) tells whether a board square is
  // taken, so a clear straight or diagonal line is used when there is one; otherwise the piece
  // travels along the lines between squares, where it fits between the other pieces.
  bool dragPiece(int fc, int fr, int tc, int tr, bool (*occupied)(int, int)) {
    if (!homed && !home()) return false;
    enable(true);
    magnet(false);
    if (!goToCell(fc, fr, TRAVEL_SPEED)) return false;
    magnet(true);
    bool ok;
    if (clearLine(fc, fr, tc, tr, occupied)) {
      ok = goToCell(tc, tr, DRAG_SPEED);
    } else {
      float hx = tc > fc ? 0.5f : -0.5f;
      float hy = tr > fr ? 0.5f : -0.5f;
      if (tc == fc) hx = (fc >= 9) ? -0.5f : 0.5f;
      if (tr == fr) hy = (fr >= 7) ? -0.5f : 0.5f;
      float c1x = fc + hx, c1y = fr + hy;
      float c2x = (tc == fc) ? c1x : tc - hx;
      float c2y = (tr == fr) ? c1y : tr - hy;
      ok = goToCell(c1x, c1y, DRAG_SPEED) && goToCell(c2x, c1y, DRAG_SPEED) &&
           goToCell(c2x, c2y, DRAG_SPEED) && goToCell(tc, tr, DRAG_SPEED);
    }
    // A short settle so the piece sits centred, then drop the magnet.
    delay(80);
    magnet(false);
    return ok;
  }

 private:
  Servo servo_;

  static bool onBoard(int c, int r) { return c >= 0 && c < 8 && r >= 0 && r < 8; }

  bool clearLine(int fc, int fr, int tc, int tr, bool (*occupied)(int, int)) {
    if (!onBoard(fc, fr) || !onBoard(tc, tr)) return false;
    int dc = tc - fc, dr = tr - fr;
    if (abs(dc) <= 1 && abs(dr) <= 1) return true;
    if (dc != 0 && dr != 0 && abs(dc) != abs(dr)) return false;  // knight-like
    int sc = (dc > 0) - (dc < 0), sr = (dr > 0) - (dr < 0);
    for (int c = fc + sc, r = fr + sr; c != tc || r != tr; c += sc, r += sr) {
      if (occupied(c, r)) return false;
    }
    return true;
  }

  void dirs(long da, long db) {
    digitalWrite(PIN_A_DIR, (da >= 0) ^ INVERT_A_DIR ? HIGH : LOW);
    digitalWrite(PIN_B_DIR, (db >= 0) ^ INVERT_B_DIR ? HIGH : LOW);
  }

  // Bresenham over the two motors with a trapezoidal profile on the dominant one.
  // stop(), if given, ends the move early (homing) and reports success.
  bool steps(long da, long db, float speed, float lengthMm, bool (*stop)()) {
    long n = max(labs(da), labs(db));
    if (n == 0) return true;
    dirs(da, db);
    // Scale tool-space speed/accel to dominant-motor steps/s.
    float k = lengthMm > 0 ? (float)n / lengthMm : STEPS_PER_MM;
    float vmax = speed * k, v0 = START_SPEED * k, acc = ACCEL * k;
    long ea = 0, eb = 0, aa = labs(da), ab = labs(db);
    int64_t next = esp_timer_get_time();
    for (long i = 0; i < n; i++) {
      if (g_abort) return false;
      if (stop && stop()) return true;
      ea += aa;
      eb += ab;
      bool sa = false, sb = false;
      if (2 * ea >= n) { sa = true; ea -= n; }
      if (2 * eb >= n) { sb = true; eb -= n; }
      if (sa) digitalWrite(PIN_A_STEP, HIGH);
      if (sb) digitalWrite(PIN_B_STEP, HIGH);
      delayMicroseconds(2);
      digitalWrite(PIN_A_STEP, LOW);
      digitalWrite(PIN_B_STEP, LOW);
      float up = sqrtf(v0 * v0 + 2 * acc * i), down = sqrtf(v0 * v0 + 2 * acc * (n - i));
      float v = fminf(vmax, fminf(up, down));
      next += (int64_t)(1e6f / v);
      while (esp_timer_get_time() < next) {
      }
      if ((i & 1023) == 0) yield();
    }
    return true;
  }

  static bool hitX() { return digitalRead(PIN_X_MIN) == LOW; }
  static bool hitY() { return digitalRead(PIN_Y_MIN) == LOW; }

  bool homeAxis(bool isX) {
    bool (*hit)() = isX ? hitX : hitY;
    // CoreXY: pure X moves both motors the same way, pure Y moves them opposite.
    auto jog = [&](float mm, float speed, bool (*stop)()) {
      long s = lroundf(mm * STEPS_PER_MM);
      return isX ? steps(s, s, speed, fabsf(mm), stop) : steps(s, -s, speed, fabsf(mm), stop);
    };
    if (hit()) jog(10, HOMING_SPEED, nullptr);  // start off the switch
    if (!jog(-(isX ? MAX_X : MAX_Y) - 20, HOMING_SPEED, hit) || !hit()) return false;
    jog(4, HOMING_SPEED, nullptr);
    if (!jog(-8, HOMING_SPEED / 4, hit) || !hit()) return false;
    return !g_abort;
  }
};
