import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
export async function verifyHost(ctx,dir){
 const report={at:new Date().toISOString(),kind:'DSH host registry invocation, synthetic session, no chat model',calls:[]};
 const context={agent:{session:{id:'phase2-acceptance'},options:{}},signal:AbortSignal.timeout(60000),callId:randomUUID()};
 async function run(name,args={},summarize=()=>true){
  try{const tool=ctx.tools.get(name);if(!tool)throw Error('tool not registered');const result=await tool.execute(args,context);if(result?.isError)throw Error('tool returned isError');report.calls.push({name,ok:true,result:summarize(result)});return result;}
  catch(err){report.calls.push({name,ok:false,error:String(err.message).slice(0,180)});}
 }
 try{for(let i=0;i<30&&!ctx.tools.schemas().some(t=>t.name.includes('list_knowledge_files'));i++)await delay(1000);
 await run('local_memory_status',{},x=>x.queue);await run('media_connections',{},x=>x.connections.length);
 await run('local_memory_search',{query:'昵称'},x=>({hits:x.records.length,withSource:x.records.every(r=>Boolean(r.source))}));
 const novel=ctx.tools.schemas().find(t=>t.name.includes('list_knowledge_files'));await run(novel?.name||'novel tool missing',{});
 const read=ctx.tools.schemas().find(t=>t.name.includes('read_knowledge_file'));if(read&&process.env.DSH_PHASE2_NOVEL_FILE)await run(read.name,{file:process.env.DSH_PHASE2_NOVEL_FILE},x=>({responseBytes:Buffer.byteLength(JSON.stringify(x))}));
 await run('media_local_motion',{title:'潮汐之间',caption:'光从海平面升起',duration:6},x=>x);
 const job=await run('media_local_comfy',{action:'submit',template:'probe'},x=>x);if(job?.id){for(let n=0;n<10;n++){await delay(500);const x=await run('media_local_comfy',{action:'poll',id:job.id},v=>v);if(x?.file)break;}}
 }finally{fs.writeFileSync(path.join(dir,'host-test.json'),JSON.stringify(report,null,2));}
}
