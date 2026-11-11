import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
export async function verify3(ctx,dir,root){
 fs.mkdirSync(dir,{recursive:true});const report={at:new Date().toISOString(),level:'真实 DSH 注册工具调用，合成验收会话，未调用聊天模型或收费云接口',calls:[]};
 const exec={agent:{session:{id:'media3-acceptance'},options:{}},callId:'media3-workflow-acceptance-v1',signal:AbortSignal.timeout(240000)};
 async function invoke(name,args){const started=Date.now();const tool=ctx.tools.get(name);if(!tool)throw Error('工具未注册 '+name);const r=await tool.execute(args,exec);if(r?.isError)throw Error('工具失败 '+JSON.stringify(r));report.calls.push({name,args,result:r,ms:Date.now()-started});fs.writeFileSync(path.join(dir,'host3.json'),JSON.stringify(report,null,2));return r;}
 try{
  await invoke('media_capabilities',{});
  const settings=await invoke('media_workflow',{action:'list'});const instance=settings.instances.find(x=>x.id==='local')||settings.instances[0];
  const model='v1-5-pruned-emaonly.safetensors';
  const priorDir=root?path.join(root,'workflows3/jobs'):null;const prior=priorDir&&fs.existsSync(priorDir)?fs.readdirSync(priorDir).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(priorDir,x)))).find(x=>x.owner==='media3-acceptance'):null;
  const p=prior||await invoke('media_workflow',{action:'submit',instanceId:instance.id,templateId:'txt2img',valuesJSON:JSON.stringify({model,prompt:'A beautiful watercolor painting of a mountain lake, small wooden cabin, pine trees, golden morning light, detailed illustration',width:512,height:512,seed:671042,steps:16})});
  for(let i=0;i<90;i++){await delay(2000);const r=await invoke('media_workflow',{action:'poll',id:p.id});if(r.status==='completed'){fs.copyFileSync(r.files[0].path,path.join(dir,'lake.png'));break;}if(i===89)throw Error('工作流超时');}
  exec.callId='media3-pipeline-acceptance-v1';const pipeline=await invoke('media_pipeline',{action:'create',prompt:'Watercolor painting of a lighthouse on a rocky island at sunset, calm sea, cinematic composition',model,seconds:5});
  for(let i=0;i<100;i++){await delay(2000);const r=await invoke('media_pipeline',{action:'resume',id:pipeline.id});if(r.state==='completed'){for(const f of r.files)fs.copyFileSync(f.path,path.join(dir,f.name));break;}if(['blocked','uncertain'].includes(r.state))throw Error(r.error);if(i===99)throw Error('编排超时');}
  for(let i=0;i<20&&!ctx.tools.get('local_memory_status');i++)await delay(1000);
  if(ctx.tools.get('local_memory_status'))await invoke('local_memory_status',{});
  const novel=ctx.tools.schemas().find(t=>t.name.includes('list_knowledge_files'));if(novel)await invoke(novel.name,{});
  report.ok=true;
 }catch(e){report.ok=false;report.error=e.message;}
 finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(dir,'host3.json'),JSON.stringify(report,null,2));}
}
