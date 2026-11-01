"""Build Pages from an explicit public-file allowlist, never from the repo root."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]


def archive_updated_at(data_dir, latest_date):
    """Use the persisted data completion time, never file mtime or rebuild time."""
    if not latest_date:
        return None
    try:
        status = json.loads((data_dir / f"{latest_date}_status.json").read_text(encoding="utf-8"))
        if status.get("date") != latest_date:
            return None
        stamp = datetime.fromisoformat(status["updated_at"].replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            return None
        return stamp.astimezone(timezone.utc).isoformat()
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None


def build(destination, data_dir=None, demo=False, repository=""):
    destination = destination.resolve()
    if destination == ROOT or ROOT.is_relative_to(destination):
        raise ValueError("Build destination cannot contain the source repository.")
    destination.mkdir(parents=True, exist_ok=True)
    # Only clear a known previous build, never an arbitrary directory.
    marker = destination / ".daily-arxiv-build"
    if any(destination.iterdir()) and not marker.exists():
        raise ValueError("Destination is not an empty directory or a previous daily-arxiv build.")
    if marker.exists():
        shutil.rmtree(destination)
        destination.mkdir()
    marker.touch()
    for name in ("index.html", "settings.html", "statistic.html", "setup.html", "login.html"):
        shutil.copy2(ROOT / name, destination / name)
    for name in ("css", "js", "assets"):
        shutil.copytree(ROOT / name, destination / name)
    output_data = destination / "data"
    output_data.mkdir()
    source_data = data_dir or ROOT / "data"
    for pattern in ("*_AI_enhanced_Chinese.jsonl", "*_status.json"):
        for path in sorted(source_data.glob(pattern)):
            shutil.copy2(path, output_data / path.name)
    files = sorted(p.name for p in output_data.glob("*_AI_enhanced_Chinese.jsonl"))
    (destination / "assets/file-list.txt").write_text("".join(name + "\n" for name in files), encoding="utf-8")
    latest_date = files[-1][:10] if files else None
    updated_at = archive_updated_at(output_data, latest_date)
    # Both local preview and Pages subpath hosting use same-origin data URLs.
    config = "const DATA_CONFIG = {\n  demo: " + json.dumps(demo) + ",\n  repository: " + json.dumps(repository) + ",\n"
    config += "  latestArchive: " + json.dumps(latest_date) + ",\n  archiveUpdatedAt: " + json.dumps(updated_at) + ",\n"
    config += "  getDataBaseUrl() { return new URL('.', location.href).href.replace(/\\/$/, ''); },\n"
    config += "  getDataUrl(path) { return new URL(path, new URL('.', location.href)).href; }\n};\n"
    (destination / "js/data-config.js").write_text(config)
    (destination / ".nojekyll").touch()
    print(f"Built {destination}: {len(files)} daily archives; demo={demo}")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "_site")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--repository", default="")
    args = parser.parse_args()
    build(args.output, args.data_dir, args.demo, args.repository)
