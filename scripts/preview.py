"""Build an explicitly labeled synthetic preview without accounts or API calls."""
import json
from pathlib import Path
import tempfile

from build_site import ROOT, build


def main():
    records = json.loads((ROOT / "tests/fixtures/demo.json").read_text())
    with tempfile.TemporaryDirectory() as directory:
        data = Path(directory)
        for day in ("2026-10-27", "2026-10-28"):
            (data / f"{day}_AI_enhanced_Chinese.jsonl").write_text(
                "".join(json.dumps(p, ensure_ascii=False) + "\n" for p in records if p["demo_date"] == day), encoding="utf-8"
            )
        build(ROOT / ".preview", data_dir=data, demo=True)
    print("Preview: python3 -m http.server 8765 --bind 127.0.0.1 --directory .preview")


if __name__ == "__main__":
    main()
