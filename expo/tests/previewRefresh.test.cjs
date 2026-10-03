const { test }=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const guardModule={exports:{}};new Function('module','exports',transpile(fs.readFileSync(path.join(root,'lib/remoteRevision.ts'),'utf8')))(guardModule,guardModule.exports);const {shouldApplyRemoteRevision}=guardModule.exports;
function harness(){
 let cursor=0,effects=[],slots=[],scheduled=[],reads=[],poll;const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
 const react={useRef:value=>{const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i]},useState:value=>{const i=cursor++;if(!slots[i])slots[i]={value};return [slots[i].value,v=>slots[i].value=v]},useEffect:(fn,deps)=>{const i=cursor++,old=effects[i];if(!old||deps.some((x,j)=>x!==old.deps[j]))scheduled.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})},useCallback:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((x,j)=>x!==slots[i].deps[j]))slots[i]={value:fn,deps};return slots[i].value}};
 const module={exports:{}};new Function('require','module','exports','setInterval','clearInterval',transpile(fs.readFileSync(path.join(root,'lib/kvSync.ts'),'utf8')))(id=>id==='react'?react:{kvGet:key=>{const item=deferred();reads.push({key,...item});return item.promise},kvSubscribe:()=>()=>{},kvSet:()=>Promise.resolve(),recordKvWrite:()=>{}},module,module.exports,fn=>{poll=fn;return 1},()=>{});
 return {reads,render(args){cursor=0;const result=module.exports.useKvSync(args);scheduled.splice(0).forEach(fn=>fn());return result},poll:()=>poll()};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('delayed initial fetch cannot restore the old theme after a local theme save',async()=>{
 const h=harness();let revision=100,theme='new',observed;
 const args=()=>({key:'own:brand.v2',enabled:true,value:{theme},rev:revision,onRemote:(row,meta)=>{observed=meta;if(shouldApplyRemoteRevision(row.rev,revision,meta))theme=row.value.theme}});
 h.render(args());revision=200;h.render(args());h.reads[0].resolve({rev:100,value:{theme:'old'}});await tick();assert.equal(observed.startedRev,100);assert.equal(theme,'new');
});
test('background poll never forces stale data over the selected theme',async()=>{
 const h=harness();let revision=100,theme='old',lastMeta;
 const args=()=>({key:'own:brand.v2',enabled:true,value:{theme},rev:revision,onRemote:(row,meta)=>{lastMeta=meta;if(shouldApplyRemoteRevision(row.rev,revision,meta)){theme=row.value.theme;revision=row.rev}}});
 h.render(args());h.reads[0].resolve({rev:100,value:{theme:'old'}});await tick();h.render(args());theme='selected';revision=200;h.render(args());h.poll();h.reads[1].resolve({rev:100,value:{theme:'old'}});await tick();assert.equal(lastMeta.forced,false);assert.equal(theme,'selected');
 h.poll();h.reads[2].resolve({rev:300,value:{theme:'newer-server-choice'}});await tick();assert.equal(theme,'newer-server-choice');
});
test('manual refresh from an old account cannot update the new account',async()=>{
 const h=harness(),seen=[];const args=key=>({key,enabled:true,value:{},rev:100,onRemote:row=>seen.push(row.value)});
 const first=h.render(args('a'));h.reads[0].resolve(null);await tick();h.render(args('a'));const refresh=first.refresh();h.render(args('b'));h.reads[1].resolve({rev:200,value:{account:'a'}});await refresh;assert.deepEqual(seen,[]);
});
test('a cold cache and an intentional refresh still accept authoritative server data',()=>{
 assert.equal(shouldApplyRemoteRevision(90,100,{initial:true,startedRev:100}),true);
 assert.equal(shouldApplyRemoteRevision(90,100,{forced:true,startedRev:100}),true);
 assert.equal(shouldApplyRemoteRevision(90,200,{forced:true,startedRev:100}),false);
});
test('client preview is untransformed while idle and limits swipes to the left edge',()=>{
 const home=fs.readFileSync(path.join(root,'app/index.tsx'),'utf8');
 assert.match(home,/previewSliding \? \{ transform:/);assert.match(home,/touch.x > 32/);assert.match(home,/activeOffsetX\(24\)/);assert.match(home,/failOffsetY\(\[-12, 12\]\)/);
 const image=fs.readFileSync(path.join(root,'components/PortraitImage.tsx'),'utf8');assert.match(image,/loading="eager"/);
});
