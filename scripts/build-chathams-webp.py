#!/usr/bin/env python3
"""Generate faithful WebP copies of Chathams screenshots (originals preserved).

Pillow's pinned binary WebP codec runs on clean GitHub Actions hosts.
Prefer lossless encoding for text and graphs; otherwise quality 92.
"""
from __future__ import annotations
from pathlib import Path
import sys

try:
    from PIL import Image, features
except ImportError as exc:
    raise SystemExit("Pinned Pillow missing; install it in the Pages build step.") from exc

SCREENSHOTS = (
    "ecowatch-dashboard", "ecowatch-charts1", "ecowatch-charts2",
    "ecowatch-charts3", "helios-dashboard", "helios-forecast",
)


def build(source_dir: Path, output_dir: Path) -> None:
    if not features.check("webp"):
        raise SystemExit("Pillow is missing WebP codec support.")
    output_dir.mkdir(parents=True, exist_ok=True)
    total_png = total_webp = 0
    for stem in SCREENSHOTS:
        source = source_dir / (stem + ".png")
        dest = output_dir / (stem + ".webp")
        if not source.is_file() or source.stat().st_size == 0:
            raise SystemExit(f"Missing original Chathams screenshot: {source}")
        original_size = source.stat().st_size
        with Image.open(source) as opened:
            opened.load()
            original_dimensions = opened.size
            image = opened.convert("RGBA" if "A" in opened.getbands() or "transparency" in opened.info else "RGB")
            image.save(dest, format="WEBP", lossless=True, method=6)
            if dest.stat().st_size >= original_size * 0.88:
                image.save(dest, format="WEBP", lossless=False, quality=92, method=6)
        with Image.open(dest) as rendered:
            rendered.load()
            if rendered.format != "WEBP" or rendered.size != original_dimensions:
                raise SystemExit(f"Invalid WebP format or resized screenshot: {dest}")
        webp_size = dest.stat().st_size
        if stem.endswith("dashboard") and webp_size >= original_size:
            raise SystemExit(f"Dashboard conversion did not reduce bytes: {stem}")
        total_png += original_size
        total_webp += webp_size
        print(f"{stem}: {original_size // 1024} KiB PNG -> {webp_size // 1024} KiB WebP")
    print(f"Chathams WebP total: {total_png // 1024} -> {total_webp // 1024} KiB "
          f"({(1-total_webp/total_png)*100:.1f}% transfer reduction).")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-chathams-webp.py <png_source_dir> <output_dir>")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
