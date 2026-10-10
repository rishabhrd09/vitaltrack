/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), { fileName:file, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020} }).outputText;
  vm.runInNewContext(code, { module,exports:module.exports,Map,Set,Date, require(name) { if (name in deps) return deps[name]; throw new Error('Unexpected import: '+name); } });
  return module.exports;
}
function harness() {
  const types = load('types/index.ts');
  const core = load('features/assistant/core.ts', {'../../types':types});
  const contracts = load('features/assistant/contracts.ts');
  const queries = load('features/assistant/queries.ts', {'@/types':types,'./core':core,'./contracts':contracts});
  let state = {user:{id:'a'},isAuthenticated:true}, epoch=0, changed; let uuid=0;
  const session = {owner:'a',epoch:0};
  const sessionTools = { captureSession:()=>({owner:state.user.id,epoch}), assertSession(s) { if (!state.isAuthenticated || s.owner!==state.user.id || s.epoch!==epoch) throw new Error('Session changed'); } };
  const drafts = load('features/assistant/drafts.ts', { react:{},'@/types':types,'./queries':queries,'./contracts':contracts,
    '@/store/useAuthStore':{useAuthStore:{subscribe(fn){changed=fn;}}},'@/services/assistantSession':sessionTools,'@/utils/helpers':{generateId:()=>`submission-${++uuid}`} });
  return { core,contracts,queries,drafts,session, switchAccount(){const prev=state; state={...state,user:{id:'b'}}; epoch++;changed(state,prev);}, current:()=>sessionTools.captureSession() };
}
const item=(id,name,quantity=2,extra={})=>({id,name,quantity,minimumStock:5,unit:'pairs',isActive:true,isCritical:false,version:2,categoryId:'w',...extra});
const items=[item('g','Hand gloves'),item('m','Surgical masks',0,{unit:'boxes',brand:'MaskCo',supplierName:'Good Supplier'}),item('s','Saline',10,{unit:'bottles',categoryId:'f'}),item('d','Deleted',0,{isActive:false})];
const categories=[{id:'w',name:'Wound care'},{id:'f',name:'Fluids'}];
const plain=v=>JSON.parse(JSON.stringify(v));

test('complete summary includes every active row and unchanged stock counts',()=>{const h=harness(); const a=h.core.answerIntent(h.core.command('summary'),items,100);assert.equal(a.items.length,3);assert.equal(a.statistics[0].value,3);});
for (const [question,expected] of [
 ['Show everything that is low or out of stock',['g','m']],
 ['Show low-stock items in wound care',['g']],
 ['Show everything supplied by Good Supplier',['m']],
 ['Which items have no supplier recorded?',['g','s']],
 ['Show quantities for hand gloves and surgical masks',['g','m']],
 ['Show items below their minimum stock',['g','m']],
 ['Show all inventory items with quantities and status',['g','m','s']],
 ['What brand are the surgical masks, and who supplies them?',['m']],
]) test('bounded query: '+question,()=>{const h=harness();const spec=h.queries.parseExpanded(question);assert.equal(spec.intent,'inventory_query');assert.deepEqual(plain(h.queries.queryInventory(spec.query,items,categories).map(i=>i.id)),expected);});
test('follow-up retains supplier and stock filters and sorting; context is required',()=>{const h=harness();const q={...h.contracts.queryDefaults,supplier:'Good Supplier'};const follow=h.queries.parseExpanded('Sort alphabetically');assert.throws(()=>h.queries.queryInventory(follow.query,items,categories));assert.deepEqual(plain(h.queries.queryInventory(follow.query,items,categories,q).map(i=>i.id)),['m']);});
test('query ambiguity or unresolved second item never silently drops a requested row',()=>{const h=harness();const q={...h.contracts.queryDefaults,item_queries:['Hand gloves','Unknown']};assert.throws(()=>h.queries.queryInventory(q,items,categories),/Nothing was omitted/);const ambiguous=[...items,item('g2','Hand gloves')];assert.throws(()=>h.queries.queryInventory({...q,item_queries:['Hand gloves']},ambiguous,categories));assert.equal(h.queries.queryInventory({...q,item_queries:['Hand gloves']},ambiguous,categories,undefined,{'Hand gloves':'g2'})[0].id,'g2');});
test('spoken explicit units and quantities override deterministic suggestions without changing inventory',()=>{const h=harness();const before=plain(items);const spec=h.queries.parseExpanded('Prepare an order for twenty pairs of hand gloves and 5 boxes of surgical masks and include the other low-stock items');const rows=h.drafts.prepareDraft(spec,items,[]);assert.deepEqual(plain(rows.map(r=>[r.item.id,r.quantity,r.source])),[['g',20,'spoken'],['m',5,'spoken']]);assert.deepEqual(plain(items),before);assert.equal(h.drafts.getDraft(h.session),null);});
test('low-stock drafting uses configured threshold and never LLM quantities',()=>{const h=harness();const rows=h.drafts.prepareDraft(h.queries.parseExpanded('Prepare a draft for all low-stock items'),items,[]);assert.deepEqual(plain(rows.map(r=>[r.item.id,r.quantity,r.source])),[['g',3,'suggested']]);const spec=h.contracts.specification('draft_order',{draft_mode:'new',include_out:true});assert.throws(()=>h.drafts.prepareDraft(spec,[item('x','Unknown threshold',0,{minimumStock:0})],[]),/quantity explicitly/);});
test('unit mismatch, missing quantity and contradictory repeats require clarification',()=>{const h=harness();const c=h.contracts;const spec=lines=>c.specification('draft_order',{draft_mode:'new',lines});const line={operation:'set',item_query:'Hand gloves',quantity:5,unit:'boxes'};assert.throws(()=>h.drafts.prepareDraft(spec([line]),items,[]),/no conversion/);assert.throws(()=>h.drafts.prepareDraft(spec([{...line,unit:null,quantity:null}]),items,[]),/order quantity/);assert.throws(()=>h.drafts.prepareDraft(spec([{...line,unit:null},{...line,unit:null,quantity:6}]),items,[]),/Conflicting/);const duplicate=h.drafts.prepareDraft(spec([{...line,unit:null},{...line,unit:null}]),items,[]);assert.equal(duplicate[0].quantity,5);});
test('add more and set quantity are distinct; remove cannot be re-added by an inclusion rule',()=>{const h=harness();const old=[{item:items[0],quantity:20,source:'spoken'}];const add=h.drafts.prepareDraft(h.queries.parseExpanded('Add 5 more pairs of hand gloves to this draft'),items,old);assert.equal(add[0].quantity,25);const set=h.drafts.prepareDraft(h.queries.parseExpanded('Set the order quantity for hand gloves to 5 pairs'),items,old);assert.equal(set[0].quantity,5);const spec=h.contracts.specification('draft_order',{draft_mode:'edit',include_low:true,lines:[{operation:'remove',item_query:'Hand gloves',quantity:null,unit:null}]});assert.equal(h.drafts.prepareDraft(spec,items,old).length,0);});
test('unqualified edits, spoken confirmations and prohibited stock actions never become drafts',()=>{const h=harness();for(const q of ['Set gloves to 20','Confirm','Save my order','Export my order','Delete gloves','Apply order to stock','Send order to supplier']){const value=h.queries.parseExpanded(q)||h.core.parseLocal(q);assert.ok(!value||['clarify','unsupported_action'].includes(value.intent),q);}});
test('strict contract rejects code, IDs, server actions, unknown keys and oversized quantities',()=>{const h=harness();for(const patch of [{intent:'save_order'},{code:'danger'},{lines:[{operation:'set',item_query:'Gloves',quantity:1000000,unit:null}]},{draft_mode:'edit'}])assert.throws(()=>h.contracts.validateSpecification({...h.contracts.specification('clarify'),...patch}));});
test('manual draft preservation, navigation memory and account clearing',()=>{const h=harness();const manual=[{item:items[0],quantity:9,source:'manual'}];h.drafts.writeDraft(h.session,manual);assert.equal(h.drafts.getDraft(h.session).rows[0].quantity,9);assert.throws(()=>h.drafts.mergeDrafts(manual,[{...manual[0],quantity:3}]),/Different quantities/);h.switchAccount();assert.throws(()=>h.drafts.getDraft(h.session),/Session changed/);assert.equal(h.drafts.getDraft(h.current()),null);});
test('final inventory recheck preserves quantities but flags stock and rejects deleted/unit-changed items',()=>{const h=harness();const rows=[{item:items[0],quantity:20,source:'spoken'}];const r=h.drafts.recheckDraft(rows,[{...items[0],quantity:4,version:3}]);assert.equal(r.rows[0].quantity,20);assert.equal(r.changes.length,1);assert.throws(()=>h.drafts.recheckDraft(rows,[]),/no longer available/);assert.throws(()=>h.drafts.recheckDraft(rows,[{...items[0],unit:'pieces'}]),/unit changed/);});
test('unknown save outcomes retain one request/localId and lock editing; saved order re-export creates nothing',()=>{const h=harness();const rows=[{item:items[0],quantity:20,source:'spoken'}];h.drafts.writeDraft(h.session,rows);const first=h.drafts.beginSubmission(h.session,rows);const retry=h.drafts.beginSubmission(h.session,rows);assert.equal(first,retry);assert.equal(first.items[0].expectedVersion,2);assert.throws(()=>h.drafts.writeDraft(h.session,rows),/may already be saved/);h.drafts.markSaved(h.session,{id:'server',orderId:'ORD-1',items:[]});assert.equal(h.drafts.getDraft(h.session).attempt.saved.orderId,'ORD-1');assert.equal(h.drafts.beginSubmission(h.session,rows),first);h.drafts.clearSavedDraft(h.session);assert.equal(h.drafts.getDraft(h.session),null);});

test('unknown constraints are not silently stripped from a locally supported query',()=>{const h=harness();for(const q of ['Show low-stock items expiring tomorrow','Show all inventory items under 3 units','Show items with no brand recorded']){const spec=h.queries.parseExpanded(q);assert.ok(!spec||['clarify','unsupported_action'].includes(spec.intent),q);}});

test('compound filters go to online interpretation without losing a condition',()=>{
  const h=harness();
  for(const q of ['Show low-stock items in wound care supplied by Good Supplier, sorted by name','Show low-stock items from supplier Good Supplier with brand Recorded Brand']) assert.equal(h.queries.routeLocally(q,[]),null,q);
});

test('near-spelling draft names require explicit selection even with one candidate',()=>{
  const h=harness();
  const s=h.contracts.specification('draft_order',{draft_mode:'new',lines:[{operation:'set',item_query:'hand glovs',quantity:20,unit:'pairs'}]});
  assert.throws(()=>h.drafts.prepareDraft(s,items,[]),/Choose the item/);
  const choices=h.queries.resolveItem('hand glovs',items);
  assert.equal(choices.length,1);
  const selected=h.drafts.prepareDraft(s,items,[],{'hand glovs':choices[0].id});
  assert.equal(selected[0].quantity,20); assert.equal(selected[0].item.id,choices[0].id);
});

for (const question of [
  'Create a saved order draft for two units of Ambu bag and all the items which are low in stock or out of stock',
  'Create a saved order draft for the following items: first is two units of Ambu bag, and second is all the items which are low in stock or out of stock, create a saved order draft.',
  'Prepare an order for 2 units of Ambu bag and include everything that is low in stock and out of stock',
]) test('mixed spoken draft preserves explicit quantities and both stock groups: '+question,()=>{
  const h=harness();
  const source=[item('a','Ambu Bag',1,{unit:'unit'}),...items];
  const before=plain(source);
  const spec=h.queries.routeLocally(question,source.map(i=>i.name));
  assert.equal(spec?.intent,'draft_order'); assert.equal(spec.include_low,true); assert.equal(spec.include_out,true);
  const rows=h.drafts.prepareDraft(spec,source,[]);
  assert.deepEqual(plain(rows.map(r=>[r.item.id,r.quantity,r.source])),[['a',2,'spoken'],['g',3,'suggested'],['m',5,'suggested']]);
  assert.deepEqual(plain(source),before); assert.equal(h.drafts.getDraft(h.session),null);
});

test('mixed draft language cannot drop extra constraints, invent units or authorize saving',()=>{
  const h=harness();
  for (const q of [
    'Create a saved order draft for 2 units of Ambu bag and all low-stock items except masks',
    'Create a saved order draft for 2 units of Ambu bag and all low-stock items from supplier Good Supplier',
    'Create a saved order draft for 2 units of Ambu bag and only 3 of the low-stock items',
    'Create a saved order draft for 2 units of Ambu bag then save the order',
    'Create a saved order draft for 2 units of Ambu bag and confirm the order',
    'Create a saved order draft for 2 units of Ambu bag and save it',
    'Prepare a draft for 2 units of Ambu bag then persist it',
  ]) {
    const parsed=h.queries.routeLocally(q,[]);
    assert.ok(!parsed || ['clarify','unsupported_action'].includes(parsed.intent),q);
  }
  const s=h.queries.routeLocally('Create a saved order draft for two boxes of Ambu bag and all low-stock items',[]);
  assert.throws(()=>h.drafts.prepareDraft(s,[item('a','Ambu Bag',1,{unit:'unit'})],[]),/no conversion/);
});
