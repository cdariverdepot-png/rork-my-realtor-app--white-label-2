const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
const navigation = load('lib/clientNavigation.ts');
test('preview account paths lead to a useful menu while signed-in clients keep their account', () => {
  for (const route of ['/account', '/client-profile', '/client-recovery']) assert.equal(navigation.clientDestination(route, true), '/menu');
  assert.equal(navigation.clientDestination('/account', false), '/account');
  assert.equal(navigation.clientDestination('/message', true), '/messages');
  assert.equal(navigation.clientDestination('/message', false), '/messages');
  for (const page of ['/', '/menu', '/listings', '/favorites', '/messages', '/calendar', '/documents', '/account', '/client-profile', '/listing/one']) assert.ok(navigation.isClientPage(page), page);
  for (const page of ['/admin', '/admin/studio', '/portal', '/login', '/welcome']) assert.equal(navigation.isClientPage(page), false);
});
test('all seven footer designs have useful menu routes in preview and retain client profile controls', () => {
  const react = { createElement: (type, props, ...children) => ({type,props:props||{},children:children.flat(Infinity)}) };
  const component = load('components/ThemeNavigation.tsx', {
    react, 'react-native': {Text:'text',View:'view',StyleSheet:{create:x=>x}}, 'lucide-react-native': {}, 'expo-blur':{BlurView:'blur'}, './TactilePressable':'button',
    '@/hooks/useReducedTransparency': {useReducedTransparency:()=>false},
    '@/constants/themeDesigns': {themeDesign:(id)=>({composition:id,background:'#111111',accent:'#aa9900',muted:'#888888'})},
  }).default;
  const buttons = node => node && typeof node === 'object' ? (node.type === 'button' ? [node] : node.children.flatMap(buttons)) : [];
  for (const composition of ['coastal','discovery','journal','concierge','property','minimal','editorial']) {
    for (const preview of [false,true]) {
      const routes=[]; const tabs=buttons(component({brand:{layoutId:composition,theme:{}},preview,onNavigate:route=>routes.push(route)}));
      tabs.forEach(tab=>tab.props.onPress());
      assert.equal(tabs.length, composition==='coastal'?4:5);
      assert.ok(routes.includes(preview || ['discovery','concierge'].includes(composition) ? '/menu' : '/account'));
      if (preview) assert.ok(!routes.includes('/account'));
    }
  }
});

test('theme presses respond immediately, preserve handlers, and respect reduced motion', () => {
  for(const reduced of [false,true]) {
    let cursor=0;const slots=[];let haptics=0,presses=0;
    class Value {constructor(value){this.value=value;}setValue(value){this.value=value;}stopAnimation(){}}
    const flatten=s=>Array.isArray(s)?Object.assign({},...s.filter(Boolean).map(flatten)):s||{};
    const react={createElement:(type,props,...children)=>({type,props,children}),useRef:value=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},useState:value=>{const i=cursor++;slots[i]??=value;return [slots[i],next=>{slots[i]=next;}];}};
    const component=load('components/TactilePressable.tsx',{react,'react-native':{Pressable:'button',Platform:{OS:'ios'},StyleSheet:{flatten},Animated:{Value,createAnimatedComponent:()=> 'button',spring:(value,opts)=>({start:()=>value.setValue(opts.toValue)})}},'expo-haptics':{selectionAsync:()=>{haptics++;return Promise.resolve();}},'@/hooks/useThemeMotion':{useReducedMotion:()=>({reduced})}}).default;
    const render=()=>{cursor=0;return component({onPress:()=>presses++,style:{minHeight:12,minWidth:20}});};
    let button=render();let style=flatten(button.props.style);
    assert.equal(style.minHeight,44);assert.equal(style.minWidth,44);
    button.props.onPressIn({});button=render();style=flatten(button.props.style);
    assert.equal(style.opacity,0.78);assert.equal(style.transform.at(-1).scale.value,reduced?1:0.975);
    button.props.onPress({});assert.equal(presses,1);assert.equal(haptics,1);
    button.props.onPressOut({});button=render();assert.equal(flatten(button.props.style).opacity,1);
  }
});
test('a client only sees explicitly assigned transactions and appropriate shared documents', () => {
  const {clientDocuments}=load('lib/clientDocuments.ts');
  const tx=[{id:'mine',clientIds:['a']},{id:'other',clientIds:['b']},{id:'unassigned',clientIds:[]}];
  const docs=[{id:'general'},{id:'direct',recipientIds:['a']},{id:'other',recipientIds:['b']},{id:'mine-tx',transactionId:'mine'},{id:'other-tx',transactionId:'other'},{id:'unassigned-tx',transactionId:'unassigned'},{id:'restricted',transactionId:'mine',recipientIds:['b']}];
  const result=clientDocuments(docs,tx,'a');
  assert.deepEqual(result.transactions.map(x=>x.id),['mine']);
  assert.deepEqual(result.items.map(x=>x.id),['direct','mine-tx']);
  assert.deepEqual(clientDocuments(docs,tx,undefined),{items:[],transactions:[]});
});
test('notification callback changes do not repeatedly mark all notifications read', () => {
  let cursor=0, slots=[], cleanup, lastFocus, reads=0, current;
  const react={createElement:()=>null,useRef:value=>{const i=cursor++;return slots[i]??(slots[i]={current:value});},useCallback:(fn,deps)=>{const i=cursor++;return slots[i]??(slots[i]=fn);}};
  const screen=load('app/notifications.tsx', {react,'react-native':{StyleSheet:{create:x=>x}},'expo-router':{useRouter:()=>({}),useFocusEffect:fn=>{if(fn!==lastFocus){cleanup?.();lastFocus=fn;cleanup=fn();}}},'lucide-react-native':{},
    '@/constants/colors':{brand:{},dark:{},fonts:{}},'@/contexts/NotificationsContext':{useNotifications:()=>({items:[],permission:'granted',markAllRead:current})},'@/contexts/BrandContext':{useBrand:()=>({brand:{realtor:{name:'Alex'}}})},
    '@/components/ModalChrome':{},'@/components/ScreenBackdrop':{},'@/components/PressableScale':{},'@/components/Reveal':{}});
  // Re-render for new callbacks/remote notifications without navigating away.
  for(let i=0;i<12;i++){current=()=>{reads=i+1;};cursor=0;screen.default();}
  assert.equal(reads,0);
  cleanup();
  assert.equal(reads,12); // exactly the latest callback, once on blur
});
