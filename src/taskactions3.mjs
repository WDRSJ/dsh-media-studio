import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
export async function taskAction3(ctx,root,{type,id,operation,stageId}){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!['query','resume','cancel','pause','retry'].includes(operation)||['pause','retry'].includes(operation)&&type!=='pipeline')throw Error('任务编号或操作无效');
 if(operation==='retry'&&!/^[A-Za-z][A-Za-z0-9_-]{0,48}$/.test(stageId||''))throw Error('重试需要有效阶段编号');
 let owner,tool,args;
 if(type==='workflow'){
  const file=path.join(root,'workflows3','jobs',id+'.json');if(!fs.existsSync(file))throw Error('任务不存在');owner=JSON.parse(fs.readFileSync(file)).owner;tool='media_workflow';args={action:operation==='cancel'?'cancel':operation==='resume'?'resume':'poll',id};
 }else if(['pipeline','cloud'].includes(type)){
  const file=path.join(root,type==='pipeline'?'pipelines-v3/jobs.sqlite':'tasks.sqlite');if(!fs.existsSync(file))throw Error('任务不存在');
  const db=new DatabaseSync(file,{readOnly:true});try{owner=db.prepare('SELECT owner FROM '+(type==='pipeline'?'jobs':'tasks')+' WHERE id=?').get(id)?.owner;}finally{db.close();}
  tool=type==='pipeline'?'media_pipeline':operation==='cancel'?'media_cancel':'media_task';args=type==='pipeline'?{action:operation==='query'?'get':operation==='resume'?'continue':operation,id,...operation==='retry'?{stageId}:{}}:{id,resume:operation==='resume'};
 }else throw Error('任务类别无效');
 if(!owner)throw Error('任务不存在');const agent=ctx.agents?.get(owner);if(!agent)throw Error('请先打开任务原聊天，再查询、恢复或停止');
 const target=ctx.tools.get(tool);if(!target)throw Error('任务工具未加载');
 const result=await target.execute(args,{agent,callId:'history-'+id+'-'+operation,signal:AbortSignal.timeout(120000)});
 if(result?.isError)throw Error('任务操作失败');return result;
}
