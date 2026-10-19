#!/usr/bin/env python3
"""Offline public SEO and navigation regression tests, no internet needed."""
from __future__ import annotations
import importlib.util
import json
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urljoin


SCRIPT = Path(__file__).with_name("build-site-discovery.py")
spec = importlib.util.spec_from_file_location("site_discovery", SCRIPT)
if not spec or not spec.loader:
    raise RuntimeError("Discovery script not importable")
discovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(discovery)


class SiteDiscoveryTests(unittest.TestCase):
    def test_every_approved_page_has_canonical_and_linkedin_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, slug in discovery.approved_pages().items():
                (root / name).write_text(
                    '<!doctype html><html><head><title>Public Research &amp; Partners</title>'
                    '<meta name="description" content="Public observations &amp; limits">'
                    '</head><body><img src="Logo (2).jpeg"></body></html>',
                    encoding="utf-8",
                )
            (root / "Logo (2).jpeg").write_bytes(b"\xff\xd8\xff\xd9")
            discovery.build(root)
            for name, slug in discovery.approved_pages().items():
                page = (root / name).read_text(encoding="utf-8")
                target = discovery.DOMAIN + ("/" + slug + "/" if slug else "/")
                self.assertIn(f'<link rel="canonical" href="{target}">', page, name)
                self.assertIn(f'<meta property="og:url" content="{target}">', page, name)
                self.assertIn('og:image', page, name)
                self.assertIn('favicon.svg', page, name)
                self.assertIn('logo.jpg', page, name)
                self.assertNotIn('Logo (2).jpeg', page, name)
                self.assertNotIn('twitter:', page, name)
                if name == "index.html":
                    self.assertIn('"@type":"Organization"', page)
                    self.assertNotIn('"sameAs"', page)
            self.assertTrue((root / "favicon.ico").read_bytes().startswith(b"\x00\x00\x01\x00"))
            self.assertTrue((root / "favicon.svg").read_text().startswith("<svg"))
            self.assertEqual((root / "logo.jpg").read_bytes(), b"\xff\xd8\xff\xd9")
            self.assertIn("Sitemap: https://pythology.co.nz/sitemap.xml", (root / "robots.txt").read_text())
            xml = ET.fromstring((root / "sitemap.xml").read_text())
            locs = [node.text for node in xml.findall(".//{*}loc")]
            self.assertEqual(len(locs), len(discovery.approved_pages()))
            self.assertEqual(len(set(locs)), len(locs))
            self.assertIn("https://pythology.co.nz/physical-intelligence/", locs)
            self.assertIn("https://pythology.co.nz/where-it-fits/", locs)

    def test_subpages_resolve_sibling_navigation_with_site_base(self):
        # A check on URL semantics at both custom domain and GitHub project path.
        for origin, parent in [
            ("https://pythology.co.nz/", ""),
            ("https://example.github.io/pythology-pages-lab/", "pythology-pages-lab/"),
        ]:
            for source in ("about/", "prometheus/", "subterranean/"):
                doc = origin + source
                base = urljoin(doc, "../")
                for target in ("enviroarc/", "where-it-fits/", "about/", ""):
                    resolved = urljoin(base, target)
                    self.assertEqual(resolved, origin + target)
                    self.assertNotIn(source + "enviroarc/", resolved)
        sitejs = Path(__file__).resolve().parents[1] / "site.js"
        script = sitejs.read_text(encoding="utf-8")
        self.assertIn("new URL('./', document.baseURI)", script)
        self.assertIn("new URL(target, siteRoot).pathname", script)

    def test_replace_old_open_graph_without_duplicates(self):
        old = ('<html><head><title>Example</title>'
               '<meta name="description" content="A page">'
               '<link rel="canonical" href="https://pythology.co.nz/test.html">'
               '<meta property="og:title" content="Old">'
               '</head><body></body></html>')
        page = discovery.inject(old, slug="test", homepage=False)
        self.assertEqual(page.count('property="og:title"'), 1)
        self.assertEqual(page.count('rel="canonical"'), 1)
        self.assertIn('href="https://pythology.co.nz/test/"', page)
        self.assertNotIn('content="Old"', page)

    def test_public_physical_monitoring_text_is_precise(self):
        root = Path(__file__).resolve().parents[1]
        physical = (root / "physical-intelligence.html").read_text(encoding="utf-8")
        applied = (root / "where-it-fits.html").read_text(encoding="utf-8")
        home = (root / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="who-its-for"', physical)
        self.assertIn("authorised live sensor feed", applied)
        self.assertIn("read-only", applied.lower())
        self.assertIn("simulated", physical.lower())
        self.assertIn('class="home-partner-path"', home)
        self.assertIn('href="where-it-fits.html"', home)


if __name__ == "__main__":
    unittest.main()
