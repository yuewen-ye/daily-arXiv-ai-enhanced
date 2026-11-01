"""Data completion time must survive page rebuilds without being invented."""
import json
from pathlib import Path
import tempfile
import unittest

from scripts.build_site import archive_updated_at, build


class ArchiveFreshnessTests(unittest.TestCase):
    def test_build_uses_latest_archive_completion_time_and_preserves_it_on_rebuild(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'data'
            source.mkdir()
            for day in ('2026-10-30', '2026-10-31'):
                (source / f'{day}_AI_enhanced_Chinese.jsonl').write_text('{}\n')
            stamp = '2026-10-31T20:42:56+00:00'
            (source / '2026-10-31_status.json').write_text(json.dumps({'date': '2026-10-31', 'updated_at': stamp}))
            site = build(root / 'site', data_dir=source)
            first = (site / 'js/data-config.js').read_text()
            self.assertIn('latestArchive: "2026-10-31"', first)
            self.assertIn(f'archiveUpdatedAt: "{stamp}"', first)
            build(site, data_dir=source)
            self.assertEqual(first, (site / 'js/data-config.js').read_text())
            # A newer archive with missing metadata must not inherit an older timestamp.
            (source / '2026-11-01_AI_enhanced_Chinese.jsonl').write_text('{}\n')
            build(site, data_dir=source)
            self.assertIn('archiveUpdatedAt: null', (site / 'js/data-config.js').read_text())

    def test_missing_malformed_naive_and_wrong_batch_times_are_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            target = source / '2026-10-31_status.json'
            self.assertIsNone(archive_updated_at(source, '2026-10-31'))
            for content in ('broken', '{}', '[]', json.dumps({'date':'2026-10-30','updated_at':'2026-10-31T20:42:56Z'}), json.dumps({'date':'2026-10-31','updated_at':'2026-10-31T20:42:56'})):
                target.write_text(content)
                self.assertIsNone(archive_updated_at(source, '2026-10-31'))
            target.write_text(json.dumps({'date':'2026-10-31','updated_at':'2026-11-01T04:42:56+08:00'}))
            self.assertEqual(archive_updated_at(source, '2026-10-31'), '2026-10-31T20:42:56+00:00')
