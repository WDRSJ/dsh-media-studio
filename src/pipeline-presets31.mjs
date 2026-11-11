import {recoverResources49,withResourceLock49,assertNotArchived49} from './resource-journal49.mjs';
import {ConnectionStore} from './connections.mjs';
import fs from 'node:fs';import path from 'node:path';
import {atomicJSON} from './policy3.mjs';import {validatePipeline} from './pipeline3.mjs';import {safeData} from './workflow-portable31.mjs';
import {workflowDefinition31} from './workflows3.mjs';
const file=root=>path.join(root,'pipeline-presets31.json');
export function pipelinePresets31(root){recoverResources49(root);return fs.existsSync(file(root))?JSON.parse(fs.readFileSync(file(root))):[];}
export function savePipelinePreset31(root,input){return withResourceLock49(root,()=>savePipelineUnlocked49(root,input));}
function savePipelineUnlocked49(root,input){
 assertNotArchived49(root,'pipeline',input?.id);
 if(!input||!/^[\w-]{1,100}$/.test(input.id||'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('联合方案编号或名称无效');
 const stages=validatePipeline(input.spec).map(({id,name,executor,dependencies,params})=>({id,name,executor,dependencies,params}));safeData({stages});const accounts=new ConnectionStore(root).load().value.connections;for(const stage of stages){if(stage.executor==='cloud-media'&&!accounts.some(c=>c.id===stage.params.connectionId))throw Error('联合方案账户不存在，请重新绑定：'+stage.params.connectionId);if(stage.executor==='comfy-workflow')workflowDefinition31(root,stage.params.templateId);}
 const rows=pipelinePresets31(root),old=rows.find(p=>p.id===input.id);if(old&&input.expectedVersion!==old.version)throw Error('联合方案版本已变化，请重新读取');
 if(!old&&rows.length>=200)throw Error('联合方案已达200项');
 let auto=null;
 if(input.auto?.enabled){
  const a=input.auto;if(!['image','video','music','speech'].includes(a.kind)||!['model','edited','slideshow','composed'].includes(a.goal)||!['preview','standard','premium'].includes(a.tier))throw Error('Auto联合方案目标或档位无效');
  for(const s of stages)if(s.executor==='comfy-workflow'){const w=workflowDefinition31(root,s.params.templateId);if(s.params.workflowVersion!==undefined&&s.params.workflowVersion!==w.version)throw Error('工作流版本变化，请重新读取参数');s.params.workflowVersion=w.version;}
  auto={enabled:true,kind:a.kind,goal:a.goal,tier:a.tier,evidence:'用户声明的整条路线档位，非客观质量实测'};
 }
 const record={id:input.id,name:input.name.trim(),version:(old?.version||0)+1,stages,auto,modified:new Date().toISOString()};atomicJSON(file(root),[...rows.filter(p=>p.id!==record.id),record]);return record;
}
