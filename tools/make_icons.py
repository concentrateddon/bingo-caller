#!/usr/bin/env python3
"""Regenerate the PWA icons (pure Python, no dependencies): python3 tools/make_icons.py"""
import math, struct, zlib, os

BG = (11, 22, 38)
BALL = (45, 108, 223)
INK = (17, 17, 17)

def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def in_ring(u, v, cx, cy, ro, ri):
    d = math.hypot(u - cx, v - cy)
    return ri <= d <= ro

def letter_b(u, v):
    # stem
    if -0.55 <= u <= -0.33 and -0.8 <= v <= 0.85: return True
    # upper bowl (right half ring) + bars
    if u >= -0.33:
        if in_ring(u, v, -0.05, -0.4, 0.4, 0.18): return True
        if in_ring(u, v, -0.02, 0.4, 0.45, 0.22): return True
        if -0.33 <= u <= -0.05 and (-0.8 <= v <= -0.58 or -0.12 <= v <= 0.1 or 0.62 <= v <= 0.85 - 0.0 and False): return True
        if -0.33 <= u <= -0.02 and 0.63 <= v <= 0.85: return True
    return False

def pixel(x, y, radius):
    dx, dy = x - 0.5, y - 0.5
    d = math.hypot(dx, dy)
    if d > radius: return BG
    # shaded sphere
    hx, hy = x - (0.5 - radius * 0.35), y - (0.5 - radius * 0.4)
    hl = max(0.0, 1 - math.hypot(hx, hy) / (radius * 0.9))
    shade = d / radius
    col = lerp(BALL, (8, 20, 60), shade ** 3 * 0.8)
    col = lerp(col, (255, 255, 255), hl ** 2 * 0.55)
    if d <= radius * 0.62:
        s = radius * 0.62 * 0.72
        u, v = dx / s, dy / s
        return INK if letter_b(u, v) else (255, 255, 255)
    return col

def render(size, radius, ss=3):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size, radius)
                    r += c[0]; g += c[1]; b += c[2]
            n = ss * ss
            row += bytes((int(r / n), int(g / n), int(b / n)))
        rows.append(bytes(row))
    return rows

def png(path, size, rows):
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

os.makedirs('icons', exist_ok=True)
png('icons/icon-512.png', 512, render(512, 0.44))
png('icons/icon-192.png', 192, render(192, 0.44))
png('icons/maskable-512.png', 512, render(512, 0.36))  # ball stays inside the maskable safe zone
print('icons written')
