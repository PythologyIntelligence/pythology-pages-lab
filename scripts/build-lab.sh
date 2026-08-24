#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD"
OUT="$ROOT/_site"
MIRROR="$ROOT/.mirror"
BASE_PATH="/pythology-pages-lab"
PYTHOLOGY_SOURCE="https://pythology.co.nz"
VE_SOURCE="https://verry-elleegant-ai.vercel.app"

rm -rf "$OUT" "$MIRROR"
mkdir -p "$OUT" "$MIRROR/main" "$MIRROR/ve"

# Mirror the public Pythology website only. Cerberus is intentionally excluded
# from this lab until its high-frequency data path is moved to the VPS.
wget \
  --recursive \
  --level=3 \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --no-parent \
  --domains=pythology.co.nz,www.pythology.co.nz \
  --reject-regex='/(api|cerberus-app)(/|$)|/forex\.html($|\?)' \
  --directory-prefix="$MIRROR/main" \
  "$PYTHOLOGY_SOURCE/"

MAIN_INDEX="$(find "$MIRROR/main" -type f -name index.html -print | head -n 1 || true)"
if [[ -z "$MAIN_INDEX" ]]; then
  echo "Could not locate mirrored Pythology index.html" >&2
  exit 1
fi
MAIN_DIR="$(dirname "$MAIN_INDEX")"
cp -a "$MAIN_DIR"/. "$OUT"/

# Make sure the public lab never accidentally ships the Cerberus application.
rm -rf "$OUT/cerberus-app" "$OUT/cerberus-app.html" "$OUT/forex.html" "$OUT/forex.html.html"
find "$OUT" -type f \( -name '*cerberus-app*' -o -name 'forex.html*' \) -delete || true

# EarthNet's live UI fetches JSON dynamically, so wget will not discover these.
mkdir -p "$OUT/data"
for file in earthnet_latest.json earthnet_status.json earthnet_nz_daily.json earthnet_hydrology_nz.json; do
  curl -fsSL "$PYTHOLOGY_SOURCE/data/$file" -o "$OUT/data/$file" || echo "EarthNet snapshot unavailable: $file"
done

# Explicitly stage EarthNet v3 and all of its browser-side layers in case the
# marketing-site crawl did not encounter the operational dashboard.
EARTHNET_FILES=(
  earthnet-v3.html
  earthnet-v3.css
  earthnet-causal.css
  earthnet-satellite-geopolitical.css
  earthnet-intelligence.css
  earthnet-interactions.css
  earthnet-live-loader.js
  earthnet-v3.js
  earthnet-v3-marker-bridge.js
  earthnet-drawer-hooks.js
  earthnet-causal.js
  earthnet-intelligence.js
  earthnet-reliefweb.js
  earthnet-geopolitical.js
  earthnet-satellite.js
  earthnet-media.js
  earthnet-interactions.js
)
for file in "${EARTHNET_FILES[@]}"; do
  curl -fsSL "$PYTHOLOGY_SOURCE/$file" -o "$OUT/$file" || echo "EarthNet asset unavailable: $file"
done

# Stage the Agri frontend only. No production client data, access codes,
# feedback writes or server-side endpoints are copied into this public lab.
AGRI_FILES=(
  agri-portal.html
  agri-portal.css
  agri-decision.css
  agri-enterprise.css
  agri-mark-handover.css
  agri-mark-upgrade.css
  agri-mark-livestock.css
  agri-portal.js
  agri-enterprise.js
  agri-mark-handover.js
  agri-mark-preflight.js
  agri-mark-upgrade-v2.js
  agri-mark-live-status.js
  agri-brookfield-context.js
  agri-direct-link.js
  agri-mark-livestock.js
)
for file in "${AGRI_FILES[@]}"; do
  curl -fsSL "$PYTHOLOGY_SOURCE/$file" -o "$OUT/$file" || echo "Agri frontend asset unavailable: $file"
done

# Public lab safety shim: block production Agri API writes/reads and explain why.
cat > "$OUT/agri-pages-lab-guard.js" <<'EOF'
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || '';
    let pathname = raw;
    try { pathname = new URL(raw, location.href).pathname; } catch {}
    if (pathname.includes('/api/agri-')) {
      return Promise.resolve(new Response(JSON.stringify({
        error: 'GitHub Pages lab: private Agri API is intentionally disabled. Production remains untouched.'
      }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    }
    return originalFetch(input, init);
  };

  const banner = document.createElement('div');
  banner.textContent = 'GITHUB PAGES LAB · AGri frontend only · private farm data and write APIs disabled';
  Object.assign(banner.style, {
    position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: '99999',
    padding: '10px 14px', borderRadius: '10px', background: '#07171cee',
    border: '1px solid #38bfa455', color: '#b9fff1', font: '600 12px/1.3 system-ui,sans-serif',
    textAlign: 'center', letterSpacing: '.04em'
  });
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(banner));
})();
EOF

python3 - <<'PY'
from pathlib import Path
path = Path('_site/agri-portal.html')
if path.exists():
    text = path.read_text()
    marker = '</body>'
    if 'agri-pages-lab-guard.js' not in text:
        text = text.replace(marker, '  <script src="agri-pages-lab-guard.js"></script>\n' + marker)
    path.write_text(text)
PY

# Mirror the Verry Elleegant frontend into its own path.
wget \
  --recursive \
  --level=2 \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --no-parent \
  --domains=verry-elleegant-ai.vercel.app \
  --directory-prefix="$MIRROR/ve" \
  "$VE_SOURCE/"

VE_INDEX="$(find "$MIRROR/ve" -type f -name index.html -print | head -n 1 || true)"
if [[ -n "$VE_INDEX" ]]; then
  VE_DIR="$(dirname "$VE_INDEX")"
  mkdir -p "$OUT/verry-elleegant"
  cp -a "$VE_DIR"/. "$OUT/verry-elleegant"/
else
  echo "Verry Elleegant mirror was unavailable; retaining the rest of the lab." >&2
fi

# Snapshot the read-only VE endpoints used by the frontend. These are copied as
# static JSON so the Pages clone can render without executing Vercel functions.
mkdir -p "$OUT/lab-api/ve"
for endpoint in live-board races health; do
  curl -fsSL "$VE_SOURCE/api/$endpoint" -o "$OUT/lab-api/ve/$endpoint.json" || echo "VE snapshot unavailable: $endpoint"
done

# Rewrite VE's common read-only endpoint paths in mirrored JS/HTML to the local
# snapshot files. AI synthesis is deliberately not proxied because it is a POST.
python3 - <<'PY'
from pathlib import Path
root = Path('_site/verry-elleegant')
if root.exists():
    replacements = {
        '/api/live-board': '../lab-api/ve/live-board.json',
        '/api/races': '../lab-api/ve/races.json',
        '/api/health': '../lab-api/ve/health.json',
    }
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in {'.html', '.js', '.mjs', '.css'}:
            continue
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        new = text
        for old, repl in replacements.items():
            new = new.replace(old, repl)
        if new != text:
            path.write_text(new)
PY

# Add a tiny lab marker without changing the production source.
cat > "$OUT/pages-lab-status.json" <<EOF
{"mode":"github-pages-lab","cerberus":"excluded-vps-later","earthnet":"static-snapshot","agri":"frontend-only-private-api-disabled","verryElleegant":"static-frontend-readonly-snapshots","builtAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

# Keep GitHub Pages from invoking Jekyll processing.
touch "$OUT/.nojekyll"

# Guard against accidentally mirroring obvious private/server-side paths.
rm -rf "$OUT/private-data" "$OUT/netlify" "$OUT/api" "$OUT/.git" "$OUT/.github"

# Fail closed if anything obviously secret-looking made it into the output.
if grep -RIlE '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|GEMINI_API_KEY=|STRIPE_SECRET_KEY=|NETLIFY_AUTH_TOKEN=)' "$OUT" >/tmp/pages-lab-secret-scan.txt; then
  echo 'Potential secret material detected in Pages output:' >&2
  cat /tmp/pages-lab-secret-scan.txt >&2
  exit 1
fi

echo "Prepared GitHub Pages lab at $OUT"
find "$OUT" -maxdepth 2 -type f | sort | head -n 80
