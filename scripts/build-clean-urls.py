#!/usr/bin/env python3
"""Clean, backward-compatible URLs for approved public Pages Lab documents.

Existing .html files stay usable. Canonical /slug/ aliases keep asset URLs rooted
through a base element while retaining same-page #fragment navigation.
"""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import html
import re
import sys

PAGES = {
    "index.html": "",
    "enviroarc.html": "enviroarc",
    "precursor-research.html": "subterranean",
    "weather-lab.html": "weather-lab",
    "prometheus.html": "prometheus",
    "chathams.html": "chathams",
    "core-technology.html": "core-technology",
    "current-research.html": "current-research",
    "where-it-fits.html": "where-it-fits",
    "about.html": "about",
    "research.html": "research",
    "mdra.html": "mdra",
    "earthnet-platform.html": "earthnet-platform",
    "earthnet-nz-intelligence.html": "earthnet-nz-intelligence",
    "computational-biology-lab.html": "computational-biology-lab",
    "causal-intelligence.html": "causal-intelligence",
    "physical-intelligence.html": "physical-intelligence",
    "future.html": "future",
    "cerberus.html": "cerberus",
    "sentinel-command.html": "sentinel-command",
}
ALIASES = {"precursor-research": "precursor-research.html",
           "extreme-weather": "weather-lab.html"}
ATTR = re.compile(r'(?P<head>\bhref\s*=\s*)(?P<quote>["\'])(?P<url>.*?)(?P=quote)', re.I | re.S)
DOMAIN = "https://pythology.co.nz"

def rewrite_url(raw, slug, clone):
    u = urlsplit(html.unescape(raw))
    if u.scheme or u.netloc or u.path.startswith("//"):
        return raw
    if not u.path and u.fragment:
        # Without this, <base href="../"> sends same-page links to the homepage.
        if clone:
            return (slug + "/" if slug else "./") + "#" + u.fragment
        return raw
    if u.path in PAGES:
        route = PAGES[u.path]
        return urlunsplit(("", "", route + "/" if route else "./", u.query, u.fragment))
    return raw

def rewrite(source, slug, clone):
    def sub(m):
        return m["head"] + m["quote"] + rewrite_url(m["url"], slug, clone) + m["quote"]
    out = ATTR.sub(sub, source)
    for name, route in PAGES.items():
        out = out.replace(DOMAIN + "/" + name, DOMAIN + "/" + (route + "/" if route else ""))
    if clone:
        if "</head>" not in out:
            raise ValueError("Missing closing <head> in clean page")
        extra = '  <base href="../">\n'
        if 'rel="canonical"' not in out:
            extra += '  <link rel="canonical" href="' + DOMAIN + "/" + slug + '/">\n'
        # HTML fetches assets as it parses; <base> must precede CSS/JS links.
        out = out.replace("<head>", "<head>\n" + extra, 1)
    return out

def build(out):
    old = {}
    for name in PAGES:
        file = out / name
        if not file.is_file():
            raise SystemExit("Missing original public page: " + name)
        old[name] = file.read_text(encoding="utf-8")
    for name, source in old.items():
        (out / name).write_text(rewrite(source, PAGES[name], False), encoding="utf-8")
    for name, route in PAGES.items():
        if not route:
            continue
        target = out / route / "index.html"
        if target.exists():
            raise SystemExit("Existing published folder clashes with clean route: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rewrite(old[name], route, True), encoding="utf-8")
    for route, name in ALIASES.items():
        target = out / route / "index.html"
        if target.exists():
            raise SystemExit("Existing published folder clashes with clean alias: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        alias = rewrite(old[name], route, True)
        # The synonym advertises the primary address to search engines.
        canonical = DOMAIN + "/" + PAGES[name] + "/"
        alias = alias.replace(DOMAIN + "/" + route + "/", canonical)
        target.write_text(alias, encoding="utf-8")
    weather = (out / "weather-lab" / "index.html").read_text(encoding="utf-8")
    enviro = (out / "enviroarc.html").read_text(encoding="utf-8")
    assert '<base href="../">' in weather
    assert 'href="weather-lab/#moore"' in weather
    assert 'href="enviroarc/#weather-lab"' in weather
    assert 'href="subterranean/"' in enviro
    assert 'href="weather-lab/"' in enviro
    assert (out / "precursor-research.html").is_file()
    print("Created", len(PAGES)-1, "clean public routes and", len(ALIASES),
          "alternate names; all legacy .html addresses remain functional.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/build-clean-urls.py _site")
    build(Path(sys.argv[1]))
