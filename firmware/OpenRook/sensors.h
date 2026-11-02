// The 8x8 reed-switch matrix, read through an MCP23017.
//
// Port A drives the eight rank lines (one at a time pulled low, the rest high-impedance) and
// port B reads the eight file lines with pull-ups. Every switch has a 1N4148 in series
// (cathode towards the rank line) so any number of pieces reads correctly.
#pragma once
#include <Arduino.h>
#include <Wire.h>

#include "config.h"

class Sensors {
 public:
  bool present = false;

  void begin() {
    Wire.begin(PIN_SDA, PIN_SCL, 400000);
    Wire.beginTransmission(MCP_ADDR);
    present = Wire.endTransmission() == 0;
    if (!present) return;
    write(0x0A, 0x00);  // IOCON: BANK=0, sequential
    write(0x14, 0x00);  // OLATA: rank lines drive low when enabled as outputs
    write(0x00, 0xFF);  // IODIRA: all ranks released
    write(0x01, 0xFF);  // IODIRB: files are inputs
    write(0x0D, 0xFF);  // GPPUB: pull-ups on files
    write(0x03, 0x00);  // IPOLB: normal polarity
  }

  // Bit (rank * 8 + file) is set when a piece stands on that square (a1 = bit 0, h8 = bit 63).
  uint64_t read() {
    if (!present) return 0;
    uint64_t bits = 0;
    for (int rank = 0; rank < 8; rank++) {
      write(0x00, (uint8_t) ~(1 << rank));
      delayMicroseconds(30);
      uint8_t files = ~readReg(0x13);
      bits |= (uint64_t)files << (rank * 8);
    }
    write(0x00, 0xFF);
    return bits;
  }

  // Debounced reading: returns true once when a new value has been stable for STABLE_SCANS.
  bool poll(uint64_t &stable) {
    uint64_t now = read();
    if (now == candidate_) {
      if (count_ < STABLE_SCANS) count_++;
    } else {
      candidate_ = now;
      count_ = 1;
    }
    if (count_ >= STABLE_SCANS && candidate_ != stable_) {
      stable_ = candidate_;
      stable = stable_;
      return true;
    }
    stable = stable_;
    return false;
  }

  uint64_t stable() const { return stable_; }
  void forceReport() { stable_ = ~candidate_; }

 private:
  uint64_t candidate_ = 0, stable_ = 0;
  int count_ = 0;

  void write(uint8_t reg, uint8_t v) {
    Wire.beginTransmission(MCP_ADDR);
    Wire.write(reg);
    Wire.write(v);
    Wire.endTransmission();
  }
  uint8_t readReg(uint8_t reg) {
    Wire.beginTransmission(MCP_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((int)MCP_ADDR, 1);
    return Wire.available() ? Wire.read() : 0xFF;
  }
};
