#!/usr/bin/env bash
# Bouwt de F-licentie trainer als los programma voor Windows, Linux en macOS (in standalone/dist).
# Gebruik: bash standalone/build.sh     (Go 1.22 of nieuwer nodig)
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..
rm -rf app dist && mkdir -p app dist
# Alleen wat de app gebruikt (img/theorievragen en de bronbestanden niet).
cp "$ROOT/index.html" app/
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/data" app/
mkdir -p app/img
for d in examenvragen theorie veron logo; do cp -r "$ROOT/img/$d" app/img/; done
[ -f "$ROOT/manifest.webmanifest" ] && cp "$ROOT/manifest.webmanifest" app/ || true
build() { echo "  $3"; CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -trimpath -ldflags "-s -w" -o "dist/$3" .; }
echo "Bouwen:"
build windows amd64 F-licentie-trainer.exe
build linux   amd64 F-licentie-trainer-linux
build darwin  arm64 F-licentie-trainer-mac
rm -rf app
ls -lh dist
