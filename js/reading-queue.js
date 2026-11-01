/* Local reading state; independent of ranking, archive dates and paid summaries. */
(function (root) {
  'use strict';
  const baseId = value => String(value || '').replace(/v\d+$/, '');
  function create(getStorage, scope = 'personal') {
    const key = `dailyArxiv.read.v1.${scope}`;
    let entries = new Map(), error = '';
    function reload() {
      try {
        const raw = getStorage().getItem(key);
        const data = raw ? JSON.parse(raw) : { version: 1, entries: [] };
        if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.some(p => !p || typeof p.id !== 'string' || !p.id || typeof p.title !== 'string' || !Array.isArray(p.category))) throw new Error('Invalid reading state');
        entries = new Map(data.entries.map(p => [baseId(p.id), p]));
        error = '';
        return true;
      } catch (_) {
        error = '已读记录无法读取，请检查浏览器存储权限。为保护原记录，暂不写入。';
        return false;
      }
    }
    function update(paper, read) {
      if (!reload()) return false;
      const next = new Map(entries);
      if (read) next.set(baseId(paper.id), { ...paper, readAt: new Date().toISOString() });
      else next.delete(baseId(paper.id));
      try {
        getStorage().setItem(key, JSON.stringify({ version: 1, entries: [...next.values()] }));
        entries = next;
        error = '';
        return true;
      } catch (_) {
        error = '已读记录未保存，可能是存储空间不足或权限受限；论文仍保留原状态。';
        return false;
      }
    }
    reload();
    return {
      key, reload, update,
      get error() { return error; },
      has: paper => entries.has(baseId(paper.id)),
      list: () => [...entries.values()].sort((a, b) => String(b.readAt).localeCompare(String(a.readAt))),
      export: () => JSON.stringify({ version: 1, entries: [...entries.values()] }, null, 2),
      select: (papers, mode = 'unread', limit = 50) => {
        if (mode === 'all') return papers;
        const seen = new Set();
        return papers.filter(paper => {
          const id = baseId(paper.id);
          if (entries.has(id) || seen.has(id)) return false;
          seen.add(id);
          return true;
        }).slice(0, limit);
      }
    };
  }
  const api = { create, baseId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReadingQueue = api;
})(typeof window !== 'undefined' ? window : globalThis);
