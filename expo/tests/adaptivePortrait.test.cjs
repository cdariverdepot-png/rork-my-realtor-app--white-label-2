const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname,'..');
function runtime(ratio=0.5, known=true, fontScale=1) {
 const cache=new Map();
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:fn=>fn(),useState:()=>[false,()=>{}],memo:x=>x};
 const rn={View:'View',Text:'Text',Pressable:'Pressable',Modal:'Modal',ScrollView:'ScrollView',Animated:{View:'Animated.View'},StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:390,fontScale})};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>{
 if(id==='react')return react;if(id==='react-native')return rn;if(id==='expo-image')return {Image:'Image'};
 if(id==='lucide-react-native')return new Proxy({},{get:(_,key)=>key});
 if(id.endsWith('/TactilePressable'))return 'Pressable';
 if(id==='@/hooks/usePortraitDimensions')return {usePortraitDimensions:()=>({ratio,known,hasPhoto:true})};
 if(id==='@/hooks/useThemeMotion')return {useThemeMotion:()=>({imgTranslate:0})};
 let next=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);
 if(!path.extname(next))next=fs.existsSync(next+'.tsx')?next+'.tsx':next+'.ts';return load(next);
 },m,m.exports);return m.exports;}
 return {load:p=>load(path.join(root,p))};
}
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(all)];
const brand=id=>({layoutId:id,portraitUrl:'https://photos.example/profile.jpg',theme:{accent:'gold',displayFont:'playfair',surface:'ivory',presentationVersion:2,imagePositions:{}},realtor:{name:'Alex Morgan',brandName:'Morgan Realty',heroMessage:'A place to call home',tagline:'',heroEyebrow:'Welcome',welcomeNote:'Your introduction',title:'Advisor',city:'CDA',monogram:'AM'},curated:{},concierge:{}});
const themes=['eliza-editorial','coastal-personal','advisor-journal','warm-concierge','private-collection','modern-editorial','portrait-statement'];
function expand(node){if(!node||typeof node!=='object')return node;if(typeof node.type==='function')return expand(node.type(node.props));return {...node,props:{...node.props,children:(node.props?.children??[]).flat(Infinity).map(expand)}};}
test('seven distinct flow compositions preserve every photo shape without overlapping copy',()=>{
 const fingerprints=new Set();for(const ratio of [0.5,1,2])for(const id of themes){
 const rt=runtime(ratio),Hero=rt.load('components/ThemeHero.tsx').default;const tree=expand(Hero({brand:brand(id),width:390,preview:true}));
 const image=all(tree).find(n=>n.props?.contentFit==='contain'&&n.props?.accessibilityLabel?.startsWith('Portrait'));
 assert.ok(image,id);assert.equal(image.props.style.transform,undefined);
 const animated=all(tree).find(n=>n.type==='Animated.View');assert.ok(animated,id);
 assert.ok(!all(animated).some(n=>n.type==='Text'),id+' image layer cannot obscure text');
 assert.equal(tree.props.style.height,undefined);assert.equal(tree.props.style.position,undefined);
 if(ratio===0.5)fingerprints.add(JSON.stringify(tree));
 }assert.equal(fingerprints.size,7);
});
test('stored framing has no effect until crop is explicitly selected',()=>{
 const rt=runtime(0.5), Full=rt.load('components/FullPortrait.tsx').default,b=brand('private-collection');
 b.theme.imagePositions={'private-collection:gold:playfair:ivory':{x:30,y:10,zoom:2}};
 const full=Full({brand:b,width:300});assert.equal(full.props.children[0].props.children[0].props.contentFit,'contain');assert.equal(full.props.children[0].props.children[0].props.style.transform,undefined);
 b.theme.portraitFit='crop';const cropped=Full({brand:b,width:300});assert.equal(cropped.props.children[0].props.children[0].props.contentFit,'cover');assert.deepEqual(cropped.props.children[0].props.children[0].props.style.transform,[{scale:2}]);
});
test('large text and unknown or wide photos stack the split compositions',()=>{
 for(const [ratio,known,fontScale]of [[0.5,false,1],[0.5,true,1.5],[2,true,1]])for(const file of ['MarissaHero','SloaneHero','NoraHero']){
 const rt=runtime(ratio,known,fontScale),Hero=rt.load('components/themes/'+file+'.tsx').default;
 const id=file==='MarissaHero'?'coastal-personal':file==='SloaneHero'?'warm-concierge':'modern-editorial';
 const tree=Hero({brand:brand(id),width:390});assert.ok(all(tree).some(n=>n.props?.style?.flexDirection==='column'),file);
 }
});
test('carousel fits the width of the phone viewport independently of page height',()=>{
 const source=fs.readFileSync(path.join(root,'components/ThemeFace.tsx'),'utf8');assert.match(source,/const scale = width \/ 390/);assert.doesNotMatch(source,/naturalHeight|onLayout=/);
});
