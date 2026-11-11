import {recoverResources49,withResourceLock49,assertNotArchived49} from './resource-journal49.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {modes,kinds,atomicJSON,loadSettings3} from './policy3.mjs';
import {ConnectionStore} from './connections.mjs';
import {workflowDefinition31,bind} from './workflows3.mjs';

const permitted={image:['ratio','width','height','steps','seed','cfg','maxSeconds','requireOnline'],video:['duration','ratio','fps','format','generateAudio','videoStyle','maxSeconds','requireOnline'],music:['duration','instrumental','maxSeconds','requireOnline'],speech:['voiceId','maxSeconds','requireOnline']};
const file=root=>path.join(root,'studio3-plans.json');
export function plans3(root){recoverResources49(root);return fs.existsSync(file(root))?JSON.parse(fs.readFileSync(file(root))):{plans:[],active:{}};}
export function activePlan3(root,kind){const state=plans3(root);return state.plans.find(p=>p.id===state.active[kind]);}
export function storePlan3(root,input){return withResourceLock49(root,()=>storePlanUnlocked49(root,input));}
function storePlanUnlocked49(root,input){
 assertNotArchived49(root,'plan',input?.id);
 if(!input||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)||!String(input.name||'').trim()||String(input.name).length>100||!kinds.includes(input.kind)||!modes.includes(input.mode)||!['preview','standard','premium'].includes(input.tier))throw Error('方案编号、名称、类别、模式或档位无效');
 const params=input.params||{};if(params.videoStyle!==undefined&&!['model','slideshow'].includes(params.videoStyle))throw Error('未知Auto视频路线');if(params.maxSeconds!==undefined&&(!Number.isFinite(params.maxSeconds)||params.maxSeconds<=0||params.maxSeconds>86400)||params.requireOnline!==undefined&&typeof params.requireOnline!=='boolean')throw Error('Auto调度约束无效');if(Array.isArray(params)||typeof params!=='object'||Object.keys(params).some(k=>!permitted[input.kind].includes(k))||JSON.stringify(params).length>2500)throw Error('方案含不适用的参数');
 if(!Number.isFinite(Number(input.budgetCNY??0))||Number(input.budgetCNY??0)<0||Number(input.budgetCNY??0)>100)throw Error('方案单任务预算无效');
 if(input.connectionId&&!new ConnectionStore(root).load().value.connections.some(c=>c.id===input.connectionId&&c.kind===input.kind))throw Error('连接与媒体类别不匹配');
 if(input.requiresRebind&&(input.workflowId&&!input.instanceId||['Cloud','Hybrid'].includes(input.mode)&&!input.connectionId))throw Error('跨设备方案需重新选择执行实例或云端账号后保存');
 for(const key of ['workflowId','instanceId'])if(input[key]&&!/^[\w.-]{1,100}$/.test(input[key]))throw Error('工作流或实例 ID 无效');
 const workflowParams=input.workflowParams||{};
 if(!workflowParams||Array.isArray(workflowParams)||typeof workflowParams!=='object'||JSON.stringify(workflowParams).length>12000)throw Error('动态工作流参数无效');
 let workflowVersion=null;
 if(input.workflowId){const t=workflowDefinition31(root,input.workflowId);if(t.kind!==input.kind||!t.graph)throw Error('方案工作流类别不符或尚未转换');if(input.expectedWorkflowVersion!==undefined&&input.expectedWorkflowVersion!==t.version)throw Error('工作流版本变化，请重新读取参数并检查依赖');bind(t.graph,t.mappings,workflowParams);workflowVersion=t.version;}
 else if(Object.keys(workflowParams).length)throw Error('动态参数需要绑定工作流');
 const state=plans3(root),old=state.plans.find(p=>p.id===input.id),inst=loadSettings3(root).instances.find(i=>i.id===input.instanceId);let speedEstimate=null;
 if(Object.hasOwn(input,'estimatedSeconds')&&input.estimatedSeconds!=null){if(!Number.isFinite(input.estimatedSeconds)||input.estimatedSeconds<=0||input.estimatedSeconds>86400||!input.workflowId||!inst)throw Error('耗时估算需正秒数、工作流与明确实例');speedEstimate={seconds:input.estimatedSeconds,instanceId:inst.id,instanceUrl:inst.url,workflowId:input.workflowId,workflowVersion,evidence:'user-estimate; not benchmarked'};}
 else if(!Object.hasOwn(input,'estimatedSeconds')&&old?.speedEstimate&&old.speedEstimate.workflowId===input.workflowId&&old.speedEstimate.workflowVersion===workflowVersion&&old.speedEstimate.instanceId===inst?.id&&old.speedEstimate.instanceUrl===inst?.url)speedEstimate=old.speedEstimate;
 const p={id:input.id,name:input.name.trim(),kind:input.kind,mode:input.mode,tier:input.tier,connectionId:input.connectionId||'',workflowId:input.workflowId||'',instanceId:input.instanceId||'',params,workflowParams,workflowVersion,speedEstimate,budgetCNY:Number(input.budgetCNY||0)};
 if(state.plans.length>=200&&!state.plans.some(x=>x.id===p.id))throw Error('方案数量已达上限');
 state.plans=[...state.plans.filter(x=>x.id!==p.id),p];atomicJSON(file(root),state);return p;
}
export function activatePlan3(root,id,kind){return withResourceLock49(root,()=>activatePlanUnlocked49(root,id,kind));}
function activatePlanUnlocked49(root,id,kind){
 const state=plans3(root);const p=state.plans.find(p=>p.id===id);
 if(id&&!p)throw Error('方案不存在');if(p){delete p.restoredInactive49;state.active[p.kind]=p.id;}else if(kinds.includes(kind))delete state.active[kind];else throw Error('需要类别');
 atomicJSON(file(root),state);return state.active;
}
export function applyPlanArgs(root,args){const p=activePlan3(root,args.kind);return p?{...p.params,tier:p.tier,connectionId:p.connectionId||undefined,...Object.fromEntries(Object.entries(args).filter(([,v])=>v!==undefined))}:args;}
// Workflow-only values never enter the cloud adapter argument object.
export function workflowPlanValues31(root,plan,templateId,overrides={}){
 const t=workflowDefinition31(root,templateId),values={};
 if(plan?.workflowId&&plan.workflowId!==templateId)plan=null;
 if(plan?.workflowId===templateId&&plan.workflowVersion!=null&&plan.workflowVersion!==t.version)throw Error('工作流版本变化，请重新检查并保存方案参数');
 for(const [key,value]of Object.entries({...plan?.params,...plan?.workflowParams,...overrides}))if(value!==undefined){
  if(Object.hasOwn(t.mappings,key))values[key]=value;
  else if(Object.hasOwn(plan?.workflowParams||{},key)||Object.hasOwn(overrides,key))throw Error('工作流版本变化或参数未映射 '+key);
 }
 bind(t.graph,t.mappings,values);return values;
}
