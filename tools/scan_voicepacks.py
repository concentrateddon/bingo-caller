#!/usr/bin/env python3
"""Rebuild voicepacks/packs.json from the folders under voicepacks/ and report missing clips.

    python3 tools/scan_voicepacks.py

Keeps the display names already in packs.json; new folders get their folder name.
"""
import json, os, sys, collections

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'voicepacks')
EXTS = ('ogg', 'opus', 'mp3', 'm4a', 'aac', 'webm', 'wav')
LETTERS = 'BINGO'
NEEDED = [f'{LETTERS[(n - 1) // 15]}{n}' for n in range(1, 76)] + ['Bingo', 'FalseBingo']
OPTIONAL = [f'Wild{d}' for d in range(10)]  # announcement before a WILD round

manifest_path = os.path.join(ROOT, 'packs.json')
try:
    old = {p['id']: p for p in json.load(open(manifest_path)).get('packs', [])}
except Exception:
    old = {}

packs = []
for name in sorted(os.listdir(ROOT)):
    folder = os.path.join(ROOT, name)
    if not os.path.isdir(folder) or name.startswith('.'):
        continue
    files = {os.path.splitext(f)[0]: os.path.splitext(f)[1][1:] for f in os.listdir(folder) if f.lower().endswith(tuple('.' + e for e in EXTS))}
    if not files:
        print(f'- {name}: no audio files, skipped')
        continue
    ext = collections.Counter(files.values()).most_common(1)[0][0]
    missing = [k for k in NEEDED if files.get(k) != ext]
    packs.append({'id': name, 'name': old.get(name, {}).get('name', name), 'ext': ext})
    status = 'complete' if not missing else f'{len(missing)} missing: ' + ', '.join(missing[:12]) + (' …' if len(missing) > 12 else '')
    no_wild = [k for k in OPTIONAL if files.get(k) != ext]
    if no_wild:
        status += f' (optional WILD announcements: {10 - len(no_wild)}/10 present)'
    print(f'- {name} (.{ext}): {status}')

json.dump({'packs': packs}, open(manifest_path, 'w'), indent=2)
open(manifest_path, 'a').write('\n')
print(f'wrote {manifest_path} with {len(packs)} pack(s)')
