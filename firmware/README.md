# Firmware (ESP32)

`OpenRook/` is an Arduino sketch for an ESP32 DevKit (ESP32-WROOM-32). It reads the 64 reed
switches through an MCP23017, drives the CoreXY gantry and the magnet servo, and talks to the
app over Bluetooth LE. All chess logic is in the app; the board protocol is in
[PROTOCOL.md](PROTOCOL.md).

## Flash it

**Arduino IDE**

1. *Preferences → Additional boards manager URLs*:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`, then install **esp32**
   (3.x) in the Boards Manager.
2. Library Manager: install **NimBLE-Arduino** (2.x), **ESP32Servo** and **Adafruit NeoPixel**.
3. Open `OpenRook/OpenRook.ino`, board **ESP32 Dev Module**, pick the port, Upload.

**arduino-cli**

```sh
arduino-cli core install esp32:esp32
arduino-cli lib install "NimBLE-Arduino" "ESP32Servo" "Adafruit NeoPixel"
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/OpenRook
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 firmware/OpenRook
```

**No toolchain**: every CI run attaches `OpenRook.ino.merged.bin`; flash it at offset 0 with
<https://espressif.github.io/esptool-js/>.

## First power-up

1. Open the Serial Monitor at 115200: you should see `HELLO OpenRook 1.0.0`. Type `SCAN` and put a
   piece on a few squares (`BOARD …` changes).
2. Type `HOME`. The carriage should go left then towards you and stop on the switches. If an
   axis runs the wrong way, flip `INVERT_A_DIR` / `INVERT_B_DIR` in `config.h`; if X and Y are
   swapped, swap the motor plugs.
3. In the app: *Board → Calibration*. Find the servo angles where the magnet just touches the
   underside of the board (up) and is clear of it (down), then *Go to a1* and adjust a1 X/Y
   until the magnet is under the centre of a1; *Check h8*; *Save to board*.
4. Put a piece on e2 and press *Test: e2→e4*.

`config.h` has the pins, steps/mm, speeds and limits.
