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

## Run

```bash
npm install
npm run dev      # dev build
npm run build    # installers in src-tauri/target/release/bundle
```

Needs Rust and Node. On Linux also install the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Permissions

- **macOS:** System Settings → Privacy & Security → **Input Monitoring** → allow KeyBuddy.
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
src-tauri/src/engine.rs settings, stats, playback
ui/                     settings window
tools/slice.py          recordings -> packs
```
