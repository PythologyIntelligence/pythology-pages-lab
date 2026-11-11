#!/usr/bin/env python3
"""Apply a pinned, reviewed redesign to an already built Pages artifact.

Never edits main source pages or raw data. Preserves original public research
interfaces under /archive-research/ and fails closed on missing assets.
"""
from __future__ import annotations
import html
from pathlib import Path
import re
import shutil
import sys

PAGES = [
    "index.html", "prometheus-research.html", "environmental.html",
    "biological.html", "physical-systems.html", "about.html", "chathams.html",
    "current-research.html", "computational-biology-lab.html",
    "physical-intelligence.html", "weather-lab.html", "precursor-research.html",
    "forecast-ledger.html", "subterranean-lab.html",
]
ILLUSTRATIONS = [
    "biology.jpeg", "evidence_layers.jpeg", "fault_sensor_context.jpeg",
    "home_page.jpeg", "research_philosophy.jpeg", "structural.jpeg",
]
ARCHIVES = [
    "prometheus-research.html", "environmental.html", "weather-lab.html",
    "precursor-research.html", "chathams.html", "current-research.html",
    "physical-intelligence.html", "about.html",
]
LIVE = {
    "prometheus-research.html": [("ledger", "Forecast ledger", "prometheus-research.html")],
    "forecast-ledger.html": [("ledger", "Forecast ledger", "prometheus-research.html")],
    "environmental.html": [
        ("nz", "NZ daily observations", "environmental.html"),
        ("weather", "Weather screening", "environmental.html"),
    ],
    "weather-lab.html": [("weatherlab", "Weather Lab public source", "weather-lab.html")],
    "precursor-research.html": [("geology", "Geological public screen", "precursor-research.html")],
    "subterranean-lab.html": [("geology", "Geological public screen", "precursor-research.html")],
}

def embed_live(page_name: str, document: str) -> str:
    entries = LIVE.get(page_name, [])
    if not entries:
        return document
    cards = "".join(
        '<article class="px-live-card" data-live-evidence="' + kind +
        '"><h3>' + html.escape(label) +
        '</h3><p class="px-live-state" data-live-state>Checking public evidence…</p>' +
        '<p data-live-detail>Awaiting dated source record.</p>' +
        '<p class="px-live-date" data-live-date></p></article>'
        for kind, label, _ in entries
    )
    source = entries[0][2]
    section = ('<section class="px-section px-live-section" id="public-live-evidence">'
      '<div class="px-shell"><p class="px-tag">DATED RESEARCH STATUS</p>'
      '<h2>Current public evidence feeds</h2>'
      '<p class="px-live-intro">These read-only feeds are separate from the dated historical examples above. '
      'A delayed or unavailable snapshot is not an indication of safety or inactivity. '
      'Research screens are not official warnings or clinically validated predictions.</p>'
      '<div class="px-live-grid">' + cards + '</div>'
      '<p><a href="archive-research/' + source +
      '">View the preserved detailed research display</a></p>'
      '</div></section>')
    if "</main>" not in document:
        raise ValueError(f"{page_name}: missing </main>")
    document = document.replace("</main>", section + "</main>", 1)
    if "</head>" not in document:
        raise ValueError(f"{page_name}: missing </head>")
    document = document.replace("</head>",
      '<link rel="stylesheet" href="assets/live-evidence.css">'
      '<script defer src="assets/live-evidence.js"></script></head>', 1)
    return document

def apply(out: Path, source: Path) -> None:
    if not (out / "index.html").is_file():
        raise ValueError("original Pages build missing index")
    for path in PAGES:
        if not (source / path).is_file():
            raise ValueError("redesign source missing " + path)
    for path in ("assets/theme.css", "assets/site.js",
                 "assets/live-evidence.js", "assets/live-evidence.css"):
        if not (source / path).is_file():
            raise ValueError("redesign dependency missing " + path)
    for image in ILLUSTRATIONS:
        path = source / "assets" / "illustrations" / image
        if not path.is_file() or path.stat().st_size < 50000:
            raise ValueError("redesign image invalid: " + image)

    archive_root = out / "archive-research"
    archive_root.mkdir(exist_ok=True)
    for name in ARCHIVES:
        old = (out / name).read_text(encoding="utf-8")
        if "</head>" not in old or "<head>" not in old:
            raise ValueError("cannot preserve original " + name)
        old = old.replace("<head>", '<head><base href="../">'
                 '<meta name="robots" content="noindex,nofollow">', 1)
        notice = ('<aside role="note" style="padding:12px 20px;background:#102c35;'
                 'color:white;font:14px system-ui">Preserved research display. '
                 'Return to <a style="color:#bef" href="' + name +
                 '">the updated Pythology page</a>.</aside>')
        if "<body" in old:
            old = re.sub(r"(<body[^>]*>)", r"\1" + notice, old, count=1, flags=re.I)
        (archive_root / name).write_text(old, encoding="utf-8")

    for name in PAGES:
        text = (source / name).read_text(encoding="utf-8")
        # Keep the canonical public Prometheus route, not the older redirect.
        text = text.replace('href="prometheus.html"', 'href="prometheus-research.html"')
        text = text.replace("href='prometheus.html'", "href='prometheus-research.html'")
        # The formerly nested preview was moved to the Pages root.
        text = text.replace("../Logo%20(2).jpeg", "Logo%20(2).jpeg")
        text = text.replace("../Logo (2).jpeg", "Logo%20(2).jpeg")
        text = embed_live(name, text)
        (out / name).write_text(text, encoding="utf-8")

    for path in ("assets/theme.css", "assets/site.js",
                 "assets/live-evidence.js", "assets/live-evidence.css"):
        target = out / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / path, target)
    for image in ILLUSTRATIONS:
        target = out / "assets" / "illustrations" / image
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "assets" / "illustrations" / image, target)

    # Prove that the original detailed pages and data clients still exist.
    for file in ("data/earthnet_prometheus.json", "data/earthnet_nz_daily.json",
                 "prometheus-stats.js", "prometheus-research-cards.js",
                 "weather-lab-live.js", "weather-observation-list.js",
                 "site.js", "enviroarc.html", "earthnet-platform.html"):
        if not (out / file).is_file():
            raise ValueError("original research asset disappeared: " + file)
    assert 'data-live-evidence="ledger"' in (out / "prometheus-research.html").read_text()
    assert 'data-live-evidence="nz"' in (out / "environmental.html").read_text()
    assert (archive_root / "precursor-research.html").is_file()
    print(f"Redesign integrated: {len(PAGES)} HTML pages, {len(ILLUSTRATIONS)} images, "
          f"{len(ARCHIVES)} old detailed research displays preserved.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: apply-redesign.py _site .site-redesign-source")
    apply(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
