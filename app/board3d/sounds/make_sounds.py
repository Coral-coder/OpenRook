"""Builds the battle sound cues (app/board3d/sounds/*.mp3) from recorded source files.

Every cue is layered and processed from real recordings (see CREDITS.md): pitched (tape-speed
style), filtered, put into a synthetic stone-hall reverb, trimmed, loudness-normalised and encoded
as mono MP3 (which iOS WKWebView and Android WebView both decode with decodeAudioData).

usage: python3 make_sounds.py <downloads dir> [out dir (default: here)] [cue ...]
The downloads dir holds one folder per source, named as in CREDITS.md (archives extracted into
<folder>/x/). Needs ffmpeg (with libmp3lame), numpy, scipy and soundfile.
"""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sndlib as L  # noqa: E402

D = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else HERE
SR = L.SR
_cache = {}


def src(rel):
    p = os.path.join(D, rel)
    if p not in _cache:
        _cache[p] = L.load(p)
    return _cache[p]


def S(rel, a=None, b=None, sp=1.0):
    """A source (optionally a slice a..b seconds), at tape speed sp."""
    x = src(rel)
    if a is not None:
        x = L.seg(x, a, b if b is not None else len(x) / SR)
    else:  # whole file: drop its leading silence so layers line up on their onsets
        db = L.frame_db(x, 64) - 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        x = x[max(0, np.argmax(db > -36) * 64 - 64):]
    x = L.fade(x, 0.002, 0.02)
    return L.speed(x, sp) if sp != 1 else x.copy()


def EV(rel, i, length, sp=1.0, rise=18, pre=0.005):
    """Event i of a long take, `length` seconds from its onset."""
    key = (rel, rise)
    if key not in _cache:
        _cache[key] = L.events(src(rel), rise=rise)
    a0, b0, _ = _cache[key][i]
    seg = L.seg(src(rel), a0, b0)
    a = a0 + np.argmax(np.abs(seg)) / SR - 0.012 - pre  # start just before the loudest moment (the contact)
    a = max(a0, a)
    return S(rel, a, a + length, sp)


def rev(x):
    return x[::-1].copy()


def hp(x, f):
    return L.bq(x, 'high', f)


def lp(x, f):
    return L.bq(x, 'low', f)


def mix(*layers):
    return L.mix(*[(l[0], l[1] if len(l) > 1 else 0, l[2] if len(l) > 2 else 0) for l in layers])


def ramp_in(x, t):
    x = x.copy(); n = min(len(x), int(t * SR))
    x[:n] *= np.linspace(0, 1, n) ** 2
    return x


def fade_out(x, t):
    x = x.copy(); n = min(len(x), int(t * SR))
    x[-n:] *= np.linspace(1, 0, n) ** 1.5
    return x


def room(x, wet=-14, t60=1.6, damp=4500):
    return L.reverb(x, wet, t60, damp)


MED = 'medieval1/x/'
SNS = MED + 'Sabre Norse Sword Blade on Blade.wav'
ANS = MED + 'Axe Norse Sword Blade on Blade.wav'
MNS = MED + 'Mace Norse Sword Blade.wav'
MSH = MED + 'Mace Spear Haft.wav'
BF = 'breakfall/x/bfh1_'
FZ = 'fantozzi/x/Fantozzi-footsteps/flac/Fantozzi-'
TOWEL = 'towel/x/wet_towel_on_floor/wet_towel_on_floor-%02d.flac'
CAVE = 'cavein/cave_in_-_starninjas.ogg'
BOULDER = 'boulderdrop/boulder_drop.ogg'
ROCK = 'rockbreak/rock_break.ogg'
MUFF = 'muffled/NenadSimic%20-%20Muffled%20Distant%20Explosion.wav'
QUAKE = 'quake/shake.flac'
THUNDER = 'rainthunder/rain-thunder.ogg'
SWISH = 'swishes/x/swishes/swish-%d.wav'
SWING = 'rpgpack/x/RPG Sound Pack/battle/swing%s.wav'
DEEP = 'deepbreaks/x/Deep Break %d.wav'
CRUNCH = 'crunch/x/impcrunch/impactcrunch%02d.mp3.flac'
IMPACT = 'impactsn/x/impact.%d.ogg'
ICE = 'ice/x/IceShatters/LedasLuzta%s.ogg'
DARK = 'darkmagic/x/dark_magic/fout-%02d.flac'
AIR = 'airwhoosh/whoosh2_0.wav'
PAVE = 'usc_pavement/G38-10-Horse%20Walks%20on%20Pavement.flac'
WHINNY = 'usc_whinny12/G38-12-Horse%20Whinnies.flac'


def lowboost(x, db=4, fc=160):
    return L.shelf_low(x, fc, db)


R = {}  # cue -> list of variant builders (each a lambda returning a signal)

# ---------------------------------------------------------------- steel
R['sword_swing'] = [
    lambda: room(lp(mix((S(SWISH % 3, sp=0.8),), (S(SWING % '', sp=0.85), -6, 0.01)), 6000), -18),
    lambda: room(lp(mix((S(SWISH % 7, sp=0.78),), (S(SWING % '2', sp=0.8), -6, 0.0)), 6000), -18),
    lambda: room(lp(mix((S(SWISH % 8, sp=0.84),), (S(SWING % '3', sp=0.82), -6, 0.01)), 6000), -18),
]


def clash(f, i, sp):
    blade = L.dering(L.env_exp(EV(f, i, 0.6, sp), 0.2), 3, -9)  # cut before the next hit; only a brief ring
    body = lp(S(TOWEL % 3, sp=0.7), 900)
    return room(lowboost(mix((blade,), (body, -10, 0.0))), -13, 1.7)


R['sword_clash'] = [
    lambda: clash(ANS, 3, 0.82), lambda: clash(ANS, 6, 0.8),
    lambda: clash(MNS, 5, 0.84), lambda: clash(SNS, 13, 0.78),
]


def blade_on_stone(i, stone, chips, sp):
    blade = L.dering(L.env_exp(EV(ANS, i, 0.4, sp), 0.06), 3)
    return room(mix((blade, -3), (S(stone, sp=0.85), 0, 0.0), (hp(S(chips), 1500), -8, 0.03)), -13)


R['sword_hit_stone'] = [
    lambda: blade_on_stone(9, BF + 'rock_hit_01.ogg', BF + 'rock_falling_04.ogg', 0.8),
    lambda: blade_on_stone(8, 'rpg80/x/item_stone_01.ogg', BF + 'rock_falling_06.ogg', 0.85),
    lambda: blade_on_stone(2, BF + 'rock_breaking_03.ogg', BF + 'rock_falling_05.ogg', 0.78),
]
R['stab'] = [
    lambda: room(mix((S('kenneyrpg/x/OGG/knifeSlice.ogg', sp=0.7), -2), (S(CRUNCH % 3, 0.05, None, 0.85), -3, 0.08),
                     (lp(S(TOWEL % 2, sp=0.6), 1500), -6, 0.1)), -15),
    lambda: room(mix((S('kenneyrpg/x/OGG/knifeSlice2.ogg', sp=0.72), -2), (S(CRUNCH % 4, 0.08, None, 0.8), -3, 0.07),
                     (lp(S(TOWEL % 3, sp=0.6), 1500), -6, 0.09)), -15),
    lambda: room(mix((S('kenneyrpg/x/OGG/knifeSlice.ogg', sp=0.66), -2), (S(CRUNCH % 1, 0.05, None, 0.8), -4, 0.09),
                     (lp(S(TOWEL % 5, sp=0.6), 1500), -6, 0.1)), -15),
]


def block(i, imp, sp):
    return room(L.dering(lowboost(mix((L.env_exp(EV(MSH, i, 0.6, sp), 0.18), -2), (lp(S(IMPACT % imp, sp=0.55), 1800), 0, 0.0))), 4), -13, 1.7)


R['shield_block'] = [lambda: block(2, 10, 0.75), lambda: block(5, 4, 0.72), lambda: block(0, 8, 0.78)]
R['shield_bash'] = [
    lambda: room(lowboost(mix((S('sfx100/x/slam_02.ogg', sp=0.8),), (S('sfx100v2/x/sfx100v2_metal_hit_01.ogg', sp=0.7), -6),
                              (lp(S(BOULDER, sp=0.8), 1200), -6))), -12),
    lambda: room(lowboost(mix((S('sfx100/x/slam_03.ogg', sp=0.78),), (EV(MSH, 9, 0.5, 0.7), -6),
                              (lp(S(BOULDER, sp=0.75), 1200), -6))), -12),
]

# ---------------------------------------------------------------- stone
R['stone_crack'] = [
    lambda: room(mix((S(DEEP % 1, sp=0.75),), (S(BF + 'rock_breaking_03.ogg', sp=0.8), -9, 0.01)), -13),
    lambda: room(mix((S(DEEP % 6, sp=0.72),), (S(BF + 'rock_breaking_01.ogg', sp=0.8), -10, 0.01)), -13),
    lambda: room(mix((S(DEEP % 8, sp=0.78),), (S(BF + 'rock_falling_04.ogg', sp=0.8), -10, 0.02)), -13),
]
R['stone_break_small'] = [
    lambda: room(mix((S(ROCK, sp=0.9),), (S(BF + 'rock_breaking_02.ogg', sp=0.85), -5, 0.0), (S(BF + 'rock_falling_01.ogg'), -9, 0.1)), -13),
    lambda: room(mix((S(ROCK, sp=0.82),), (S(BF + 'rock_breaking_01.ogg', sp=0.8), -6, 0.0), (S(BF + 'rock_falling_09.ogg'), -9, 0.08)), -13),
    lambda: room(mix((S(ROCK, sp=0.97),), (S(BF + 'rock_breaking_03.ogg', sp=0.85), -5, 0.0), (S('rpg80/x/stones_02.ogg'), -9, 0.09)), -13),
]


def big_break(sp, cave_at, crunch):
    return room(lowboost(mix(
        (S(BOULDER, sp=sp),), (S(ROCK, sp=sp * 0.9), -2, 0.005), (S(CRUNCH % crunch, 0.08, None, 0.7), -5, 0.02),
        (fade_out(ramp_in(S(CAVE, cave_at, cave_at + 1.6, 0.85), 0.05), 0.8), -6, 0.1),
        (fade_out(S(MUFF, 0, 0.9), 0.5), -8, 0.0)), 5), -11, 2.0)


R['stone_break_large'] = [lambda: big_break(0.7, 0.4, 4), lambda: big_break(0.64, 1.6, 3), lambda: big_break(0.76, 2.5, 1)]
R['stone_crumble'] = [
    lambda: room(mix((fade_out(ramp_in(S(CAVE, 0.3, 1.8, 0.8), 0.04), 0.6),), (S('rpg80/x/stones_02.ogg', sp=0.8), -4, 0.05)), -13),
    lambda: room(mix((fade_out(ramp_in(S(CAVE, 1.5, 3.0, 0.8), 0.04), 0.6),), (S('rpg80/x/stones_03.ogg', sp=0.8), -4, 0.04)), -13),
    lambda: room(mix((fade_out(ramp_in(S(CAVE, 2.5, 4.0, 0.76), 0.04), 0.6),), (S(BF + 'rock_falling_03.ogg', sp=0.8), -4, 0.03)), -13),
]


def bodyfall(sp, towel, stones):
    return room(lowboost(mix((lp(S(BOULDER, sp=sp), 3000),), (lp(S(TOWEL % towel, sp=0.6), 2000), -4, 0.0),
                             (S(stones), -8, 0.06), (fade_out(S(MUFF, 0, 0.6), 0.4), -10))), -12, 1.8)


R['body_fall'] = [lambda: bodyfall(0.8, 1, 'rpg80/x/stones_01.ogg'), lambda: bodyfall(0.74, 3, BF + 'rock_falling_02.ogg'),
                  lambda: bodyfall(0.86, 5, 'rpg80/x/stones_04.ogg')]


def dust(at, sp, pebble):
    return room(mix((fade_out(ramp_in(hp(S(CAVE, at, at + 1.0, sp), 1200), 0.08), 0.5),), (hp(S(pebble), 800), -10, 0.05)), -14)


R['dust'] = [lambda: dust(0.6, 1.1, BF + 'rock_falling_05.ogg'), lambda: dust(1.9, 1.05, BF + 'rock_falling_06.ogg'),
             lambda: dust(3.0, 1.15, BF + 'rock_falling_08.ogg')]
R['footstep_stone'] = [lambda f=f: room(hp(S(FZ + f + '.flac', sp=0.88), 70), -16) for f in ('StoneL1', 'StoneL3', 'StoneR2', 'StoneR3')]


def heavy(f, sp):
    return room(lowboost(mix((S(FZ + f + '.flac', sp=0.62),), (lp(S(BOULDER, sp=sp), 1500), -3), (S('rpg80/x/stones_04.ogg', sp=0.8), -14, 0.02)), 4), -13, 1.8)


R['footstep_heavy'] = [lambda: heavy('StoneL2', 0.9), lambda: heavy('StoneR1', 0.85), lambda: heavy('StoneL3', 0.95)]
def tape(rel, a, b, sp=1.0):
    """A slice of an old USC tape transfer, with its steady hiss and tones subtracted."""
    x = L.seg(src(rel), a, b)
    return L.speed(L.fade(L.denoise(x, src(rel)), 0.002, 0.03), sp) if sp != 1 else L.fade(L.denoise(x, src(rel)), 0.002, 0.03)


R['hoof'] = [lambda t=t: room(L.dering(lp(hp(tape(PAVE, 20 + t, 20 + t + 0.34, 0.95), 160), 9000), 6, -16, 0.03, 5), -14) for t in (2.01, 4.49, 6.07, 8.54)]
R['horse_neigh'] = [lambda a=a, b=b: room(lp(hp(fade_out(tape(WHINNY, a, b), 0.3), 220), 9000), -13, 1.8) for a, b in ((3.2, 5.15), (14.74, 17.15))]
R['clap'] = [
    lambda: room(mix((hp(S(TOWEL % 1, sp=1.15), 300),), (S('rpg80/x/item_stone_01.ogg', 0.14, None, 0.8), -4, 0.0)), -8, 2.2),
    lambda: room(mix((hp(S(TOWEL % 6, sp=1.1), 300),), (S(BF + 'rock_hit_01.ogg', sp=0.8), -4, 0.0)), -8, 2.2),
]

# ---------------------------------------------------------------- magic
R['spell_charge'] = [
    lambda: room(ramp_in(mix((S('teleport/teleport.wav', 0.05, 1.35),), (rev(S('fire/fire-1.wav', 0.5, 1.8, 0.8)), -6)), 0.9), -14),
    lambda: room(ramp_in(mix((rev(S(DARK % 2, 0, 1.2)), -2), (S('earthspell/Earth%20Element%20Magic%20Spell_0.flac', 0.1, 1.3), -6)), 0.8), -14),
]


def thunder(a, b, crack):
    t = lowboost(fade_out(S(THUNDER, a, b), 1.2), 3)
    return room(mix((t,), (S(crack, sp=1.3), -6, 0.0), (S(BF + 'rock_breaking_01.ogg', sp=1.0), -10, 0.0)), -12, 2.2)


R['lightning'] = [lambda: thunder(22.2, 26.6, CRUNCH % 1),
                  lambda: room(mix((lowboost(fade_out(S('sfx100v2/x/sfx100v2_thunder_01.ogg', 0.15, 4.2), 1.0), 3),),
                                   (S(CRUNCH % 2, sp=1.3), -6, 0.0)), -12, 2.2)]


def fire(sw, spell, at):
    return room(mix((S('flame/flame.ogg', sp=0.9),), (S('rpg80/x/spell_fire_%02d.ogg' % spell), 0, 0.03), (S(SWISH % sw, sp=0.55), -6),
                    (fade_out(S('fire/fire-1.wav', at, at + 0.9), 0.4), -6, 0.1)), -14)


R['fire_whoosh'] = [lambda: fire(3, 6, 0.2), lambda: fire(7, 4, 1.0), lambda: fire(8, 3, 1.8)]
R['ice_form'] = [
    lambda: room(mix((fade_out(S('freeze/freeze.wav', 0.2, 1.7), 0.4),), (S(ICE % '2', sp=0.8), -10, 0.6)), -13),
    lambda: room(mix((fade_out(S('freeze/freeze.wav', 0.2, 1.9, 0.85), 0.4),), (S(ICE % '4', 0.3, None, 0.8), -12, 0.7)), -13),
]
R['ice_shatter'] = [
    lambda f=f, sp=sp: room(mix((S(ICE % f, sp=sp),), (lp(S(BOULDER, sp=0.9), 800), -12)), -12)
    for f, sp in (('', 0.9), ('33', 0.88), ('5', 0.92))]
R['magic_shield'] = [
    lambda: room(mix((ramp_in(rev(S('flame/flame.ogg', sp=0.7)), 0.2), -4), (S(DARK % 2, 0, 1.1), 0, 0.25),
                     (lp(S(IMPACT % 10, sp=0.5), 600), -6, 0.3)), -12, 2.0),
    lambda: room(mix((ramp_in(rev(S(SWISH % 7, sp=0.45)), 0.1), -4), (S(DARK % 1, 0.2, 1.4), 0, 0.12),
                     (lp(S(IMPACT % 4, sp=0.5), 600), -6, 0.15)), -12, 2.0),
]


def mimpact(dark, a, rk, sp):
    return room(lowboost(mix((fade_out(S(MUFF, 0, 1.0, sp), 0.5),), (fade_out(S(DARK % dark, a, a + 0.7), 0.4), -3),
                             (S(ROCK, sp=0.8), -9), (S('rpg80/x/spell_01.ogg', sp=0.8), -8))), -12, 1.8)


R['magic_impact'] = [lambda: mimpact(2, 0, 1, 1.0), lambda: mimpact(1, 0.4, 1, 0.9), lambda: mimpact(3, 0.6, 1, 1.1)]
R['telekinesis'] = [
    lambda: room(L.dering(mix((fade_out(ramp_in(hp(lp(S(AIR, 0.5, 1.6, 0.7), 2500), 140), 0.3), 0.5),), (S('rpg80/x/stones_03.ogg', sp=0.8), -10, 0.3),
                     (S('earthspell/Earth%20Element%20Magic%20Spell_0.flac', 0.3, 1.4), -10, 0.1)), 4, -12, 0.2), -13),
    lambda: room(L.dering(mix((fade_out(ramp_in(hp(lp(S(AIR, 2.5, 3.6, 0.65), 2500), 140), 0.3), 0.5),), (S('rpg80/x/stones_02.ogg', sp=0.8), -10, 0.25),
                     (S('earthspell/Earth%20Element%20Magic%20Spell_0.flac', 0.2, 1.3), -10, 0.1)), 4, -12, 0.2), -13),
]
R['shockwave'] = [
    lambda: room(lowboost(mix((fade_out(S(MUFF, 0, 1.6), 0.8),), (fade_out(lp(S(AIR, 1.0, 1.8, 0.8), 3000), 0.4), -4),
                              (S(BF + 'rock_falling_01.ogg'), -10, 0.15))), -11, 2.2),
    lambda: room(lowboost(mix((fade_out(S(MUFF, 0, 1.6, 0.9), 0.8),), (fade_out(lp(S(AIR, 3.0, 3.8, 0.75), 3000), 0.4), -4),
                              (S(BF + 'rock_falling_09.ogg'), -10, 0.12))), -11, 2.2),
]
R['earthquake'] = [
    lambda: room(lowboost(mix((fade_out(lp(S(QUAKE, 0, 3.8), 2500), 1.5),), (fade_out(ramp_in(S(CAVE, 0.5, 3.5, 0.8), 0.5), 1.0), -12, 0.4),
                              (fade_out(S(MUFF, 0.15, 3.0, 0.8), 1.0), -8)), 3), -14, 2.0),
    lambda: room(lowboost(mix((fade_out(lp(S(QUAKE, 0.4, 4.2, 0.9), 2500), 1.5),), (fade_out(ramp_in(S(CAVE, 1.0, 4.0, 0.75), 0.5), 1.0), -12, 0.3),
                              (fade_out(S(MUFF, 0.15, 3.0, 0.75), 1.0), -8)), 3), -14, 2.0),
]


def loopable(x, xf=0.5):
    """Crossfade the tail into the head so the buffer loops without a click."""
    n = int(xf * SR)
    head, body, tail = x[:n], x[n:-n], x[-n:]
    w = np.sin(np.linspace(0, np.pi / 2, n))
    return np.concatenate([body, tail * np.cos(np.linspace(0, np.pi / 2, n)) + head * w])


def worm_hum():
    air = lp(S(AIR, 0.0, 5.2, 0.55), 1400)[:int(4.5 * SR)]
    rumble = lp(S(THUNDER, 24.5, 30.5, 0.8), 260)[:int(4.5 * SR)]
    throb = lp(S(DARK % 1, 0, 2.8, 0.5), 1500)[:int(4.5 * SR)]
    x = mix((air,), (rumble, 2), (throb, -8))
    return loopable(room(lowboost(x, 4), -16, 2.0)[:int(4.5 * SR)])


R['wormhole_hum'] = [worm_hum]


def worm_boom(sp):
    return room(lowboost(mix(
        (S(MUFF, 0, None, sp),), (lp(fade_out(S(THUNDER, 22.25, 28.5), 2.5), 1500), -5, 0.02),
        (lp(S(BOULDER, sp=0.5), 900), -1), (fade_out(lp(S(QUAKE, 0, 3.0), 400), 1.5), -6, 0.05)), 6, 120), -10, 3.0, 3000)


R['wormhole_boom'] = [lambda: worm_boom(0.85), lambda: worm_boom(0.76)]

# ---------------------------------------------------------------- statues
def wake(deeps, sp, trickle):
    xs = [(S(DEEP % d, sp=sp * (1 + 0.05 * k)), -2 * k, 0.11 * k + 0.04 * (k > 1)) for k, d in enumerate(deeps)]
    return room(mix(*xs, (S(trickle, sp=0.85), -9, 0.2), (lp(S(BOULDER, sp=0.9), 700), -12, 0.0)), -13)


R['wake'] = [lambda: wake((2, 3, 7), 0.82, 'rpg80/x/stones_02.ogg'), lambda: wake((4, 9, 10), 0.8, 'rpg80/x/stones_03.ogg'),
             lambda: wake((5, 1, 8), 0.86, BF + 'rock_falling_03.ogg')]


def settle(sp, at, st):
    return room(mix((lp(S(BOULDER, sp=sp), 1100),), (fade_out(ramp_in(hp(S(CAVE, at, at + 0.7, 1.1), 1500), 0.05), 0.4), -12, 0.08),
                    (S(st), -14, 0.05)), -14)


R['settle'] = [lambda: settle(0.85, 0.7, 'rpg80/x/stones_01.ogg'), lambda: settle(0.8, 2.0, 'rpg80/x/stones_04.ogg'),
               lambda: settle(0.9, 3.0, BF + 'rock_falling_07.ogg')]


def promotion(sp, ice):
    rumble = fade_out(ramp_in(lp(S(QUAKE, 0.3, 2.9, sp), 320), 0.6), 1.0)
    # the shimmer: an airy breath sped up into sparkle, and ice crackling high (all noisy, nothing tonal)
    air = hp(fade_out(ramp_in(S('sandspell/sand-spell.flac', sp=1.35), 0.25), 0.4), 2500)
    return room(mix((lowboost(rumble, 3), -2), (air, -4, 0.5), (hp(S(ICE % ice, sp=1.3), 3000), -8, 0.75),
                    (hp(S(ICE % '5', sp=1.4), 3000), -12, 1.0),
                    (ramp_in(rev(S(SWISH % 7, sp=0.5)), 0.1), -8, 1.45), (lp(S(BOULDER, sp=0.8), 900), -6, 1.75)), -11, 2.4)


R['promotion'] = [lambda: promotion(1.0, '2'), lambda: promotion(0.9, '4')]
R['ooze'] = [
    lambda m=m, s=s: room(mix((S('mud/x/mud_%02d.ogg' % m, sp=0.8),), (S('squish/x/impsplat/impactsplat%02d.mp3.flac' % s, sp=0.8), -6, 0.02)), -15)
    for m, s in ((2, 3), (4, 4), (8, 2))]

# loudness targets (dB, our K-ish short-term measure): one level for everything, so sfx.js's per-cue
# gains and the callers' volumes alone set the balance; long beds sit a little lower.
TARGET = {'wormhole_hum': -19, 'earthquake': -17}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[3:])
    for cue, vs in R.items():
        if only and cue not in only:
            continue
        files = []
        for i, f in enumerate(vs):
            x = f()
            x = L.bq(x, 'high', 28)  # no sub-sonic waste
            if cue not in ('horse_neigh', 'sword_clash'):
                # no bells: notch any narrow resonance that would linger as a tone (a drum's or a horseshoe's ring)
                x = L.dering(x, 4, -10, 0.15, 8)
            if cue != 'wormhole_hum':
                x = L.trim(x, -54, 0.003, 0.06)
            x = L.normalize(x, TARGET.get(cue, -16), -1.0)
            name = '%s_%d.mp3' % (cue, i + 1)
            L.write_mp3(os.path.join(OUT, name), x, q=6)
            files.append(name)
            print('%-22s %5.2fs  %6.1f KB' % (name, len(x) / SR, os.path.getsize(os.path.join(OUT, name)) / 1024))
