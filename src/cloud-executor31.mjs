import {legacyPreview31} from './legacy-preview31.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';

// Shared by the actual host and isolated protocol integration. No provider
// submission is permitted before the original session's one-shot approval.
export function cloudExecutor31(runtime,{getAgent,ask}){
 const root=runtime.root;
 return async(a,owner)=>{
  if(['prepare','reconcile'].includes(a.action)){
   let params=a.params;
   if(a.input){if(a.input.kind!=='image'||fs.statSync(a.input.file).size>20*1024*1024)throw Error('联合参考素材需为20MB以内图片');params={...params,_pipelineReference:fs.readFileSync(a.input.file).toString('base64')};}
   const previous=runtime.findPrepared(params,owner,owner+':'+a.requestId);if(previous||a.action==='reconcile')return previous;
   if(params.expectedConnectionHash){const c=runtime.config.load().value.connections.find(c=>c.id===params.connectionId);if(!c||createHash('sha256').update(JSON.stringify(c)).digest('hex')!==params.expectedConnectionHash)throw Error('Auto计划账号或模型配置变化，未创建新报价；请重新规划');}
   return runtime.prepare(params,owner,owner+':'+a.requestId);
  }
  let row=runtime.row(a.id,owner);let purposeEvidence=null;if(['music','speech'].includes(row.plan.input?.kind)){if(row.plan.connection?.protocol!=='legacy')throw Error('严格联合音轨需要已审查模型用途；普通音频协议不能证明音乐/语音');const c=legacyPreview31(root,row.plan.connection,row.plan.input,{reviewed:true}).contract;if(c.wireHash!==row.plan.capabilityContract?.wireHash)throw Error('原音轨用途契约变化，未提交或重新计费');purposeEvidence={source:'reviewed official adapter execution contract; not content inference',purpose:c.kind,provider:c.provider,model:c.model,wireHash:c.wireHash};}
  if(a.action==='retry-check')return runtime.view(row);
  if(a.canContinue&&!a.canContinue())return{status:'paused'};
  if(row.status==='awaiting-approval'){
   const agent=getAgent(owner);if(!agent)throw Error('原会话未加载，保留待授权计划');
   const previous=(a.previousAttempts||[]).reduce((n,p)=>n+p.estimateCNY,0);
   const answer=await ask({agent,questions:[{id:a.id,header:'联合任务云端阶段',question:'云端阶段 '+row.plan.model+'，估算人民币 '+row.plan.estimate+' 元。'+(a.previousAttempts?.length?'此前失败尝试估算/预留 '+previous+' 元，可能已计费；本次是新的生成请求。':'')+(row.plan.input.referenceImageBase64?'将向此云端账户发送上一阶段图片。':'')+'允许本次生成？',options:[{label:'允许本次生成'},{label:'取消'}]}]});
   if(!answer.answers?.some(v=>v.id===a.id&&!v.custom&&v.selected?.includes('允许本次生成'))){runtime.deny(a.id,owner);return{status:'cancelled'};}
   if(a.canContinue&&!a.canContinue())return{status:'paused'};
   runtime.approve(a.id,owner);row=runtime.row(a.id,owner);
  }
  if(a.canContinue&&!a.canContinue())return{status:'paused'};
  if(row.status==='approved')try{await runtime.submit(a.id,owner);}catch(e){const latest=runtime.row(a.id,owner);if(latest.status==='uncertain')return{...runtime.view(latest),error:e.message};throw e;}
  else if(row.status==='submitted')await runtime.poll(a.id,owner);
  row=runtime.row(a.id,owner);return {...runtime.view(row),...purposeEvidence?{purposeEvidence}:{},file:row.files[0]?.path};
 };
}
