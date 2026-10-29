// Fixed Bo4 orchestration over unchanged Organon storage and evaluation modules.
import fs from 'node:fs';
import path from 'node:path';
import {runPaths,copyTask,allocateCandidate,candidatePath,candidateOrdinals} from '../upstream/organon/src/candidates.js';
import {pinBudget,budgetReport,budgetStatus} from '../upstream/organon/src/budget.js';
import {readPopulation,writePopulation,merit} from '../upstream/organon/src/population.js';
import {filesOf} from '../upstream/organon/src/files.js';
import {evaluate} from '../upstream/organon/src/providers/evaluate.js';
import {defaultPersona,defaultInstruction} from '../upstream/organon/src/providers/mutate.js';
import {generate} from './model.js';
import {write,append,hash} from './store.js';

export function inheritedModel(agent) {
  const options=agent.options ?? {}, request=agent.session.requestHeader?.()?.config;
  const current=request ?? options;
  return Object.fromEntries(Object.entries({provider:current.provider,model:current.model,
    reasoningEffort:current.reasoningEffort,maxTokens:options.maxTokens}).filter(([,v])=>v!==undefined));
}
export function solutionText(text,parent) {
  const blocks=[...text.matchAll(/```(?:cpp|c\+\+)\s*\n([\s\S]*?)```/g)];
  if(blocks.length!==1) throw new Error('Expected one complete cpp block');
  const code=blocks[0][1].replace(/\r\n/g,'\n'), original=parent.replace(/\r\n/g,'\n');
  const region=s=>s.match(/^([\s\S]*?^.*?#EVOLVE_START[^\n]*\n)([\s\S]*?)(^.*?#EVOLVE_END[^\n]*(?:\n[\s\S]*)?)$/m);
  const a=region(original),b=region(code);
  if(!a || !b || a[1]!==b[1] || a[3].trimEnd()!==b[3].trimEnd()) throw new Error('Only the EVOLVE region may change');
  return a[1]+b[2]+a[3];
}
export class Greedy {
  constructor(ctx,evaluator=evaluate) {this.ctx=ctx;this.evaluator=evaluator;}
  async status(agent) {
    const {root}=runPaths(agent), rows=await readPopulation(root);
    return {budget:await budgetReport(root),champion:rows.find(r=>r.survival==='yes')??null,
      blocked:fs.existsSync(path.join(root,'greedy.pending.json')),paused:fs.existsSync(path.join(root,'PAUSE'))};
  }
  pause(agent) {const {root}=runPaths(agent);fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'PAUSE'),'');return {pause_requested:true};}
  async run({max_budget,candidates=max_budget,resume=false}, {agent,signal=new AbortController().signal}) {
    for(const [key,n] of Object.entries({max_budget,candidates})) if(!Number.isSafeInteger(n)||n<1||n>999999) throw new Error(`${key} must be 1..999999`);
    const paths=runPaths(agent),task=fs.realpathSync(paths.task),root=path.join(task,'run');
    const settings=JSON.parse(fs.readFileSync(path.join(task,'task.json'),'utf8'));
    if(typeof settings.program!=='string'||path.isAbsolute(settings.program)||settings.program.split(/[\\/]/).includes('..')) throw new Error('Invalid task program');
    const statement=fs.readFileSync(path.join(task,'statement.md'),'utf8');
    const fingerprint=hash(JSON.stringify([fs.readFileSync(path.join(task,'task.json'),'utf8'),statement,fs.readFileSync(path.join(task,settings.program),'utf8'),fs.readFileSync(path.join(task,'evaluator/evaluator.py'),'utf8')]));
    fs.mkdirSync(root,{recursive:true});
    const lock=path.join(root,'greedy.lock'),fd=fs.openSync(lock,'wx');
    const files=filesOf(root),pending=path.join(root,'greedy.pending.json');
    try {
      const identity=await files.read('greedy.identity.json');
      if(identity===undefined) {
        if((await candidateOrdinals(root)).length || (await readPopulation(root)).length || await files.exists('budget.json')) throw new Error('Existing foreign run: use a fresh task copy');
        await files.write('greedy.identity.json',JSON.stringify({version:2,fingerprint}));
      } else if(JSON.parse(identity).fingerprint!==fingerprint) throw new Error('Task changed since initialization');
      if(fs.existsSync(pending)) throw new Error('Unsettled operation requires audit; automatic replay prohibited');
      await pinBudget(root,max_budget);
      if(resume) fs.rmSync(path.join(root,'PAUSE'),{force:true});
      let rows=await readPopulation(root);
      const facade={ctx:this.ctx,files,currentRun:()=>({task,agent,signal})};
      const score=async c=>{const fitness=await this.evaluator({id:c.id,dir:c.path},facade);if(!Number.isFinite(fitness))throw new Error('Nonfinite evaluator fitness');return fitness;};
      if(!rows.length) {
        write(pending,{phase:'baseline'});
        const c=await copyTask(root,task),fitness=await score(c);
        rows=[{id:c.id,parent:null,fitness,survival:'yes'}];
        await writePopulation(root,rows);fs.unlinkSync(pending);
      }
      let done=0;
      while(done<candidates && (await budgetStatus(root,max_budget)).remaining>0 && !fs.existsSync(path.join(root,'PAUSE'))) {
        signal.throwIfAborted();
        const parent=rows.find(r=>r.survival==='yes');
        if(!parent) throw new Error('Missing champion');
        const n=Math.min(4,candidates-done,(await budgetStatus(root,max_budget)).remaining);
        write(pending,{phase:'batch',parent:parent.id,count:n});
        const batch=[];
        for(let i=0;i<n;i++)batch.push(await allocateCandidate(root,max_budget,parent.id));
        const results=await Promise.allSettled(batch.map(async c=>{
          const file=path.join(c.path,settings.program),source=fs.readFileSync(file,'utf8');
          const options={...inheritedModel(agent),signal,system:defaultPersona(),messages:[{role:'user',content:[{type:'text',text:
            defaultInstruction(parent.fitness)+'\n\nThe files are supplied inline. Return exactly one complete solution in a cpp fenced block, including both EVOLVE markers.\n\nTASK:\n'+statement+'\n\nPARENT SOLUTION:\n'+source}]}]};
          const requestDir=path.join(root,'requests',c.id);fs.mkdirSync(requestDir,{recursive:true});
          write(path.join(requestDir,'intent.json'),{...options,signal:undefined,parent:parent.id});
          const response=await generate(this.ctx.llm,options,chunk=>append(path.join(requestDir,'stream.jsonl'),chunk));
          write(path.join(requestDir,'response.json'),response);
          // Like Organon's failed worker, a settled malformed response leaves the copied parent for evaluation.
          try {if(response.finish!=='stop')throw new Error('Truncated generation');fs.writeFileSync(file,solutionText(response.text,source));}
          catch(error){write(path.join(requestDir,'generation_error.json'),{error:String(error)});}
          const fitness=await score(c);
          return {id:c.id,parent:parent.id,fitness,survival:'no'};
        }));
        const errors=results.filter(r=>r.status==='rejected');
        if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Batch unsettled; saved artifacts require audit');
        const children=results.map(r=>r.value);let best=parent;
        for(const child of children)if(merit(child.fitness)>merit(best.fitness))best=child;
        rows.push(...children);for(const row of rows)row.survival=row.id===best.id?'yes':'no';
        await writePopulation(root,rows);fs.unlinkSync(pending);done+=n;
      }
      return {...await this.status(agent),generated:done};
    } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
  }
}
