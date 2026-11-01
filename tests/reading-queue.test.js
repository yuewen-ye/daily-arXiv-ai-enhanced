const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, baseId } = require('../js/reading-queue.js');
function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
}
const papers=Array.from({length:55},(_,i)=>({id:`2610.${String(i+1).padStart(5,'0')}`,title:`Paper ${i+1}`,category:['cs.AI'],date:'2026-10-30',zotero:{rank:i+1,score:55-i}}));
test('marking read before taking the first 50 admits rank 51 and undo restores rank 1',()=>{
  const s=storage(), q=create(()=>s);
  assert.equal(q.select(papers).length,50);
  assert.equal(q.update(papers[0],true),true);
  assert.equal(q.select(papers)[0].id,papers[1].id);
  assert.equal(q.select(papers).at(-1).id,papers[50].id);
  assert.equal(q.update(papers[0],false),true);
  assert.equal(q.select(papers)[0].id,papers[0].id);
});
test('read identity survives reload, archive changes, and arXiv version suffixes',()=>{
  const s=storage();
  create(()=>s).update({...papers[0],id:papers[0].id+'v1'},true);
  const q=create(()=>s);
  assert.equal(q.has({...papers[0],id:papers[0].id+'v2',date:'2026-10-31'}),true);
  assert.equal(q.select([{...papers[0],date:'2026-10-31'},papers[1]]).length,1);
  assert.equal(q.list()[0].title,'Paper 1');
  assert.equal(baseId('hep-th/9901001v3'),'hep-th/9901001');
});
test('all view preserves all papers; duplicate versions use only one unread slot',()=>{
  const q=create(()=>storage());
  const duplicate=[papers[0],{...papers[0],id:papers[0].id+'v2'},papers[1]];
  assert.equal(q.select(duplicate).length,2);
  assert.equal(q.select(duplicate,'all').length,3);
});
test('storage write failure keeps the paper unread and reports the failed persistence',()=>{
  const s=storage();
  s.setItem=()=>{throw new Error('quota')};
  const q=create(()=>s);
  assert.equal(q.update(papers[0],true),false);
  assert.equal(q.has(papers[0]),false);
  assert.match(q.error,/未保存/);
});
test('malformed saved state is preserved and cannot be silently overwritten',()=>{
  let writes=0;
  const q=create(()=>({getItem:()=>'{broken',setItem:()=>writes++}));
  assert.match(q.error,/无法读取/);
  assert.equal(q.update(papers[0],true),false);
  assert.equal(writes,0);
});
test('demo and personal state remain separate, and exported records include saved identities',()=>{
  const s=storage(),demo=create(()=>s,'demo'),personal=create(()=>s,'personal');
  demo.update(papers[0],true);
  personal.reload();
  assert.equal(personal.has(papers[0]),false);
  assert.equal(JSON.parse(demo.export()).entries[0].id,papers[0].id);
});
