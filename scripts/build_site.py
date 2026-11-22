"""Build an allowlisted site and a self-contained Cloud Run source bundle."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
FILES = ["index.html", "renderer.mjs", "model.mjs", "heart-tree.mjs", "heart-inspect.mjs",
         "heart-tree-preview.html", "visual-quality.mjs", "colab-export.mjs", "Reflector.js",
         "three.module.min.js", "three.core.min.js", "reference.jpg", "SOURCES.md", "THREE-LICENSE",
         "data/district-osm.json"]


def build():
    out = ROOT / ".site"
    bundle = ROOT / "dist" / "cloudrun"
    # Only remove the two fixed, disposable build outputs under this checkout.
    for directory in (out, bundle):
        if not directory.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError("Build output escaped checkout")
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True)
    for name in FILES:
        source = ROOT / name
        if not source.is_file():
            raise FileNotFoundError(name)
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for source in (ROOT / "assets").rglob("*"):
        if source.is_file() and source.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".json"}:
            target = out / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    manifest = json.loads((out / "assets/pbr/manifest.json").read_text(encoding="utf-8"))
    for material in manifest["materials"].values():
        for filename in material.values():
            if Path(filename).name != filename or not (out / "assets/pbr" / filename).is_file():
                raise ValueError(f"Missing or invalid texture: {filename}")
    for name in ["front", "side"]:
        if not (out / f"assets/renders/{name}.png").is_file():
            raise ValueError(f"Missing render: {name}")
    records = {p.relative_to(out).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
               for p in sorted(out.rglob("*")) if p.is_file()}
    (out / "site-manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    shutil.copytree(out, bundle / "public")
    shutil.copy2(ROOT / "deploy/server.py", bundle / "server.py")
    shutil.copy2(ROOT / "deploy/Dockerfile", bundle / "Dockerfile")
    print(json.dumps({"publicFiles": len(records), "bytes": sum(p.stat().st_size for p in out.rglob("*") if p.is_file()),
                      "sourceBundle": "dist/cloudrun", "excluded": [".git", "colab", "credentials", "source-only scripts"]}))


if __name__ == "__main__":
    build()
