import {legacyPreview31} from './legacy-preview31.mjs';
import {autoPipeline31} from './auto-pipeline31.mjs';
import {protocolIssue31} from './protocol-ready31.mjs';
import {autoSlideshow31} from './auto-slideshow31.mjs';
import {speechBillingCharacters} from '../engine/core.mjs';
import {studioImage31,imageBinding31} from './input31.mjs';
import fs from 'node:fs';import path from 'node:path';
import {selectBackend3} from './selection3.mjs';
import {loadSettings3} from './policy3.mjs';import {activePlan3,plans3,workflowPlanValues31} from './plans3.mjs';import {readBudget} from './budget.mjs';
import {workflowAdmin,workflowTool,bind,checkpointBinding31} from './workflows3.mjs';
import {resourcePolicy31} from './resource-policy31.mjs';

function capabilityReason31(error){
 if(!Array.isArray(error?.issues))return error.message;
 const labels={duration:'时长',ratio:'画幅',resolution:'分辨率',referenceImages:'参考图片',prompt:'内容',kind:'媒体类别'};
 return error.issues.map(i=>{const key=i.path?.[0],label=labels[key]||key||'参数';return i.code==='too_small'?label+'必须至少为 '+i.minimum:i.code==='too_big'?label+'不能超过 '+i.maximum:i.code==='invalid_value'?label+'不属于此模型支持的值':label+'格式或取值无效';}).join('；');
}
export async function autoDecision3(runtime,args,owner,{discover,inspect=(a)=>workflowTool(runtime.root,{action:'inspect',...a},owner),localOnly=false,cloudOnly=false}={}){
 const root=runtime.root,settings=loadSettings3(root),plan=activePlan3(root,args.kind),config=runtime.config.load().value,budget=readBudget(root);
 const tier=args.tier==='quality'?'premium':args.tier||plan?.tier||'preview',maxSeconds=args.maxSeconds??plan?.params?.maxSeconds,requireOnline=args.requireOnline??plan?.params?.requireOnline??false,duration=args.duration??plan?.params?.duration??5;
 if(maxSeconds!==undefined&&(!Number.isFinite(maxSeconds)||maxSeconds<=0||maxSeconds>86400)||typeof requireOnline!=='boolean'||!Number.isFinite(duration)||duration<=0)throw Error('Auto耗时、网络或时长约束无效');
 if(args.budgetCNY!==undefined&&(!Number.isFinite(args.budgetCNY)||args.budgetCNY<0))throw Error('任务预算无效');
 // A saved zero-budget plan is an explicit no-charge ceiling, unlike the
 // legacy global zero value which means "ask" without a configured cap.
 const limits=[args.budgetCNY,plan?.budgetCNY,budget.perRequestCNY||undefined].filter(v=>v!==undefined);
 if(settings.sessionBudgetCNY){const used=runtime.db.prepare("SELECT plan FROM tasks WHERE owner=? AND status NOT IN ('awaiting-approval','cancelled')").all(owner).reduce((n,r)=>n+JSON.parse(r.plan).estimate,0);limits.push(Math.max(0,settings.sessionBudgetCNY-used));}
 if(budget.monthlyCNY>0){const columns=runtime.db.prepare('PRAGMA table_info(tasks)').all().map(c=>c.name),date=columns.includes('dispatched_at')?"COALESCE(dispatched_at,approved_at,created)":columns.includes('approved_at')?"COALESCE(approved_at,created)":'created',month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date()),used=runtime.db.prepare("SELECT plan FROM tasks WHERE status NOT IN ('awaiting-approval','cancelled') AND strftime('%Y-%m',"+date+",'+8 hours')=?").all(month).reduce((n,r)=>n+JSON.parse(r.plan).estimate,0);limits.push(Math.max(0,budget.monthlyCNY-used));}
 // Unset limits permit a quote, never permission to pay. Native generation still asks.
 const cap=limits.length?Math.min(...limits):100,input=studioImage31(root,args.referenceImage,owner);
 if(args.pipelineGoal)return autoPipeline31(runtime,args,owner,{cap,tier,requireOnline,maxSeconds,discover,inspect,quote:stage=>autoDecision3(runtime,stage,owner,{discover:async()=>[],inspect,localOnly,cloudOnly})});
 const videoStyle=args.videoStyle??plan?.params?.videoStyle??'model';if(!['model','slideshow'].includes(videoStyle))throw Error('未知Auto视频路线');if(args.kind==='video'&&videoStyle==='slideshow'){if(plan?.workflowId)return{selected:null,rejected:[{id:'local:slideshow',reason:'已有固定视频工作流，不静默替换为图片视频'}],budgetCNY:cap,tier};return autoSlideshow31(runtime,{...args,duration},owner,{tier,cap,maxSeconds,requireOnline,decideImage:()=>autoDecision3(runtime,{kind:'image',prompt:args.prompt,tier:'preview',budgetCNY:cap,...requireOnline?{requireOnline:true}:{}},owner,{discover,inspect,localOnly:cloudOnly?false:true,cloudOnly})});}
 const candidates=[];
 for(const c of config.connections){
  if(c.kind!==args.kind||args.connectionId&&c.id!==args.connectionId)continue;
  const enabled=c.enabled&&!config.customProviders?.some(p=>p.id===c.providerId&&p.enabled===false);
  const supported=['legacy','openai-image','openai-speech','async-http','sync-http'].includes(c.protocol);
  const protocolIssue=(['music','speech'].includes(args.kind)&&c.protocol!=='legacy'?'严格Auto音轨需要已审查模型用途，不能仅凭音频协议判断音乐/语音':null)||protocolIssue31(c,args.kind,{...plan?.params,...args}),credentialIssue=c.protocol==='legacy'&&c.providerId==='tencent'&&!runtime.vault.has(c.credentialRefs?.SecretId||'stored:TENCENTCLOUD_SECRET_ID')?'腾讯云连接缺少SecretId':null,available=enabled&&supported&&!protocolIssue&&runtime.vault.has(c.credentialRef);
  for(const [t,model]of [['preview',c.modelPreview],['standard',c.modelStandard||c.modelQuality],['premium',c.modelQuality]]){
   if(!model)continue;
   let official,capabilityIssue;
   if(c.protocol==='legacy')try{official=legacyPreview31(root,c,{kind:args.kind,prompt:args.prompt||'',tier:t==='preview'?'preview':'quality',requestedTier:t,duration,ratio:args.ratio??plan?.params?.ratio??'16:9',lyrics:args.lyrics??plan?.params?.lyrics??'',instrumental:args.instrumental??plan?.params?.instrumental??true,generateAudio:args.generateAudio??plan?.params?.generateAudio??false,referenceImages:args.referenceImages||(!input&&args.referenceImage?[args.referenceImage]:[])},{reviewed:true,resolution:args.resolution,ratio:args.ratio??plan?.params?.ratio,duration:args.duration??plan?.params?.duration}).contract;}catch(e){capabilityIssue='官方能力预检：'+capabilityReason31(e);}
   let price=c.pricing?.rate,factor=c.pricing?.currency==='CNY'?1:c.pricing?.fxCNY,unit=c.pricing?.unit;
   if(c.protocol==='legacy'&&!c.pricing){try{const route=JSON.parse(fs.readFileSync(path.join(root,'media-routing.json'))),key=c.providerId==='tencent'?'tencentMusic':c.providerId==='bailian'?'bailianMusic':args.kind==='video'&&c.providerId==='minimax'?'minimaxVideo':c.providerId==='siliconflow'?'siliconflow'+args.kind[0].toUpperCase()+args.kind.slice(1):args.kind;
    const quote=route.models?.[key]?.[t==='preview'?'preview':'quality'];if(quote?.model===model){price=quote.unitPriceCNY;factor=1;unit=quote.unit||'request';}
   }catch{}}
   const units=['second','video_second'].includes(unit)?duration:['kchar','speech_kchar'].includes(unit)?(unit==='speech_kchar'&&c.providerId==='minimax'?speechBillingCharacters(args.prompt||''):Array.from(args.prompt||'').length)/1000:1;
   const estimate=official?official.estimateCNY:typeof price==='number'&&Number.isFinite(factor)?Math.ceil(price*factor*units*10000)/10000:NaN;
   candidates.push({id:c.id+':'+t,connectionId:c.id,name:c.label||c.providerId||'云端方案',model,source:'cloud',kind:c.kind,tier:t,enabled,available:available&&!capabilityIssue&&!credentialIssue,unavailableReason:protocolIssue||credentialIssue||capabilityIssue,...official?{capabilityContract:official}:{},estimateCNY:estimate,networkStatus:'unknown',speedEvidence:'未测量',capabilities:[c.kind==='image'?'txt2img':c.kind,...official?.inputMode==='image-to-video'?['i2v']:official?.inputMode==='image-edit'?['img2img']:[]]});
  }
 }
 let instances=[];const dependencyRejected=[];
 const allWorkflows=(await workflowAdmin(root,{action:'list'})).templates.filter(t=>t.kind===args.kind&&t.enabled&&(!t.status||t.status==='ready'));
 const saved=plan?.workflowId?[plan]:plans3(root).plans.filter(p=>p.mode==='Auto'&&!p.restoredInactive49&&p.kind===args.kind&&p.workflowId);
 const fixedWorkflow=plan?.workflowId||saved[0]?.workflowId||null;
 const candidateWorkflows=allWorkflows.filter(t=>!fixedWorkflow||t.id===fixedWorkflow);
 function verifiedCount(templateId){try{const dir=path.join(root,'workflows3/jobs');if(!fs.existsSync(dir))return 0;return fs.readdirSync(dir).filter(x=>x.endsWith('.json')).reduce((n,x)=>{try{const j=JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'));return n+(j.templateId===templateId&&j.status==='completed'&&(j.files||[]).some(f=>f?.verification?.verified===true)?1:0);}catch{return n;}},0);}catch{return 0;}}
 const qualityScore=t=>{const n=String(t.name+' '+t.id).toLowerCase();return /moss|z[-_ ]?image|flux|sdxl|wan/.test(n)?3:/ace|sd[-_ ]?1[._-]?5/.test(n)?1:2;};
 if(!fixedWorkflow)candidateWorkflows.sort((a,b)=>(a.id==='txt2img'?0:a.id==='img2img'?1:2)-(b.id==='txt2img'?0:b.id==='img2img'?1:2)||qualityScore(b)-qualityScore(a));
 const localPlans=saved.length?saved:plan?[plan]:[];
 if(!cloudOnly&&!args.connectionId&&(!args.referenceImage||input)&&candidateWorkflows.length){instances=await discover();for(const i of instances){
  if(!i.local||!i.available)continue;
  for(const template of candidateWorkflows){
  if(template.instanceId&&template.instanceId!==i.id)continue;
  const planForInstance=plan?.workflowId===template.id&&(!plan.instanceId||plan.instanceId===i.id)?plan:null;
  const candidatePlan=saved.find(p=>p.workflowId===template.id&&p.instanceId===i.id)||saved.find(p=>p.workflowId===template.id&&!p.instanceId)||planForInstance,id=template.id==='txt2img'?'local:'+i.id:'local:'+i.id+':'+template.id;
  if(plan?.workflowId===template.id&&plan.instanceId&&plan.instanceId!==i.id){dependencyRejected.push({id,workflowId:template.id,planId:plan.id,reason:'活动方案绑定实例 '+plan.instanceId+'，当前实例 '+i.id+' 不符；不会静默改绑定'});continue;}
  const reject=reason=>dependencyRejected.push({id,workflowId:template.id,planId:candidatePlan?.id||null,reason});
  let t;try{t=await workflowAdmin(root,{action:'export',templateId:template.id});}catch(e){reject(e.message);continue;}
  if(t.kind!==args.kind||!t.enabled||!t.graph){reject('工作流类别不符、未启用或缺少 API 图');continue;}
  if(args.model&&!JSON.stringify(t.graph).includes(args.model)){reject('指定模型 '+args.model+' 不在工作流依赖中，不会静默替换');continue;}
  let inputBinding;const needsInput=Object.values(t.graph).some(n=>n.class_type==='LoadImage');if(needsInput&&!input){reject('工作流需要外部图片；Auto尚未绑定本次输入，不能复用历史素材或默认文件');continue;}if(input)try{inputBinding=imageBinding31(t);}catch(e){reject(e.message);continue;}
  const overrides=Object.fromEntries(['prompt','width','height','steps','cfg','seed','duration','fps','ratio'].filter(k=>Object.hasOwn(t.mappings||{},k)&&args[k]!==undefined).map(k=>[k,args[k]]));
  let values;try{values=workflowPlanValues31(root,candidatePlan,template.id,overrides);}catch(e){reject(e.message);continue;}
  if(t.mappings?.prompt)values.prompt=args.prompt||'';
  try{values=checkpointBinding31(t,values,i.checkpoints);}catch(e){reject(e.message);continue;}
  let analysis;try{analysis=await inspect({templateId:template.id,instanceId:i.id,values,...inputBinding?{deferredImages:[inputBinding.node]}:{}});}catch(e){reject('工作流检查失败：'+e.message);continue;}
  if(!analysis.compatible){reject('工作流依赖不满足：'+analysis.issues.join('；'));continue;}
  let resource=resourcePolicy31(root,bind(t.graph,t.mappings,values),i.id,i.devices);
  const gpuCount=(i.devices||[]).filter(d=>['cuda','hip','xpu','mps'].includes(String(d.type||'').toLowerCase())).length;
  if(!resource.available&&gpuCount&&/复杂模型资源|工作流资源需求未知/.test(resource.reason))resource={...resource,available:true,requiredVRAMMB:null,unknownRequirement:true,resourceEvidence:'该模型未登记显存估算；已检测到本地 GPU，允许首次尝试，失败会保留为可诊断回执，不据此承诺质量'};
  if(!resource.available){reject(resource.reason);continue;}
  const speed=candidatePlan?.speedEstimate,speedValid=speed&&speed.workflowId===template.id&&speed.workflowVersion===t.version&&speed.instanceId===i.id&&speed.instanceUrl===i.url;
  const verified=verifiedCount(template.id),localTier=candidatePlan?.workflowId?candidatePlan.tier:(args.tier==='quality'||args.tier==='premium'?'premium':'standard');
  candidates.push({id,networkStatus:'reachable',expectedSeconds:speedValid?speed.seconds:undefined,speedEvidence:speedValid?'此实例/工作流版本的用户耗时估算，非实测或完成时限保证':'未核定耗时',source:'local',kind:args.kind,tier:localTier,qualityEvidence:candidatePlan?.workflowId?'用户方案档位，非客观质量实测'+(verified?'；已有 '+verified+' 次真实完成回执（解码校验）':''):(verified?'已有 '+verified+' 次真实完成回执（解码校验）':'尚未有真实完成回执；静态可执行不等于质量验证'),verificationScore:verified,qualityScore:qualityScore(t),enabled:true,available:true,estimateCNY:0,capabilities:[args.kind==='image'?(input?'img2img':'txt2img'):args.kind,...input?['image-input']:[]],...inputBinding?{inputBinding,input:{reference:input.reference,sha256:input.sha256}}:{},...resource,instanceId:i.id,workflowId:template.id,workflowVersion:t.version,planId:candidatePlan?.id||null,model:values.model||null,values,dependencyCheck:analysis});
 }}}
 const decision=selectBackend3(candidates,{kind:args.kind,tier,budgetCNY:cap,required:[args.referenceImage||args.referenceImages?.length?(args.kind==='video'?'i2v':'img2img'):args.kind==='image'?'txt2img':args.kind],availableVRAMMB:0,allowCloud:!input&&!localOnly,maxSeconds,requireOnline});
 return {...decision,rejected:[...decision.rejected,...dependencyRejected],budgetCNY:cap,tier,constraints:{maxSeconds,requireOnline},predictionOnly:true};
}
