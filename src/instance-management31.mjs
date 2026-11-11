import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';import{loadSettings3,saveSettings3,atomicJSON}from'./policy3.mjs';import{instanceReferences31,instanceSummary31}from'./instance-identity31.mjs';
const archiveFile=root=>path.join(root,'removed-instances31.json');const archived=root=>fs.existsSync(archiveFile(root))?JSON.parse(fs.readFileSync(archiveFile(root),'utf8')):[];
export const settingsRevision31=settings=>createHash('sha256').update(JSON.stringify(settings)).digest('hex');
export function instanceManage31(root,a){
 const s=loadSettings3(root);if(a.operation==='audit')return{instances:instanceSummary31(s).map(i=>({...i,...instanceReferences31(root,i.id)})),removed:archived(root).map(({instance,removedAt})=>({id:instance.id,label:instance.label,url:instance.url,removedAt}))};
 if(a.revision!==settingsRevision31(s))throw Error('实例配置已变化，请重新读取后操作');
 if(a.operation==='remove'){
  const i=s.instances.find(i=>i.id===a.id);if(!i)throw Error('实例不存在');if(i.enabled!==false)throw Error('请先断开此配置，再检查引用并移除');const refs=instanceReferences31(root,i.id);if(!refs.removable)throw Error(refs.errors.length?'无法完整检查实例引用，禁止移除':'实例仍被工作流、方案、模型登记或任务历史引用；只能断开，不能移除');
  atomicJSON(archiveFile(root),[...archived(root).filter(x=>x.instance.id!==i.id),{instance:i,removedAt:new Date().toISOString()}]);saveSettings3(root,{...s,instances:s.instances.filter(x=>x.id!==i.id)},{removeId:i.id});return{removed:i.id,recoverable:true,serviceStopped:false,mediaDeleted:false};
 }
 if(a.operation==='restore'){
  const i=archived(root).find(r=>r.instance.id===a.id);if(!i)throw Error('没有可恢复配置');if(s.instances.some(x=>x.id===a.id))throw Error('实例ID已存在，禁止覆盖');saveSettings3(root,{...s,instances:[...s.instances,{...i.instance,enabled:false}]});atomicJSON(archiveFile(root),archived(root).filter(x=>x.instance.id!==a.id));return{restored:a.id,enabled:false};
 }
 throw Error('未知实例管理操作');
}
