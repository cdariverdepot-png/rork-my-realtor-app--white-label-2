const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const moduleRef = { exports: {} };
const source = fs.readFileSync(path.resolve(__dirname,'../lib/themeComposition.ts'),'utf8');
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleRef,moduleRef.exports);
const { themeComposition } = moduleRef.exports;
test('composition keeps published inventory in editor order without stale listings', () => {
  const items = [{id:'first'},{id:'hidden',hidden:true},{id:'archived',sourceArchived:true},{id:'last'}];
  const plan = themeComposition('modern-editorial',390,.7,items);
  assert.deepEqual(plan.items.map(x=>x.id),['first','last']);
  assert.deepEqual(items.map(x=>x.id),['first','hidden','archived','last']);
});
test('wide photographs stay above copy and tall photos split only with sufficient width', () => {
  assert.equal(themeComposition('advisor-journal',390,1.8,[]).portraitFirst,true);
  assert.equal(themeComposition('advisor-journal',390,.6,[]).split,false);
  assert.equal(themeComposition('advisor-journal',900,.6,[]).split,true);
  assert.equal(themeComposition('advisor-journal',900,1.8,[]).split,false);
});
test('single and sparse collections fit narrow client screens', () => {
  for(const width of [320,390,768]) {
    assert.ok(themeComposition('private-collection',width,.7,[{}]).cardWidth <= width-40);
    assert.ok(themeComposition('portrait-statement',width,.7,[{},{}]).cardWidth <= width-64);
  }
});
test('carousel artwork and miniature renderer remain unchanged from the approved release', () => {
  const cp = require('node:child_process');
  const git = 'C:/Users/Charlotte/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe';
  // Local verification only; CI can check the explicit miniature boundary below.
  const live = fs.readFileSync(path.resolve(__dirname,'../components/themes/ReferenceHome.tsx'),'utf8');
  assert.match(live,/p\.miniature \? <CarouselReferenceHome/);
  if(fs.existsSync(git) && fs.existsSync(path.resolve(__dirname, '../../.git'))) {
    const previous=cp.execFileSync(git,['-c','safe.directory=*','show','7dd9c83:expo/components/themes/ReferenceHome.tsx'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'});
    assert.equal(live.split('function CarouselReferenceHome(p: ReferenceHomeProps) {')[1].replace(/\r\n/g,'\n'),previous.split('export default function ReferenceHome(p: ReferenceHomeProps) {')[1].replace(/\r\n/g,'\n'));
  }
});
