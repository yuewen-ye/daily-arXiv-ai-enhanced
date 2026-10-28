#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
uv sync --locked --extra zotero
if [ ! -f .env ]; then
  echo 'Create .env from .env.example and fill the three credentials first.' >&2
  exit 1
fi
# dotenv is parsed as data by uv, never sourced as executable shell code.
today=$(date -u +%Y-%m-%d)
mkdir -p data
(cd daily_arxiv && uv run --project .. --env-file ../.env --extra zotero scrapy crawl arxiv -O "../data/$today.jsonl")
uv run --env-file .env --extra zotero python -m ai.daily --data "data/$today.jsonl"
python3 scripts/build_site.py
echo 'Open the site: python3 -m http.server 8765 --bind 127.0.0.1 --directory _site'
