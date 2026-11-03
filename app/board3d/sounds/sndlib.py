"""Small audio toolkit for building the OpenRook battle cues from recorded sources."""
import subprocess, numpy as np
from scipy import signal

SR = 44100


def load(path, sr=SR):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode())
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)


def frame_db(x, hop=441):
    n = max(1, len(x) // hop)
    e = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(e)


def events(x, hop=441, rise=14.0, fall=8.0, min_gap=0.08, min_len=0.04, pre=0.01):
    """Find separate sound events. Returns list of (start_s, end_s, peak_db)."""
    db = frame_db(x, hop)
    floor = np.percentile(db, 15)
    on_t, off_t = floor + rise, floor + fall
    ev, i, n = [], 0, len(db)
    gapf = int(min_gap * SR / hop)
    while i < n:
        if db[i] > on_t:
            s = i
            while s > 0 and db[s - 1] > off_t and i - s < 20:
                s -= 1
            j = i
            quiet = 0
            while j < n:
                if db[j] < off_t:
                    quiet += 1
                    if quiet >= gapf:
                        break
                else:
                    quiet = 0
                j += 1
            e = j - quiet
            if (e - s) * hop / SR >= min_len:
                ev.append((max(0, s * hop / SR - pre), e * hop / SR, float(np.max(db[s:e + 1]))))
            i = j
        else:
            i += 1
    return ev


def seg(x, a, b):
    return x[int(a * SR):int(b * SR)].copy()


def resample(x, ratio):
    """Pitch/time by ratio (>1 = higher & shorter), like a tape speed change."""
    if abs(ratio - 1) < 1e-6:
        return x
    n = int(round(len(x) / ratio))
    return signal.resample_poly(x, n, len(x)) if len(x) < 200000 else np.interp(
        np.arange(n) * ratio, np.arange(len(x)), x)


def speed(x, ratio):
    # rational approximation for resample_poly
    from fractions import Fraction
    f = Fraction(ratio).limit_denominator(200)
    return signal.resample_poly(x, f.denominator, f.numerator)


def bq(x, kind, fc, order=2):
    fc = np.clip(fc, 10, SR / 2 - 100)
    sos = signal.butter(order, fc, btype=kind, fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def shelf_low(x, fc, gain_db):
    """Crude low shelf: add (or remove) low-passed copy."""
    g = 10 ** (gain_db / 20) - 1
    return x + g * bq(x, 'low', fc)


def fade(x, fin=0.002, fout=0.05):
    x = x.copy()
    a = int(fin * SR); b = int(fout * SR)
    if a > 0 and len(x) > a:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0 and len(x) > b:
        x[-b:] *= np.linspace(1, 0, b) ** 2
    return x


def env_exp(x, tau):
    t = np.arange(len(x)) / SR
    return x * np.exp(-t / tau)


def pad_to(x, n):
    return np.concatenate([x, np.zeros(max(0, n - len(x)))])


def mix(*layers):
    """layers: (signal, gain_db, delay_s)"""
    n = max(int(d * SR) + len(s) for s, g, d in layers)
    out = np.zeros(n)
    for s, g, d in layers:
        i = int(d * SR)
        out[i:i + len(s)] += s * 10 ** (g / 20)
    return out


def norm_peak(x, db=-1.0):
    return x * (10 ** (db / 20) / (np.max(np.abs(x)) + 1e-12))


_ir_cache = {}


def hall_ir(t60=1.6, damp=4500, seed=7, predelay=0.012):
    """A synthetic stone-hall impulse response: dense decaying noise, darker as it decays."""
    key = (t60, damp, seed, predelay)
    if key in _ir_cache:
        return _ir_cache[key]
    rng = np.random.default_rng(seed)
    n = int(t60 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # two bands decaying at different rates (highs die faster in stone rooms with air absorption)
    lo = bq(noise, 'low', damp) * np.exp(-6.9 * t / t60)
    hi = bq(noise, 'high', damp) * np.exp(-6.9 * t / (t60 * 0.35))
    ir = lo + 0.5 * hi
    # sparse early reflections
    er = np.zeros(int(0.08 * SR))
    for k in range(9):
        er[int(rng.uniform(0.004, 0.075) * SR)] += rng.uniform(0.3, 0.8) * (1 if k % 2 else -1)
    ir[:len(er)] += er * 3
    ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
    ir /= np.sqrt(np.sum(ir ** 2))
    _ir_cache[key] = ir
    return ir


def reverb(x, wet_db=-14.0, t60=1.6, damp=4500, tail=True):
    ir = hall_ir(t60, damp)
    w = signal.fftconvolve(x, ir)
    if not tail:
        w = w[:len(x)]
    else:
        x = pad_to(x, len(w))
    return x + w * 10 ** (wet_db / 20)


def trim(x, thresh_db=-50, pre=0.004, post_fade=0.04):
    """Cut leading/trailing silence (relative to peak)."""
    pk = np.max(np.abs(x)) + 1e-12
    db = frame_db(x, 64) - 20 * np.log10(pk)
    act = np.where(db > thresh_db)[0]
    if not len(act):
        return x
    a = max(0, act[0] * 64 - int(pre * SR))
    b = min(len(x), (act[-1] + 1) * 64)
    return fade(x[a:b], 0.001, post_fade)


def loudness(x):
    """A simple short-term loudness: K-ish weighted (highpass 100Hz + presence boost) RMS over the loudest 400ms."""
    y = bq(x, 'high', 100)
    y = y + 0.4 * bandpass(y, 1500, 6000)
    w = int(0.4 * SR)
    if len(y) <= w:
        return 10 * np.log10(np.mean(y ** 2) + 1e-12)
    c = np.cumsum(np.concatenate([[0], y ** 2]))
    m = (c[w:] - c[:-w]) / w
    return 10 * np.log10(np.max(m) + 1e-12)


def soft_limit(x, ceiling_db=-1.0):
    c = 10 ** (ceiling_db / 20)
    return c * np.tanh(x / c)


def normalize(x, target=-16.0, ceiling=-1.0):
    g = target - loudness(x)
    y = x * 10 ** (g / 20)
    pk = np.max(np.abs(y))
    c = 10 ** (ceiling / 20)
    if pk > c:
        # gentle limiting: if far over, scale down partially and soft-clip the rest
        over = 20 * np.log10(pk / c)
        y *= 10 ** (-max(0, over - 3) / 20)
        y = soft_limit(y, ceiling)
    return y


def write_wav(path, x):
    import soundfile as sf
    sf.write(path, np.clip(x, -1, 1).astype(np.float32), SR, subtype='PCM_16')


def write_mp3(path, x, q=5):
    import soundfile as sf, tempfile, os
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, np.clip(x, -1, 1).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ac", "1", "-c:a", "libmp3lame", "-q:a", str(q), path],
                   check=True)
    os.unlink(tmp)


def spectro_png(x, path, title='', marks=None, width=24, height=4):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(width, height), sharex=True,
                                 gridspec_kw=dict(height_ratios=[1, 2]))
    t = np.arange(len(x)) / SR
    step = max(1, len(x) // 20000)
    a1.plot(t[::step], x[::step], lw=0.4, color='#333')
    a1.set_ylim(-1, 1)
    a1.set_title(title, fontsize=9)
    f, tt, S = signal.spectrogram(x, SR, nperseg=1024, noverlap=768)
    a2.pcolormesh(tt, f, 10 * np.log10(S + 1e-12), vmin=-120, vmax=-30, cmap='magma', shading='auto')
    a2.set_yscale('symlog', linthresh=200)
    a2.set_ylim(30, 16000)
    a2.set_ylabel('Hz')
    if marks:
        for (tm, lab) in marks:
            for a in (a1, a2):
                a.axvline(tm, color='c', lw=0.6)
            a1.text(tm + 0.02, 0.8, lab, fontsize=6, rotation=90, va='top')
    fig.tight_layout()
    fig.savefig(path, dpi=90)
    plt.close(fig)


def denoise(x, ref, over=2.0, floor=0.08, pct=20):
    """Spectral subtraction: the noise profile is the per-bin `pct` percentile magnitude of `ref`
    (a whole take, so steady tape hiss and tones are caught by minimum statistics)."""
    nper = 2048
    _, _, R = signal.stft(ref, SR, nperseg=nper)
    prof = np.percentile(np.abs(R), pct, axis=1)[:, None]
    _, _, X = signal.stft(x, SR, nperseg=nper)
    mag = np.abs(X)
    g = np.maximum(1 - over * prof / (mag + 1e-12), floor)
    _, y = signal.istft(X * g, SR, nperseg=nper)
    return y[:len(x)]


def peaking(x, f0, gain_db, q):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def dering(x, n=4, cut=-12.0, after=0.06, thresh=7.0):
    """Tame ringing: notch the n most prominent narrow peaks of the decay (after `after` s)."""
    from scipy import ndimage
    tail = x[int(after * SR):]
    if len(tail) < 4096:
        return x
    f, _, Z = signal.stft(tail, SR, nperseg=4096)
    db = 20 * np.log10(np.abs(Z).mean(axis=1) + 1e-12)
    d = db - ndimage.median_filter(db, 41)
    p = [i for i in signal.find_peaks(d, height=thresh, distance=4)[0] if 120 < f[i] < 9000]
    for i in sorted(p, key=lambda i: -d[i])[:n]:
        x = peaking(x, f[i], max(cut, -d[i]), 6)
    return x
