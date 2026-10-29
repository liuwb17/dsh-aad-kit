import {defineTool} from '@deepseek-ai/dsh-tools';
import {Greedy} from './aligned.js';
export const name='dsh-aad-greedy';
export const inject=['llm','tools','subprocess'];
export function apply(ctx) {
  const service=new Greedy(ctx);
  ctx.provide('aadGreedy',service);
  const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
  const tool=(name,description,parameters,execute)=>ctx.tools.register(defineTool({name,description,parameters,output,execute}));
  tool('greedy_run','Run fixed greedy Bo4 on the Organon task in session cwd. Baseline is free; each allocated child costs one candidate. Uses the session model. No RSI. Makes model and evaluator calls.',
    {max_budget:{type:'integer',required:true,description:'Pinned total candidate budget (1..999999).'},candidates:{type:'integer',description:'Candidates to generate in this invocation; defaults to remaining budget.'},resume:{type:'boolean',description:'Clear an explicitly requested pause; never replay unresolved operations.'}},
    (args,exec)=>service.run(args,exec));
  tool('greedy_status','Read budget and champion without model/evaluation calls.',{},(_args,exec)=>service.status(exec.agent));
  tool('greedy_pause','Pause after the current batch drains.',{},(_args,exec)=>service.pause(exec.agent));
}
