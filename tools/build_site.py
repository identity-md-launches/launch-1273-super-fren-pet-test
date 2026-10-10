#!/usr/bin/env python3
"""Validate and copy the no-build static site to the publishable dist/ export."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "site"
DEST = ROOT / "dist"
LOCK = SOURCE / "dependencies.lock"
ALLOWED = {".html", ".css", ".js", ".jpg", ".png", ".webp", ".svg", ".woff2", ".txt", ".sol"}


def main():
    dependencies = json.loads(LOCK.read_text())
    for item in dependencies["files"]:
        path = SOURCE / item["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item["sha256"]:
            raise SystemExit(f"Dependency integrity failed: {path}")
    if (SOURCE / "docs/SFPTToken.sol").read_bytes() != (ROOT / "src/SFPTToken.sol").read_bytes():
        raise SystemExit("The downloadable contract no longer matches src/SFPTToken.sol")
    pages = list(SOURCE.rglob("*.html"))
    for page in pages:
        text = page.read_text()
        for required in ("<title>", 'name="description"', 'property="og:title"', 'property="og:image"', 'rel="icon"', 'lang="en"'):
            if required not in text:
                raise SystemExit(f"Missing {required} in {page}")
    if DEST.exists():
        shutil.rmtree(DEST)
    for path in sorted(SOURCE.rglob("*")):
        if path.is_file() and path.suffix in ALLOWED and not path.name.endswith(".d.ts"):
            target = DEST / path.relative_to(SOURCE)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    files = [path for path in DEST.rglob("*") if path.is_file()]
    total = sum(path.stat().st_size for path in files)
    print(f"PASS: {len(pages)} pages, {len(files)} export files, {total:,} bytes; pinned assets verified.")
    print("dist/ is a byte-for-byte static export. No compiler or package install is required to serve site/.")


if __name__ == "__main__":
    main()
