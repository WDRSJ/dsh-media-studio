import {checkImport52,validatePlanFields52} from './import-validation52.mjs';
import {randomUUID} from 'node:crypto';
import {plans3} from './plans3.mjs';
import {workflowAdmin,bind} from './workflows3.mjs';
import {safeData,importPortable31} from './workflow-portable31.mjs';

export async function exportPlan31(root,id){
 const p=plans3(root).plans.find(p=>p.id===id);if(!p)throw Error('请先保存方案');
 const plan={name:p.name,kind:p.kind,mode:p.mode,tier:p.tier,budgetCNY:p.budgetCNY,params:p.params,workflowParams:p.workflowParams||{}};
 const workflow=p.workflowId?await workflowAdmin(root,{action:'exportPortable',templateId:p.workflowId}):null;
 const result={format:'dsh-media-plan',schemaVersion:1,plan,workflow,rebind:{required:true,instanceId:null,connectionId:null,notice:'不含账号、实例地址、凭证、模型文件或素材；导入后重新选择实例/账号并检查模型依赖'},containsCredentials:false};
 safeData(plan);return result;
}

// Returns a draft only. Import never saves/activates a plan or performs network
// requests. A bundled workflow receives a new ID; source IDs cannot overwrite.
export async function importPlan31(root,document){
 if(!document||document.format!=='dsh-media-plan'||document.schemaVersion!==1||JSON.stringify(document).length>2000000)throw Error('不支持的便携方案格式或文件过大');
 checkImport52(document);const p=document.plan;validatePlanFields52(p);safeData(p);
 if(!p||!['image','video','music','speech'].includes(p.kind)||!['Cloud','Local','Hybrid','Auto'].includes(p.mode)||!['preview','standard','premium'].includes(p.tier)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('便携方案字段无效');
 const values=p.workflowParams||{},params=p.params||{};
 if(!values||Array.isArray(values)||typeof values!=='object'||JSON.stringify(values).length>12000||!params||Array.isArray(params)||typeof params!=='object'||JSON.stringify(params).length>2500||!Number.isFinite(p.budgetCNY)||p.budgetCNY<0||p.budgetCNY>100)throw Error('便携方案参数或预算无效');
 let workflowId='',pendingWorkflow=null;
 if(document.workflow){const w=importPortable31(document.workflow);if(w.kind!==p.kind)throw Error('方案和工作流媒体类别不符');bind(w.graph,w.mappings,values);pendingWorkflow=document.workflow;}
 else if(Object.keys(values).length)throw Error('动态参数缺少随包工作流');
 return {pendingWorkflow,draft:{id:'plan_'+randomUUID(),name:p.name,kind:p.kind,mode:p.mode,tier:p.tier,budgetCNY:p.budgetCNY,params,workflowParams:values,workflowId,instanceId:'',connectionId:'',requiresRebind:true},activated:false,message:'仅预览方案草稿，未保存任何工作流或方案；需要确认事务导入后重新绑定'};
}
