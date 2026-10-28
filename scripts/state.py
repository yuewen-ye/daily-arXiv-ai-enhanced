"""Restore/persist the public archive and cost ledger on the data branch.

Uses a temporary Git index so the source checkout and branch stay untouched.
Network errors while restoring must stop the run: an empty cost ledger is unsafe.
"""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REF = "refs/remotes/origin/data"


def git(*args, **kwargs):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, **kwargs)


def restore():
    remote = subprocess.run(["git", "ls-remote", "--exit-code", "origin", "refs/heads/data"], cwd=ROOT, capture_output=True)
    if remote.returncode == 2:
        print("First run: no data branch yet.")
        return
    remote.check_returncode()
    git("fetch", "--no-tags", "--depth=1", "origin", f"data:{REF}")
    for name in ("data", "_state", "assets/file-list.txt"):
        exists = subprocess.run(["git", "cat-file", "-e", f"{REF}:{name}"], cwd=ROOT, capture_output=True)
        if exists.returncode == 0:
            archive = git("archive", REF, "--", name).stdout
            subprocess.run(["tar", "-x", "-C", str(ROOT)], input=archive, check=True)
    print("Restored daily archives and summary ledger.")


def save():
    files = []
    for directory, patterns in (("data", ("*.jsonl", "*_status.json")), ("_state", ("*.json",))):
        for pattern in patterns:
            files.extend(str(path.relative_to(ROOT)) for path in (ROOT / directory).glob(pattern) if path.is_file())
    if (ROOT / "assets/file-list.txt").exists():
        files.append("assets/file-list.txt")
    if not files:
        print("No new public state to save.")
        return
    env = dict(os.environ, GIT_AUTHOR_NAME="daily-arxiv[bot]", GIT_AUTHOR_EMAIL="daily-arxiv@users.noreply.github.com", GIT_COMMITTER_NAME="daily-arxiv[bot]", GIT_COMMITTER_EMAIL="daily-arxiv@users.noreply.github.com")
    parent = subprocess.run(["git", "rev-parse", "--verify", REF], cwd=ROOT, capture_output=True, text=True)
    with tempfile.TemporaryDirectory() as directory:
        env["GIT_INDEX_FILE"] = str(Path(directory) / "index")
        git("read-tree", "--empty", env=env)
        git("add", "-f", "--", *sorted(set(files)), env=env)
        tree = git("write-tree", env=env, text=True).stdout.strip()
        parents = ["-p", parent.stdout.strip()] if parent.returncode == 0 else []
        if parents and tree == git("rev-parse", f"{REF}^{{tree}}", text=True).stdout.strip():
            print("Public state unchanged.")
            return
        commit = git("commit-tree", tree, *parents, "-m", "Update public papers and summary usage", env=env, text=True).stdout.strip()
        # A normal fast-forward push; a concurrent update fails instead of erasing history.
        git("push", "origin", f"{commit}:refs/heads/data", env=env)
    print("Saved public archives and summary ledger.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("restore", "save"))
    args = parser.parse_args()
    restore() if args.action == "restore" else save()
