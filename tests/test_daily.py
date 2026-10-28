import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from ai.daily import DeepSeek, FIELDS, cache_key, enhance, run
from ai.zotero_recommend import fetch_corpus, matches_path, recommend, weighted_scores
from scripts.build_site import build


def paper(identifier, summary="candidate", score=3, rank=1):
    return {"id": identifier, "title": "Test " + identifier, "summary": summary, "authors": ["Author"], "categories": ["cs.CV"], "zotero": {"score": score, "rank": rank}}


class Client:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def summarize(self, item):
        self.calls.append(item["id"])
        if self.fail:
            raise RuntimeError("simulated API error")
        return {field: "测试概括 " + field for field in FIELDS}


class Encoder:
    def __init__(self):
        self.texts = []

    def encode(self, texts, **kwargs):
        assert kwargs["task"] == "retrieval" and kwargs["prompt_name"] == "document"
        self.texts.append(texts)
        return [[1, 0] if text == "new" else [0, 1] for text in texts]

    def similarity(self, candidates, references):
        return Mock(tolist=lambda: [[sum(x * y for x, y in zip(a, b)) for b in references] for a in candidates])


class RecommendationTests(unittest.TestCase):
    def test_recent_entry_has_more_weight_using_original_formula(self):
        values = weighted_scores([[1, 0], [0, 1]], 2)
        self.assertGreater(values[0], values[1])
        self.assertAlmostEqual(values[0], 10 / (1 + 1 / (1 + math.log10(2))))

    def test_unsorted_corpus_is_sorted_before_document_document_encoding(self):
        encoder = Encoder()
        corpus = [{"abstract": "old", "dateAdded": "2020-01-01"}, {"abstract": "new", "dateAdded": "2026-01-01"}]
        scored = recommend([paper("old", "old"), paper("new", "new")], corpus, encoder=encoder)
        self.assertEqual(encoder.texts[0], ["new", "old"])
        self.assertEqual(scored[1]["zotero"]["rank"], 1)
        self.assertGreater(scored[1]["zotero"]["score"], scored[0]["zotero"]["score"])

    def test_empty_and_invalid_corpus_do_not_produce_fake_scores(self):
        with self.assertRaises(ValueError):
            weighted_scores([[1]], 0)
        with self.assertRaises(ValueError):
            weighted_scores([[float("nan")]], 1)
        with self.assertRaises(ValueError):
            weighted_scores([[1, 2]], 1)

    def test_collection_globs_respect_directory_boundaries(self):
        self.assertTrue(matches_path("2026/vision/characters", "2026/**"))
        self.assertTrue(matches_path("2026/vision", "2026/**/vision"))
        self.assertFalse(matches_path("2026/vision/characters", "2026/*"))

    def test_cloud_read_paginates_and_filters_eligible_nonempty_items(self):
        def response(items):
            return Mock(status_code=200, headers={"Last-Modified-Version": "8"}, json=lambda: items)
        session = Mock()
        session.get.side_effect = [response([{"data": {"itemType": "attachment"}}] * 100), response([
            {"data": {"itemType": "journalArticle", "abstractNote": "old", "dateAdded": "2020-01-01"}},
            {"data": {"itemType": "preprint", "abstractNote": "new", "dateAdded": "2026-01-01"}},
            {"data": {"itemType": "preprint", "abstractNote": "  "}},
        ])]
        corpus = fetch_corpus("123", "not-a-real-key", session=session)
        self.assertEqual([entry["abstract"] for entry in corpus], ["new", "old"])
        self.assertEqual(session.get.call_args_list[1].kwargs["params"]["start"], 100)
        self.assertNotIn("not-a-real-key", session.get.call_args.args[0])

    def test_cloud_error_and_empty_library_are_explicit(self):
        session = Mock()
        session.get.return_value = Mock(status_code=403)
        with self.assertRaisesRegex(RuntimeError, "403"):
            fetch_corpus("123", "private-key", session=session)
        session.get.return_value = Mock(status_code=200, headers={}, json=lambda: [])
        with self.assertRaisesRegex(ValueError, "No eligible"):
            fetch_corpus("123", "private-key", session=session)


@patch("ai.daily.is_sensitive", return_value=False)
class PipelineTests(unittest.TestCase):
    def test_top_n_and_same_day_rerun_do_not_charge_again(self, _filter):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            papers = [paper("low", rank=3), paper("high", rank=1), paper("middle", rank=2)]
            first = Client()
            stats = enhance(papers, first, state, "2026-10-28", limit=2)
            self.assertEqual(first.calls, ["high", "middle"])
            self.assertEqual(stats["generated"], 2)
            self.assertNotIn("AI", papers[0])
            second = Client()
            stats = enhance(papers, second, state, "2026-10-28", limit=2)
            self.assertEqual(second.calls, [])
            self.assertEqual(stats["cached"], 2)
            self.assertEqual(stats["attempts_today"], 2)

    def test_failures_preserve_raw_abstract_and_consume_persisted_allowance(self, _filter):
        with tempfile.TemporaryDirectory() as directory:
            state, records = Path(directory), [paper("one")]
            enhance(records, Client(fail=True), state, "2026-10-28", limit=1)
            self.assertEqual(records[0]["summary_status"], "failed")
            self.assertEqual(records[0]["summary"], "candidate")
            rerun = Client()
            enhance(records, rerun, state, "2026-10-28", limit=1)
            self.assertEqual(rerun.calls, [])
            self.assertEqual(records[0]["summary_status"], "daily_limit")
            enhance(records, rerun, state, "2026-10-29", limit=1)
            self.assertEqual(rerun.calls, ["one"])

    def test_changed_abstract_or_model_invalidates_cache(self, _filter):
        item = paper("one")
        self.assertNotEqual(cache_key(item, "model-one"), cache_key(item, "model-two"))
        self.assertNotEqual(cache_key(item, "model-one"), cache_key(dict(item, summary="revised"), "model-one"))

    def test_pipeline_deduplicates_keeps_all_candidates_and_writes_compatible_archive(self, _filter):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data/2026-10-28.jsonl"
            data.parent.mkdir()
            records = [paper("low", "old"), paper("high", "new"), paper("high", "new")]
            data.write_text("".join(json.dumps(p) + "\n" for p in records))
            client = Client()
            target = run(data, root / "_state", limit=1, corpus=[{"abstract": "new", "dateAdded": "2026-01-01"}], encoder=Encoder(), client=client)
            published = [json.loads(line) for line in target.read_text().splitlines()]
            self.assertEqual(len(published), 2)
            self.assertEqual(client.calls, ["high"])
            self.assertEqual(sum("AI" in p for p in published), 1)
            self.assertIn(target.name, (root / "assets/file-list.txt").read_text())
            self.assertNotIn("dateAdded", target.read_text())
            self.assertTrue((root / "data/2026-10-28_status.json").exists())

    def test_publish_allowlist_excludes_raw_data_and_state(self, _filter):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "data"
            source.mkdir()
            (source / "2026-10-28_AI_enhanced_Chinese.jsonl").write_text("{}\n")
            (source / "2026-10-28.jsonl").write_text("private test marker")
            site = build(root / "site", data_dir=source)
            self.assertTrue((site / "data/2026-10-28_AI_enhanced_Chinese.jsonl").exists())
            self.assertFalse((site / "data/2026-10-28.jsonl").exists())
            self.assertFalse((site / "_state").exists())
            self.assertFalse((site / ".env").exists())
            self.assertNotIn("dw-dengwei/data", (site / "js/data-config.js").read_text())


class DeepSeekRequestTests(unittest.TestCase):
    def test_request_uses_official_endpoint_disables_thinking_and_validates_json(self):
        session = Mock()
        session.post.return_value = Mock(status_code=200, json=lambda: {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({field: "text" for field in FIELDS})}}]})
        result = DeepSeek("fake-key", session=session).summarize(paper("one"))
        self.assertEqual(set(result), set(FIELDS))
        self.assertEqual(session.post.call_args.args[0], "https://api.deepseek.com/chat/completions")
        request = session.post.call_args.kwargs["json"]
        self.assertEqual(request["thinking"]["type"], "disabled")
        self.assertEqual(request["response_format"]["type"], "json_object")
        self.assertEqual(request["max_tokens"], 1600)

    def test_truncated_json_and_error_responses_are_not_cached_as_success(self):
        session = Mock()
        session.post.return_value = Mock(status_code=200, json=lambda: {"choices": [{"finish_reason": "length"}]})
        with self.assertRaisesRegex(ValueError, "incomplete"):
            DeepSeek("fake", session=session).summarize(paper("one"))
        session.post.return_value = Mock(status_code=401)
        with self.assertRaisesRegex(RuntimeError, "401"):
            DeepSeek("fake", session=session).summarize(paper("one"))


if __name__ == "__main__":
    unittest.main()
