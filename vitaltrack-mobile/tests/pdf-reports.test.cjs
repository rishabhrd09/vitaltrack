/* eslint-env node */
const assert=require('node:assert/strict');const {test}=require('node:test');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
function load(file,deps={},globals={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{module:m,exports:m.exports,Date,Map,setTimeout,clearTimeout,AbortController,...globals,require:n=>{if(n in deps)return deps[n];throw new Error('Unexpected import '+n);}});return m.exports;}
function harness({copyFails=false,sharing=true,cancelAtPrint=false,printWait,copyWait,availabilityWait,shareWait,timers}={}){const calls={html:[],shared:[],copies:[]};let valid=true;const escapeHtml=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');const fileSystem={documentDirectory:'file:///documents/',readAsStringAsync:async()=>'',copyAsync:async v=>{calls.copies.push(v);if(copyWait)await copyWait;if(copyFails)throw new Error('Copy failed');}};const deps={'expo-print':{printToFileAsync:async({html})=>{calls.html.push(html);if(printWait)await printWait;if(cancelAtPrint)valid=false;return{uri:'file:///cache/real.pdf'};}},'expo-sharing':{isAvailableAsync:async()=>{if(availabilityWait)await availabilityWait;return sharing;},shareAsync:async uri=>{calls.shared.push(uri);if(shareWait)await shareWait;}},'expo-file-system/legacy':fileSystem,'react-native':{Alert:{alert(){}}},'@/utils/sanitize':{escapeHtml,validateImageUri:()=>null},'@/utils/helpers':{formatDate:s=>s,now:()=>new Date().toISOString()},'@/types':load('types/index.ts'),'@/utils/logger':{logger:{warn(){}}}};return {calls,inventory:load('utils/inventoryPdfExport.ts',deps),order:load('utils/orderPdfExport.ts',deps,timers||{}),ready(){if(!valid)throw new Error('Session changed');}};}
const items=[{id:'a',name:'<Gloves>',quantity:2,minimumStock:5,unit:'pairs',categoryId:'missing',isActive:true},{id:'b',name:'Masks',quantity:0,minimumStock:5,unit:'boxes',categoryId:'known',isActive:true}];
test('inventory PDF keeps unknown-category rows, uses reviewed facts and escapes names',async()=>{const h=harness();await h.inventory.exportInventoryPdf({items,categories:[{id:'known',name:'Wound care'}],includePhotos:false,timestamp:100,stale:true});const html=h.calls.html[0];assert.match(html,/&lt;Gloves&gt;/);assert.match(html,/Masks/);assert.match(html,/Category name unavailable/);assert.match(html,/Last-known\/offline snapshot/);assert.match(html,/2 items in the reviewed view/);assert.doesNotMatch(html,/<Gloves>/);});
test('failed report rename shares the real original file, never a nonexistent destination',async()=>{const h=harness({copyFails:true});const result=await h.inventory.exportInventoryPdf({items,categories:[],includePhotos:false});assert.equal(result.uri,'file:///cache/real.pdf');assert.deepEqual(h.calls.shared,['file:///cache/real.pdf']);});
test('unavailable sharing is reported as generated only',async()=>{const h=harness({sharing:false});const result=await h.order.exportOrderPdf({id:'ORD-1',items},false);assert.equal(result.shared,false);assert.equal(h.calls.shared.length,0);});
test('order PDF escapes title/links and has no write service',async()=>{const h=harness();await h.order.exportOrderPdf({id:'ORD-<1>',items:[{...items[0],purchaseLink:'https://example.test/" onclick="bad'}]},false);const html=h.calls.html[0];assert.match(html,/ORD-&lt;1&gt;/);assert.doesNotMatch(html,/href="[^"\n]*" onclick=/);});
test('session changes after rendering prevent sharing old-account data',async()=>{const h=harness({cancelAtPrint:true});await assert.rejects(h.inventory.exportInventoryPdf({items,categories:[],includePhotos:false,assertReady:h.ready}),/Session changed/);assert.equal(h.calls.shared.length,0);});
test('inventory PDF critical count and markers match the app flag-or-name rule without changing stock status',async()=>{
  const h=harness();
  const rows=[
    {...items[0],name:'Gauze',quantity:8,minimumStock:5,isCritical:true},
    {...items[0],id:'c',name:'Ambu Bag',quantity:1,minimumStock:1,isCritical:false},
    {...items[1],isCritical:false},
  ];
  await h.inventory.exportInventoryPdf({items:rows,categories:[],includePhotos:false});
  const html=h.calls.html[0];
  assert.match(html,/Critical Equipment<\/span><span class="value">2<\/span>/);
  assert.equal((html.match(/class="critical-marker"/g)||[]).length,2);
  assert.match(html,/title="Marked critical equipment"/);
  assert.match(html,/title="Critical equipment by name rule"/);
  assert.match(html,/using the recorded flag or the app's equipment-name rules/);
  assert.match(html,/Gauze[\s\S]*?sb-ok">OK/);
  assert.match(html,/Ambu Bag[\s\S]*?sb-low">LOW/);
});

function clock() {
  let next = 0; const active = new Map();
  return {
    setTimeout(fn, milliseconds) { const id = ++next; active.set(id, { fn, milliseconds }); return id; },
    clearTimeout(id) { active.delete(id); },
    fire(milliseconds) { const entries = [...active.entries()].filter(([, timer]) => timer.milliseconds === milliseconds); assert.ok(entries.length, `No timer for ${milliseconds}`); for (const [id, timer] of entries) { active.delete(id); timer.fn(); } },
    count: () => active.size,
  };
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

test('a stalled native PDF render times out; a late result never opens sharing', async () => {
  let finish; const printWait = new Promise(resolve => { finish = resolve; }); const timers = clock();
  const h = harness({ printWait, timers }); const result = h.order.exportOrderPdf({ id: 'ORD-1', items }, false);
  await flush(); timers.fire(45_000); await assert.rejects(result, /Creating the PDF timed out/);
  finish(); await flush(); assert.equal(h.calls.copies.length, 0); assert.equal(h.calls.shared.length, 0); assert.equal(timers.count(), 0);
});

test('a stalled PDF rename uses the already generated file rather than blocking export', async () => {
  let finish; const copyWait = new Promise(resolve => { finish = resolve; }); const timers = clock();
  const h = harness({ copyWait, timers }); const result = h.order.exportOrderPdf({ id: 'ORD-1', items }, false);
  await flush(); timers.fire(8_000); assert.equal((await result).uri, 'file:///cache/real.pdf'); assert.deepEqual(h.calls.shared, ['file:///cache/real.pdf']);
  finish(); await flush(); assert.equal(timers.count(), 0);
});

test('a stalled sharing availability check gives recoverable PDF feedback without launching a share', async () => {
  const timers = clock(); const h = harness({ availabilityWait: new Promise(() => {}), timers }); const result = h.order.exportOrderPdf({ id: 'ORD-1', items }, false);
  await flush(); timers.fire(5_000); await assert.rejects(result, /Checking PDF sharing timed out/); assert.equal(h.calls.shared.length, 0); assert.equal(timers.count(), 0);
});

test('the interactive share sheet has no short deadline and cancellation ends only this export wait', async () => {
  let finish; const timers = clock(); const h = harness({ shareWait: new Promise(resolve => { finish = resolve; }), timers }); const controller = new AbortController(); const stages = [];
  const result = h.order.exportOrderPdf({ id: 'ORD-1', items }, false, h.ready, { signal: controller.signal, onStage: stage => stages.push(stage) });
  await flush(); assert.deepEqual(stages, ['preparing', 'rendering', 'sharing']); assert.equal(h.calls.shared.length, 1); assert.equal(timers.count(), 0);
  controller.abort(); await assert.rejects(result, /PDF export cancelled/); finish(); await flush(); assert.equal(h.calls.shared.length, 1);
});

test('an account change after native order rendering prevents any sharing', async () => {
  const h = harness({ cancelAtPrint: true }); await assert.rejects(h.order.exportOrderPdf({ id: 'ORD-1', items }, false, h.ready), /Session changed/); assert.equal(h.calls.shared.length, 0);
});
