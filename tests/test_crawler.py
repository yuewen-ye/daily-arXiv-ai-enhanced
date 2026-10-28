from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from scrapy.http import HtmlResponse

from daily_arxiv.daily_arxiv.pipelines import DailyArxivPipeline
from daily_arxiv.daily_arxiv.spiders.arxiv import ArxivSpider


def result(identifier):
    return SimpleNamespace(
        get_short_id=lambda: identifier + "v1", title="Title " + identifier,
        authors=[SimpleNamespace(name="Example Author")], categories=["cs.CV"],
        comment=None, summary="Abstract " + identifier,
    )


class BatchedMetadataTests(unittest.TestCase):
    def test_150_papers_use_two_batches_and_keep_each_original_record(self):
        identifiers = [f"2610.{i:05d}" for i in range(150)]
        spider = SimpleNamespace(metadata_ids=identifiers)
        pipeline = DailyArxivPipeline()
        pipeline.client = Mock()
        pipeline.client.results.side_effect = lambda search: iter(result(identifier) for identifier in search.id_list)
        records = [pipeline.process_item({"id": identifier}, spider) for identifier in identifiers]
        self.assertEqual(pipeline.client.results.call_count, 2)
        self.assertEqual([len(call.args[0].id_list) for call in pipeline.client.results.call_args_list], [100, 50])
        self.assertEqual([p["id"] for p in records], identifiers)
        self.assertEqual(records[-1]["summary"], "Abstract " + identifiers[-1])
        self.assertEqual(records[0]["authors"], ["Example Author"])

    def test_cross_list_duplicates_reuse_metadata(self):
        pipeline = DailyArxivPipeline()
        pipeline.client = Mock()
        pipeline.client.results.return_value = iter([result("2610.00001")])
        spider = SimpleNamespace(metadata_ids=["2610.00001"])
        pipeline.process_item({"id": "2610.00001"}, spider)
        pipeline.process_item({"id": "2610.00001"}, spider)
        self.assertEqual(pipeline.client.results.call_count, 1)

    def test_missing_metadata_is_explicit_and_not_retried_for_each_item(self):
        pipeline = DailyArxivPipeline()
        pipeline.client = Mock()
        pipeline.client.results.return_value = iter([])
        spider = SimpleNamespace(metadata_ids=["2610.00001"])
        for _ in range(2):
            with self.assertRaisesRegex(RuntimeError, "not returned"):
                pipeline.process_item({"id": "2610.00001"}, spider)
        self.assertEqual(pipeline.client.results.call_count, 1)

    def test_spider_registers_all_eligible_ids_before_first_item(self):
        html = '<div id="dlpage"><dl>' + ''.join(
            f'<dt><a name="item{i}"></a><a title="Abstract" href="/abs/2610.{i:05d}">arXiv</a></dt>'
            '<dd><div class="list-subjects"><span class="primary-subject">Vision (cs.CV)</span></div></dd>'
            for i in (1, 2)
        ) + '</dl></div>'
        with patch.dict('os.environ', {"CATEGORIES": "cs.CV"}):
            spider = ArxivSpider()
        response = HtmlResponse(url='https://arxiv.org/list/cs.CV/new', body=html.encode(), encoding='utf-8')
        items = spider.parse(response)
        first = next(items)
        self.assertEqual(first["id"], "2610.00001")
        self.assertEqual(spider.metadata_ids, ["2610.00001", "2610.00002"])
        self.assertEqual(next(items)["id"], "2610.00002")


if __name__ == '__main__':
    unittest.main()
