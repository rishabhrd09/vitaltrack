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
async function harness({loaded=true,offline=false,saveFails=0,pdfFails=0,oldBackend=false}={}) {
  const calls={posts:[],pdfs:[],back:0,snapshots:0};let alert,inventory=[item,{...item,id:'hidden',name:'Hidden',isActive:false}],fresh=[item],isSuccess=loaded;
  const types=load('types/index.ts');const core=load('features/assistant/core.ts',{'../../types':types});const contracts=load('features/assistant/contracts.ts');const queries=load('features/assistant/queries.ts',{'@/types':types,'./core':core,'./contracts':contracts});
  const session={owner:'a',epoch:0};let valid=true,epoch=0;
  const sessions={captureSession:()=>{if(!valid)throw new Error('Signed out');return {...session,epoch};},assertSession:s=>{if(!valid || s.epoch!==epoch)throw new Error('Session changed');},ownsSnapshot:()=>true};
  const auth=fn=>fn({isAuthenticated:true,user:{id:'a'}});auth.subscribe=()=>()=>{};
  const drafts=load('features/assistant/drafts.ts',{react:React,'@/store/useAuthStore':{useAuthStore:auth},'@/services/assistantSession':sessions,'@/types':types,'@/utils/helpers':{generateId:()=> 'same-local-id'},'./queries':queries,'./contracts':contracts});
  const host=name=>({children,...props})=>React.createElement(name,props,children);
  const rn=Object.fromEntries(['View','Text','TouchableOpacity','TextInput','Image'].map(name=>[name,host(name)]));
  rn.FlatList=({data,renderItem,ListEmptyComponent})=>React.createElement('FlatList',{},data.length?data.map((i,index)=>React.createElement(React.Fragment,{key:i.item?.id||i.id},renderItem({item:i,index}))):ListEmptyComponent);
  rn.Modal=({visible,children})=>visible?React.createElement('Modal',{},children):null;let lifecycle;rn.AppState={currentState:'active',addEventListener:(_,fn)=>{lifecycle=fn;return {remove(){}};}};rn.StyleSheet={create:v=>v};rn.Alert={alert:(title,message,buttons)=>{alert={title,message,buttons};}};
  class ApiClientError extends Error {constructor(status){super('Failed');this.status=status;}}
  const deps={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':rn,'react-native-safe-area-context':{SafeAreaView:host('SafeAreaView')},'@expo/vector-icons':{Ionicons:host('Icon')},'expo-router':{useLocalSearchParams:()=>({})},
    '@/theme/ThemeContext':{useTheme:()=>({colors:load('theme/colors.ts').colors})},'@/theme/spacing':load('theme/spacing.ts'),'@/types':types,
    '@/utils/orderPdfExport':{exportOrderPdf:async(order)=>{calls.pdfs.push(order);if(pdfFails-->0)throw new Error('Printer failed');return {shared:true};}},
    '@/store/useAuthStore':{useAuthStore:auth},'@/services/assistantSession':sessions,'@/features/assistant/snapshot':{inventorySnapshot:async()=>{calls.snapshots++;return {items:fresh,timestamp:100,stale:false};}},
    '@/features/assistant/drafts':drafts,'@/services/assistant':{capabilities:async()=>({order_review_guard:!oldBackend})},'@/services/api':{ApiClientError},
    '@/hooks/useServerData':{useItems:()=>({data:inventory,isSuccess,isFetching:false})},'@/hooks/useServerMutations':{useCreateOrder:()=>({mutateAsync:async request=>{calls.posts.push(request);if(saveFails-->0)throw new ApiClientError(0);return {id:'saved',orderId:'ORD-1',items:request.items};}})},
    '@/hooks/useNetworkStatus':{useNetworkStatus:()=>({isOnline:!offline})},'@/utils/navigation':{safeBack:()=>{calls.back++;}},};
  const Screen=load('app/order/create.tsx',deps).default;let tree;
  await act(async()=>{tree=create(React.createElement(Screen));});
  const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  const press=async label=>{const node=tree.root.findAll(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel===label)[0];assert.ok(node,label);assert.ok(!node.props.disabled);await act(async()=>{node.props.onPress();await flush();});};
  return {calls,drafts,session,tree,press,alert:()=>alert,
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
