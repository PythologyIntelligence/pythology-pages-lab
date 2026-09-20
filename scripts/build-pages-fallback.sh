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

# Always overlay the complete current human-facing surface so fallback can never
# publish an incomplete navigation/site shell.
PUBLIC_FALLBACK_OVERRIDES=(
  index.html
  site.css
  site.js
  architecture-in-action.css
  pythology-human.css
  home-proof.js
  earthnet-human.css
  earthnet-page.js
  earthnet-platform.html
  earthnet-nz-intelligence.html
  prometheus-page.js
  prometheus.html
  research-ui.js
  stack-human.css
  research.html
  where-it-fits.css
  where-it-fits.html
  about-human.css
  about.html
  causal-human.css
  causal-intelligence.html
  future.css
  future.html
  cerberus.html
  sentinel-command.html
  sentinel-command.css
  sentinel-command.js
)
for file in "${PUBLIC_FALLBACK_OVERRIDES[@]}"; do
  [[ -f "$ROOT/$file" ]] || { echo "Fallback override missing: $file" >&2; exit 1; }
  cp "$ROOT/$file" "$OUT/$file"
done

mkdir -p "$OUT/png_images"
[[ -s "$ROOT/png_images/about_me.png" ]] || { echo 'Fallback founder portrait missing.' >&2; exit 1; }
cp "$ROOT/png_images/about_me.png" "$OUT/png_images/about_me.png"

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

for required in about.html prometheus.html mdra.html future.html site.js png_images/about_me.png; do
  [[ -s "$OUT/$required" ]] || { echo "Fallback site incomplete: $required" >&2; exit 1; }
done

touch "$OUT/.nojekyll"
rm -rf "$OUT/private-data" "$OUT/netlify" "$OUT/api" "$OUT/.git" "$OUT/.github"

echo "Prepared complete resilient Pages fallback at $OUT"
