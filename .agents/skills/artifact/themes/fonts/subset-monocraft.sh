#!/usr/bin/env bash
# Rebuilds monocraft-code.woff2: Monocraft reduced to the glyphs code, call
# stacks and diagrams use (ASCII, Latin-1, arrows, box drawing, a few marks),
# with ligatures removed so `+-` never becomes an arrow.
#
# Usage: themes/fonts/subset-monocraft.sh <path/to/Monocraft.ttf>
# Needs Python 3; installs fonttools and brotli into a throwaway venv.
set -euo pipefail

src="${1:?usage: subset-monocraft.sh <Monocraft.ttf>}"
here="$(cd "$(dirname "$0")" && pwd)"
venv="$(mktemp -d)"
trap 'rm -rf "$venv"' EXIT

python3 -m venv "$venv"
"$venv/bin/pip" install --quiet fonttools brotli

"$venv/bin/pyftsubset" "$src" \
  --output-file="$here/monocraft-code.woff2" \
  --flavor=woff2 \
  --layout-features='' \
  --name-IDs='*' \
  --notdef-outline \
  --unicodes='U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-21FF,U+2500-257F,U+25B6,U+25C0,U+25CB,U+25CF,U+2713,U+2717'

ls -l "$here/monocraft-code.woff2"
