const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');

function screen(initial={}) {
  let focused=0,submitted=0,changed='';
  const slots=[];
  let cursor=0;
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
    useRef:(initial)=>{ const i=cursor++; if(slots[i]===undefined) slots[i]={current: initial==null ? {focus:()=>{focused++;}} : initial}; return slots[i]; },
    useState:(initial)=>{ const i=cursor++; if(slots[i]===undefined) slots[i]=initial; return [slots[i], value=>{ slots[i]=typeof value==='function'?value(slots[i]):value; }]; },
    useEffect:()=>{}};
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/BuildUrlEntry.tsx'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText;
  new Function('require','module','exports',code)(id=>{
    if(id==='react')return React;
    if(id==='react-native')return {Platform:{OS:'web'},StyleSheet:{absoluteFill:{},absoluteFillObject:{},create:styles=>styles},Text:'Text',TextInput:'TextInput',View:'View',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',ActivityIndicator:'ActivityIndicator',Animated:{Value:class{interpolate(){return 0}},View:'Animated.View',ScrollView:'ScrollView',event:()=>()=>{},timing:()=>({start(){}}),spring:()=>({start(){}})}};
    if(id==='expo-image')return {Image:'Image'};
    if(id==='expo-blur')return {BlurView:'BlurView'};
    if(id==='expo-linear-gradient')return {LinearGradient:'LinearGradient'};
    if(id==='lucide-react-native')return {ArrowLeft:'ArrowLeft',ArrowUpRight:'ArrowUpRight',Link2:'Link2'};
    if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:0})};
    if(id==='./TactilePressable')return 'Pressable';
    if(id==='@/constants/backdrops')return {SCREEN_BG:{listings:'background'}};
    if(id==='@/hooks/useThemeMotion')return {useReducedMotion:()=>({ready:true,reduced:true})};
    throw Error(id);
  },module,module.exports);
  let props={url:'',onChange:value=>{changed=value},onSubmit:()=>submitted++,onExit:()=>{},...initial};
  const nodes=root=>[root,...root.children.filter(x=>x&&typeof x==='object').flatMap(nodes)];
  const render=()=>{ cursor=0; return nodes(module.exports.default(props)); };
  return {render,update:next=>{props={...props,...next}},get focused(){return focused},get submitted(){return submitted},get changed(){return changed}};
}
const button=s=>s.render().find(n=>n.props.accessibilityLabel==='Import my listings');
const input=s=>s.render().find(n=>n.props.accessibilityLabel==='Your listings URL');

test('startup import is clickable without a URL and focuses the existing input with feedback',()=>{
  const s=screen();assert.equal(button(s).props.disabled,false);button(s).props.onPress();
  assert.equal(s.focused,1);assert.equal(s.submitted,0);
  assert.ok(s.render().some(n=>n.props.accessibilityRole==='alert'));
  input(s).props.onChangeText('cindycarlsonrealty.com');assert.equal(s.changed,'cindycarlsonrealty.com');
  assert.ok(!s.render().some(n=>n.props.accessibilityRole==='alert'));
});
test('valid URL click and keyboard submission invoke the same importer',()=>{
  const s=screen({url:'https://third-party.example/property'});
  button(s).props.onPress();input(s).props.onSubmitEditing();assert.equal(s.submitted,2);
});
test('session preparation gives feedback without pretending an import is in progress',()=>{
  const s=screen({preparing:true,url:'https://public.example/'});
  assert.equal(button(s).props.disabled,false);assert.equal(input(s).props.editable,true);
  button(s).props.onPress();assert.equal(s.submitted,0);
  assert.ok(s.render().some(n=>n.props.accessibilityRole==='alert'));
  s.update({preparing:false});button(s).props.onPress();assert.equal(s.submitted,1);
});
test('an in-flight import blocks duplicate click and keyboard requests',()=>{
  const s=screen({busy:true,url:'https://public.example/'});
  assert.equal(button(s).props.disabled,true);assert.equal(input(s).props.editable,false);
  button(s).props.onPress();input(s).props.onSubmitEditing();assert.equal(s.submitted,0);
});
