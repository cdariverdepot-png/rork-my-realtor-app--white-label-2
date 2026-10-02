const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const edge=fs.readFileSync(path.resolve(__dirname,'../../supabase/functions/analyze-realtor-build/index.ts'),'utf8');const source=edge.slice(edge.indexOf('function copyVariationValue'),edge.indexOf('function validate('));const parse=new Function(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return copyVariationValue;')();
test('copy parser handles structured and fenced variations without saving metadata or blank values',()=>{
for(const raw of ['{"value":"Welcome home."}','```json\n{"value":"Welcome home."}\n```','{"heroMessage":"Welcome home."}','Welcome home.'])assert.equal(parse(raw,'heroMessage'),'Welcome home.');
for(const raw of ['','{"value":" "}','{"id":"response_123"}','{"value":','[]'])assert.equal(parse(raw,'heroMessage'),'');
});
test('regeneration retries empty output once and keeps refusals and partial output out of saved copy',()=>{
const block=edge.slice(edge.indexOf('if (input?.mode === "regenerate")'),edge.indexOf('// File fallback:'));assert.match(block,/attempt < 2/);assert.match(block,/payload.status === "incomplete"/);assert.match(block,/part.type === "refusal"/);assert.match(block,/if \(!value\) return reply/);assert.doesNotMatch(block,/rawPreview/);
});
