import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Greedy,inheritedModel,solutionText} from '../src/aligned.js';
import {readPopulation,merit} from '../upstream/organon/src/population.js';
export function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aligned-greedy-'));
 fs.mkdirSync(path.join(root,'evaluator'));
 fs.writeFileSync(path.join(root,'evaluator/evaluator.py'),'def evaluate(p):\n return {"combined_score": 7}\n');
 fs.writeFileSync(path.join(root,'task.json'),JSON.stringify({program:'solution.cpp',timeout:10,max_retries:0,sandbox:false}));
 fs.writeFileSync(path.join(root,'statement.md'),'Improve this program.');
 fs.writeFileSync(path.join(root,'solution.cpp'),'// #EVOLVE_START\nint main(){}\n// #EVOLVE_END\n');
 const calls=[];
 const llm={async *stream(options){calls.push(options);yield {type:'block-end',index:0,block:{type:'text',text:'```cpp\n// #EVOLVE_START\nint main(){return 0;}\n// #EVOLVE_END\n```'}};yield {type:'usage',usage:{inputTokens:5,outputTokens:5}};yield {type:'finish',reason:{kind:'stop'}};}};
 const agent={options:{provider:'fixture',model:'model',maxTokens:100},session:{header:{cwd:root}}};
 return {root,calls,llm,agent,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('Bo4 freezes parent, baseline free, final partial batch, pinned budgets and no baseline replay',async()=>{
 const f=fixture();try{
  let evaluations=0;const service=new Greedy({llm:f.llm},async c=>{evaluations++;return Number(c.id.slice(1))+1;});
  const result=await service.run({max_budget:5},{agent:f.agent});
  assert.equal(result.budget.used,5);assert.equal(evaluations,6);assert.equal(f.calls.length,5);
  const rows=await readPopulation(path.join(f.root,'run'));
  assert.deepEqual(rows.slice(1,5).map(r=>r.parent),Array(4).fill('c000000'));
  assert.equal(rows[5].parent,'c000004');assert.equal(result.champion.id,'c000005');
  await service.run({max_budget:5},{agent:f.agent});assert.equal(evaluations,6);
  await assert.rejects(service.run({max_budget:6},{agent:f.agent}),/cannot be changed/);
 }finally{f.cleanup();}
});
test('chunk continuation and settled invalid generation retain copied parent',async()=>{
 const f=fixture();try{
  f.llm.stream=async function*(){yield {type:'usage',usage:{inputTokens:1,outputTokens:1}};yield {type:'finish',reason:{kind:'stop'}};};
  const service=new Greedy({llm:f.llm},async()=>-10);
  await service.run({max_budget:3,candidates:1},{agent:f.agent});
  const result=await service.run({max_budget:3},{agent:f.agent});
  assert.equal(result.champion.id,'c000000');assert.equal(result.budget.used,3);
  assert.ok(fs.existsSync(path.join(f.root,'run/requests/c000001/generation_error.json')));
 }finally{f.cleanup();}
});
test('unknown model outcome blocks retry',async()=>{
 const f=fixture();try{
  f.llm.stream=async function*(){throw new Error('network unknown');};
  const service=new Greedy({llm:f.llm},async()=>1);
  await assert.rejects(service.run({max_budget:1},{agent:f.agent}),/unsettled/);
  await assert.rejects(service.run({max_budget:1},{agent:f.agent}),/replay prohibited/);
 }finally{f.cleanup();}
});
test('Organon merit, model inheritance, edit boundary',()=>{
 assert.ok(merit(-5)>merit(-20));assert.ok(merit(-20)>merit(0));
 assert.deepEqual(inheritedModel({options:{provider:'old',model:'old',reasoningEffort:'low',maxTokens:42},session:{requestHeader:()=>({config:{provider:'new',model:'new'}})}}),{provider:'new',model:'new',maxTokens:42});
 assert.throws(()=>solutionText('```cpp\nchanged\n```','original'),/EVOLVE/);
});
