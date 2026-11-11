import {storeAutoPipeline31,readAutoPipeline31} from './auto-pipeline31.mjs';
import {atomicJSON} from './policy3.mjs';
import {studioImage31,imageBinding31,bindStudioImage31,bindStudioMedia31} from './input31.mjs';
import {validateWorkflowInput54} from './media-transfer54.mjs';
import {pipelineEstimate31} from './pipeline-billing31.mjs';
import {cloudExecutor31} from './cloud-executor31.mjs';
import {autoDecision3} from './auto3.mjs';
import {recoverableTasks} from './recovery3.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {workflowTool,workflowAdmin,workflowDefinition31,checkpointBinding31} from './workflows3.mjs';
import {inventory31} from './inventory31.mjs';
import {pipeline3} from './pipeline3.mjs';
import {enforce,loadSettings3,effectiveMode} from './policy3.mjs';
import {comfy as legacyComfy} from './comfy.mjs';
import {activePlan3,workflowPlanValues31} from './plans3.mjs';
import {mediaDeliveries} from './delivery3.mjs';

export async function registerNative3(ctx,runtime,defineTool){
 runtime.quarantineInterruptedSubmissions?.();
 const root=runtime.root,runners=new Map(),routes=new Map();let stopped=false;
 const deliver=mediaDeliveries(ctx,root);
 const artifactKeyFile=path.join(root,'artifact.key');if(!fs.existsSync(artifactKeyFile))fs.writeFileSync(artifactKeyFile,randomBytes(32),{flag:'wx'});const artifactKey=fs.readFileSync(artifactKeyFile);
 const output={schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]};
 const ownerOf=exec=>{const owner=exec.agent?.session?.id;if(!owner)throw Error('需要会话身份');return owner;};
 function artifacts(value){
  const files=value.files||value.stages?.filter(s=>s.output).map(s=>({path:s.output.file,kind:s.output.kind}))||[];
  const hybrid=value.stages?.some(s=>s.executor==='cloud-media');
  return {...value,estimateCNY:hybrid?pipelineEstimate31(value.stages):0,costLabel:hybrid?'含云端阶段，金额为估算，实扣待结算':'本地执行，无云端生成费用',files:files.map(f=>{
   const filename=f.path;if(!filename||!fs.existsSync(filename))return f;
   if(!routes.has(filename)){
    const url='/media-studio/local-artifact/'+createHmac('sha256',artifactKey).update(filename).digest('hex');
    const dispose=ctx.webServer.register({kind:'exact',path:url,handler:async(req,res)=>{
     if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
     const stat=fs.statSync(filename),ext=path.extname(filename).toLowerCase();res.setHeader('content-type',({'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.wav':'audio/wav','.flac':'audio/flac','.mp3':'audio/mpeg','.opus':'audio/ogg','.ogg':'audio/ogg','.m4a':'audio/mp4','.webm':'video/webm'})[ext]||'application/octet-stream');res.setHeader('x-content-type-options','nosniff');res.setHeader('cache-control','no-store');res.setHeader('content-length',stat.size);
     if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }});routes.set(filename,{url,dispose});
   }
   const stage=value.stages?.find(s=>s.output?.file===filename),reference=stage&&stage.output.kind==='image'?'studio://pipeline/'+value.id+'/'+stage.id:!value.stages&&value.id&&/\.(png|jpg|webp)$/i.test(filename)&&fs.existsSync(path.join(root,'workflows3/jobs',value.id+'.json'))?'studio://workflow/'+value.id+'/'+files.indexOf(f):undefined;return {...f,...reference?{reference}: {},url:routes.get(filename).url,name:path.basename(filename),kind:f.kind||(/\.(mp4|webm)$/i.test(filename)?'video':/\.(wav|flac|mp3|opus|ogg|m4a)$/i.test(filename)?'audio':'image')};
  })};
 }
 // Re-register completed artifacts so links issued by this version survive reloads.
 const completedDir=path.join(root,'workflows3','jobs');
 if(fs.existsSync(completedDir))for(const file of fs.readdirSync(completedDir).filter(f=>f.endsWith('.json')))try{const j=JSON.parse(fs.readFileSync(path.join(completedDir,file)));if(j.status==='completed')artifacts({files:j.files||[]});}catch{}
 const pipelineDB=path.join(root,'pipelines-v3','jobs.sqlite');
 if(fs.existsSync(pipelineDB)){const db=new DatabaseSync(pipelineDB,{readOnly:true});try{for(const r of db.prepare('SELECT plan FROM jobs').all())try{artifacts(JSON.parse(r.plan));}catch{}}finally{db.close();}}
 const authorize=(owner,call)=>({kind,source})=>enforce(root,kind,source,owner,call);
 const cloudCall=cloudExecutor31(runtime,{getAgent:owner=>ctx.agents.get(owner),ask:q=>ctx.userQuestions.ask(q)});
 const pipelineComfy=async(_root,a,owner)=>{
  if(a.action==='reconcile'){
   const id=createHash('sha256').update(owner+'\0'+a.requestId).digest('hex').slice(0,32),file=path.join(root,'workflows3','jobs',id+'.json');
   if(!fs.existsSync(file))return{state:'uncertain'};
   const j=JSON.parse(fs.readFileSync(file));
   if(j.owner!==owner||j.templateId!==a.templateId||j.instance?.id!==(a.instanceId||'local')||(j.kind||'image')!==a.kind||a.workflowVersion!==undefined&&j.version!==a.workflowVersion)throw Error('原本地工作流回执与阶段不匹配');
   return{id:j.id,promptId:j.promptId,state:j.status};
  }
  if(a.canContinue&&!a.canContinue())return{paused:true};
  if(a.action==='poll'&&a.id.length===36)return legacyComfy(root,a,owner);
  const values=a.workflow?{...a.values}:Object.fromEntries(Object.entries({prompt:a.prompt,model:a.model,width:a.width,height:a.height}).filter(([,value])=>value!==undefined&&value!==''));
  if(a.action==='submit'&&a.workflow){
   const t=workflowDefinition31(root,a.templateId);if(a.workflowVersion!==undefined&&t.version!==a.workflowVersion)return{preflightFailure:true,error:'联合阶段工作流版本变化，未上传或提交；请检查方案'};if(t.kind!==a.kind)throw Error('联合阶段工作流媒体类别不匹配');
   for(const [alias,input]of Object.entries(a.inputs||{})){
    const {port}=validateWorkflowInput54(t,alias,input?.kind);
    if(!input?.sha256)throw Error('联合阶段输入缺少归档校验');
    let image;
    if(input.reference){
     const inst=loadSettings3(root).instances.find(i=>i.id===a.instanceId);
     image=await bindStudioMedia31(root,{reference:input.reference,sha256:input.sha256},owner,a.requestId,{instanceId:a.instanceId,instanceUrl:inst?.url,templateId:t.id,version:t.version,alias,kind:port.kind},(b64,kind)=>workflowAdmin(root,{action:'upload',instanceId:a.instanceId,kind,dataBase64:b64}),{kind:port.kind});
    }else{
     if(!input.file||!fs.existsSync(input.file)||createHash('sha256').update(fs.readFileSync(input.file)).digest('hex')!==input.sha256)throw Error('联合阶段输入归档校验失败');
     const uploaded=await workflowAdmin(root,{action:'upload',instanceId:a.instanceId,kind:port.kind,dataBase64:fs.readFileSync(input.file).toString('base64')});if(uploaded.kind!==port.kind)throw Error('联合素材上传类型与输入端口不匹配');image=uploaded.image;
    }
    values[alias]=image;
   }
  }
  if(a.canContinue&&!a.canContinue())return{paused:true};
  const result=await workflowTool(root,a.action==='submit'?{action:'submit',templateId:a.templateId||'txt2img',instanceId:a.instanceId||'local',requestId:a.requestId,expectedVersion:a.workflowVersion,values}:a,owner);
  if(result.files&&(result.files.length!==1||result.files[0].kind!==a.kind))throw Error('联合阶段需要一个与声明用途一致的已验证目标产物；请明确选择输出');return {...result,state:result.status,file:result.files?.[0]?.path};
 };

 async function workflow(args,owner,call){
  let a={...args};
  if(a.action==='submit'){
   const initial=activePlan3(root,a.kind||'image'),templateId=a.templateId||initial?.workflowId||'txt2img',t=workflowDefinition31(root,templateId),candidate=activePlan3(root,t.kind),p=candidate?.workflowId&&candidate.workflowId!==templateId?null:candidate;
   enforce(root,t.kind,'local',owner,call);
   a={...a,templateId,instanceId:a.instanceId||p?.instanceId||t.instanceId||'local',values:workflowPlanValues31(root,p,templateId,a.values||{}),requestId:call};
   const inst=loadSettings3(root).instances.find(i=>i.id===a.instanceId);
   const remote=inst&&!['localhost','127.0.0.1','[::1]'].includes(new URL(inst.url).hostname);
   a.allowRemote=false;
   if(remote){
    if(!inst.trusted)throw Error('远程实例未获得信任，不会发送工作流或素材');
    const agent=ctx.agents?.get(owner);if(!agent||!ctx.userQuestions)throw Error('远程执行需在原会话中明确确认');
    const answer=await ctx.userQuestions.ask({agent,questions:[{id:'remote-comfy',header:'远程工作流',question:'将向 '+inst.url+' 发送工作流参数和素材引用。仅允许已授权的 ComfyUI 执行，不允许收费 API 节点。请确认实例归属和运行成本；此确认不授予云端媒体生成费用。',options:[{label:'仅允许本次远程执行'},{label:'取消'}]}]});
    if(!answer.answers?.some(v=>v.id==='remote-comfy'&&!v.custom&&v.selected?.includes('仅允许本次远程执行')))throw Error('用户取消远程工作流，未提交');
    a.allowRemote=true;
   }
  }else a.allowRemote=true; // Only owner-bound original receipts may be queried.
  return artifacts(await workflowTool(root,a,owner));
 }
 function follow(type,id,owner,call){
  if(ctx.agents&&!ctx.agents.get(owner))return null;
  const key=type+':'+id;if(runners.has(key))return runners.get(key).job;
  const abort=new AbortController();const entry={abort};runners.set(key,entry);
  let job;try{job=ctx.jobs.start({owner,kind:'media',label:'本地媒体 '+id.slice(0,8),outputLimitBytes:2500,run(handle){
   const done=(async()=>{try{
    while(!stopped&&!abort.signal.aborted){
     const result=type==='workflow'?await workflow({action:'poll',id},owner,call):artifacts(await pipeline3(root,{action:'resume',id},owner,{authorize:authorize(owner,call),comfyCall:pipelineComfy,cloudCall}));
     const status=result.status||result.state;
     if(['completed','failed','blocked','uncertain','cancelled','cancel-requested','paused'].includes(status)){
      try{deliver(result,owner,type+':'+id);}catch(e){console.warn('Media file delivery deferred: '+e.message);}
      const files=(result.files||[]).map(({path,url,name,kind,bytes,sha256})=>({path,url,name,kind,bytes,sha256}));
      handle.append(JSON.stringify({id,type,status,tool:type==='workflow'?'media_workflow':'media_pipeline',action:type==='workflow'?'poll':'get',files,estimateCNY:result.estimateCNY,costLabel:result.costLabel,message:files.length?'成品已有原生文件卡片；聊天请用 files.path 完整路径引用，files.url 仅供控制台播放，不用于 Markdown 图片。只查询原任务，禁止重复生成':'请查询原任务并交付成品，禁止重复生成'})+'\n');return {status:['completed','paused'].includes(status)?'completed':'failed',result:JSON.stringify({id,status,files})};
     }
     handle.updateProgress('本地服务处理中，原任务 '+id.slice(0,8));await delay(2000,undefined,{signal:abort.signal});
    }return {status:'killed',detail:'本机跟进暂停，原任务保留'};
   }catch(e){return {status:'failed',detail:e.message};}finally{runners.delete(key);}})();entry.done=done;return {done,cancel(){abort.abort();}};
  }});}catch(e){runners.delete(key);ctx.logger?.warn?.('Media background tracking unavailable: '+e.message);return null;}entry.job=job;return job;
 }
 const withFollow=(type,result,owner,call)=>{const jobId=follow(type,result.id,owner,call);if(jobId&&type==='workflow')try{const file=path.join(root,'workflows3/jobs',result.id+'.json');if(fs.existsSync(file)){const job=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(file,JSON.stringify({...job,jobId},null,2)+'\n');}}catch{}return {...result,taskId:result.id,backgroundJobId:jobId,jobId,...jobId?{}:{backgroundWarning:'后台跟进未启动，原任务已保留。请查询原任务，禁止重复生成。'}};};
 // Sessions may load after plugins, so periodically revisit persisted work.
 const recovered=new Set();
 function recover() {
  if(stopped||!ctx.agents||!ctx.jobs)return;
  try {for(const task of recoverableTasks(root)) {
   const key=task.type+':'+task.id;
   if(!recovered.has(key)&&ctx.agents.get(task.owner)){const job=follow(task.type,task.id,task.owner,task.call);if(job)recovered.add(key);}
  }}catch(e){ctx.logger?.warn?.('Media task recovery: '+e.message);}
 }
 const recoveryTimer=setInterval(recover,15000);recoveryTimer.unref?.();
 ctx.effect(()=>()=>clearInterval(recoveryTimer));
 recover();
 const register=tool=>ctx.effect(()=>ctx.tools.register(defineTool({...tool,output})));
 register({name:'media_capabilities',description:'一次查询当前执行模式、所有已授权实例的加载器模型（不只 checkpoints）、工作流依赖/状态、真实完成回执和云端连接；不包含凭证。没有检测到的模型不能声称可用。',parameters:{refresh:{type:'boolean'}},async execute(args){const s=loadSettings3(root),inventory=await inventory31(root,{refresh:args.refresh===true});return {settings:{mode:s.mode,kinds:s.kinds,sessionBudgetCNY:s.sessionBudgetCNY},inventory,summary:inventory.summary};}});
 register({name:'media_workflow_manage',description:'管理工作流：自动导入/转换/绑定（autoPrepare）、ComfyUI 用户工作流读取/导入/同步/冲突/打开（comfyList/comfyRead/comfyImport/comfySync/comfyPull/comfyOpen/comfyStatus）；describeOutputs/selectOutputs/reviewOutput；import/confirmImport/save/convert/export/exportGUI/copy/enable/list/versions/restore/parameters/catalog。图形导出只返回文件内容，不自动执行或下载模型。',parameters:{action:{type:'string',required:true},templateId:{type:'string'},instanceId:{type:'string'},id:{type:'string'},name:{type:'string'},previewId:{type:'string'},documentJSON:{type:'string'},mappingsJSON:{type:'string'},expectedVersion:{type:'integer'},version:{type:'integer'},enabled:{type:'boolean'},kind:{type:'string'},file:{type:'string'},allowRemote:{type:'boolean'},overwrite:{type:'boolean'},apply:{type:'string'},refresh:{type:'boolean'}},async execute(args,exec){
  ownerOf(exec);
  if(!['inventory','import','save','convert','autoPrepare','comfyList','comfyRead','comfyImport','comfySync','comfyPull','comfyOpen','comfyStatus','export','exportGUI','copy','enable','list','versions','restore','parameters','catalog','rename','requirements','exportPortable','importPortable','confirmImport','cancelImport','selectOutputs','describeOutputs','reviewOutput','reviewNode'].includes(args.action))throw Error('不支持的管理操作');
  if(args.action==='inventory')return inventory31(root,{refresh:args.refresh===true});
  const normalized=args.action==='parameters'&&!args.templateId&&args.id?{...args,templateId:args.id}:args;const document=normalized.documentJSON?JSON.parse(normalized.documentJSON):undefined;return workflowAdmin(root,{...normalized,...normalized.action==='reviewNode'?{node:document?.node,definitionHash:document?.definitionHash,acknowledgeLocalOnly:document?.acknowledgeLocalOnly}:{},document,mappings:normalized.mappingsJSON?JSON.parse(normalized.mappingsJSON):undefined});
 }});
 register({name:'media_workflow',description:'本地 ComfyUI 多实例工作流。list/inspect/submit/poll/resume/cancel。valuesJSON 为已绑定参数。提交自动后台跟进，完成后 poll 返回成品播放器。不会自动切换收费渠道。',parameters:{action:{type:'string',required:true},id:{type:'string'},templateId:{type:'string'},instanceId:{type:'string'},expectedVersion:{type:'integer'},valuesJSON:{type:'string'}},async execute(args,exec){
  const owner=ownerOf(exec),values=JSON.parse(args.valuesJSON||'{}');const result=await workflow({...args,action:args.action==='resume'?'poll':args.action,values},owner,exec.callId);
  try{deliver(result,owner,'workflow:'+result.id);}catch(e){return{...result,deliveryWarning:e.message};}
  return ['submit','resume'].includes(args.action)&&['submitted','queued','running','unknown'].includes(result.status)?withFollow('workflow',result,owner,exec.callId):result;
 }});
 register({name:'media_pipeline',description:'本地图片生成→图片淡入淡出视频编排，不是扩散视频模型。create/get/resume/pause/continue/cancel/retry。retry须stageId且只允许确认失败的云端阶段，另建请求重新确认费用。pause仅停止后续，continue显式恢复；不撤回已提交阶段。按阶段留存结果，恢复不重提不确定任务。specJSON 可指定依赖图，支持本地图片、云端媒体和本地视频合成；云端阶段逐次请求费用授权。',parameters:{action:{type:'string',required:true},id:{type:'string'},prompt:{type:'string'},model:{type:'string'},seconds:{type:'number'},stageId:{type:'string'},specJSON:{type:'string'}},async execute(args,exec){
  const owner=ownerOf(exec);
  const spec=args.specJSON?JSON.parse(args.specJSON):undefined;
  if(args.action==='create'&&Array.isArray(spec))for(const stage of spec.filter(s=>['comfy-image','comfy-workflow'].includes(s.executor))){const id=stage.params?.instanceId||'local',i=loadSettings3(root).instances.find(i=>i.id===id);if(!i||!['127.0.0.1','localhost','[::1]'].includes(new URL(i.url).hostname))throw Error('联合工作流素材传递目前需配置本机实例；远程请在原聊天单独确认执行，不会先启动收费阶段');}
  const result=await pipeline3(root,{...args,callId:exec.callId,spec},owner,{authorize:authorize(owner,exec.callId),comfyCall:pipelineComfy,cloudCall});
  const value=artifacts(result);try{deliver(value,owner,'pipeline:'+result.id);}catch(e){value.deliveryWarning=e.message;}
  return ['create','resume','continue','retry'].includes(args.action)&&['pending','running','waiting'].includes(result.state)?withFollow('pipeline',value,owner,exec.callId):value;
 }});
 async function explicitWorkflow(args,exec,owner){
 const id=args.workflowId||args.templateId;if(!id)return null;
 const t=workflowDefinition31(root,id);
 if(!t.enabled||!t.graph)throw Error('指定的工作流尚未就绪：'+(t.availability?.reason||(t.diagnostics||[]).map(x=>x.message).join('；')||'需要自动转换、绑定或启用'));
 if(t.kind!==args.kind)throw Error('指定工作流的媒体类别为 '+t.kind+'，与请求 '+args.kind+' 不一致；不会静默替换');
 const instanceId=args.instanceId||t.instanceId||'local';const inst=loadSettings3(root).instances.find(i=>i.id===instanceId);
 if(!inst)throw Error('指定工作流的目标 ComfyUI 实例未配置：'+instanceId);
 enforce(root,t.kind,'local',owner,exec.callId);
 const m=t.mappings||{},values={};
 for(const [alias,arg] of [['prompt','prompt'],['negative','negative'],['width','width'],['height','height'],['steps','steps'],['seed','seed'],['cfg','cfg'],['fps','fps'],['lyrics','lyrics'],['duration','duration'],['quality','quality'],['format','format'],['model','model']])if(args[arg]!==undefined&&m[alias])values[alias]=args[arg];
 if(args.instrumental!==undefined&&m.instrumental)values.instrumental=args.instrumental;
 if(args.referenceImage&&m.image){const input=studioImage31(root,args.referenceImage,owner);if(!input)throw Error('本地参考图需要本会话已归档素材标识');values.image=await bindStudioImage31(root,input,owner,exec.callId,{instanceId:inst.id,instanceUrl:inst.url,templateId:t.id,version:t.version,values},dataBase64=>workflowAdmin(root,{action:'upload',instanceId:inst.id,dataBase64}));}
 const r=await workflow({action:'submit',kind:t.kind,templateId:t.id,expectedVersion:t.version,instanceId:inst.id,values},owner,exec.callId);
 return {...(r.status==='submitted'?withFollow('workflow',r,owner,exec.callId):r),selectedBackend:'Local',taskType:'local-workflow',message:'本地 ComfyUI 工作流任务；可用 media_task、media_history 或 media_workflow poll 查询同一 ID',decision:{selected:{workflowId:t.id,instanceId:inst.id,workflowVersion:t.version,source:'explicit',kind:t.kind}},selectionReason:'用户明确指定工作流 '+t.name,queryTool:'media_workflow',queryAction:'poll'};
}
async function route(args,exec){
  const owner=ownerOf(exec),mode=effectiveMode(root,args.kind,owner,exec.callId),plan=activePlan3(root,args.kind);
  if(args.workflowId||args.templateId){const explicit=await explicitWorkflow(args,exec,owner);if(explicit)return explicit;}
  if(args.executePlanId){
   if(mode!=='Auto')throw Error('执行Auto计划需要当前Auto模式');const record=readAutoPipeline31(root,args.executePlanId,owner);
   if(args.kind!==record.args.kind||args.prompt!==record.args.prompt)throw Error('计划内容变化，请重新规划');
   if(record.parentId)return{...artifacts(await pipeline3(root,{action:'get',id:record.parentId},owner)),reused:true,queryTool:'media_pipeline',queryAction:'get'};
   const fresh=await autoDecision3(runtime,record.args,owner,{discover:()=>workflowAdmin(root,{action:'discover'})});
   if(!fresh.selected||fresh.fingerprint!==record.decision.fingerprint)throw Error('计划依赖、预算、账号、版本或路线变化，请重新预览；未执行');
   const result=await pipeline3(root,{action:'create',callId:'auto-plan:'+record.id,spec:fresh.selected.stages},owner);
   atomicJSON(path.join(root,'auto-plans31',record.id+'.json'),{...record,parentId:result.id});
   return{...withFollow('pipeline',artifacts(result),owner,exec.callId),selectedBackend:fresh.selected.source,decision:fresh,queryTool:'media_pipeline',queryAction:'get'};
  }
  if(args.pipelineGoal&&mode!=='Auto')throw Error('多阶段Auto规划需要Auto模式，不覆盖当前执行策略');
  const input=studioImage31(root,args.referenceImage,owner);if(mode==='Cloud'){if(input)throw Error('归档素材只在本地Auto/Local中使用；传往云端请通过Hybrid明确确认');return null;}if(mode==='Local'&&args.referenceImage&&!input)throw Error('本地参考图需要本会话已归档素材标识，未读取外部地址');
  if(mode==='Hybrid')throw Error('联合模式请使用 media_pipeline 明确跨后端阶段，未静默退回云端');
  let decision;
  if(mode==='Auto'){
   decision=await autoDecision3(runtime,args,owner,{discover:()=>workflowAdmin(root,{action:'discover'}),localOnly:args.localOnly===true,cloudOnly:args.cloudOnly===true});
   if(args.pipelineGoal)return storeAutoPipeline31(root,owner,args,decision);
   if(!decision.selected)throw Error('自动规划没有可执行方案：'+decision.rejected.map(x=>x.id+' '+x.reason).join('；'));
   if(decision.selected.source==='cloud')return {cloudArgs:{...args,connectionId:decision.selected.connectionId,tier:decision.selected.tier,budgetCNY:decision.budgetCNY,...decision.selected.capabilityContract?.wireHash?{expectedWireHash:decision.selected.capabilityContract.wireHash}:{}},decision};
   if(decision.selected.executor==='pipeline'){const result=await pipeline3(root,{action:'create',callId:exec.callId,spec:decision.selected.stages},owner,{authorize:authorize(owner,exec.callId),comfyCall:pipelineComfy,cloudCall});const value=artifacts(result);return{...(['pending','running','waiting'].includes(result.state)?withFollow('pipeline',value,owner,exec.callId):value),selectedBackend:'Local',decision,routeKind:'slideshow',selectionReason:'普通图片合成视频，不是模型视频',queryTool:'media_pipeline',queryAction:'get'};}
  }
  if(!['image','video'].includes(args.kind)&&!plan?.workflowId&&!decision?.selected){if(mode==='Local')throw Error('本类别尚无已验证本地执行器，请在设置中配置，不会切换收费渠道');return null;}
  const found=decision?.selected?{id:decision.selected.instanceId,checkpoints:[decision.selected.model]}:(await workflowAdmin(root,{action:'discover'})).find(i=>i.local&&i.available&&i.id===(plan?.instanceId||'local'));
  if(!found){if(mode==='Local')throw Error('未发现可用本地实例，未发起云端调用');return null;}
  if(args.kind==='video'&&!plan?.workflowId&&!decision?.selected?.workflowId)throw Error('Local 视频请配置视频工作流，或使用 media_pipeline 创建图片转视频编排');
  const templateId=decision?.selected?.workflowId||plan?.workflowId||'txt2img',t=workflowDefinition31(root,templateId);
  if(decision?.selected?.workflowVersion!==undefined&&decision.selected.workflowVersion!==t.version)throw Error('自动规划后工作流版本变化，请重新规划；未提交生成');
  if(t.kind!==args.kind)throw Error('当前方案工作流不支持此媒体类别');
  const values=checkpointBinding31(t,decision?.selected?.values||workflowPlanValues31(root,plan,templateId,t.mappings.prompt?{prompt:args.prompt}:{}),found.checkpoints);
  if(input){const binding=decision?.selected?.inputBinding||imageBinding31(t),inst=loadSettings3(root).instances.find(i=>i.id===found.id);enforce(root,args.kind,'local',owner,exec.callId);exec.signal?.throwIfAborted();values[binding.alias]=await bindStudioImage31(root,input,owner,exec.callId,{instanceId:found.id,instanceUrl:inst?.url,templateId,version:t.version,values},dataBase64=>workflowAdmin(root,{action:'upload',instanceId:found.id,dataBase64}));}
  const r=await workflow({action:'submit',kind:args.kind,templateId,expectedVersion:t.version,instanceId:found.id,values},owner,exec.callId);
  return {...(r.status==='submitted'?withFollow('workflow',r,owner,exec.callId):r),selectedBackend:'Local',decision,selectionReason:mode==='Auto'?'本机有可用工作流和模型，无云端生成费用':'用户选择本地模式',queryTool:'media_workflow',queryAction:'poll'};
 }
 ctx.effect(()=>async()=>{stopped=true;const active=[...runners.values()];for(const r of active)r.abort.abort();await Promise.allSettled(active.map(r=>r.done));for(const r of routes.values())r.dispose();});
 return {route};
}

