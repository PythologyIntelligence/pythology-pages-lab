#!/usr/bin/env python3
"""Regression checks for the three independently verified website audit gaps."""
from __future__ import annotations
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load(name: str):
    source = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.replace("-", "_").replace(".", "_"), source)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

clean = load("build-clean-urls.py")
seo = load("build-site-discovery.py")


class WebsiteAuditTests(unittest.TestCase):
    def test_static_header_navigation_from_clean_subpages(self):
        source = ('''<html><head><title>Research</title></head><body>
        <header class="site-header">
          <a href="index.html">Home</a>
          <nav data-nav-links>
            <a href="enviroarc.html">EnviroArc</a>
            <a href="about.html">About</a>
            <a href="where-it-fits.html">Where it fits</a>
          </nav>
          <a href="about.html#contact">Contact</a>
        </header>
        <main><a href="about.html">In-content link</a></main>
        </body></html>''')
        for slug in ("prometheus", "about", "subterranean"):
            new = clean.rewrite(source, slug, True)
            for dest in ("enviroarc/", "about/", "where-it-fits/"):
                self.assertIn('href="/' + dest + '"', new)
                self.assertNotIn('href="' + dest + '"', new)
            self.assertIn('href="/about/#contact"', new)
            self.assertIn('href="/"', new)
            # Other links keep the supported relative-to-base routing semantics.
            self.assertIn('<main><a href="about/">', new)
            self.assertLess(new.index('<base href="../">'), new.index('</head>'))

    def test_prometheus_apostrophe_is_not_truncated(self):
        raw = ('''<html><head><title>Prometheus — Pythology</title>
          <meta name="description" content="Prometheus is Pythology's autonomous environmental research observer: early signals, accountable forecasts &amp; a transparent record.">
          </head><body></body></html>''')
        out = seo.inject(raw, slug="prometheus", homepage=False)
        self.assertIn('content="Prometheus is Pythology&#x27;s autonomous environmental research observer: early signals, accountable forecasts &amp; a transparent record."', out)
        self.assertIn('property="og:description"', out)
        self.assertNotIn('og:description" content="Prometheus is Pythology"', out)
        self.assertEqual(out.count('property="og:description"'), 1)

    def test_original_images_still_available_and_new_refs_are_webp(self):
        build = (ROOT / "scripts" / "build-lab.sh").read_text(encoding="utf-8")
        self.assertIn("build-chathams-webp.py", build)
        self.assertIn('cp "$CHATHAMS_SOURCE/"*.png', build)
        for page in ("index.html", "chathams.html"):
            html = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn('png_images/chathams/helios-dashboard.webp', html)
            self.assertIn('png_images/chathams/ecowatch-dashboard.webp', html)
            self.assertNotIn('png_images/chathams/helios-dashboard.png', html)
            self.assertNotIn('png_images/chathams/ecowatch-dashboard.png', html)
        chathams = (ROOT / "chathams.html").read_text(encoding="utf-8")
        self.assertIn('loading="lazy"', chathams)
        self.assertIn('fetchpriority="high"', chathams)


if __name__ == "__main__":
    unittest.main()
