import {previewImport51,finishImport51} from './import-session51.mjs';
import {resourceManage49,resourceOverview49} from './resource-management49.mjs';
import {instanceManage31,settingsRevision31} from './instance-management31.mjs';
import {instanceSummary31} from './instance-identity31.mjs';
import {randomUUID} from 'node:crypto';
import {taskAction3} from './taskactions3.mjs';
import {history3} from './history3.mjs';
import {loadSettings3,saveSettings3} from './policy3.mjs';
import {autoDecision3} from './auto3.mjs';
import {plans3,storePlan3,activatePlan3} from './plans3.mjs';
import {workflowAdmin,workflowTool} from './workflows3.mjs';
import {inventory31} from './inventory31.mjs';
import {exportPlan31,importPlan31} from './plan-portable31.mjs';
import {validatePipeline} from './pipeline3.mjs';
import fs from 'node:fs';import path from 'node:path';
import {pipelinePresets31,savePipelinePreset31} from './pipeline-presets31.mjs';
import {listWindowsVoices} from './tts-win31.mjs';
import {neuralTtsCapabilities} from './neural-tts31.mjs';

export function registerControl3(ctx,root,token,runtime){
 const validateLocalWorkflow=async(templateId,kind,instanceId)=>{
  const list=(await workflowAdmin(root,{action:'list'})).templates,row=list.find(x=>x.id===templateId);
  if(!row)throw Error('工作流不存在');if(row.kind!==kind)throw Error('工作流类别为 '+row.kind+'，与当前类别 '+kind+' 不一致');
  if(!row.enabled)throw Error('工作流未启用');
  const detail=await workflowAdmin(root,{action:'export',templateId});if(!detail.graph)throw Error('工作流缺少 API 图，尚未就绪');
  const inst=(loadSettings3(root).instances||[]).find(x=>x.id===instanceId);if(!inst)throw Error('请选择已配置的 ComfyUI 实例');
  const host=new URL(inst.url).hostname;if(!['127.0.0.1','localhost','[::1]'].includes(host))throw Error('普通本地执行只允许本机实例；远程请先在原聊天确认');
  return {row,detail,inst};
 };
 const state=async()=>{let skillCatalog=[];try{skillCatalog=(ctx.skills&&await ctx.skills.snapshot({cwd:process.cwd()}))?.skills?.filter(x=>x.name==='media-studio-creative')||[];}catch{}return{resources:resourceOverview49(root),settings:loadSettings3(root),settingsRevision:settingsRevision31(loadSettings3(root)),instanceChoices:instanceSummary31(loadSettings3(root)),workflows:(await workflowAdmin(root,{action:'list'})).templates,pipelinePresets:pipelinePresets31(root),skillCatalog,...plans3(root)};};
 return ctx.webServer.register({kind:'exact',path:'/media-studio/v3',handler:async(req,res)=>{
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
  try{
   if(req.headers.origin&&req.headers.origin!=='dsh-app://app'&&new URL(req.headers.origin).host!==req.headers.host)throw Error('Cross-origin refused');
   if(req.method==='GET'){res.end(JSON.stringify(await state()));return;}
   if(req.method!=='POST'||req.headers['x-media-token']!==token)throw Error('Unauthorized');
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>30000000)throw Error('Request too large');}
   const a=JSON.parse(raw);let result;
   if(a.action==='resourceManage')result=resourceManage49(root,a);
   else if(a.action==='importPreview')result=await previewImport51(root,a.document,a.kind,{instanceId:a.instanceId,allowRemote:a.allowRemote===true});
   else if(a.action==='importFinish')result=await finishImport51(root,a);
   else if(a.action==='settings'){if(a.revision&&a.revision!==settingsRevision31(loadSettings3(root)))throw Error('实例配置已变化，请重新读取');result=saveSettings3(root,a.settings);}
   else if(a.action==='instanceManage')result=instanceManage31(root,a);
   else if(a.action==='plan')result=storePlan3(root,a.plan);
   else if(a.action==='exportPlan')result=await exportPlan31(root,a.id);
   else if(a.action==='importPlan')result=await importPlan31(root,a.document);
   else if(a.action==='pipelinePreset')result=savePipelinePreset31(root,a.preset);
   else if(a.action==='pipelineSessions')result=ctx.agents.list().map(agent=>({id:agent.session.id,title:agent.session.meta?.title||agent.session.id}));
   else if(a.action==='pipelineValidate'){
    const stages=validatePipeline(a.spec),warnings=[];
    if(stages.some(s=>s.executor.startsWith('ffmpeg-'))&&!fs.existsSync(process.env.DSH_FFMPEG_PATH||path.join(root,'tools','ffmpeg.exe')))warnings.push('未配置FFmpeg；不会下载，合成阶段需先配置现有程序');
    if(stages.some(s=>s.executor==='cloud-media'))warnings.push('云端阶段费用将在原聊天逐次核定并确认；检查结构不代表账号权限或真实生成验收');
    if(stages.some(s=>s.executor==='windows-tts'))warnings.push('本地语音使用 Windows 系统语音合成，属于系统 TTS，不是神经网络语音模型；音色与质量取决于已安装系统语音');
    result={stages,warnings,executed:false};
   }
   else if(a.action==='ttsVoices')result={voices:await listWindowsVoices()};
   else if(a.action==='neuralTtsVoices')result=neuralTtsCapabilities();
   else if(a.action==='pipelineCreate'){
    if(typeof a.owner!=='string'||!/^ui-[a-f0-9-]{36}$/.test(a.requestId||''))throw Error('需要原聊天及本次请求编号');
    const agent=ctx.agents.get(a.owner);if(!agent)throw Error('请先打开任务原聊天，再选择并开始');
    validatePipeline(a.spec);const tool=agent.ctx?.tools?agent.ctx.tools.get('media_pipeline',agent):ctx.tools.get('media_pipeline');if(!tool)throw Error('原聊天未启用联合任务工具');
    result=await tool.execute({action:'create',specJSON:JSON.stringify(a.spec)},{agent,callId:a.requestId,signal:AbortSignal.timeout(60000)});
   }
   else if(['autoPlan','autoExecute'].includes(a.action)){
    const agent=ctx.agents.get(a.owner);if(!agent)throw Error('请先打开任务原聊天');
    const tool=agent.ctx?.tools?agent.ctx.tools.get('media_generate',agent):ctx.tools.get('media_generate');if(!tool)throw Error('原聊天未启用媒体生成工具');
    const args={kind:a.kind,prompt:a.prompt,...a.action==='autoExecute'?{executePlanId:a.planId}:{pipelineGoal:a.goal,tier:a.tier,budgetCNY:a.budgetCNY,...a.referenceImage?{referenceImage:a.referenceImage}:{},...a.maxSeconds!==undefined?{maxSeconds:a.maxSeconds}:{},requireOnline:a.requireOnline===true,...a.localOnly===true?{localOnly:true}:{},...a.duration!==undefined?{duration:a.duration}:{},...a.ratio?{ratio:a.ratio}:{},...a.resolution?{resolution:a.resolution}:{}}};
    result=await tool.execute(args,{agent,callId:'auto-ui-'+(a.planId||randomUUID()),signal:AbortSignal.timeout(60000)});
   }
   else if(a.action==='activatePlan')result=activatePlan3(root,a.id,a.kind);
   else if(a.action==='task')result=await taskAction3(ctx,root,a);
   else if(a.action==='history'){res.end(JSON.stringify({history:history3(root)}));return;}
   else if(a.action==='discover'){const rows=await workflowAdmin(root,{action:'discover'});res.end(JSON.stringify({discovery:a.id?rows.find(x=>x.id===a.id):rows}));return;}
   else if(a.action==='smartPlan'){
    if(!runtime)throw Error('当前宿主未提供规划运行时');
    const strategy=['quality','value','local'].includes(a.strategy)?a.strategy:'value',tier=strategy==='quality'?'premium':strategy==='value'?'standard':'preview';
    const args={kind:a.kind,prompt:a.prompt,tier,budgetCNY:a.budgetCNY??(strategy==='local'?0:10),...a.maxSeconds?{maxSeconds:Number(a.maxSeconds)}:{}};
    const decision=await autoDecision3(runtime,args,'ui-smart',{discover:()=>workflowAdmin(root,{action:'discover'}),inspect:x=>workflowTool(root,{action:'inspect',...x},'ui-smart'),localOnly:strategy==='local',cloudOnly:a.cloudOnly===true});
    const s=decision.selected;const wf=s?.workflowId?(await workflowAdmin(root,{action:'list'})).templates.find(x=>x.id===s.workflowId):null;
    result={plan:{id:'ui-smart-'+randomUUID(),kind:a.kind,prompt:a.prompt,strategy,budgetCNY:args.budgetCNY,tier,selected:s?{name:wf?.displayName||wf?.name||s.name||(s.source==='cloud'?'云端方案':'本地工作流'),source:s.source,instanceId:s.instanceId||null,workflowId:s.workflowId||null,model:s.model||null,tier:s.tier,estimateCNY:s.estimateCNY,qualityEvidence:s.qualityEvidence,stages:(s.audits||s.stages||[]).map((x,n)=>({index:n+1,name:x.name||x.executor||('阶段 '+(n+1)),executor:x.executor||'workflow',model:x.model||x.workflowId||null,cloud:x.executor==='cloud-media',requiresApproval:!!x.requiresApproval})),values:s.values||null}:null,rejected:(decision.rejected||[]).slice(0,12),note:decision.selected?'方案来自实际实例/工作流/模型清单，尚未生成。':'没有满足约束的路线。'}};
   }
   else if(a.action==='smartExecute'){
    const p=a.plan||{},sel=p.selected;
    if(!sel)throw Error('方案没有选中路线');
    if(sel.source==='local'&&sel.workflowId){
     await validateLocalWorkflow(sel.workflowId,p.kind,sel.instanceId);
     result=await workflowTool(root,{action:'submit',templateId:sel.workflowId,instanceId:sel.instanceId,values:sel.values||{}},'ui-smart');
    }
    else result={requiresChat:true,message:'该路线包含云端或复杂多阶段，请在原聊天确认费用并执行；未静默提交。'};
   }
   else if(a.action==='workflowRun'){
    const {detail,inst}=await validateLocalWorkflow(a.templateId,a.kind,a.instanceId);
    result=await workflowTool(root,{action:'submit',templateId:detail.id,instanceId:inst.id,values:a.values||{}},'ui-local');
   }
   else if(a.action==='workflowPoll'){
    result=await workflowTool(root,{action:'poll',id:a.id},'ui-local');
   }
   else if(a.action==='smartPoll'){
    result=await workflowTool(root,{action:'poll',id:a.id},'ui-smart');
   }
   else if(a.action==='inventory')result=await inventory31(root,{refresh:a.refresh===true});
   else if(a.action==='upload')result=await workflowAdmin(root,{action:'upload',instanceId:a.instanceId,dataBase64:a.dataBase64});
   else if(a.action==='instanceCredential')result=await workflowAdmin(root,{...a,action:'instanceCredential'});
   else if(a.action==='workflowAdmin'){if(['import','importPortable'].includes(a.operation))result=await previewImport51(root,a.document,a.kind);else result=await workflowAdmin(root,{...a,action:a.operation});}
   else if(a.action==='inspect')result=await workflowTool(root,{action:'inspect',instanceId:a.id,templateId:a.templateId,values:a.values||{},allowRemote:true},'settings-inspection');
   else throw Error('Unknown action');
   res.end(JSON.stringify({result,...await state()}));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message,...e.conflicts?{conflicts:e.conflicts}:{}}));}
 }});
}
