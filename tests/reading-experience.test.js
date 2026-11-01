const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  return {
    textContent: '', innerHTML: '', hidden: false, children: [], dataset: {},
    classList: { add() {}, remove() {} },
    remove() {}, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; },
    replaceChildren() { this.children = []; this.innerHTML = ''; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return this.children.filter(child => child.className?.includes('category-button')); },
    querySelector() { return this.children[0]; },
  };
}
function app(fetch) {
  const nodes = new Map(); let startup;
  const document = {
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') startup = fn; },
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    createElement: element,
  };
  const context = vm.createContext({ document, fetch, AbortController, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '' } }, localStorage: { getItem() { return null; } },
    DATA_CONFIG: { getDataUrl: path => path }, console: { error() {} },
  });
  context.ReadingQueue=require('../js/reading-queue.js');
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
  vm.runInContext(`initEventListeners=()=>{}; initRecommendationControls=()=>{};
    loadUserKeywords=()=>{}; loadUserAuthors=()=>{}; initDatePicker=()=>{};
    renderCategoryFilter=()=>{}; selectLanguageForDate=()=> 'Chinese';
    renderPapers=()=>{ globalThis.rendered=Object.values(paperData).flat(); };`, context);
  return { context, nodes, document, run: code => vm.runInContext(code, context), startup: () => startup() };
}
const response = (text, status = 200) => ({ok: status === 200, status, text: async () => text});
const paper = id => JSON.stringify({id,title:id,categories:['cs.AI'],summary:'abstract'});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('startup distinguishes a server failure from an actually empty archive and retry recovers', async () => {
  let failed = true;
  const a = app(async () => failed ? response('',503) : response(''));
  await a.run('loadArchive()');
  const notice = a.document.getElementById('loadNotice');
  assert.match(notice.children[0].textContent, /读取失败/);
  assert.equal(a.document.getElementById('currentDate').textContent, '归档读取失败');
  assert.doesNotMatch(a.document.getElementById('paperContainer').innerHTML, /完成 Zotero/);
  failed = false;
  await notice.children[1].click();
  assert.equal(notice.hidden,true);
  assert.match(a.document.getElementById('paperContainer').innerHTML,/暂无论文归档/);
});

test('startup network rejection offers recovery instead of setup advice', async () => {
  const a = app(async () => { throw new Error('offline'); });
  a.startup(); await flush();
  assert.equal(a.document.getElementById('currentDate').textContent,'归档读取失败');
  assert.match(a.document.getElementById('loadNotice').children[0].textContent,/检查网络/);
});

test('range reads overlap, remain bounded, retain successful days and deduplicate', async () => {
  let active = 0, peak = 0;
  const pending = [];
  const a = app(async url => {
    active++; peak=Math.max(peak,active);
    await new Promise(resolve=>pending.push(resolve)); active--;
    return url.includes('2026-10-26') ? response('error',503) : response(paper('shared'));
  });
  a.run(`availableDates=['2026-10-29','2026-10-28','2026-10-27','2026-10-26','2026-10-25'];`);
  const load = a.run(`loadPapersByDateRange('2026-10-25','2026-10-29')`);
  assert.equal(active,4);
  pending.splice(0).forEach(resolve=>resolve()); await flush();
  pending.splice(0).forEach(resolve=>resolve()); await load;
  assert.equal(peak,4);
  assert.equal(a.context.rendered.length,1);
  assert.equal(a.context.rendered[0].date,'2026-10-29');
  const notice=a.document.getElementById('loadNotice');
  assert.match(notice.children[0].textContent,/已显示读取成功/);
  assert.match(notice.children[0].textContent,/2026-10-26/);
});

test('late response for an old date cannot overwrite the newly selected date', async () => {
  let resolveOld;
  const a=app(url=>url.includes('2026-10-27') ? new Promise(resolve=>resolveOld=resolve) : Promise.resolve(response(paper('new'))));
  const old=a.run(`loadPapersByDate('2026-10-27')`);
  await a.run(`loadPapersByDate('2026-10-28')`);
  resolveOld(response(paper('old'))); await old;
  assert.equal(a.context.rendered[0].id,'new');
  assert.match(a.document.getElementById('currentDate').textContent,/28/);
});

test('single date HTTP failure gives retry and never parses the error response as a paper', async () => {
  const a=app(async()=>response(paper('fake'),404));
  await a.run(`loadPapersByDate('2026-10-28')`);
  assert.equal(a.context.rendered.length,0);
  assert.match(a.document.getElementById('loadNotice').children[0].textContent,/论文读取失败/);
});

test('preferences allow distinct prefixes, reject exact case-insensitive duplicates, and save literal values', () => {
  const a=app(async()=>response(''));
  a.context.localStorage.setItem=(key,value)=>a.context[key]=value;
  a.context.setTimeout=()=>0;
  vm.runInContext(fs.readFileSync('js/settings.js','utf8'),a.context);
  a.run(`showNotification=()=>{}; addKeywordTag('transformer'); addKeywordTag('transform'); addKeywordTag('TRANSFORM'); addKeywordTag('a×b'); addAuthorTag('Alice Smith'); addAuthorTag('Alice'); addAuthorTag('alice'); saveSettings();`);
  assert.deepEqual(JSON.parse(a.context.preferredKeywords),['transformer','transform','a×b']);
  assert.deepEqual(JSON.parse(a.context.preferredAuthors),['Alice Smith','Alice']);
});

test('partial retry fetches only failed dates and preserves previous successes', async () => {
  let fail=true; const calls=[];
  const a=app(async url=>{calls.push(url);return url.includes('10-27') && fail ? response('',503) : response(paper(url.includes('10-27')?'recovered':'retained'));});
  a.run(`availableDates=['2026-10-28','2026-10-27'];`);
  await a.run(`loadPapersByDateRange('2026-10-27','2026-10-28')`);
  fail=false;
  await a.document.getElementById('loadNotice').children[1].click();
  assert.equal(calls.length,3);
  assert.equal(calls.filter(url=>url.includes('10-28')).length,1);
  assert.deepEqual(Array.from(a.context.rendered,p=>p.id),['retained','recovered']);
  assert.equal(a.document.getElementById('loadNotice').hidden,true);
});

test('a timed out read can be retried rather than leaving the loading state forever', async () => {
  let timeout;
  const a=app((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  a.context.setTimeout=fn=>{timeout=fn;return 1;};
  a.context.clearTimeout=()=>{};
  const loading=a.run(`loadPapersByDate('2026-10-28')`);
  timeout(); await loading;
  assert.equal(a.run('papersLoading'),false);
  assert.match(a.document.getElementById('loadNotice').children[0].textContent,/读取失败/);
});

test('real renderer reports search hits, supports zero-match filtering and restores preference ordering', () => {
  const a=app(async()=>response(''));
  a.context.Recommendations=require('../js/recommendations.js');
  // Load the real renderer independently of the loader-isolation stub.
  const source=fs.readFileSync('js/app.js','utf8');
  const start=source.indexOf('function renderPapers()');
  const end=source.indexOf('\nfunction showPaperDetails',start);
  vm.runInContext(source.slice(start,end),a.context);
  a.run(`paperData={'cs.AI':[
    {id:'a',title:'Diffusion',authors:'Alice',summary:'images',category:['cs.AI'],date:'2026-10-28'},
    {id:'b',title:'Planning',authors:'Bob',summary:'plans',category:['cs.AI'],date:'2026-10-28'}
  ]}; activeKeywords=['Planning']; textSearchQuery='Diffusion'; renderPapers();`);
  assert.equal(a.run('currentFilteredPapers.length'),2);
  assert.match(a.document.getElementById('recommendationStatus').textContent,/匹配 1 \/ 2/);
  a.run(`onlySearchMatches=true; renderPapers();`);
  assert.equal(a.run('currentFilteredPapers.length'),1);
  assert.match(a.document.getElementById('recommendationStatus').textContent,/当前显示 1 篇/);
  a.run(`textSearchQuery='missing'; renderPapers();`);
  assert.equal(a.run('currentFilteredPapers.length'),0);
  assert.match(a.document.getElementById('paperContainer').innerHTML,/没有匹配/);
  a.run(`textSearchQuery=''; renderPapers();`);
  assert.equal(a.run('currentFilteredPapers[0].id'),'b');
  assert.equal(a.document.getElementById('searchResultsControls').hidden,true);
});

test('update time is explicitly Beijing time across midnight, independent of the archive batch', () => {
  const a=app(async()=>response(''));
  assert.equal(a.run(`formatBeijingUpdate('2026-10-31T20:42:56Z')`),'2026年11月1日 04:42');
  assert.equal(a.run(`formatBeijingUpdate('2026-11-01T04:42:56+08:00')`),'2026年11月1日 04:42');
  for (const value of [null,'invalid','2026-10-31T20:42:56']) {
    a.context.value=value;
    assert.equal(a.run('formatBeijingUpdate(value)'),null);
  }
  a.context.DATA_CONFIG.latestArchive='2026-10-31';
  a.context.DATA_CONFIG.archiveUpdatedAt='2026-10-31T20:42:56Z';
  a.run('renderArchiveFreshness()');
  const text=a.document.getElementById('archiveFreshness').textContent;
  assert.match(text,/最近更新：2026年11月1日 04:42（北京时间）/);
  assert.match(text,/最新归档批次：2026-10-31（UTC）/);
  a.run(`currentDate='2026-10-28'; renderArchiveFreshness()`);
  assert.equal(a.document.getElementById('archiveFreshness').textContent,text);
  a.context.DATA_CONFIG.archiveUpdatedAt=null;
  a.run('renderArchiveFreshness()');
  assert.match(a.document.getElementById('archiveFreshness').textContent,/未记录完成时间/);
  a.context.DATA_CONFIG.demo=true;
  a.run('renderArchiveFreshness()');
  assert.equal(a.document.getElementById('archiveFreshness').textContent,'演示数据 · 非真实更新记录');
});
