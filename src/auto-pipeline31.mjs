import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {pipelinePresets31} from './pipeline-presets31.mjs';import {validatePipeline} from './pipeline3.mjs';import {workflowDefinition31,workflowTool,bind} from './workflows3.mjs';import {resourcePolicy31} from './resource-policy31.mjs';import {studioImage31} from './input31.mjs';import {effectiveMode,atomicJSON} from './policy3.mjs';import {protocolIssue31} from './protocol-ready31.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),rank={preview:1,standard:2,premium:3};
const kind=s=>s.executor==='archive-image'?'image':['cloud-media','comfy-workflow'].includes(s.executor)?s.params.kind:'video';
const strip=s=>s.map(({id,name,executor,dependencies,params})=>({id,name,executor,dependencies,params}));
// Existing saved DAGs are the audited topology catalog; no model-name guesses
// and no fabricated graph/node architecture. Preview never creates a quote.
export async function autoPipeline31(runtime,args,owner,{cap,tier,requireOnline,maxSeconds,discover,quote,inspect=(a)=>workflowTool(runtime.root,{action:'inspect',...a},owner)}={}){
 const root=runtime.root,goal=args.pipelineGoal;if(!['model','edited','slideshow','composed'].includes(goal))throw Error('需要明确多阶段输出目标');
 if(!rank[tier])throw Error('未知质量档位');if(args.connectionId)throw Error('多阶段路线请在联合方案绑定各阶段账号，不使用单账号覆盖');
 const config=runtime.config.load().value,rows=pipelinePresets31(root).filter(p=>p.auto?.enabled&&p.auto.kind===args.kind&&p.auto.goal===goal),rejected=[],eligible=[];let instances;
 for(const preset of rows){try{
  if(rank[preset.auto.tier]<rank[tier])throw Error('整条路线声明档位不足');if(goal==='slideshow'&&tier!=='preview')throw Error('普通图片视频仅支持Preview');
  let stages=validatePipeline(preset.stages),last=stages.at(-1);if(kind(last)!==args.kind)throw Error('最终阶段与输出类别不一致');
  if(goal==='slideshow'&&last.executor!=='ffmpeg-video'||goal==='composed'&&last.executor!=='ffmpeg-compose'||goal==='edited'&&(last.executor!=='comfy-workflow'||!last.dependencies.length)||goal==='model'&&!['cloud-media','comfy-workflow'].includes(last.executor))throw Error('输出目标与实际最终执行器不一致');
  // Final composition preserves the video source's duration/geometry. Bind
  // requirements to that explicit role, never to an arbitrary last cloud node.
  const target=last.executor==='ffmpeg-compose'?stages.find(s=>s.id===last.params.roles.video):last;
  const requested=['duration','ratio','resolution'].filter(k=>args[k]!==undefined);
  if(requested.length){
   if(target.executor==='cloud-media'){for(const key of requested)target.params[key]=args[key];}
   else if(target.executor==='ffmpeg-video'){if(args.ratio!==undefined||args.resolution!==undefined)throw Error('普通图片视频保留素材尺寸，不能承诺指定画幅或分辨率');if(args.duration!==undefined)target.params.seconds=args.duration;}
   else throw Error('本工作流尚未审查输出时长/画幅/分辨率绑定；请使用明确绑定的路线，不忽略目标约束');
  }
  if(last.executor==='ffmpeg-compose'&&args.generateAudio===true)throw Error('合成路线会替换原声，不能同时要求保留模型生成音频');
  const used=new Set();const visit=id=>{if(used.has(id))return;used.add(id);stages.find(s=>s.id===id).dependencies.forEach(visit);};visit(last.id);if(used.size!==stages.length)throw Error('有不参与最终成品的阶段，拒绝额外生成');
  if(maxSeconds!==undefined)throw Error('整条多阶段路线耗时未实测，不能满足严格总耗时约束');
  const audits=[],sources=[],bindings=[];let total=0,clouds=0,locals=0;
  for(const s of stages){
   const mode=effectiveMode(root,kind(s),owner);if(s.executor==='cloud-media'&&mode==='Local'||s.executor!=='cloud-media'&&mode==='Cloud')throw Error('阶段 '+s.id+' 被 '+mode+' 模式禁止');
   if(s.executor==='archive-image'){
    s.params.reference=s.params.reference==='$input'?args.referenceImage:s.params.reference;const source=studioImage31(root,s.params.reference,owner);if(!source)throw Error('本路线需要本会话归档图片输入');sources.push({reference:source.reference,sha256:source.sha256});audits.push({id:s.id,executor:s.executor,sourceSha256:source.sha256});continue;
   }
   if(s.executor==='cloud-media'){
    clouds++;const c=config.connections.find(c=>c.id===s.params.connectionId);if(!c)throw Error('阶段账号已移除');const issue=protocolIssue31(c,s.params.kind);if(issue)throw Error(issue);
    if(s.dependencies.length&&(!['async-http','sync-http'].includes(c.protocol)||!JSON.stringify(c.mapping.body).includes('${referenceImageBase64}')))throw Error('云端阶段未配置图片传递映射');
    if(requireOnline)throw Error('云端实际在线状态未验证，严格网络要求不满足');
    s.params.expectedConnectionHash=hash(c);s.params.prompt=args.prompt||s.params.prompt;if(s===last)for(const key of ['ratio','resolution','generateAudio','lyrics','instrumental'])if(args[key]!==undefined)s.params[key]=args[key];s.params.tier=preset.auto.tier;if(s.params.kind==='video'&&s===last&&args.duration!==undefined)s.params.duration=args.duration;
    const d=await quote({...s.params,budgetCNY:Math.min(s.params.budgetCNY??cap,cap)});if(!d.selected||d.selected.source!=='cloud')throw Error('阶段 '+s.id+' 无合格账号/模型：'+[...new Set(d.rejected.map(r=>r.reason))].join('；'));
    const q=d.selected;if(q.capabilityContract?.wireHash)s.params.expectedWireHash=q.capabilityContract.wireHash;total=Math.round((total+q.estimateCNY)*10000)/10000;audits.push({id:s.id,executor:s.executor,model:q.model,connectionId:c.id,estimateCNY:q.estimateCNY,networkStatus:'unknown',capabilityContract:q.capabilityContract||null,requiresApproval:true});bindings.push({connectionId:c.id,configHash:hash(c)});
   }else if(s.executor==='comfy-workflow'){
    locals++;instances??=await discover();const i=instances.find(i=>i.id===s.params.instanceId&&i.local&&i.available);if(!i)throw Error('阶段 '+s.id+' 本机实例不可达；远程联合传递尚未验收');
    const w=workflowDefinition31(root,s.params.templateId);if(!w.enabled||!w.graph||w.kind!==s.params.kind||w.version!==s.params.workflowVersion)throw Error('工作流禁用、类别不符或版本变化，请重新保存联合方案');
    const deferred=[];for(const [alias]of Object.entries(s.params.inputMappings||{})){const m=w.mappings[alias];if(!m||w.graph[m.node]?.class_type!=='LoadImage'||m.input!=='image')throw Error('素材映射不是LoadImage/image');deferred.push(m.node);}
    if(Object.values(w.graph).some(n=>n.class_type==='LoadImage')&&!deferred.length)throw Error('输入图片未绑定，不能使用工作流历史文件名');
    if(w.mappings.prompt)s.params.values={...s.params.values,prompt:args.prompt||''};
    const analysis=await inspect({templateId:w.id,instanceId:i.id,values:s.params.values,deferredImages:deferred});if(!analysis.compatible)throw Error('阶段依赖不满足：'+analysis.issues.join('；'));
    const resource=resourcePolicy31(root,bind(w.graph,w.mappings,s.params.values),i.id,i.devices);if(!resource.available||resource.requiredVRAMMB>resource.availableVRAMMB)throw Error(resource.reason||'显存不足');
    audits.push({id:s.id,executor:s.executor,workflowId:w.id,workflowVersion:w.version,instanceId:i.id,networkStatus:'reachable',...resource});bindings.push({workflowId:w.id,version:w.version,instanceId:i.id,instanceUrl:i.url});
   }else if(s.executor.startsWith('ffmpeg-')){
    locals++;if(!fs.existsSync(process.env.DSH_FFMPEG_PATH||path.join(root,'tools/ffmpeg.exe')))throw Error('未配置FFmpeg，不会自动下载');audits.push({id:s.id,executor:s.executor,estimateCNY:0,quality:'普通本地合成，非模型生成'});
   }else throw Error('Auto未审查该执行器；请改用通用ComfyUI阶段');
  }
  if(args.referenceImage&&!stages.some(s=>s.executor==='archive-image'))throw Error('本路线没有归档输入阶段，不忽略用户素材');
  if(total>cap)throw Error('全部云端阶段合计超过总预算');
  // Allocate a bounded retry allowance. Sum of all stage ceilings never
  // exceeds the overall cap; prior attempts already reduce each ceiling.
  let slack=Math.round((cap-total)*10000)/10000;for(const s of stages.filter(s=>s.executor==='cloud-media')){const estimate=audits.find(a=>a.id===s.id).estimateCNY,extra=Math.min(slack,Math.max(0,(s.params.budgetCNY??cap)-estimate));s.params.budgetCNY=Math.round((estimate+extra)*10000)/10000;slack=Math.round((slack-extra)*10000)/10000;}
  stages=strip(validatePipeline(stages));eligible.push({presetId:preset.id,presetVersion:preset.version,name:preset.name,stages,audits,sources,bindings,estimateCNY:total,source:clouds&&locals?'Hybrid':clouds?'Cloud':'Local',qualityEvidence:preset.auto.evidence||'用户路线档位声明，非实测',requiresApproval:clouds>0});
 }catch(e){rejected.push({id:preset.id,reason:e.message});}}
 eligible.sort((a,b)=>a.estimateCNY-b.estimateCNY||a.stages.length-b.stages.length||a.presetId.localeCompare(b.presetId));
 const selected=eligible[0]||null;return{selected,rejected,goal,kind:args.kind,tier,budgetCNY:cap,executed:false,reason:'仅比较用户明确允许Auto使用的联合路线；全阶段检查后按总估算、阶段数选择，费用仍逐次确认',fingerprint:selected?hash({presetId:selected.presetId,presetVersion:selected.presetVersion,stages:selected.stages,sources:selected.sources,bindings:selected.bindings,estimateCNY:selected.estimateCNY,models:selected.audits.map(a=>({id:a.id,model:a.model,estimateCNY:a.estimateCNY,wireHash:a.capabilityContract?.wireHash,adapterVersion:a.capabilityContract?.adapterVersion,validUntil:a.capabilityContract?.validUntil}))}):null};
}
export function storeAutoPipeline31(root,owner,args,decision){if(!decision.selected)return decision;const id=randomUUID(),record={id,owner,args,decision,created:new Date().toISOString(),expires:new Date(Math.min(Date.now()+300000,...decision.selected.audits.filter(a=>a.capabilityContract?.validUntil).map(a=>Date.parse(a.capabilityContract.validUntil)))).toISOString()};atomicJSON(path.join(root,'auto-plans31',id+'.json'),record);return{...decision,planId:id,message:'仅保存执行计划，未报价、上传或生成。请审阅阶段、费用及限制后显式执行此planId。'};}
export function readAutoPipeline31(root,id,owner){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('规划编号无效');const record=JSON.parse(fs.readFileSync(path.join(root,'auto-plans31',id+'.json')));if(record.owner!==owner)throw Error('规划不属于此会话');if(!record.parentId&&(Date.now()-Date.parse(record.created)>300000||record.expires&&Date.now()>=Date.parse(record.expires)))throw Error('规划已超过五分钟，请重新检查');return record;}
