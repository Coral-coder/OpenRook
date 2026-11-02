// OpenRook firmware configuration.
//
// Pins are for a 38-pin ESP32 DevKit V1 (ESP32-WROOM-32). See hardware/WIRING.md for the
// full schematic. Mechanical numbers match 3d-prints/common.scad: change both together.
#pragma once

// ---------------------------------------------------------------- pins
// CoreXY stepper drivers (TMC2209 or A4988 in STEP/DIR mode).
#define PIN_A_STEP 25
#define PIN_A_DIR 26
#define PIN_B_STEP 27
#define PIN_B_DIR 14
#define PIN_STEPPER_EN 13  // low = drivers enabled (shared by both drivers)

// Endstops: normally-open microswitches to GND, internal pull-ups.
#define PIN_X_MIN 32
#define PIN_Y_MIN 33

// SG90 / MG90S servo that lifts the magnet up against the underside of the board.
#define PIN_SERVO 18

// MCP23017 (I2C address 0x20) scanning the 8x8 reed-switch matrix.
#define PIN_SDA 21
#define PIN_SCL 22
#define MCP_ADDR 0x20

// One WS2812 status LED (or a short strip / ring) and a passive buzzer.
#define PIN_LED 23
#define LED_COUNT 1
#define PIN_BUZZER 19

// ---------------------------------------------------------------- mechanics
// GT2 belt, 20-tooth pulleys, 1.8 degree motors at 16 microsteps: 200*16/(20*2) = 80.
#define STEPS_PER_MM 80.0f

// Flip if an axis homes the wrong way (CoreXY: swap these before swapping motor wires).
#define INVERT_A_DIR false
#define INVERT_B_DIR false

// Square pitch and where the centre of a1 is, measured from the homed position (mm).
// These are defaults: calibrate from the app (Board -> Calibrate) and they are saved in flash.
#define DEFAULT_SQUARE_MM 40.0f
#define DEFAULT_A1_X 62.0f   // one capture column (40 mm) + the lane beside it (20 mm) + 2 mm
#define DEFAULT_A1_Y 25.0f

// Soft limits of the carriage (mm from home): lanes from column -1.5 to 8.5, rows -0.5 to 7.5.
// Building the wide version with two capture columns per side? Raise MAX_X by 80 and
// DEFAULT_A1_X by 40, and set "Capture slots" to 16 in the app.
#define MAX_X 425.0f
#define MAX_Y 335.0f

// Speeds (mm/s) and acceleration (mm/s^2).
#define TRAVEL_SPEED 220.0f   // magnet down, carriage alone
#define DRAG_SPEED 90.0f      // magnet up, dragging a piece
#define HOMING_SPEED 40.0f
#define ACCEL 900.0f
#define START_SPEED 15.0f

// Servo angles (degrees): magnet touching the board / clear of it. Calibrated from the app.
#define DEFAULT_SERVO_UP 20
#define DEFAULT_SERVO_DOWN 95
#define SERVO_SETTLE_MS 250

// Sensor scanning
#define SCAN_INTERVAL_MS 15
#define STABLE_SCANS 4  // a reading must repeat this many times before it is reported

#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_NAME "OpenRook"
