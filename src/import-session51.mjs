import {preparation52} from './import-authority52.mjs';
import {checkImport52} from './import-validation52.mjs';
import fs from'node:fs';import os from'node:os';import path from'node:path';import{randomUUID,createHash}from'node:crypto';import{identifyImport51}from'./import-identify51.mjs';import{safeData}from'./workflow-portable31.mjs';import{workflowAdmin}from'./workflows3.mjs';import{importPlan31}from'./plan-portable31.mjs';import{resourceOverview49}from'./resource-management49.mjs';import{readJSON49,resourceTransaction49,withResourceLock49,recoverResources49}from'./resource-journal49.mjs';
const pending=new Map(),revision=root=>createHash('sha256').update(resourceOverview49(root).revision+'\0'+(fs.existsSync(path.join(root,'studio3-settings.json'))?fs.readFileSync(path.join(root,'studio3-settings.json')):'')).digest('hex');
export async function previewImport51(root,document,kind='image',options={}){
 checkImport52(document);const identified=identifyImport51(document);const checked=structuredClone(document);for(const packet of [checked,identified.format==='dsh-media-plan'?checked.workflow:null])if(packet&&['dsh-media-plan','dsh-media-workflow'].includes(packet.format)&&packet.containsCredentials===false)delete packet.containsCredentials;safeData(checked);if(!['image','video','music','speech'].includes(kind))throw Error('媒体类别无效');
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-import51-'));let workflow=null,plan=null;
 try{
  if(identified.format==='dsh-media-plan'){const result=await importPlan31(scratch,document);plan=result.draft;if(result.pendingWorkflow)workflow=await workflowAdmin(scratch,{_preparation52:preparation52,action:'importPortable',document:result.pendingWorkflow});if(workflow)plan.workflowId=workflow.id;plan.restoredInactive49=true;}
  else workflow=await workflowAdmin(scratch,{_preparation52:preparation52,action:identified.format==='dsh-media-workflow'?'importPortable':'import',document,auto:false,...identified.format==='dsh-media-workflow'?{}:{kind}});
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
 if(workflow){workflow.enabled=false;workflow.importedDisabled=true;workflow.disabledReason='导入后停用；确认保存后可自动转换/绑定并明确启用';workflow.status=workflow.graph?'imported-disabled':(workflow.status||'needs-binding');}
 for(const [id,p]of pending)if(p.expires<Date.now())pending.delete(id);if(pending.size>=100)throw Error('导入预览过多，请稍后重试');
 const id=randomUUID(),entry={root:path.resolve(root),revision:revision(root),workflow,plan,instanceId:options.instanceId||null,allowRemote:options.allowRemote===true,expires:Date.now()+600000};pending.set(id,entry);
 return{previewId:id,format:identified.format,name:plan?.name||workflow?.name,kind:plan?.kind||workflow?.kind,status:workflow?.status||workflow?.diagnostics?'needs-binding':'needs-binding',diagnostics:workflow?.diagnostics||[{code:'auto-prepare-on-confirm',node:'document',message:'确认保存后将使用目标实例 object_info 自动转换/绑定'}],instanceBinding:options.instanceId?'目标实例 '+options.instanceId+'；确认后自动转换和绑定':'尚未选择目标实例；确认后如已配置实例将自动尝试，否则保留 needs-binding 诊断',nodes:workflow?.graph?workflow.dependencies?.nodes||[]:[...new Set((workflow?.gui?.nodes||[]).map(n=>n.type))],models:workflow?.dependencies?.modelFields||[],dependencyStatus:'尚未联系目标实例；确认保存后将自动检查模型和节点',newResources:[workflow&&{type:'workflow',id:workflow.id,name:workflow.name},plan&&{type:'plan',id:plan.id,name:plan.name}].filter(Boolean),persisted:false,activated:false,notice:'确认后保存独立资源，保留重名但使用新ID；不覆盖已有版本。工作流保持停用，方案不激活。导入不会打开ComfyUI Desktop画布。'};
}
export async function finishImport51(root,{previewId,cancel=false}){
 if(typeof previewId!=='string'||!/^[-a-f0-9]{36}$/.test(previewId))throw Error('导入预览ID无效');
 recoverResources49(root);
 const previous=readJSON49(path.join(root,'import-receipts52.json'),{});
 if(previous[previewId]){if(cancel)throw Error('导入已经确认保存，不能当作取消；如需移除请归档');return previous[previewId];}
 const p=pending.get(previewId);
 if(!p||p.root!==path.resolve(root)||p.expires<Date.now())throw Error('预览已过期或宿主已重启，请重新预览；未隐式重新导入');
 if(cancel){pending.delete(previewId);return{cancelled:true,persisted:false};}
 if(p.result)return p.result;
 const result=withResourceLock49(root,()=>{
  if(revision(root)!==p.revision)throw Error('资源或实例配置已变化，请重新预览');
  const changes={};
  if(p.workflow){const rows=readJSON49(path.join(root,'workflows3/templates.json'),[]);if(rows.some(w=>w.id===p.workflow.id))throw Error('工作流ID冲突');changes['workflows3/templates.json']=[...rows,p.workflow];}
  if(p.plan){const state=readJSON49(path.join(root,'studio3-plans.json'),{plans:[],active:{}});if(state.plans.some(x=>x.id===p.plan.id))throw Error('方案ID冲突');state.plans.push(p.plan);changes['studio3-plans.json']=state;}
  p.result={persisted:true,activated:false,workflow:p.workflow,plan:p.plan,message:'已事务保存；正在自动转换、绑定和静态验收'};
  changes['import-receipts52.json']={...readJSON49(path.join(root,'import-receipts52.json'),{}),[previewId]:p.result};
  try{resourceTransaction49(root,changes);}catch(e){delete p.result;throw e;}
  return p.result;
 });
 if(result?.persisted&&p.instanceId&&result.workflow&&(result.workflow.gui||result.workflow.graph)){
  try{
   const prepared=await workflowAdmin(root,{action:'autoPrepare',templateId:result.workflow.id,instanceId:p.instanceId||undefined,allowRemote:p.allowRemote===true,kind:result.workflow.kind,expectedVersion:result.workflow.version});
   result.workflow=prepared;result.status=prepared.status;result.diagnostics=prepared.diagnostics||[];result.workflowStatus=prepared.status;
   const receiptFile=path.join(root,'import-receipts52.json');const receipts=readJSON49(receiptFile,{});
   receipts[previewId]={...receipts[previewId],workflow:prepared,status:prepared.status,diagnostics:prepared.diagnostics||[]};
   resourceTransaction49(root,{'import-receipts52.json':receipts});
  }catch(e){
   result.status='conversion-failed';result.workflowStatus='conversion-failed';result.diagnostics=[{code:e.code||'auto-prepare-failed',node:'document',message:e.message}];
  }
 }
 return result;
}
