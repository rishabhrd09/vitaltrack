/* eslint-env node */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, deps={}) {
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name in deps)return deps[name];throw new Error('Unexpected import '+name);},Map,Set,Date,AbortController,setTimeout,clearTimeout});
  return module.exports;
}
const item={id:'g',name:'Hand gloves',quantity:2,minimumStock:5,unit:'pairs',isActive:true,isCritical:false,version:2};
async function harness({loaded=true,offline=false,saveFails=0,pdfFails=0,oldBackend=false,saveWait,pdfWait,mode,inventoryRows,initialRows,submitted=false,saveErrors=[],saveFirstOnly=false,pdfFirstOnly=false,pdfUncancellable=false}={}) {
  const calls={posts:[],pdfs:[],back:0,snapshots:0,navigation:[]};let alert,inventory=inventoryRows||[item,{...item,id:'hidden',name:'Hidden',isActive:false}],fresh=inventoryRows||[item],isSuccess=loaded;
  const types=load('types/index.ts');const core=load('features/assistant/core.ts',{'../../types':types});const contracts=load('features/assistant/contracts.ts');const selection=load('features/assistant/selection.ts',{'@/types':types,'./core':core,'./contracts':contracts});const queries=load('features/assistant/queries.ts',{'@/types':types,'./core':core,'./contracts':contracts,'./selection':selection});
  const session={owner:'a',epoch:0};let valid=true,epoch=0;
  const sessions={captureSession:()=>{if(!valid)throw new Error('Signed out');return {...session,epoch};},assertSession:s=>{if(!valid || s.epoch!==epoch)throw new Error('Session changed');},ownsSnapshot:()=>true};
  const auth=fn=>fn({isAuthenticated:true,user:{id:'a'}});auth.subscribe=()=>()=>{};
  let generatedIds=0;const drafts=load('features/assistant/drafts.ts',{react:React,'@/store/useAuthStore':{useAuthStore:auth},'@/services/assistantSession':sessions,'@/types':types,'@/utils/helpers':{generateId:()=> ++generatedIds===1?'same-local-id':`same-local-id-${generatedIds}`},'./selection':selection,'./contracts':contracts});
  if(initialRows){drafts.writeDraft(session,initialRows,true,'voice');if(submitted)drafts.beginSubmission(session,initialRows);}
  const host=name=>({children,...props})=>React.createElement(name,props,children);
  const rn=Object.fromEntries(['View','Text','TouchableOpacity','TextInput','Image','ActivityIndicator'].map(name=>[name,host(name)]));
  rn.FlatList=({data,renderItem,ListEmptyComponent})=>React.createElement('FlatList',{},data.length?data.map((i,index)=>React.createElement(React.Fragment,{key:i.item?.id||i.id},renderItem({item:i,index}))):ListEmptyComponent);
  rn.Modal=({visible,children})=>visible?React.createElement('Modal',{},children):null;let lifecycle;rn.AppState={currentState:'active',addEventListener:(_,fn)=>{lifecycle=fn;return {remove(){}};}};rn.StyleSheet={create:v=>v};rn.Alert={alert:(title,message,buttons)=>{alert={title,message,buttons};}};
  class ApiClientError extends Error {constructor(status){super('Failed');this.status=status;}}
  const deps={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':rn,'react-native-safe-area-context':{SafeAreaView:host('SafeAreaView')},'@expo/vector-icons':{Ionicons:host('Icon')},'expo-router':{useLocalSearchParams:()=>({mode}),useRouter:()=>({replace:route=>calls.navigation.push(route)})},
    '@/theme/ThemeContext':{useTheme:()=>({colors:load('theme/colors.ts').colors})},'@/theme/spacing':load('theme/spacing.ts'),'@/types':types,
    '@/utils/orderPdfExport':{exportOrderPdf:async(order,_photos,assertReady,options)=>{const pdfIndex=calls.pdfs.length;calls.pdfs.push(order);calls.exportOptions=options;options?.onStage('rendering');if(pdfWait&&(!pdfFirstOnly||pdfIndex===0)){if(pdfUncancellable)await pdfWait;else{let cancel;try{await Promise.race([pdfWait,new Promise((_,reject)=>{cancel=()=>reject(new Error('Export cancelled'));options.signal.addEventListener('abort',cancel,{once:true});})]);}finally{options.signal.removeEventListener('abort',cancel);}}}if(!pdfUncancellable)assertReady();if(pdfFails-->0)throw new Error('Printer failed');return {shared:true};}},
    '@/store/useAuthStore':{useAuthStore:auth},'@/services/assistantSession':sessions,'@/features/assistant/snapshot':{inventorySnapshot:async()=>{calls.snapshots++;return {items:fresh,timestamp:100,stale:false};}},
    '@/features/assistant/drafts':drafts,'@/services/assistant':{capabilities:async()=>({order_review_guard:!oldBackend})},'@/services/api':{ApiClientError},
    '@/hooks/useServerData':{useItems:()=>({data:inventory,isSuccess,isFetching:false})},'@/hooks/useServerMutations':{useCreateOrder:options=>{calls.feedback=options;return {mutateAsync:async request=>{const attemptIndex=calls.posts.length;calls.posts.push(request);if(saveWait&&(!saveFirstOnly||attemptIndex===0))await saveWait;if(saveErrors[attemptIndex]!==undefined)throw new ApiClientError(saveErrors[attemptIndex]);if(saveFails-->0)throw new ApiClientError(0);return {id:'saved',orderId:'ORD-1',items:request.items};}};}},
    '@/hooks/useNetworkStatus':{useNetworkStatus:()=>({isOnline:!offline})},'@/utils/navigation':{safeBack:()=>{calls.back++;}},};
  const Screen=load('app/order/create.tsx',deps).default;let tree;
  await act(async()=>{tree=create(React.createElement(Screen));});
  const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  const press=async label=>{const node=tree.root.findAll(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===label)[0];assert.ok(node,label);assert.ok(!node.props.disabled);await act(async()=>{node.props.onPress();await flush();});};
  return {calls,drafts,session,tree,press,alert:()=>alert,
    newSavedSession:async()=>{let next;await act(async()=>{epoch++;next={...session,epoch};const rows=[{item,quantity:4,source:'manual'}];drafts.writeDraft(next,rows,true,'manual');drafts.beginSubmission(next,rows);drafts.markSaved(next,{id:'new-session-order',orderId:'ORD-NEW',items:[]});await flush();});return next;},
    remount:async()=>{await act(async()=>{tree.unmount();});await act(async()=>{tree=create(React.createElement(Screen));});},
    settle:async finish=>{await act(async()=>{finish();await flush();});},
    choose:async label=>{await act(async()=>{const button=alert.buttons.find(b=>b.text===label);assert.ok(button,label);button.onPress?.();await flush();});},
    confirm:async()=>{await act(async()=>{alert.buttons.find(b=>b.onPress).onPress();await flush();});},
    fresh:rows=>{fresh=rows;},setLoaded:async()=>{isSuccess=true;await act(async()=>{tree.update(React.createElement(Screen));});},
    edit:async text=>{await act(async()=>{tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel?.startsWith('Order quantity')).props.onChangeText(text);});},
    dispose:async()=>{await act(async()=>{tree.unmount();});}, invalidate:()=>{valid=false;}, expireSession:()=>{epoch++;}, background:()=>{rn.AppState.currentState='background';lifecycle('background');}, foreground:()=>{rn.AppState.currentState='active';lifecycle('active');},};
}
test('manual form waits for verified loaded inventory, excludes inactive items and retains edits after refresh',async()=>{const h=await harness({loaded:false});try{assert.equal(h.drafts.getDraft(h.session),null);await h.setLoaded();assert.equal(h.drafts.getDraft(h.session).rows.length,1);await h.edit('20');await h.setLoaded();assert.equal(h.drafts.getDraft(h.session).rows[0].quantity,20);}finally{await h.dispose();}});
test('only a touch confirmation saves, and saved response rows feed the shared PDF',async()=>{const h=await harness();try{assert.equal(h.calls.posts.length,0);await h.press('Confirm order & export PDF');assert.equal(h.calls.posts.length,0);await h.confirm();assert.equal(h.calls.posts.length,1);assert.equal(h.calls.posts[0].items[0].expectedVersion,2);assert.equal(h.calls.pdfs[0].id,'ORD-1');assert.equal(h.calls.back,1);}finally{await h.dispose();}});
test('changed stock requires another review and never rewrites the spoken/manual quantity',async()=>{const h=await harness();try{await h.edit('20');h.fresh([{...item,quantity:4,version:3}]);await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts.length,0);assert.match(h.alert().title,/review again/);assert.equal(h.drafts.getDraft(h.session).rows[0].quantity,20);await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts[0].items[0].quantity,20);assert.equal(h.calls.posts[0].items[0].expectedVersion,3);}finally{await h.dispose();}});
test('unknown save failure retains draft and request identity on another touch retry',async()=>{const h=await harness({saveFails:1});try{await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.back,0);assert.equal(h.calls.pdfs.length,0);await h.press('Retry same submission');await h.confirm();assert.equal(h.calls.posts.length,2);assert.equal(h.calls.posts[0],h.calls.posts[1]);assert.equal(h.calls.back,1);}finally{await h.dispose();}});
test('PDF failure retains saved order and re-export never posts another order',async()=>{const h=await harness({pdfFails:1});try{await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts.length,1);assert.match(h.alert().title,/Order saved/);assert.equal(h.calls.back,0);await h.press('Re-export saved order');await h.confirm();assert.equal(h.calls.posts.length,1);assert.equal(h.calls.pdfs.length,2);assert.equal(h.calls.pdfs[0].id,h.calls.pdfs[1].id);}finally{await h.dispose();}});
for(const [label,opts] of [['offline',{offline:true}],['old backend',{oldBackend:true}]])test(label+' cannot commit a reviewed draft',async()=>{const h=await harness(opts);try{await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts.length,0);assert.ok(h.drafts.getDraft(h.session));}finally{await h.dispose();}});
test('leaving before the touch confirmation prevents the late callback from saving',async()=>{const h=await harness();await h.press('Confirm order & export PDF');await h.dispose();await h.confirm();assert.equal(h.calls.posts.length,0);assert.equal(h.calls.pdfs.length,0);});

test('editing while a confirmation is open requires a new review',async()=>{const h=await harness();try{await h.press('Confirm order & export PDF');await h.edit('20');await h.confirm();assert.equal(h.calls.posts.length,0);await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts[0].items[0].quantity,20);}finally{await h.dispose();}});
test('an old confirmation cannot save after a new login epoch',async()=>{const h=await harness();try{await h.press('Confirm order & export PDF');h.expireSession();await h.confirm();assert.equal(h.calls.posts.length,0);assert.equal(h.calls.pdfs.length,0);}finally{await h.dispose();}});
test('a background confirmation cannot start a submission',async()=>{const h=await harness();try{await h.press('Confirm order & export PDF');h.background();await h.confirm();assert.equal(h.calls.posts.length,0);assert.equal(h.calls.snapshots,0);}finally{await h.dispose();}});

test('returning to foreground does not revive an old confirmation dialog',async()=>{const h=await harness();try{await h.press('Confirm order & export PDF');h.background();h.foreground();await h.confirm();assert.equal(h.calls.posts.length,0);await h.press('Confirm order & export PDF');await h.confirm();assert.equal(h.calls.posts.length,1);}finally{await h.dispose();}});


test('order save and PDF rendering expose separate progress while submitted quantities remain locked', async () => {
  let save, pdf; const h = await harness({ saveWait: new Promise(resolve => { save = resolve; }), pdfWait: new Promise(resolve => { pdf = resolve; }) });
  const hasText = text => h.tree.root.findAllByType('Text').some(node => node.children.join('').includes(text));
  try {
    await h.press('Confirm order & export PDF'); await h.confirm();
    assert.equal(h.calls.feedback.feedback, 'screen'); assert.ok(hasText('Saving your order')); assert.equal(h.calls.pdfs.length, 0);
    assert.equal(h.tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel?.startsWith('Order quantity')).props.editable, false);
    await h.settle(save); assert.equal(h.calls.posts.length, 1); assert.ok(h.drafts.getDraft(h.session).attempt.saved); assert.ok(hasText('Order saved · creating PDF'));
    assert.equal(h.calls.pdfs.length, 1); await h.settle(pdf); assert.equal(h.calls.back, 1);
  } finally { save(); pdf(); await h.dispose(); }
});

test('unknown save outcomes are labelled as unknown and cannot be edited into another submission', async () => {
  const h = await harness({ saveFails: 1 });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm();
    assert.equal(h.alert().title, 'Save status unknown'); assert.match(h.alert().message, /original submission ID/);
    assert.equal(h.tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel?.startsWith('Order quantity')).props.editable, false);
    const first = h.calls.posts[0]; await h.press('Retry same submission'); await h.confirm(); assert.equal(h.calls.posts[1], first);
  } finally { await h.dispose(); }
});

test('leaving during a save retains its eventual saved response and never starts native PDF work', async () => {
  let finish; const h = await harness({ saveWait: new Promise(resolve => { finish = resolve; }) });
  await h.press('Confirm order & export PDF'); await h.confirm(); await h.dispose();
  await h.settle(finish); assert.equal(h.calls.posts.length, 1); assert.ok(h.drafts.getDraft(h.session).attempt.saved); assert.equal(h.calls.pdfs.length, 0);
});

const emergencyInventory = [
  { ...item, id: 'critical-one', name: 'Ambu Bag', quantity: 1, minimumStock: 2, isCritical: true },
  { ...item, id: 'critical-zero', name: 'Oxygen Cylinder', quantity: 0, minimumStock: 2, isCritical: true },
  { ...item, id: 'ordinary-zero', name: 'Bed Sheets', quantity: 0, isCritical: false },
  { ...item, id: 'enough', name: 'Suction Machine', quantity: 3, isCritical: true },
  { ...item, id: 'inactive-critical', name: 'Ventilator', quantity: 0, isCritical: true, isActive: false },
];
test('emergency orders contain exactly active critical backup equipment, excluding unrelated out-of-stock items', async () => {
  const h = await harness({ mode: 'emergency', inventoryRows: emergencyInventory });
  try { assert.deepEqual(Array.from(h.drafts.getDraft(h.session).rows, row => row.item.id), ['critical-one', 'critical-zero']); assert.equal(h.calls.posts.length, 0); }
  finally { await h.dispose(); }
});

test('an emergency request never silently replaces an existing draft; keep, merge and replace require touch', async () => {
  const initialRows = [{ item: emergencyInventory[0], quantity: 7, source: 'spoken' }, { item: emergencyInventory[2], quantity: 9, source: 'manual' }];
  for (const choice of ['Keep current draft', 'Add missing items', 'Replace draft']) {
    const h = await harness({ mode: 'emergency', inventoryRows: emergencyInventory, initialRows });
    try {
      assert.deepEqual(Array.from(h.drafts.getDraft(h.session).rows, row => row.quantity), [7, 9]);
      assert.match(h.alert().title, /existing draft/); await h.choose(choice);
      const rows = h.drafts.getDraft(h.session).rows;
      if (choice === 'Keep current draft') assert.deepEqual(Array.from(rows, row => row.quantity), [7, 9]);
      if (choice === 'Add missing items') { assert.deepEqual(Array.from(rows, row => row.item.id), ['critical-one', 'ordinary-zero', 'critical-zero']); assert.equal(rows[0].quantity, 7); }
      if (choice === 'Replace draft') { assert.deepEqual(Array.from(rows, row => row.item.id), ['critical-one', 'critical-zero']); assert.deepEqual(Array.from(rows, row => row.quantity), [1, 2]); }
      assert.equal(h.calls.posts.length, 0);
    } finally { await h.dispose(); }
  }
});

test('an emergency request cannot replace an unknown submission or use a stale draft-choice callback', async () => {
  const initialRows = [{ item: emergencyInventory[2], quantity: 9, source: 'spoken' }];
  const submitted = await harness({ mode: 'emergency', inventoryRows: emergencyInventory, initialRows, submitted: true });
  try { assert.equal(submitted.alert().buttons.length, 1); assert.equal(submitted.alert().buttons[0].text, 'Keep current order'); assert.equal(submitted.drafts.getDraft(submitted.session).rows[0].quantity, 9); }
  finally { await submitted.dispose(); }
  const h = await harness({ mode: 'emergency', inventoryRows: emergencyInventory, initialRows });
  try { await h.edit('12'); await h.choose('Replace draft'); assert.equal(h.drafts.getDraft(h.session).rows[0].quantity, 12); assert.equal(h.calls.posts.length, 0); }
  finally { await h.dispose(); }
});


for (const status of [403, 409, 422]) test(`an unknown first save followed by HTTP ${status} keeps the original request locked`, async () => {
  const h = await harness({ saveErrors: [0, status] });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); const request = h.calls.posts[0];
    await h.press('Retry same submission'); await h.confirm();
    assert.equal(h.alert().title, 'Save status unknown'); assert.match(h.alert().message, /Recent Orders/);
    assert.equal(h.drafts.getDraft(h.session).attempt.request, request);
    assert.equal(h.tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel?.startsWith('Order quantity')).props.editable, false);
    await h.press('Retry same submission'); await h.confirm();
    assert.equal(h.calls.posts.length, 3); assert.ok(h.calls.posts.every(post => post === request)); assert.equal(h.calls.pdfs.length, 1);
  } finally { await h.dispose(); }
});

test('a definitive rejection of the first request still unlocks its unsaved draft for correction', async () => {
  for (const status of [403, 409, 422]) {
    const h = await harness({ saveErrors: [status] });
    try { await h.press('Confirm order & export PDF'); await h.confirm(); assert.equal(h.alert().title, 'Order not confirmed'); assert.equal(h.drafts.getDraft(h.session).attempt, undefined); await h.edit('20'); assert.equal(h.drafts.getDraft(h.session).rows[0].quantity, 20); }
    finally { await h.dispose(); }
  }
});

test('a saved order interrupted during PDF can be finished with Done, then a new cart starts without another save', async () => {
  let finish; const h = await harness({ pdfWait: new Promise(resolve => { finish = resolve; }) });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); assert.ok(h.drafts.getDraft(h.session).attempt.saved);
    await h.settle(() => h.background()); h.foreground();
    assert.ok(h.drafts.getDraft(h.session).attempt.saved); await h.press('Done — view saved orders');
    assert.equal(h.drafts.getDraft(h.session), null); assert.deepEqual(h.calls.navigation, ['/(tabs)/orders']);
    await h.remount(); const next = h.drafts.getDraft(h.session); assert.equal(next.rows.length, 1); assert.equal(next.attempt, undefined); assert.equal(h.calls.posts.length, 1);
    finish(); await h.settle(() => {}); assert.equal(h.calls.pdfs.length, 1);
  } finally { finish(); await h.dispose(); }
});

test('an unknown order has no Done action and leaving review retains its original submission', async () => {
  const h = await harness({ saveFails: 1 });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); const request = h.calls.posts[0];
    assert.equal(h.tree.root.findAll(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Done — view saved orders').length, 0);
    await h.press('Leave order review'); await h.remount(); assert.equal(h.drafts.getDraft(h.session).attempt.request, request);
  } finally { await h.dispose(); }
});


test('a stale Done callback cannot clear a saved order from a later login epoch', async () => {
  const h = await harness({ pdfFails: 1 });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm();
    const staleDone = h.tree.root.findAll(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Done — view saved orders')[0].props.onPress;
    const nextSession = await h.newSavedSession(); await h.settle(staleDone);
    assert.equal(h.drafts.getDraft(nextSession).attempt.saved.id, 'new-session-order'); assert.deepEqual(h.calls.navigation, []);
  } finally { await h.dispose(); }
});


test('a late first-request rejection cannot unlock a remounted retry with an unknown outcome', async () => {
  let finishFirst; const h = await harness({ saveWait: new Promise(resolve => { finishFirst = resolve; }), saveFirstOnly: true, saveErrors: [403, 0] });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); const request = h.calls.posts[0];
    await h.remount(); await h.press('Retry same submission'); await h.confirm();
    assert.equal(h.alert().title, 'Save status unknown'); assert.equal(h.drafts.getDraft(h.session).attempt.request, request);
    await h.settle(finishFirst);
    assert.equal(h.drafts.getDraft(h.session).attempt.request, request);
    await h.press('Retry same submission'); await h.confirm();
    assert.equal(h.calls.posts.length, 3); assert.ok(h.calls.posts.every(post => post === request)); assert.equal(h.calls.pdfs.length, 1);
  } finally { finishFirst(); await h.dispose(); }
});


test('a late save success for a completed attempt cannot mark a newer unknown submission as saved', async () => {
  let finishFirst; const h = await harness({ saveWait: new Promise(resolve => { finishFirst = resolve; }), saveFirstOnly: true, saveErrors: [undefined, undefined, 0] });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); const original = h.calls.posts[0];
    await h.remount(); await h.press('Retry same submission'); await h.confirm();
    assert.equal(h.calls.posts[1], original); assert.equal(h.calls.pdfs.length, 1);
    await h.remount(); await h.press('Confirm order & export PDF'); await h.confirm();
    const newer = h.drafts.getDraft(h.session).attempt.request; assert.notEqual(newer.localId, original.localId);
    assert.equal(h.drafts.getDraft(h.session).attempt.saved, undefined);
    await h.settle(finishFirst);
    assert.equal(h.drafts.getDraft(h.session).attempt.request, newer);
    assert.equal(h.drafts.getDraft(h.session).attempt.saved, undefined);
    assert.equal(h.alert().title, 'Save status unknown'); assert.equal(h.calls.pdfs.length, 1); assert.equal(h.calls.posts.length, 3);
  } finally { finishFirst(); await h.dispose(); }
});

test('late PDF completion after Done cannot clear or relabel a newer unknown submission', async () => {
  let finishPdf; const h = await harness({ pdfWait: new Promise(resolve => { finishPdf = resolve; }), pdfFirstOnly: true, pdfUncancellable: true, saveErrors: [undefined, 0] });
  try {
    await h.press('Confirm order & export PDF'); await h.confirm(); const first = h.calls.posts[0];
    await h.press('Done — view saved orders'); await h.remount();
    await h.press('Confirm order & export PDF'); await h.confirm(); const newer = h.drafts.getDraft(h.session).attempt.request;
    assert.notEqual(newer.localId, first.localId); assert.equal(h.drafts.getDraft(h.session).attempt.saved, undefined);
    await h.settle(finishPdf);
    assert.equal(h.drafts.getDraft(h.session).attempt.request, newer); assert.equal(h.drafts.getDraft(h.session).attempt.saved, undefined);
    assert.equal(h.alert().title, 'Save status unknown'); assert.equal(h.calls.back, 0); assert.deepEqual(h.calls.navigation, ['/(tabs)/orders']);
  } finally { finishPdf(); await h.dispose(); }
});
