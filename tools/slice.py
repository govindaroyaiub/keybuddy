#!/usr/bin/env python3
"""Slice CC0 typing recordings into KeyBuddy sound packs.

    python3 -I tools/slice.py sounds/raw src-tauri/packs sounds/demo

For each pack it decodes the source clips (ffmpeg), finds every key hit,
throws away messy ones (overlapping, clipped, too quiet), then sorts the rest:

  * loud hits             -> key presses (bottom-out)
  * soft hits             -> key releases (top-out)
  * darkest/longest press -> space, enter, backspace

Output per pack is one small .kbp file that the app embeds:

    b"KBP1" then entries of: u8 kind (0 press, 1 release), u8 class,
    u32 sample count, i16 LE samples (mono, 48 kHz)

Classes match src-tauri/src/keymap.rs: 0 normal, 1 mod, 2 space, 3 enter, 4 back.
It also renders a short demo .wav per pack so you can audition it.
"""

import math
import random
import struct
import subprocess
import sys
import wave
from array import array
from pathlib import Path

SR = 48_000
FRAME = 48  # 1 ms

PACKS = {
    # pack id: (primary sources, fallback sources)
    "thocky": (["linear_cherryred"], ["linear_gateronred"]),
    "clacky": (["clacky_linear"], ["clacky_gateronred"]),
    "clicky": (["clicky_mxblue", "clicky_single"], ["clicky_mxblue2"]),
    "tactile": (["tactile_mxbrown", "tactile_single"], []),
}

N_NORMAL = 16
N_BIG = 4
N_RELEASE = 12
MIN_CLEAN = 30


def decode(path: Path) -> array:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    a = array("h")
    a.frombytes(raw)
    if sys.byteorder == "big":
        a.byteswap()
    return a


def highpass(x: array, hz: float = 60.0) -> list:
    # One-pole high-pass: removes desk rumble and mic DC.
    rc = 1.0 / (2 * math.pi * hz)
    k = rc / (rc + 1.0 / SR)
    out = [0.0] * len(x)
    prev_x = prev_y = 0.0
    for i, s in enumerate(x):
        y = k * (prev_y + s - prev_x)
        out[i] = y
        prev_x, prev_y = s, y
    return out


def envelope(x: list) -> list:
    env = []
    for i in range(0, len(x) - FRAME, FRAME):
        seg = x[i:i + FRAME]
        env.append(math.sqrt(sum(v * v for v in seg) / FRAME))
    return env


def onsets(env: list) -> list:
    floor = sorted(env)[len(env) // 5] + 1.0  # 20th percentile ~ room noise
    found, last = [], -999
    for i in range(8, len(env)):
        prev = sum(env[i - 8:i]) / 8 + 1e-9
        if env[i] > floor * 6 and env[i] > prev * 3.5 and i - last > 30:
            # walk back to the true start of the rise
            j = i
            while j > 0 and env[j - 1] < env[j] and env[j - 1] > floor * 2:
                j -= 1
            found.append(j)
            last = i
    return found


def hits(x: list, env: list) -> list:
    out = []
    ons = onsets(env)
    for n, f in enumerate(ons):
        nxt = ons[n + 1] if n + 1 < len(ons) else len(env)
        gap_ms = nxt - f
        if gap_ms < 35:
            continue  # another key lands on top of this one
        start = max(0, f * FRAME - 72)
        end_f = min(nxt - 2, f + 140)
        peak_env = max(env[f:end_f])
        # trim the tail at -36 dB from the peak
        t = end_f
        for k in range(f, end_f):
            if k > f + 8 and env[k] < peak_env * 0.016:
                t = k
                break
        seg = x[start:t * FRAME]
        if len(seg) < 25 * FRAME // 1:
            seg = x[start:start + 25 * FRAME]
        pk = max(range(len(seg)), key=lambda j: abs(seg[j]))
        peak = abs(seg[pk])
        if peak > 32000:
            continue  # clipped
        if pk > 18 * FRAME:
            continue  # starts with junk before the real hit
        after = seg[pk + 25 * FRAME:]
        if after and max(abs(v) for v in after) > 0.4 * peak:
            continue  # a second key bleeds in
        zc = sum(1 for a, b in zip(seg, seg[1:]) if (a < 0) != (b < 0)) / len(seg)
        out.append({"seg": seg, "peak": peak, "zcr": zc, "len": len(seg)})
    return out


def finish(seg: list, target_peak: float) -> list:
    peak = max(abs(v) for v in seg) or 1.0
    g = target_peak / peak
    out = [v * g for v in seg]
    fade = min(len(out), 3 * FRAME)
    for i in range(fade):
        out[len(out) - fade + i] *= 1 - i / fade
    fin = min(len(out), 12)
    for i in range(fin):
        out[i] *= i / fin
    return out


def spread(items: list, n: int) -> list:
    if len(items) <= n:
        return items
    step = len(items) / n
    return [items[int(i * step)] for i in range(n)]


def build(pack: str, raw: Path):
    primary, fallback = PACKS[pack]
    all_hits = []
    for group in (primary, fallback):
        for name in group:
            p = raw / f"{name}.mp3"
            if not p.exists():
                print(f"  missing {p.name}, skipping")
                continue
            x = highpass(decode(p))
            h = hits(x, envelope(x))
            print(f"  {name}: {len(h)} clean hits")
            all_hits += h
        if len(all_hits) >= MIN_CLEAN:
            break

    if len(all_hits) < 8:
        raise SystemExit(f"{pack}: not enough clean hits")

    peaks = sorted(h["peak"] for h in all_hits)
    p75 = peaks[int(len(peaks) * 0.75)]
    presses = [h for h in all_hits if h["peak"] >= 0.55 * p75]
    releases = [h for h in all_hits if 0.12 * p75 <= h["peak"] < 0.42 * p75 and h["len"] < 70 * FRAME]

    # darker + longer = bigger key
    presses.sort(key=lambda h: h["zcr"] / math.sqrt(h["len"]))
    big = presses[: N_BIG * 3]
    normal = presses[N_BIG * 3:] or presses
    # keep the most typical-sounding normals: middle of the brightness range
    normal.sort(key=lambda h: h["zcr"])
    mid = len(normal) // 2
    normal = normal[max(0, mid - N_NORMAL * 2): mid + N_NORMAL * 2]
    normal = spread(normal, N_NORMAL)
    releases.sort(key=lambda h: h["peak"])
    releases = spread(releases, N_RELEASE)

    entries = []
    for h in normal:
        entries.append((0, 0, finish(h["seg"], 20000)))
        entries.append((0, 1, finish(h["seg"], 17000)))
    for cls, chunk in ((2, big[0:N_BIG]), (3, big[N_BIG:2 * N_BIG]), (4, big[2 * N_BIG:3 * N_BIG])):
        for h in chunk or big[:N_BIG]:
            entries.append((0, cls, finish(h["seg"], 22000)))
    for h in releases:
        for cls in range(5):
            entries.append((1, cls, finish(h["seg"], 7500)))

    print(f"  -> {len(normal)} normal, {len(big)} big, {len(releases)} release takes")
    return entries


def write_pack(entries, path: Path):
    with open(path, "wb") as f:
        f.write(b"KBP1")
        for kind, cls, seg in entries:
            a = array("h", (max(-32767, min(32767, int(v))) for v in seg))
            if sys.byteorder == "big":
                a.byteswap()
            f.write(struct.pack("<BBI", kind, cls, len(a)))
            f.write(a.tobytes())


def write_demo(entries, path: Path):
    # "the quick brown fox" rhythm with spaces and an enter
    rng = random.Random(4)
    press = {c: [e[2] for e in entries if e[0] == 0 and e[1] == c] for c in range(5)}
    rel = [e[2] for e in entries if e[0] == 1 and e[1] == 0]
    text = "the quick brown fox jumps\n" * 2
    out = [0.0] * int(SR * (len(text) * 0.14 + 1))
    t = int(SR * 0.2)
    for ch in text:
        cls = 2 if ch == " " else 3 if ch == "\n" else 0
        s = rng.choice(press[cls] or press[0])
        for i, v in enumerate(s):
            out[t + i] += v
        if rel:
            r = rng.choice(rel)
            rt = t + int(SR * rng.uniform(0.07, 0.11))
            for i, v in enumerate(r):
                if rt + i < len(out):
                    out[rt + i] += v
        t += int(SR * rng.uniform(0.09, 0.16))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(array("h", (max(-32767, min(32767, int(v))) for v in out)).tobytes())


def main():
    raw, out, demo = (Path(a) for a in sys.argv[1:4])
    out.mkdir(parents=True, exist_ok=True)
    demo.mkdir(parents=True, exist_ok=True)
    for pack in PACKS:
        print(pack)
        entries = build(pack, raw)
        write_pack(entries, out / f"{pack}.kbp")
        write_demo(entries, demo / f"{pack}.wav")


if __name__ == "__main__":
    main()
