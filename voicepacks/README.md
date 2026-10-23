# Voice packs

A voice pack is a folder of short audio clips, one per ball plus two announcements.
The app loads a game's clips into memory when that game starts, so playback is instant.

## Folder layout

```
voicepacks/
  packs.json            ← list of packs (rebuild it with tools/scan_voicepacks.py)
  demo/                 ← one folder per pack; the folder name is the pack id
    B1.m4a … B15.m4a
    I16.m4a … I30.m4a
    N31.m4a … N45.m4a
    G46.m4a … G60.m4a
    O61.m4a … O75.m4a
    Bingo.m4a           ← played when BINGO is tapped
    FalseBingo.m4a      ← played when FALSE BINGO is tapped
    Wild0.m4a … Wild9.m4a  ← optional: announcement before a WILD round (see below)
  my-caller/            ← add your own pack folders alongside
```

## File names (case-sensitive!)

| Clip                  | Name                              | Example      |
| --------------------- | --------------------------------- | ------------ |
| Each ball             | `<Letter><Number>.<ext>`          | `B7.ogg`, `O75.ogg` |
| Winning bingo         | `Bingo.<ext>`                     |              |
| False bingo           | `FalseBingo.<ext>`                |              |
| WILD announcement (optional) | `Wild0.<ext>` … `Wild9.<ext>` | `Wild7.ogg` |

Ranges: **B** 1–15, **I** 16–30, **N** 31–45, **G** 46–60, **O** 61–75.
All clips in a pack must use the same extension.
If a clip is missing, that ball is simply called silently (the host sees a warning when the game loads).
Columns marked "out of play" for a game are never loaded.

### WILD announcements (optional)

When the host taps WILD and picks a digit, the app plays `Wild<digit>` first and starts calling when it ends.
Record one clip per digit, each saying the whole announcement, for example for `Wild7`:
"We're calling a wild — mark every ball ending in seven. I'll now call each of those. We will pause when I'm
finished so that you can catch up."
If a pack has no `Wild` clips (or has voice turned off) the round simply starts without an announcement.

## Recommended format: Opus in an Ogg container (`.ogg`)

Opus is the smallest format for speech and plays natively in Chrome on Android.
Mono, 16–24 kbps is plenty for a clear voice: roughly 2–3 KB per clip, under 250 KB for a full pack.

With ffmpeg:

```bash
# one file
ffmpeg -i B7.wav -ac 1 -ar 24000 -c:a libopus -b:a 20k -application voip B7.ogg

# a whole folder of .wav files
for f in *.wav; do ffmpeg -i "$f" -ac 1 -ar 24000 -c:a libopus -b:a 20k -application voip "${f%.wav}.ogg"; done
```

Other formats work too (`.mp3`, `.m4a`, `.wav`, `.webm`) — set the `ext` field in `packs.json`
(or let the scan script detect it). Tips for recording: trim silence at the start and end of each clip so
the call lands the moment the ball appears, and normalise loudness so all clips sound alike.

## Registering a pack

1. Create `voicepacks/<pack-id>/` and drop the clips in.
2. Run `python3 tools/scan_voicepacks.py` — it rebuilds `packs.json` and tells you what is missing.
   (Or edit `packs.json` by hand: `{ "id": "my-caller", "name": "My Caller", "ext": "ogg" }`.)
3. Deploy. In the app: Setup → **Evening & Data** → *Refresh pack list*, then choose the pack per game
   (or *Apply to all games*).
4. On each tablet, while online, open Setup and tap **Cache voices**. It downloads only the packs assigned to the
   current evening's games, so the audio is stored on the device and works with no internet. (Setup → Evening & Data
   shows what is cached and can remove it.)
   Press it again whenever you change audio files.

The included `demo` pack is computer-generated, only there to try things out. Delete the folder
(and its entry in `packs.json`) when you have your own.
