#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD"
OUT="$ROOT/_site"
MIRROR="$ROOT/.mirror"
PYTHOLOGY_SOURCE="https://pythology.co.nz"
AGRI_SOURCE="$ROOT/agri-source"
VE_SOURCE="https://verry-elleegant-ai.vercel.app"

rm -rf "$OUT" "$MIRROR"
mkdir -p "$OUT" "$MIRROR/main" "$MIRROR/ve"

# Mirror the public Pythology website. The former Cerberus React application is
# intentionally excluded; the standalone read-only Cerberus portal is staged
# deterministically from this repository later in the build.
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
  "$PYTHOLOGY_SOURCE/" || true

MAIN_INDEX=""
for candidate in \
  "$MIRROR/main/pythology.co.nz/index.html" \
  "$MIRROR/main/www.pythology.co.nz/index.html"; do
  if [[ -f "$candidate" ]]; then
    MAIN_INDEX="$candidate"
    break
  fi
done
if [[ -z "$MAIN_INDEX" ]]; then
  MAIN_INDEX="$(find "$MIRROR/main" -maxdepth 3 -type f -name index.html -print | head -n 1 || true)"
fi
if [[ -z "$MAIN_INDEX" ]]; then
  echo "Could not locate mirrored Pythology index.html" >&2
  exit 1
fi
MAIN_DIR="$(dirname "$MAIN_INDEX")"
cp -a "$MAIN_DIR"/. "$OUT"/

# Never ship the retired Cerberus React application or former forex route.
rm -rf "$OUT/cerberus-app" "$OUT/cerberus-app.html" "$OUT/forex.html" "$OUT/forex.html.html"
find "$OUT" -type f \( -name '*cerberus-app*' -o -name 'forex.html*' \) -delete || true

# EarthNet's live UI fetches JSON dynamically, so wget will not discover these.
mkdir -p "$OUT/data"
for file in earthnet_latest.json earthnet_status.json earthnet_nz_daily.json earthnet_hydrology_nz.json; do
  curl -fsSL "$PYTHOLOGY_SOURCE/data/$file" -o "$OUT/data/$file" || echo "EarthNet snapshot unavailable: $file"
done

# Cerberus remains read-only on GitHub for now. Keep the seed snapshot in this
# repository so Pages does not depend on a private cross-repository raw URL.
# The UI surfaces staleness rather than pretending an old snapshot is current.
cp "$ROOT/data/cerberus_latest.json" "$OUT/data/cerberus_latest.json"

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

# Stage the vendored Agri frontend only. Keeping these files in this repository
# removes the circular dependency on the live site and avoids private-repository
# access from GitHub Actions. No production client data, access codes, feedback
# writes or server-side endpoints are copied into this public lab.
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
  cp "$AGRI_SOURCE/$file" "$OUT/$file" || {
    echo "Required vendored Agri frontend asset unavailable: $file" >&2
    exit 1
  }
done

# Build an independent safe Agri snapshot from Open-Meteo at a generic public
# test point. This is the same Pages pattern we want to test, without exposing a
# real farm or relying on Netlify's Agri functions.
python3 scripts/build-agri-lab.py

# Public lab shim: serve the safe local Agri snapshot for reads, and block all
# production feedback/application writes.
cat > "$OUT/agri-pages-lab-guard.js" <<'EOF'
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || '';
    let pathname = raw;
    try { pathname = new URL(raw, location.href).pathname; } catch {}

    if (pathname.includes('/api/agri-data')) {
      return originalFetch('data/agri_lab.json', { cache: 'no-store' });
    }

    if (pathname.includes('/api/agri-feedback') || pathname.includes('/api/agri-application')) {
      return Promise.resolve(new Response(JSON.stringify({
        error: 'GitHub Pages lab: production Agri writes are intentionally disabled.'
      }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    }

    return originalFetch(input, init);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const client = document.getElementById('client-id');
    const code = document.getElementById('access-code');
    const button = document.querySelector('#access-form button[type="submit"]');
    if (client && !client.value) client.value = 'pages-lab-demo';
    if (code && !code.value) code.value = 'demo';
    if (button) button.textContent = 'Open GitHub Pages lab';

    const banner = document.createElement('div');
    banner.textContent = 'GITHUB PAGES LAB · generic Open-Meteo farm · no private client data · write APIs disabled';
    Object.assign(banner.style, {
      position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: '99999',
      padding: '10px 14px', borderRadius: '10px', background: '#07171cee',
      border: '1px solid #38bfa455', color: '#b9fff1', font: '600 12px/1.3 system-ui,sans-serif',
      textAlign: 'center', letterSpacing: '.04em'
    });
    document.body.appendChild(banner);
  });
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
  "$VE_SOURCE/" || true

VE_INDEX=""
for candidate in \
  "$MIRROR/ve/verry-elleegant-ai.vercel.app/index.html" \
  "$MIRROR/ve/www.verry-elleegant-ai.vercel.app/index.html"; do
  if [[ -f "$candidate" ]]; then
    VE_INDEX="$candidate"
    break
  fi
done
if [[ -z "$VE_INDEX" ]]; then
  VE_INDEX="$(find "$MIRROR/ve" -maxdepth 3 -type f -name index.html -print | head -n 1 || true)"
fi
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
{"mode":"github-pages-lab","cerberus":"standalone-readonly-github-snapshot","earthnet":"static-snapshot","agri":"open-meteo-public-lab","verryElleegant":"static-frontend-readonly-snapshots","builtAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF

# Publish the safe System Control front end and its sanitised telemetry snapshot.
# These files contain no credentials, private client data, raw logs or provider secrets.
if [[ -d "$ROOT/monitor" ]]; then
  mkdir -p "$OUT/monitor"
  cp -a "$ROOT/monitor"/. "$OUT/monitor"/
fi
if [[ -f "$ROOT/data/system-health.json" ]]; then
  mkdir -p "$OUT/data"
  cp "$ROOT/data/system-health.json" "$OUT/data/system-health.json"
fi

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

# Overlay the approved human-facing site from this repository after the resilient
# live mirror is built. This keeps the existing EarthNet/Agri/VE safety machinery
# intact while allowing the public presentation to move forward deliberately.
PUBLIC_OVERRIDES=(
  index.html
  site.css
  site.js
  architecture-in-action.css
  pythology-human.css
  mdra.html
  mdra.css
  mdra-nav.js
  mdra-refresh.js
  mdra-refresh.css
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
for file in "${PUBLIC_OVERRIDES[@]}"; do
  if [[ ! -f "$ROOT/$file" ]]; then
    echo "Required public override missing: $file" >&2
    exit 1
  fi
  cp "$ROOT/$file" "$OUT/$file"
done

# Cache-bust the canonical navigation controller on every Pages deployment.
# Mobile/tablet browsers can otherwise keep an older site.js even after a new
# deployment and show stale menu contents.
NAV_VERSION="${GITHUB_SHA:-local}"
NAV_VERSION="${NAV_VERSION:0:12}"
NAV_VERSION="$NAV_VERSION" python3 - <<'PY'
from pathlib import Path
import os
import re

version = os.environ["NAV_VERSION"]
pattern = re.compile(r'''src=(["'])site\.js(?:\?v=[^"']*)?\1''')
replacement = lambda m: f'src={m.group(1)}site.js?v={version}{m.group(1)}'

changed = 0
for page in Path("_site").glob("*.html"):
    text = page.read_text(encoding="utf-8")
    new = pattern.sub(replacement, text)
    if new != text:
        page.write_text(new, encoding="utf-8")
        changed += 1

if changed < 1:
    raise SystemExit("No public HTML page referenced site.js for cache busting.")
print(f"Cache-busted site.js on {changed} public page(s) with version {version}.")
PY

# Apply the MDRA/public UI overlays inside the primary build so deployment is
# atomic. No second workflow is allowed to rewrite the site after publication.
VERSION="$NAV_VERSION" python3 - <<'PY'
from pathlib import Path
import os
import re

version = os.environ["VERSION"]

def version_asset(source: str, asset: str) -> str:
    pattern = rf'(["\']){re.escape(asset)}(?:\?v=[^"\']*)?(["\'])'
    return re.sub(pattern, rf'\1{asset}?v={version}\2', source)

home = Path("_site/index.html")
text = home.read_text(encoding="utf-8")
for asset in ("site.css", "pythology-human.css", "site.js", "home-proof.js"):
    text = version_asset(text, asset)

research_tag = f'<script defer src="research-ui.js?v={version}"></script>'
if "research-ui.js" not in text:
    anchor = re.search(r'<script defer src="home-proof\.js\?v=[^"]+"></script>', text)
    if not anchor:
        raise SystemExit("Could not locate versioned home-proof.js tag")
    text = text[:anchor.start()] + research_tag + "\n  " + text[anchor.start():]
else:
    text = version_asset(text, "research-ui.js")
home.write_text(text, encoding="utf-8")

nav_tag = f'<script defer src="mdra-nav.js?v={version}"></script>'
refresh_tag = f'<script defer src="mdra-refresh.js?v={version}"></script>'
refresh_css = f'<link rel="stylesheet" href="mdra-refresh.css?v={version}">'

for page in Path("_site").glob("*.html"):
    try:
        page_text = page.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    if "data-nav-links" not in page_text:
        continue

    page_text = re.sub(r'\s*<script defer src="mdra-nav\.js(?:\?v=[^"]*)?"></script>\s*', "\n", page_text)
    page_text = re.sub(r'\s*<script defer src="mdra-refresh\.js(?:\?v=[^"]*)?"></script>\s*', "\n", page_text)
    page_text = re.sub(r'\s*<link rel="stylesheet" href="mdra-refresh\.css(?:\?v=[^"]*)?">\s*', "\n", page_text)

    if "</head>" not in page_text:
        raise SystemExit(f"{page} has no closing head tag")
    page_text = page_text.replace(
        "</head>",
        f"  {refresh_css}\n  {nav_tag}\n  {refresh_tag}\n</head>",
        1,
    )
    if page.name == "mdra.html":
        page_text = version_asset(page_text, "mdra.css")
    page.write_text(page_text, encoding="utf-8")

print(f"Primary build UI overlay applied for {version}.")
PY

# Stage the round header/footer mark from this repository. Keeping the binary
# beside the build removes a private cross-repository dependency from Pages.
if [[ ! -s "$ROOT/Logo (2).jpeg" ]]; then
  echo 'Required Pythology logo is missing from the Pages repository.' >&2
  exit 1
fi
cp "$ROOT/Logo (2).jpeg" "$OUT/Logo (2).jpeg"

# Stage the approved Pythology title banner from this public Pages repository.
TITLE_BANNER="$ROOT/png_images/pythology_environmental_ai_banner.webp"
if [[ ! -s "$TITLE_BANNER" ]]; then
  echo "Required Pythology title banner missing: $TITLE_BANNER" >&2
  exit 1
fi
mkdir -p "$OUT/png_images"
cp "$TITLE_BANNER" "$OUT/png_images/pythology_environmental_ai_banner.webp"

# Stage the original founder portrait directly from this repository. Keeping the
# binary in Pages Lab removes the private cross-repository dependency that caused
# the primary build to fall back to an incomplete artifact.
FOUNDER_PORTRAIT="$ROOT/png_images/about_me.png"
[[ -s "$FOUNDER_PORTRAIT" ]] || {
  echo 'Required About founder portrait is missing from Pages Lab.' >&2
  exit 1
}
[[ "$(stat -c%s "$FOUNDER_PORTRAIT")" -eq 808020 ]] || {
  echo 'About founder portrait size validation failed.' >&2
  exit 1
}
cp "$FOUNDER_PORTRAIT" "$OUT/png_images/about_me.png"

# These public evidence projections are deliberately staged with the humanised
# pages because wget does not discover browser-fetched JSON.
for file in earthnet_prometheus.json earthnet_volcano_pulse.json earthnet_nz_daily.json prometheus_research_state.json; do
  if [[ ! -f "$ROOT/data/$file" ]]; then
    echo "Required public evidence projection missing: data/$file" >&2
    exit 1
  fi
  cp "$ROOT/data/$file" "$OUT/data/$file"
done

# Fail closed if critical public surfaces did not land.
grep -Fq 'We build intelligence' "$OUT/index.html" || {
  echo 'Humanised homepage overlay validation failed.' >&2
  exit 1
}
[[ -s "$OUT/site.css" && -s "$OUT/site.js" && -s "$OUT/architecture-in-action.css" && -s "$OUT/Logo (2).jpeg" ]] || {
  echo 'Critical homepage stylesheet, navigation script or logo validation failed.' >&2
  exit 1
}
grep -Fq "mobile-open" "$OUT/site.js" || {
  echo 'Responsive navigation controller validation failed.' >&2
  exit 1
}
grep -Fq "['mdra.html', 'MDRA']" "$OUT/site.js" || {
  echo 'Canonical primary navigation is missing MDRA.' >&2
  exit 1
}
grep -Fq "href !== currentPage" "$OUT/site.js" || {
  echo 'Current-page navigation omission validation failed.' >&2
  exit 1
}
grep -Eq 'site\.js\?v=[A-Za-z0-9._-]+' "$OUT/index.html" || {
  echo 'Navigation cache-bust validation failed on homepage.' >&2
  exit 1
}
grep -Eq 'site\.js\?v=[A-Za-z0-9._-]+' "$OUT/future.html" || {
  echo 'Navigation cache-bust validation failed on Future page.' >&2
  exit 1
}
[[ -s "$OUT/earthnet-nz-intelligence.html" ]] || {
  echo 'NZ intelligence page overlay validation failed.' >&2
  exit 1
}
[[ -s "$OUT/data/earthnet_nz_daily.json" ]] || {
  echo 'NZ daily-state projection validation failed.' >&2
  exit 1
}
[[ -s "$OUT/data/prometheus_research_state.json" ]] || {
  echo 'Prometheus research-state projection validation failed.' >&2
  exit 1
}
grep -Fq 'He does not just predict.' "$OUT/prometheus.html" || {
  echo 'Prometheus autonomous research presentation validation failed.' >&2
  exit 1
}
grep -Fq 'https://earthnet.pythology.co.nz/' "$OUT/index.html" || {
  echo 'Homepage EarthNet 2.0 link validation failed.' >&2
  exit 1
}
grep -Fq 'mdra-refresh.css?v=' "$OUT/index.html" || {
  echo 'Homepage MDRA refresh overlay validation failed.' >&2
  exit 1
}
grep -Fq 'research-ui.js?v=' "$OUT/index.html" || {
  echo 'Homepage research UI overlay validation failed.' >&2
  exit 1
}
[[ -s "$OUT/about.html" && -s "$OUT/mdra.html" && -s "$OUT/prometheus.html" ]] || {
  echo 'Human-facing site is incomplete.' >&2
  exit 1
}
[[ -s "$OUT/future.html" && -s "$OUT/future.css" ]] || {
  echo 'FUTURE presentation overlay validation failed.' >&2
  exit 1
}
[[ -s "$OUT/png_images/about_me.png" ]] || {
  echo 'About founder portrait did not stage.' >&2
  exit 1
}
[[ -s "$OUT/cerberus.html" && -s "$OUT/data/cerberus_latest.json" ]] || {
  echo 'Cerberus standalone portal or snapshot did not stage.' >&2
  exit 1
}
[[ -s "$OUT/agri-portal.html" && -s "$OUT/agri-pages-lab-guard.js" && -s "$OUT/data/agri_lab.json" ]] || {
  echo 'Agri portal, guard or safe lab snapshot did not stage.' >&2
  exit 1
}

echo "Prepared GitHub Pages lab at $OUT"
find "$OUT" -maxdepth 2 -type f | sort | head -n 100
