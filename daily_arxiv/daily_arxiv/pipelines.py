# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


# useful for handling different item types with a single interface
import arxiv
import re


class DailyArxivPipeline:
    def __init__(self):
        self.page_size = 100
        self.client = arxiv.Client(page_size=self.page_size, delay_seconds=3.0)
        self.metadata = {}
        self.missing_ids = set()

    @staticmethod
    def base_id(identifier):
        return re.sub(r"v\d+$", "", identifier)

    def fetch_batch(self, identifier, spider):
        # Keep the requested ID first so late arrivals cannot miss this batch.
        pending = [identifier] + [
            candidate for candidate in getattr(spider, "metadata_ids", [])
            if candidate != identifier and candidate not in self.metadata and candidate not in self.missing_ids
        ]
        batch = list(dict.fromkeys(pending))[:self.page_size]
        for paper in self.client.results(arxiv.Search(id_list=batch, max_results=len(batch))):
            short_id = paper.get_short_id()
            self.metadata[short_id] = paper
            self.metadata[self.base_id(short_id)] = paper
        self.missing_ids.update(candidate for candidate in batch if candidate not in self.metadata)

    def process_item(self, item: dict, spider):
        item["pdf"] = f"https://arxiv.org/pdf/{item['id']}"
        item["abs"] = f"https://arxiv.org/abs/{item['id']}"
        identifier = item["id"]
        if identifier not in self.metadata and identifier not in self.missing_ids:
            self.fetch_batch(identifier, spider)
        if identifier not in self.metadata:
            raise RuntimeError(f"arXiv metadata was not returned for {identifier}")
        paper = self.metadata[identifier]
        item["authors"] = [a.name for a in paper.authors]
        item["title"] = paper.title
        item["categories"] = paper.categories
        item["comment"] = paper.comment
        item["summary"] = paper.summary
        return item
