import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts import state


class StateBranchTests(unittest.TestCase):
    def test_round_trip_keeps_source_branch_and_preserves_ledger_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout, remote = root / "checkout", root / "remote.git"
            checkout.mkdir()

            def run(*args, cwd=checkout):
                return subprocess.check_output(args, cwd=cwd, stderr=subprocess.DEVNULL, text=True).strip()

            run("git", "init", "--bare", "--initial-branch=main", str(remote), cwd=root)
            run("git", "init", "--initial-branch=main")
            run("git", "config", "user.name", "Test")
            run("git", "config", "user.email", "test@example.invalid")
            run("git", "remote", "add", "origin", str(remote))
            (checkout / "source.py").write_text("source remains private to source branch")
            run("git", "add", "source.py")
            run("git", "commit", "-m", "Source")
            run("git", "push", "origin", "main")
            (checkout / ".env").write_text("ZOTERO_KEY=must-not-publish")
            (checkout / "_state").mkdir()
            (checkout / "_state/usage.json").write_text(json.dumps({"2026-10-28": {"attempts": 1}}))
            (checkout / "data").mkdir()
            (checkout / "data/2026-10-28_AI_enhanced_Chinese.jsonl").write_text("{}\n")
            with patch.object(state, "ROOT", checkout):
                state.restore()  # An absent branch is an explicit first run.
                state.save()
                self.assertEqual(run("git", "branch", "--show-current"), "main")
                self.assertEqual(run("git", "show", "HEAD:source.py"), "source remains private to source branch")
                state.restore()
                published = run("git", "ls-tree", "-r", "--name-only", state.REF)
                self.assertNotIn(".env", published)
                self.assertNotIn("source.py", published)
                first = run("git", "rev-parse", state.REF)
                (checkout / "_state/usage.json").write_text(json.dumps({"2026-10-28": {"attempts": 2}}))
                state.save()
                state.restore()
                # The restored checkout is intentionally shallow; check ancestry
                # on the bare remote instead of traversing its shallow boundary.
                self.assertEqual(run("git", "--git-dir", str(remote), "rev-parse", "data^"), first)
                self.assertEqual(json.loads((checkout / "_state/usage.json").read_text())["2026-10-28"]["attempts"], 2)


if __name__ == "__main__":
    unittest.main()
