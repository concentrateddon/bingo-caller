# Bingo Caller (PWA)

An installable, offline-capable bingo caller built for a landscape Android tablet (Chrome).
Plain HTML/CSS/JavaScript — no build step, no dependencies. Everything is stored on the device.

## Try it locally

```bash
python3 -m http.server 8765      # then open http://localhost:8765
```

(Service workers need `https://` or `localhost`, so opening `index.html` straight from disk won't work.)

## Deploy & install

Upload the whole folder to any static host over HTTPS (GitHub Pages, Netlify, your own site, a sub-folder is fine —
all paths are relative). On the tablet, open the site in Chrome and choose **Install app** / **Add to Home screen**.
The app then runs full-screen, landscape, and offline.

**When you deploy a change, bump `SHELL_VERSION` in `sw.js`** (`v1` → `v2`). Devices pick up the new version the next
time the app is opened online, and the old cache is deleted.

## Using it

**Setup**
- *Games* — set the number of games; for each, name the pattern, tap squares on the card to define it, choose
  **As shown** or **Example**, take columns out of play (tap the column letter), and pick a voice pack.
  Example games can have several patterns (*+ Add example*) which rotate on screen during play.
  *Start from a preset…* fills in common patterns.
- *Secret Twists* — messages that each fire once per evening on a random game, either at the start of the game
  or at a random point during it. A full-screen takeover stops calling until dismissed and **GO** is tapped.
- *Evening & Data* — rename/duplicate/delete/export/import evenings, apply one voice pack to every game,
  and download voice packs for offline use.

**Play** — Start evening → *Start Game N* (loads the voice pack) → **GO**. Each ball: 2 seconds of bouncing balls,
then the main screen. **STOP** pauses; while stopped, **BINGO!** ends the game and **FALSE BINGO** plays its clip,
after which **GO** resumes. **WILD** (also only while stopped) opens a 0–9 keypad; pick a digit and every not-yet-called ball ending in that digit is called in order, 5 seconds apart, using the voice pack (it first plays the optional `Wild<digit>` announcement clip), after which play returns to stopped until **GO** is tapped. Seconds-per-ball is adjustable with − / + (3–60 s). The ☰ button has restart, skip,
mute, and exit. Progress is saved after every ball; on next launch the app asks whether to **Resume** or **Start fresh**.

## Voice packs

See [`voicepacks/README.md`](voicepacks/README.md) for the folder layout, file names (`B1.ogg` … `O75.ogg`,
`Bingo.ogg`, `FalseBingo.ogg`) and the recommended format (Opus in Ogg, mono, ~20 kbps).
`python3 tools/scan_voicepacks.py` rebuilds `voicepacks/packs.json` and reports missing clips.

## Layout

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/main.js      app shell, home, resume prompt
js/setup.js     Setup mode
js/play.js      Play mode (state machine, timer engine, twists)
js/balls.js     bouncing-balls draw animation
js/audio.js     voice pack loading + playback (Web Audio)
js/patterns.js  card rendering, presets, sample evening
js/store.js     localStorage (evenings, play state)
js/ui.js        DOM helpers, dialogs
voicepacks/     packs.json + one folder per pack
tools/          make_icons.py, scan_voicepacks.py
```
