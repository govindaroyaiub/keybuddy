# KeyBuddy

Real mechanical keyboard sounds for every key you press, in every app — on
macOS, Windows and Linux. Lives in the menu bar / system tray.

## Packs

| Pack | Switch | Character |
|---|---|---|
| Thocky | Linear | Deep, round bottom-out |
| Clacky | Linear | Bright, hollow clack |
| Clicky | Clicky | Click-jacket blues |
| Tactile | Tactile | Browns: soft bump, muted landing |

Each pack is cut from real CC0 recordings ([credits](sounds/CREDITS.md)). Every
key keeps its own take, big keys (space, enter, backspace) get bigger sounds,
release clicks are optional, and stereo follows the key's position.
Listen offline: `sounds/demo/*.wav`.

## Record your own keyboard

Settings → **Record your keyboard**. Type a sentence, then tap Space, Enter
and Backspace a few times. KeyBuddy records the mic while the key hook logs
which key moved, so every hit is labeled exactly (press vs release, big keys).
It measures the mic's delay from the recording itself, drops overlapping
hits, and saves a pack you can preview, pick from the tray, or delete.
Recorded packs live in the app's config folder under `packs/`.

## Run

```bash
npm install
npm run dev      # dev build
npm run build    # installers in src-tauri/target/release/bundle
```

Needs Rust and Node. On Linux also install the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Release

Installers are built by GitHub Actions ([release.yml](.github/workflows/release.yml))
for macOS (Apple Silicon + Intel), Windows and Linux:

1. Bump `version` in `src-tauri/tauri.conf.json` (and `VERSION` in `site/main.js`).
2. `git tag v0.1.0 && git push origin v0.1.0`

The website's download buttons point at `releases/latest/download/…`, so they
work as soon as the release is published.

## Permissions

- **macOS:** System Settings → Privacy & Security → **Input Monitoring** → allow KeyBuddy.
- **macOS (recording):** Microphone access, asked on first recording.
- **Windows:** nothing to grant.
- **Linux:** reads `/dev/input` (works on X11 and Wayland). Add yourself to the
  `input` group: `sudo usermod -aG input $USER`, then log out and back in.

## Privacy

KeyBuddy only sees which physical key moved, never characters. It keeps key
counts and typing speed locally. No account, no network.

## Layout

```
src-tauri/src/hook/     global key listening (macOS event tap, Windows LL hook, Linux evdev)
src-tauri/src/keymap.rs native codes -> key position + class
src-tauri/src/packs.rs  embedded sample packs
src-tauri/src/audio.rs  low-latency mixer (cpal)
src-tauri/src/engine.rs settings, stats, playback, recorded packs
src-tauri/src/recorder.rs mic capture + slicing for recorded packs
ui/                     settings window
tools/slice.py          recordings -> packs
```
