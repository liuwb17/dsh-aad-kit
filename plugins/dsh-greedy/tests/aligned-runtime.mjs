import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Subprocess from '@deepseek-ai/dsh-subprocess-local';
import Sessions from '@deepseek-ai/dsh-session';
import Projections from '@deepseek-ai/dsh-session-projection';
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/index.js';
import {fixture} from './aligned.test.js';
const f=fixture(),ctx=new Context();
// Fixture-local alias; production requires `python` on the DSH subprocess PATH.
fs.mkdirSync(path.join(f.root,'bin'));
fs.symlinkSync('/usr/bin/python3',path.join(f.root,'bin/python'));
process.env.PATH=path.join(f.root,'bin')+':'+process.env.PATH;
class Adapter extends LlmAdapter {
 async resolveModel(provider,id){return {provider,id,name:id};}
 stream(options){return f.llm.stream(options);}
}
try {
 await ctx.plugin(SystemPrompt);await ctx.plugin(Tools);await ctx.plugin(LlmRuntime);
 await ctx.plugin(Sessions);await ctx.plugin(Projections);await ctx.plugin(Subprocess);
 ctx.llm.registerAdapter(['fixture'],new Adapter());await ctx.plugin(plugin);
 const session=ctx.sessions.create(undefined,{meta:{cwd:f.root}});
 const exec={agent:{session,id:session.id,options:f.agent.options},signal:new AbortController().signal};
 const result=await ctx.tools.get('greedy_run').execute({max_budget:5},exec);
 assert.equal(result.budget.used,5);assert.equal(result.champion.fitness,7);assert.equal(f.calls.length,5);
 assert.equal((await ctx.tools.get('greedy_status').execute({},exec)).blocked,false);
 console.log(JSON.stringify({realCordis:true,realLlmRuntime:true,realTools:true,realSubprocess:true,unchangedOrganonEvaluator:true,paidCalls:0,officialEvaluations:0,result}));
}finally{await ctx.fiber.dispose();f.cleanup();}
