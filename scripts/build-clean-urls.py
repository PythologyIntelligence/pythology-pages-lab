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
        # Static header links must work without JavaScript as well as after
        # site.js builds the interactive navigation. Use explicit site-root
        # paths, so /prometheus/ never resolves "enviroarc/" inside itself.
        # JS restores GitHub Pages project-prefix paths where applicable.
        def root_header(match):
            block = match.group(0)
            def rooted(href):
                value = html.unescape(href["url"])
                parts = urlsplit(value)
                if parts.scheme or parts.netloc or parts.path.startswith("/"):
                    return href.group(0)
                allowed = {route + "/" for route in PAGES.values() if route}
                allowed.update(route + "/" for route in ALIASES)
                allowed.add("./")
                if parts.path not in allowed:
                    return href.group(0)
                path = "/" if parts.path == "./" else "/" + parts.path
                root_url = urlunsplit(("", "", path, parts.query, parts.fragment))
                return href["head"] + href["quote"] + root_url + href["quote"]
            return ATTR.sub(rooted, block)
        out = re.sub(r"<header\b[^>]*>.*?</header>", root_header, out, count=1, flags=re.I | re.S)
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
        # This site mirrors its previous publication before staging new sources.
        # It is normal for the approved clean route to already have index.html.
        # Replace ONLY that route's index.html; preserve other mirrored assets.
        if target.exists() and (not target.is_file() or target.is_symlink()):
            raise SystemExit("Clean route target is not a normal file: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rewrite(old[name], route, True), encoding="utf-8")
    for route, name in ALIASES.items():
        target = out / route / "index.html"
        if target.exists() and (not target.is_file() or target.is_symlink()):
            raise SystemExit("Clean alias target is not a normal file: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        alias = rewrite(old[name], route, True)
        # The synonym advertises the primary address to search engines.
        canonical = DOMAIN + "/" + PAGES[name] + "/"
        alias = alias.replace(DOMAIN + "/" + route + "/", canonical)
        target.write_text(alias, encoding="utf-8")
    weather = (out / "weather-lab" / "index.html").read_text(encoding="utf-8")
    enviro = (out / "enviroarc.html").read_text(encoding="utf-8")
    assert '<base href="../">' in weather
    # Base must be encountered before any asset by the HTML parser; otherwise
    # browsers fetch /weather-lab/site.css and the page looks unstyled.
    assert weather.index('<base href="../">') < weather.index('href="site.css"')
    for route in list(PAGES.values())[1:] + list(ALIASES):
        page = (out / route / "index.html").read_text(encoding="utf-8")
        base_pos = page.find('<base href="../">')
        if base_pos < 0:
            raise SystemExit("Clean page missing asset base: " + route)
        # Not every legacy page spells its CSS links the same way, and some
        # use only inline styles. Check the actual external load tags instead.
        for tag in re.finditer(r'<(?:link|script)\b[^>]*>', page, re.I):
            if ('stylesheet' in tag.group().lower() or
                    re.search(r'\bsrc\s*=', tag.group(), re.I)):
                if tag.start() < base_pos:
                    raise SystemExit("CSS or JS starts before clean asset base: " + route)
    for route in ("subterranean", "weather-lab", "enviroarc"):
        page = (out / route / "index.html").read_text(encoding="utf-8")
        if page.find('href="site.css"') < page.find('<base href="../">'):
            raise SystemExit("Core stylesheet loads before clean asset base: " + route)
        if 'href="site.css"' not in page:
            raise SystemExit("Core stylesheet missing from clean page: " + route)
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
