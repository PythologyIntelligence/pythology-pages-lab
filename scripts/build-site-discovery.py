#!/usr/bin/env python3
"""Create conservative SEO, LinkedIn/Open Graph previews and clean site assets.

Called on the staged _site directory before the clean-route builder. Only the
explicit approved public pages are indexed. No social profiles are invented.
"""
from __future__ import annotations

import html
import importlib.util
import json
import math
import re
import shutil
import struct
import sys
import zlib
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

DOMAIN = "https://pythology.co.nz"
SITE_NAME = "Pythology Intelligence"
SOCIAL_IMAGE = DOMAIN + "/png_images/pythology_environmental_ai_banner.webp"
HEAD = re.compile(r"</head>", re.I)
TITLE = re.compile(r"<title\b[^>]*>(.*?)</title\s*>", re.I | re.S)
# Match the closing quote of content="..." or content='...' correctly. Apostrophes
# inside double-quoted descriptions (e.g. "Pythology's") must not truncate text.
DESCRIPTION = re.compile(
    r'<meta\b(?=[^>]*\bname=["\']description["\'])[^>]*\bcontent=(?P<quote>["\'])(?P<value>.*?)(?P=quote)[^>]*>',
    re.I | re.S,
)
CANONICAL = re.compile(r'<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>', re.I)
PREVIEW = re.compile(r'<meta\b(?=[^>]*\b(?:property|name)=["\'](?:og:[^"\']+|twitter:[^"\']+)["\'])[^>]*>\s*', re.I)
FAVICON = re.compile(r'<link\b(?=[^>]*\brel=["\'](?:shortcut )?icon["\'])[^>]*>\s*', re.I)


def approved_pages() -> dict[str, str]:
    spec = importlib.util.spec_from_file_location("clean_routes", Path(__file__).with_name("build-clean-urls.py"))
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot import approved Pages routes")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.PAGES


def inject(raw: str, *, slug: str, homepage: bool) -> str:
    match = TITLE.search(raw)
    if not match:
        raise ValueError("No document title")
    title = html.unescape(re.sub(r"<[^>]*>", "", match.group(1))).strip()
    description = DESCRIPTION.search(raw)
    # Some public legacy documents omit a description. Fill that gap instead
    # of aborting the entire site deployment; do not manufacture research claims.
    desc = (html.unescape(description.group("value")).strip() if description else
            f"Explore {title} and Pythology Intelligence's evidence-led research and applications.")
    if not title or not desc:
        raise ValueError("Title and description must not be empty")
    if description is None:
        raw = HEAD.sub('  <meta name="description" content="' + html.escape(desc, quote=True) + '">\n</head>',
                       raw, count=1)
    url = DOMAIN + ("/" + slug + "/" if slug else "/")
    h = lambda value: html.escape(value, quote=True)

    # Avoid stacking contradictory metadata from mirrored older releases.
    raw = PREVIEW.sub("", raw)
    raw = CANONICAL.sub("", raw)
    raw = FAVICON.sub("", raw)
    tags = [
        f'<link rel="canonical" href="{h(url)}">',
        '<link rel="icon" type="image/svg+xml" href="favicon.svg">',
        '<link rel="alternate icon" type="image/x-icon" href="favicon.ico">',
        f'<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{SITE_NAME}">',
        f'<meta property="og:title" content="{h(title)}">',
        f'<meta property="og:description" content="{h(desc)}">',
        f'<meta property="og:url" content="{h(url)}">',
        f'<meta property="og:image" content="{h(SOCIAL_IMAGE)}">',
        '<meta property="og:image:width" content="1672">',
        '<meta property="og:image:height" content="941">',
        '<meta property="og:image:alt" content="Pythology Environmental AI Systems — Monitor, Model, Predict, Protect">',
    ]
    if homepage:
        structured = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": SITE_NAME,
            "url": DOMAIN + "/",
            "logo": DOMAIN + "/logo.jpg",
            "description": desc,
            "areaServed": "New Zealand",
        }
        tags.append('<script type="application/ld+json">' +
                    json.dumps(structured, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") +
                    "</script>")
    if not HEAD.search(raw):
        raise ValueError("Missing document head")
    raw = HEAD.sub("\n" + "\n".join("  " + tag for tag in tags) + "\n</head>", raw, count=1)
    # Keep the old logo URL valid, but use a clean, consistent name in new pages.
    raw = raw.replace("Logo (2).jpeg", "logo.jpg")
    return raw


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="15" fill="#071318"/>
<path d="M16 49V15h19c12 0 18 6 18 16s-6 15-18 15H25" fill="none" stroke="#a6eee8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="49" cy="49" r="4" fill="#76aede"/>
</svg>
"""


def favicon_png(size: int = 32) -> bytes:
    # Minimal PNG-in-ICO variant of the site's P symbol, pure stdlib, no dependency.
    def pixel(x: int, y: int) -> tuple[int, int, int, int]:
        if x < 2 or y < 2 or x > size - 3 or y > size - 3:
            return 7, 19, 24, 255
        # Approximate the vector icon at a tiny favicon size.
        bar = 7 <= x <= 10 and 8 <= y <= 25
        bowl = (8 <= y <= 11 and 9 <= x <= 18) or (10 <= y <= 19 and 18 <= x <= 21)
        lower = 17 <= y <= 20 and 9 <= x <= 19
        dot = (x - 24) ** 2 + (y - 24) ** 2 <= 4
        return (118, 174, 222, 255) if dot else (166, 238, 232, 255) if bar or bowl or lower else (7, 19, 24, 255)
    image = b"".join(b"\0" + bytes(channel for x in range(size) for channel in pixel(x, y))
                     for y in range(size))
    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(image, 9)) +
            chunk(b"IEND", b""))


def build(out: Path) -> None:
    pages = approved_pages()
    out.mkdir(parents=True, exist_ok=True)
    indexable = {}
    for name, slug in pages.items():
        page = out / name
        if not page.is_file():
            raise SystemExit("Missing expected public document: " + name)
        source = page.read_text(encoding="utf-8")
        # Redirects and explicitly private/noindex pages must not enter a
        # public sitemap or acquire new canonicals pointing back to themselves.
        robots = re.search(r'<meta\b[^>]*\bname=["\']robots["\'][^>]*>', source, re.I)
        if robots and "noindex" in robots.group().lower():
            continue
        indexable[name] = slug
        page.write_text(inject(source, slug=slug, homepage=name == "index.html"),
                        encoding="utf-8")
    logo = out / "Logo (2).jpeg"
    if not logo.is_file():
        raise SystemExit("Required Pythology logo not staged")
    shutil.copyfile(logo, out / "logo.jpg")
    (out / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    png = favicon_png()
    # ICO contains a PNG image; supported by current browsers and Windows.
    ico = struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(png), 22) + png
    (out / "favicon.ico").write_bytes(ico)
    (out / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nDisallow: /prometheus-private.html\nDisallow: /monitor/\nSitemap: " +
        DOMAIN + "/sitemap.xml\n", encoding="utf-8")
    canonical = [DOMAIN + ("/" + slug + "/" if slug else "/") for slug in indexable.values()]
    if len(canonical) != len(set(canonical)):
        raise ValueError("Duplicate canonical route")
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
               "".join("  <url><loc>" + xml_escape(url) + "</loc></url>\n" for url in canonical) +
               "</urlset>\n")
    (out / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"Built discovery metadata for {len(indexable)} indexable public pages ({len(pages)-len(indexable)} redirects/noindex excluded), LinkedIn previews, favicons, robots and sitemap.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/build-site-discovery.py _site")
    build(Path(sys.argv[1]))
