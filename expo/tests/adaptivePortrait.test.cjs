const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname,'..');
function runtime(ratio=0.5, known=true, fontScale=1) {
 const cache=new Map();
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useMemo:fn=>fn(),useState:()=>[false,()=>{}],memo:x=>x};
 const rn={View:'View',Text:'Text',Pressable:'Pressable',Modal:'Modal',ScrollView:'ScrollView',StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:390,fontScale})};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>{
 if(id==='react')return react;if(id==='react-native')return rn;if(id==='expo-image')return {Image:'Image'};
 if(id==='lucide-react-native')return new Proxy({},{get:(_,key)=>key});
 if(id==='@/hooks/usePortraitDimensions')return {usePortraitDimensions:()=>({ratio,known,hasPhoto:true})};
 if(id==='@/hooks/useThemeMotion')return {};
 let next=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);
 if(!path.extname(next))next=fs.existsSync(next+'.tsx')?next+'.tsx':next+'.ts';return load(next);
 },m,m.exports);return m.exports;}
 return {load:p=>load(path.join(root,p))};
}
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(all)];
const brand=id=>({layoutId:id,portraitUrl:'https://photos.example/profile.jpg',theme:{accent:'gold',displayFont:'playfair',surface:'ivory',presentationVersion:2,imagePositions:{}},realtor:{name:'Alex Morgan',brandName:'Morgan Realty',heroMessage:'A place to call home',tagline:'',heroEyebrow:'Welcome',welcomeNote:'Your introduction',title:'Advisor',city:'CDA',monogram:'AM'},curated:{},concierge:{}});
const themes=['eliza-editorial','coastal-personal','advisor-journal','warm-concierge','private-collection','modern-editorial','portrait-statement'];
test('all seven themes render natural-flow photo and copy as separate stable siblings',()=>{
 for(const ratio of [0.5,1,2])for(const id of themes){
 const rt=runtime(ratio), Hero=rt.load('components/ThemeHero.tsx').default;
 const entry=Hero({brand:brand(id),width:390,preview:true});const wrapper=entry.props.children[0];
 const adaptive=wrapper.type(wrapper.props);const tree=adaptive.type(adaptive.props);
 const photo=all(tree).find(n=>n.type?.name==='FullPortrait');assert.ok(photo,id);assert.equal(photo.props.ratio,ratio);
 const photoParent=all(tree).find(n=>n.props?.children?.includes(photo));
 assert.ok(!all(photoParent).some(n=>n.type==='Text'),id+' must not overlay copy on photo');
 assert.equal(tree.props.style.height,undefined);assert.equal(tree.props.style.position,undefined);
 const panel=photo.type(photo.props);assert.equal(panel.props.style.height,Math.min(photo.props.width/ratio,photo.props.width*2.5));
 const image=panel.props.children[0];assert.equal(image.props.contentFit,'contain');assert.equal(image.props.style.transform,undefined);
 }
});
test('stored framing has no effect until crop is explicitly selected',()=>{
 const rt=runtime(0.5), Full=rt.load('components/FullPortrait.tsx').default,b=brand('private-collection');
 b.theme.imagePositions={'private-collection:gold:playfair:ivory':{x:30,y:10,zoom:2}};
 const full=Full({brand:b,width:300});assert.equal(full.props.children[0].props.contentFit,'contain');assert.equal(full.props.children[0].props.style.transform,undefined);
 b.theme.portraitFit='crop';const cropped=Full({brand:b,width:300});assert.equal(cropped.props.children[0].props.contentFit,'cover');assert.deepEqual(cropped.props.children[0].props.style.transform,[{scale:2}]);
});
test('unknown proportions and large text use a safe stacked layout',()=>{
 for(const [known,fontScale] of [[false,1],[true,1.5]]){
 const rt=runtime(0.5,known,fontScale),Adaptive=rt.load('components/themes/AdaptiveHero.tsx').default;
 const tree=Adaptive({brand:brand('portrait-statement'),width:390});const composition=tree.props.children[1];assert.equal(composition.props.style.flexDirection,'column');
 }
});
