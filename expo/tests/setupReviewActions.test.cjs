const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function screen(disabled=false){
  const state=[false,false];let slot=0,chosen=null;
  const draft={realtor:{name:'Cindy'},presentation:'website'},listings=[{id:'home',price:'$374,000',image:'public-photo'}];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>{const index=slot++;return [state[index]??initial,value=>{state[index]=value}];}};
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/SetupReviewActions.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(id=>{
    if(id==='react')return React;
    if(id==='react-native')return {Modal:'Modal',ScrollView:'ScrollView',Text:'Text',View:'View'};
    if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:0})};
    if(id==='react-native-gesture-handler')return {GestureHandlerRootView:'GestureHandlerRootView'};
    if(id.startsWith('./'))return id.slice(2);
    throw Error(id);
  },module,module.exports);
  const nodes=root=>[root,...root.children.filter(x=>x&&typeof x==='object').flatMap(nodes)];
  const render=()=>{slot=0;return nodes(module.exports.default({draft,listings,disabled,onChoose:next=>{chosen=next}}))};
  return {render,draft,listings,get chosen(){return chosen}};
}
test('preview opens with the actual unpublished draft and imported inventory',()=>{
  const s=screen();s.render().find(n=>n.props.accessibilityLabel==='Preview My App').props.onPress();
  const preview=s.render().find(n=>n.type==='ThemePreviewModal');assert.equal(preview.props.visible,true);
  assert.equal(preview.props.brand,s.draft);assert.equal(preview.props.listings,s.listings);assert.equal(s.chosen,null);
  preview.props.onClose();assert.equal(s.render().find(n=>n.type==='ThemePreviewModal').props.visible,false);
});
test('exploring does not change the draft until a theme is chosen, then returns to review',()=>{
  const s=screen();s.render().find(n=>n.props.accessibilityLabel==='Explore Themes').props.onPress();
  assert.equal(s.render().find(n=>n.type==='Modal').props.visible,true);assert.equal(s.chosen,null);
  const picker=s.render().find(n=>n.type==='ThemeCarousel');assert.equal(picker.props.draft,s.draft);assert.equal(picker.props.listings,s.listings);
  const next={...s.draft,layoutId:'coastal-personal',presentation:'premium'};picker.props.onChoose(next);
  assert.equal(s.chosen,next);assert.equal(s.render().find(n=>n.type==='Modal').props.visible,false);
});
test('closing exploration keeps the current draft and busy actions are disabled',()=>{
  const s=screen();s.render().find(n=>n.props.accessibilityLabel==='Explore Themes').props.onPress();
  s.render().find(n=>n.props.accessibilityLabel==='Back to app review').props.onPress();assert.equal(s.chosen,null);
  assert.equal(s.render().find(n=>n.type==='Modal').props.visible,false);
  for(const node of screen(true).render().filter(n=>['Explore Themes','Preview My App'].includes(n.props.accessibilityLabel)))assert.equal(node.props.disabled,true);
});
