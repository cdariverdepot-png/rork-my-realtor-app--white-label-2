const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
test('gallery browses the persisted collection through next, previous and thumbnail controls',()=>{
  let state=0;
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useEffect:()=>{},useState:()=>[state,value=>{state=value}]};
  const m={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/ListingPhotoGallery.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(id=>{
    if(id==='react')return React;
    if(id==='react-native')return {ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:x=>x,absoluteFill:{}}};
    if(id==='expo-image')return {Image:'Image'};
    if(id==='lucide-react-native')return {ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'};
    if(id.includes('PressableScale'))return 'Button';
    if(id.includes('imageUri'))return {bustedUri:x=>x};
    if(id.includes('colors'))return {brand:{},fonts:{}};
    throw Error(id);
  },m,m.exports);
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...n.children.flatMap(nodes)];
  const images=['cover.jpg','kitchen.jpg','bedroom.jpg'];
  const render=()=>nodes(m.exports.default({images,title:'119 Pine St'}));
  const hero=()=>render().find(n=>n.type==='Image'&&n.props.accessibilityLabel);
  assert.equal(hero().props.source.uri,'cover.jpg');
  render().find(n=>n.props.accessibilityLabel==='Next property photo').props.onPress();assert.equal(hero().props.source.uri,'kitchen.jpg');
  render().find(n=>n.props.accessibilityLabel==='View property photo 3 of 3').props.onPress();assert.equal(hero().props.source.uri,'bedroom.jpg');
  render().find(n=>n.props.accessibilityLabel==='Next property photo').props.onPress();assert.equal(hero().props.source.uri,'cover.jpg');
  render().find(n=>n.props.accessibilityLabel==='Previous property photo').props.onPress();assert.equal(hero().props.source.uri,'bedroom.jpg');
});
