"""Small GitHub Pages staging hook for public NZ EarthNet assets.

Python automatically imports sitecustomize from the script directory. The Pages
builder already executes scripts/build-agri-lab.py on every deploy, so this keeps
the NZ intelligence page and its public daily-state projection in _site without
changing the larger deployment workflow.
"""

from pathlib import Path
import shutil

ROOT = Path.cwd()
OUT = ROOT / "_site"

for source, destination in (
    (ROOT / "earthnet-nz-intelligence.html", OUT / "earthnet-nz-intelligence.html"),
    (ROOT / "data" / "earthnet_nz_daily.json", OUT / "data" / "earthnet_nz_daily.json"),
):
    if source.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        print(f"Staged NZ public asset: {destination}")
