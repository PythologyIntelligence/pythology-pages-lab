#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD"
OUT="$ROOT/_site"
MIRROR="$ROOT/.pages-fallback"
BASE="https://pythologyintelligence.github.io/pythology-pages-lab"

rm -rf "$OUT" "$MIRROR"
mkdir -p "$OUT" "$MIRROR"

echo "Primary source unavailable; rebuilding from the last-good GitHub Pages deployment."
# wget can return a non-zero status when an optional linked page/assets is missing.
# Treat that as non-fatal here, then verify the recovered homepage explicitly below.
wget \
  --recursive \
  --level=4 \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --no-parent \
  --domains=pythologyintelligence.github.io \
  --directory-prefix="$MIRROR" \
  "$BASE/" || true

SITE="$MIRROR/pythologyintelligence.github.io/pythology-pages-lab"
if [[ ! -f "$SITE/index.html" ]]; then
  echo "Could not recover the last-good Pages deployment." >&2
  exit 1
fi
cp -a "$SITE"/. "$OUT"/

# Always overlay the current human-facing FUTURE surface so a first deployment
# does not depend on the previous Pages package already containing it.
for file in index.html pythology-human.css future.html future.css; do
  if [[ -f "$ROOT/$file" ]]; then
    cp "$ROOT/$file" "$OUT/$file"
  fi
done

# Always overlay the current System Control code and safe telemetry from git.
if [[ -d "$ROOT/monitor" ]]; then
  mkdir -p "$OUT/monitor"
  cp -a "$ROOT/monitor"/. "$OUT/monitor"/
fi
mkdir -p "$OUT/data"
for file in system-health.json yggdrasil_activity.json earthnet_status.json; do
  if [[ -f "$ROOT/data/$file" ]]; then
    cp "$ROOT/data/$file" "$OUT/data/$file"
  fi
done

touch "$OUT/.nojekyll"
rm -rf "$OUT/private-data" "$OUT/netlify" "$OUT/api" "$OUT/.git" "$OUT/.github"

echo "Prepared resilient Pages fallback at $OUT"
