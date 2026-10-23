#!/usr/bin/env bash
# Builds KeyBuddy for macOS with a *stable* local signature.
#
# Unsigned/ad-hoc builds are identified by macOS by their exact hash, so every
# rebuild looks like a new app and Input Monitoring / Microphone grants stop
# applying. Signing with a fixed designated requirement (the bundle id) keeps
# the grant valid across rebuilds. For distribution, replace this with a real
# Developer ID signature + notarization.
set -euo pipefail
cd "$(dirname "$0")/.."

ID="app.keybuddy.desktop"
BUNDLE="src-tauri/target/release/bundle"
APP="$BUNDLE/macos/KeyBuddy.app"

npx tauri build --bundles app

codesign --force --deep --sign - --identifier "$ID" \
  --requirements "=designated => identifier \"$ID\"" "$APP"
codesign --verify --strict "$APP"

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
ARCH=$(uname -m)
mkdir -p "$BUNDLE/dmg"
DMG="$BUNDLE/dmg/KeyBuddy_${VERSION}_${ARCH}.dmg"
STAGE=$(mktemp -d)
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname KeyBuddy -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

echo "App: $APP"
echo "DMG: $DMG"
