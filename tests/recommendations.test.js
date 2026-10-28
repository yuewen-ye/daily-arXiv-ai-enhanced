const { test } = require('node:test');
const assert = require('node:assert/strict');
const { select, hasScore } = require('../js/recommendations.js');
const records = [
  { id: 'keyword', title: 'Diffusion models', authors: 'Alice', summary: 'image generation', zotero: { score: 2 } },
  { id: 'semantic', title: 'Consistent characters', authors: 'Bob', summary: 'visual identity', zotero: { score: 8 } },
  { id: 'archive', title: 'Legacy entry', authors: 'Carol', summary: 'no score' },
];
test('original keyword and author preference retains every unmatched candidate', () => {
  assert.deepEqual(select(records, { keywords: ['DIFFUSION'] }).map(p => p.id), ['keyword', 'semantic', 'archive']);
  assert.equal(select(records, { authors: ['bob'] })[0].id, 'semantic');
  assert.equal(select(records, { authors: ['bob'] }).length, records.length);
});
test('Zotero ordering is independent from keyword and author preference', () => {
  const sorted = select(records, { mode: 'zotero', keywords: ['Diffusion'], authors: ['Alice'] });
  assert.deepEqual(sorted.map(p => p.id), ['semantic', 'keyword', 'archive']);
  assert.equal(sorted[1].isMatched, true);
  assert.equal(hasScore(sorted[2]), false);
});
test('search hits go first in either view and remaining papers are retained', () => {
  for (const mode of ['original', 'zotero']) {
    const sorted = select(records, { mode, keywords: ['Diffusion'], query: 'Carol' });
    assert.equal(sorted[0].id, 'archive');
    assert.equal(sorted.length, 3);
  }
});
test('raw abstract is searchable even when a translated summary is shown', () => {
  const sorted = select([{ title: '论文', authors: '', summary: '中文概括', details: 'Diffusion' }], { keywords: ['diffusion'] });
  assert.equal(sorted[0].isMatched, true);
});
test('absent and zero scores differ; sorting does not mutate the source', () => {
  assert.equal(hasScore({ zotero: { score: 0 } }), true);
  assert.equal(hasScore({ zotero: { score: null } }), false);
  select(records, { mode: 'zotero' });
  assert.equal(records[0].isMatched, undefined);
});
