"""Draws the OpenRook schematics as SVG: controller.svg and sensor_matrix.svg.

    python3 hardware/schematic/make_schematic.py

No dependencies. Nets are joined by name: every pin ends in a net label, and labels with the
same name are connected (the usual net-label style). WIRING.md lists the same nets as a table.
"""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
COLORS = {'+12V': '#b22222', '+5V': '#d2691e', '+3V3': '#b8860b', 'GND': '#000'}
NETC = '#1f3a93'


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.items = w, h, []

    def add(self, s):
        self.items.append(s)

    def line(self, x1, y1, x2, y2, color='#000', w=1.6):
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{w}"/>')

    def text(self, x, y, s, size=13, anchor='start', color='#000', weight='normal'):
        s = s.replace('&', '&amp;').replace('<', '&lt;')
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" fill="{color}" font-weight="{weight}">{s}</text>')

    def rect(self, x, y, w, h, fill='#fffbe9'):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#000" stroke-width="1.8" rx="3"/>')

    def path(self, d, fill='none', w=1.6):
        self.add(f'<path d="{d}" fill="{fill}" stroke="#000" stroke-width="{w}"/>')

    def dot(self, x, y):
        self.add(f'<circle cx="{x}" cy="{y}" r="3.2" fill="#000"/>')

    def save(self, name):
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" '
                    f'font-family="Helvetica, Arial, sans-serif">\n<rect width="100%" height="100%" fill="#fff"/>\n')
            f.write('\n'.join(self.items))
            f.write('\n</svg>\n')


def ground(s, x, y):
    s.line(x, y, x, y + 8)
    s.line(x - 9, y + 8, x + 9, y + 8, '#000', 2)
    s.line(x - 5, y + 12, x + 5, y + 12, '#000', 2)
    s.line(x - 2, y + 16, x + 2, y + 16, '#000', 2)


def net_label(s, x, y, net, side):
    """Net label at the end of a pin stub that went left ('l') or right ('r')."""
    if net == 'GND':
        ground(s, x, y)
        return
    c = COLORS.get(net, NETC)
    s.text(x - 4 if side == 'l' else x + 4, y + 4, net, 12, 'end' if side == 'l' else 'start', c, 'bold')


def module(s, x, y, title, left, right, w=200, pitch=24, subtitle=''):
    """A module/IC box. left/right: lists of (pin name, net); net '' = not connected."""
    n = max(len(left), len(right))
    s.rect(x, y, w, n * pitch + 28)
    s.text(x + w / 2, y - 22 if subtitle else y - 8, title, 14, 'middle', '#000', 'bold')
    if subtitle:
        s.text(x + w / 2, y - 7, subtitle, 11, 'middle', '#555')
    for i, (pin, net) in enumerate(left):
        py = y + 24 + i * pitch
        s.text(x + 6, py + 4, pin, 12)
        if net:
            s.line(x - 34, py, x, py, COLORS.get(net, NETC))
            net_label(s, x - 34, py, net, 'l')
        else:
            s.text(x - 12, py + 5, '×', 13, 'middle', '#999')
    for i, (pin, net) in enumerate(right):
        py = y + 24 + i * pitch
        s.text(x + w - 6, py + 4, pin, 12, 'end')
        if net:
            s.line(x + w, py, x + w + 34, py, COLORS.get(net, NETC))
            net_label(s, x + w + 34, py, net, 'r')
        else:
            s.text(x + w + 12, py + 5, '×', 13, 'middle', '#999')


def resistor_v(s, x, y, length=70):
    seg = (length - 20) / 6
    d = f'M{x},{y} L{x},{y + 10}'
    for i in range(6):
        d += f' L{x + (8 if i % 2 == 0 else -8)},{y + 10 + seg * (i + 0.5)}'
    d += f' L{x},{y + length - 10} L{x},{y + length}'
    s.path(d)


def resistor_h(s, x, y, length=60):
    seg = (length - 20) / 6
    d = f'M{x},{y} L{x + 10},{y}'
    for i in range(6):
        d += f' L{x + 10 + seg * (i + 0.5)},{y + (8 if i % 2 == 0 else -8)}'
    d += f' L{x + length - 10},{y} L{x + length},{y}'
    s.path(d)


def capacitor_v(s, x, y, length=70, polar=False):
    m = y + length / 2
    s.line(x, y, x, m - 4)
    s.line(x, m + 4, x, y + length)
    s.line(x - 14, m - 4, x + 14, m - 4, '#000', 2.4)
    if polar:
        s.path(f'M{x - 14},{m + 9} Q{x},{m + 1} {x + 14},{m + 9}', w=2.4)
        s.text(x - 20, m - 8, '+', 14)
    else:
        s.line(x - 14, m + 4, x + 14, m + 4, '#000', 2.4)


def diode_v(s, x, y, length=70, up=False):
    """Vertical diode; current flows downward (cathode bar at the bottom) unless up=True."""
    m = y + length / 2
    s.line(x, y, x, m - 9)
    s.line(x, m + 9, x, y + length)
    if up:
        s.path(f'M{x - 10},{m + 8} L{x + 10},{m + 8} L{x},{m - 8} Z', '#fff')
        s.line(x - 11, m - 9, x + 11, m - 9, '#000', 2.4)
    else:
        s.path(f'M{x - 10},{m - 8} L{x + 10},{m - 8} L{x},{m + 8} Z', '#fff')
        s.line(x - 11, m + 9, x + 11, m + 9, '#000', 2.4)


def vpart(s, x, y, kind, top, bottom, ref, value, length=70, **kw):
    """Two-terminal part drawn vertically between net 'top' and net 'bottom'."""
    s.text(x, y - 6, top, 12, 'middle', COLORS.get(top, NETC), 'bold')
    {'R': resistor_v, 'C': capacitor_v, 'D': diode_v}[kind](s, x, y, length, **kw)
    s.text(x + 20, y + length / 2 - 2, ref, 12, 'start', '#000', 'bold')
    s.text(x + 20, y + length / 2 + 13, value, 11, 'start', '#444')
    if bottom == 'GND':
        ground(s, x, y + length)
    else:
        s.text(x, y + length + 15, bottom, 12, 'middle', COLORS.get(bottom, NETC), 'bold')


def controller():
    s = Svg(1660, 1260)
    s.text(30, 36, 'OpenRook controller — sheet 1 of 2', 22, weight='bold')
    s.text(30, 58, 'Modules plug into female headers on one perfboard. Labels with the same name are connected; × = not connected. '
                   'Parts: hardware/mouser-bom.csv.', 12, color='#444')

    # ---- power
    s.text(30, 100, 'POWER', 15, weight='bold')
    module(s, 80, 150, 'J1 DC jack', [], [('+ centre', '+12V'), ('− sleeve', 'GND')], w=120, subtitle='12 V in, 5.5 × 2.1 mm')
    vpart(s, 360, 140, 'C', '+12V', 'GND', 'C1', '100 µF 35 V', polar=True)
    module(s, 80, 300, 'U1 TSR 2-2450', [], [('1 VIN', '+12V'), ('2 GND', 'GND'), ('3 VOUT', '+5V')], w=120, subtitle='12 V → 5 V, 2 A')
    vpart(s, 360, 300, 'C', '+5V', 'GND', 'C2', '100 µF 35 V', polar=True)
    s.text(80, 450, '+3V3 comes from the ESP32 board\'s own regulator', 11, color='#444')
    s.text(80, 465, '(its 3V3 pin); it feeds U5 and the drivers\' logic.', 11, color='#444')

    # ---- ESP32
    module(s, 590, 150, 'U2 ESP32-DevKitC-32E',
           [('5V', '+5V'), ('3V3', '+3V3'), ('GND', 'GND')],
           [('GPIO25', 'A_STEP'), ('GPIO26', 'A_DIR'), ('GPIO27', 'B_STEP'), ('GPIO14', 'B_DIR'), ('GPIO13', 'MOT_EN'),
            ('GPIO32', 'X_MIN'), ('GPIO33', 'Y_MIN'), ('GPIO18', 'SERVO'), ('GPIO21', 'SDA'), ('GPIO22', 'SCL'),
            ('GPIO23', 'LED_DIN'), ('GPIO19', 'BUZZ')], w=180, subtitle='in 2 × 19-pin female headers')

    # ---- drivers
    for k, (ref, st, di, m) in enumerate([('U3', 'A_STEP', 'A_DIR', 'MA'), ('U4', 'B_STEP', 'B_DIR', 'MB')]):
        y = 150 + k * 290
        module(s, 1110, y, f'{ref} TMC2209 module, motor {"AB"[k]}',
               [('EN', 'MOT_EN'), ('MS1', '+3V3'), ('MS2', '+3V3'), ('PDN/RX', ''), ('TX', ''), ('CLK', ''), ('STEP', st), ('DIR', di)],
               [('VM', '+12V'), ('GND', 'GND'), ('2B', f'{m}_2B'), ('2A', f'{m}_2A'), ('1A', f'{m}_1A'), ('1B', f'{m}_1B'), ('VDD', '+3V3'),
                ('GND', 'GND')], w=170, subtitle='StepStick pinout, 2 × 8-pin headers')
        vpart(s, 1560, y + 20, 'C', '+12V', 'GND', f'C{4 + k}', '100 µF 35 V', polar=True)
    s.text(1080, 735, 'MS1 = MS2 = 3V3 → 16 microsteps = 80 steps/mm (firmware config.h).', 11, color='#444')
    s.text(1080, 750, 'C4 / C5 right at each driver\'s VM and GND pins.', 11, color='#444')
    s.text(1080, 765, 'Motor current: turn the module\'s trimmer to Vref ≈ 0.5 V (≈ 0.35 A).', 11, color='#444')
    s.text(1080, 780, 'Motor coils to screw terminals J7 (MA_*) and J8 (MB_*): 1A/1B = coil 1, 2A/2B = coil 2.', 11, color='#444')

    # ---- MCP23017
    module(s, 590, 580, 'U5 MCP23017-E/SP',
           [('9 VDD', '+3V3'), ('10 VSS', 'GND'), ('12 SCL', 'SCL'), ('13 SDA', 'SDA'), ('15 A0', 'GND'), ('16 A1', 'GND'),
            ('17 A2', 'GND'), ('18 RESET', 'RESET'), ('19 INTB', ''), ('20 INTA', ''), ('11, 14', '')],
           [('21 GPA0', 'RANK1'), ('22 GPA1', 'RANK2'), ('23 GPA2', 'RANK3'), ('24 GPA3', 'RANK4'), ('25 GPA4', 'RANK5'),
            ('26 GPA5', 'RANK6'), ('27 GPA6', 'RANK7'), ('28 GPA7', 'RANK8'), ('1 GPB0', 'FILE_A'), ('2 GPB1', 'FILE_B'),
            ('3 GPB2', 'FILE_C'), ('4 GPB3', 'FILE_D'), ('5 GPB4', 'FILE_E'), ('6 GPB5', 'FILE_F'), ('7 GPB6', 'FILE_G'),
            ('8 GPB7', 'FILE_H')], w=180, subtitle='28-pin DIP socket, I²C address 0x20')
    vpart(s, 100, 600, 'R', '+3V3', 'SDA', 'R1', '4.7 kΩ')
    vpart(s, 210, 600, 'R', '+3V3', 'SCL', 'R2', '4.7 kΩ')
    vpart(s, 320, 600, 'R', '+3V3', 'RESET', 'R3', '10 kΩ')
    vpart(s, 430, 600, 'C', '+3V3', 'GND', 'C3', '100 nF')
    s.text(80, 730, 'C3 right across U5 pins 9 and 10.', 11, color='#444')

    # ---- sensor connectors
    module(s, 1110, 850, 'J5 ranks · J6 files', [(f'J5-{i + 1}', f'RANK{i + 1}') for i in range(8)],
           [(f'J6-{i + 1}', f'FILE_{"ABCDEFGH"[i]}') for i in range(8)], w=170, subtitle='2 × 8-pin male headers → tiles (sheet 2)')

    # ---- servo, endstops
    s.text(30, 800, 'CONNECTORS', 15, weight='bold')
    module(s, 80, 850, 'J2 servo', [], [('signal (orange)', 'SERVO'), ('+ (red)', '+5V'), ('− (brown)', 'GND')], w=140,
           subtitle='3-pin male header')
    module(s, 80, 1010, 'J3 X endstop', [], [('C', 'X_MIN'), ('NO', 'GND')], w=140, subtitle='microswitch')
    module(s, 80, 1130, 'J4 Y endstop', [], [('C', 'Y_MIN'), ('NO', 'GND')], w=140, subtitle='microswitch')

    # ---- status LED
    lx, ly = 480, 1030
    s.text(lx - 80, ly - 30, 'STATUS LED', 13, weight='bold')
    vpart(s, lx + 60, ly, 'D', '+5V', '', 'D1', '1N4148')
    s.text(lx + 80, ly + 58, '(LED gets ≈ 4.3 V)', 10, color='#444')
    s.rect(lx + 10, ly + 90, 100, 66)
    s.line(lx + 60, ly + 70, lx + 60, ly + 90)
    s.text(lx + 60, ly + 120, 'LED1', 13, 'middle', weight='bold')
    s.text(lx + 60, ly + 136, 'WS2812 5 mm', 11, 'middle')
    s.text(lx + 64, ly + 103, 'VDD', 10)
    s.text(lx + 14, ly + 127, 'DIN', 10)
    s.line(lx + 60, ly + 156, lx + 60, ly + 170)
    ground(s, lx + 60, ly + 170)
    s.text(lx - 100, ly + 127, 'LED_DIN', 12, 'end', NETC, 'bold')
    resistor_h(s, lx - 96, ly + 123, 106)
    s.text(lx - 43, ly + 108, 'R4 330 Ω', 11, 'middle', weight='bold')

    # ---- buzzer
    bx, by = 830, 1050
    s.text(bx - 40, by - 20, 'BUZZER', 13, weight='bold')
    s.text(bx, by - 4, '+5V', 12, 'middle', COLORS['+5V'], 'bold')
    s.line(bx, by, bx, by + 20)
    s.rect(bx - 18, by + 20, 36, 50, '#fff')
    s.text(bx, by + 50, 'BZ1', 11, 'middle', weight='bold')
    s.text(bx - 24, by + 40, 'CEM-1203(42)', 10, 'end', '#444')
    s.line(bx, by + 70, bx, by + 100)
    s.line(bx, by + 10, bx + 70, by + 10)
    s.line(bx, by + 90, bx + 70, by + 90)
    diode_v(s, bx + 70, by + 10, 80, up=True)
    s.dot(bx, by + 10)
    s.dot(bx, by + 90)
    s.text(bx + 86, by + 46, 'D2 1N4148', 12, weight='bold')
    s.text(bx + 86, by + 60, 'flyback', 10, color='#444')
    tx, ty = bx, by + 140  # NPN: collector up at (tx, ty-30), emitter down
    s.add(f'<circle cx="{tx - 8}" cy="{ty}" r="22" fill="none" stroke="#000" stroke-width="1.6"/>')
    s.line(tx - 18, ty - 14, tx - 18, ty + 14, '#000', 2.6)
    s.line(tx - 18, ty - 6, tx, ty - 20)
    s.line(tx, ty - 20, tx, by + 100)
    s.line(tx - 18, ty + 6, tx, ty + 20)
    s.path(f'M{tx - 7},{ty + 19} L{tx},{ty + 20} L{tx - 3},{ty + 13}')
    s.line(tx, ty + 20, tx, ty + 36)
    ground(s, tx, ty + 36)
    s.text(tx + 22, ty + 4, 'Q1 2N3904', 12, weight='bold')
    s.line(tx - 30, ty, tx - 18, ty)
    resistor_h(s, tx - 110, ty, 80)
    s.text(tx - 70, ty - 14, 'R5 1 kΩ', 11, 'middle', weight='bold')
    s.text(tx - 114, ty + 4, 'BUZZ', 12, 'end', NETC, 'bold')

    s.save('controller.svg')


def matrix():
    sx, sy = 150, 120
    left, top = 150, 130
    s = Svg(left + 8 * sx + 40, top + 8 * sy + 40)
    s.text(30, 36, 'OpenRook sensor matrix — sheet 2 of 2', 22, weight='bold')
    s.text(30, 58, 'One reed switch (SW) + one 1N4148 per square: 64 of each. Diode band (cathode) towards the RANK line. '
                   'RANKn → J5 pin n (MCP23017 GPA n−1); FILE_x → J6 (GPB).', 12, color='#444')
    s.text(30, 76, 'Squares as seen from White. Each switch lies in the groove at the centre of its square on the tile underside.',
           12, color='#444')
    files = 'ABCDEFGH'
    for f in range(8):
        x = left + f * sx
        s.text(x, top - 16, f'FILE_{files[f]}', 13, 'middle', NETC, 'bold')
        s.line(x, top - 8, x, top + 8 * sy - 30, NETC, 2)
    for r in range(8):
        y = top + (8 - r) * sy - 30  # rank line under its row of squares
        s.text(left - 40, y + 4, f'RANK{r + 1}', 13, 'end', COLORS['+12V'], 'bold')
        s.line(left - 36, y, left + 7 * sx + 60, y, COLORS['+12V'], 2)
        for f in range(8):
            x = left + f * sx
            yt = y - sy + 22
            s.dot(x, yt)
            s.line(x, yt, x + 40, yt)
            # reed switch: glass envelope with an open contact
            s.add(f'<rect x="{x + 30}" y="{yt + 4}" width="20" height="34" fill="none" stroke="#5aa" stroke-width="1.2" rx="9"/>')
            s.line(x + 40, yt, x + 40, yt + 12)
            s.line(x + 40, yt + 12, x + 48, yt + 28)
            s.line(x + 40, yt + 30, x + 40, yt + 46)
            diode_v(s, x + 40, yt + 46, 38)
            s.line(x + 40, yt + 84, x + 40, y)
            s.dot(x + 40, y)
            s.text(x + 58, yt + 26, f'{files[f].lower()}{r + 1}', 12, weight='bold')
    s.save('sensor_matrix.svg')


if __name__ == '__main__':
    controller()
    matrix()
    print('wrote controller.svg and sensor_matrix.svg to', OUT)
