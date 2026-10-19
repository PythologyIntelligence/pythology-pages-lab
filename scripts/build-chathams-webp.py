#!/usr/bin/env python3
"""Create faithful WebP copies of Chathams evidence screenshots in Pages output.

Keep original PNG files for older cached pages and existing direct image links.
Lossless WebP is preferred for small text and dashboard charts; if the lossless
copy is not materially smaller, encode at visually high quality.
Requires the ffmpeg/libwebp that ships on ubuntu-latest runners.
"""
from __future__ import annotations
import shutil
import subprocess
import sys
from pathlib import Path

SCREENSHOTS = (
    "ecowatch-dashboard",
    "ecowatch-charts1",
    "ecowatch-charts2",
    "ecowatch-charts3",
    "helios-dashboard",
    "helios-forecast",
)


def dimensions(path: Path) -> tuple[int, int]:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    values = r.stdout.strip().split(",")
    if len(values) != 2:
        raise RuntimeError(f"Cannot determine image dimensions: {path}")
    return int(values[0]), int(values[1])


def encode(source: Path, destination: Path, *, lossless: bool) -> None:
    args = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-y", "-i", str(source), "-frames:v", "1",
        "-c:v", "libwebp", "-compression_level", "6",
    ]
    args += ["-lossless", "1"] if lossless else ["-lossless", "0", "-quality", "92"]
    subprocess.run(args + [str(destination)], check=True, timeout=120)


def build(source_dir: Path, output_dir: Path) -> None:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("WebP optimisation requires ffmpeg and ffprobe on the Pages runner.")
    output_dir.mkdir(parents=True, exist_ok=True)
    total_png = total_webp = 0
    for stem in SCREENSHOTS:
        source = source_dir / (stem + ".png")
        destination = output_dir / (stem + ".webp")
        if not source.is_file():
            raise SystemExit(f"Missing original Chathams screenshot: {source}")
        size = source.stat().st_size
        encode(source, destination, lossless=True)
        if destination.stat().st_size >= size * .88:
            # Very efficiently compressed PNGs sometimes need gentle lossy WebP.
            encode(source, destination, lossless=False)
        webp_size = destination.stat().st_size
        if webp_size <= 0 or destination.read_bytes()[:4] != b"RIFF" or destination.read_bytes()[8:12] != b"WEBP":
            raise SystemExit(f"Invalid WebP encoding: {destination}")
        if dimensions(source) != dimensions(destination):
            raise SystemExit(f"Image resolution changed for {stem}.")
        # The published WebP is expected to be smaller for the heavy dashboards.
        if stem.endswith("dashboard") and webp_size >= size:
            raise SystemExit(f"Dashboard WebP failed to reduce transfer size: {stem}.")
        total_png += size
        total_webp += webp_size
        print(f"{stem}: {size // 1024} KiB PNG -> {webp_size // 1024} KiB WebP")
    print(f"Chathams WebP: {total_png // 1024} -> {total_webp // 1024} KiB "
          f"({(1-total_webp/total_png)*100:.1f}% transfer reduction).")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-chathams-webp.py <png_source_dir> <output_dir>")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
