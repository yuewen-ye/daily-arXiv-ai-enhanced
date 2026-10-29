/* Shared browser / Node logic. Sorting does not make API requests. */
(function (root) {
  'use strict';
  const hasScore = paper => Number.isFinite(paper.zotero?.score);
  function select(papers, { mode = 'original', keywords = [], authors = [], query = '', category = 'all' } = {}) {
    const needle = query.trim().toLowerCase();
    const candidates = mode === 'zotero' || category === 'all'
      ? papers
      : papers.filter(paper => paper.category?.[0] === category);
    return candidates.map((paper, index) => {
      const text = `${paper.title || ''} ${paper.summary || ''} ${paper.details || ''}`.toLowerCase();
      const matchedKeywords = keywords.filter(word => text.includes(word.toLowerCase()));
      const matchedAuthors = authors.filter(name => (paper.authors || '').toLowerCase().includes(name.toLowerCase()));
      const haystack = [text, paper.authors, paper.category, paper.motivation, paper.method, paper.result, paper.conclusion].join(' ').toLowerCase();
      const matchReason = needle
        ? (haystack.includes(needle) ? [`文本: ${query.trim()}`] : [])
        : [...(matchedKeywords.length ? [`关键词: ${matchedKeywords.join(', ')}`] : []), ...(matchedAuthors.length ? [`作者: ${matchedAuthors.join(', ')}`] : [])];
      return { ...paper, isMatched: matchReason.length > 0, matchReason, _order: index };
    }).sort((a, b) => {
      // Search hits go first in both views, then the selected recommendation order.
      if (needle || mode === 'original') {
        const difference = Number(b.isMatched) - Number(a.isMatched);
        if (difference) return difference;
      }
      if (mode === 'zotero') {
        const difference = Number(hasScore(b)) - Number(hasScore(a));
        if (difference) return difference;
        if (hasScore(a) && hasScore(b) && a.zotero.score !== b.zotero.score) return b.zotero.score - a.zotero.score;
      }
      return a._order - b._order;
    }).map(({ _order, ...paper }) => paper);
  }
  const api = { select, hasScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recommendations = api;
})(typeof window !== 'undefined' ? window : globalThis);
