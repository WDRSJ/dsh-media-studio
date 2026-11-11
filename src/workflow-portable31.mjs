import {graphStructure} from './workflow-format31.mjs';
const sensitive=/(?:api[_-]?key|secret|password|credential|authorization|access[_-]?token|refresh[_-]?token)/i;
export function safeData(value,at='workflow') {
  if(Array.isArray(value)){value.forEach((v,i)=>safeData(v,at+'['+i+']'));return;}
  if(value&&typeof value==='object'){for(const [key,v]of Object.entries(value)){if(sensitive.test(key)&&v!==null&&v!==''&&v!==undefined)throw Error('便携导出拒绝可能的凭证字段 '+at+'.'+key);safeData(v,at+'.'+key);}return;}
  if(typeof value==='string'){
    if(/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value)||/sk-[A-Za-z0-9_-]{24,}/.test(value))throw Error('便携导出拒绝绝对路径或疑似密钥 '+at);
    if(/^https?:\/\//.test(value)){const u=new URL(value);if(u.username||u.password||[...u.searchParams.keys()].some(k=>sensitive.test(k)||/token/i.test(k)))throw Error('便携导出拒绝敏感链接 '+at);}
  }
}
export function exportPortable31(t) {
  if(!t.graph)throw Error('便携工作流需要 API 图以便检查敏感字段；请先转换或补充 API 图');
  graphStructure(t.graph);
  const workflow={name:t.name,description:t.description||'',kind:t.kind,graph:structuredClone(t.graph),mappings:structuredClone(t.mappings||{}),dependencies:structuredClone(t.dependencies||{}),originVersion:t.version};
  if(t.gui){workflow.gui=structuredClone(t.gui);workflow.gui.extra={mediaStudio:structuredClone(t.gui.extra?.mediaStudio||{})};}
  safeData(workflow);
  return {format:'dsh-media-workflow',schemaVersion:1,workflow,rebind:{required:true,instanceId:null,models:'重新检查实例的加载器选项；原模型名只是依赖引用，不随包附带模型文件',inputs:'重新上传/选择所需素材；不包含文件内容'},containsCredentials:false};
}
export function importPortable31(doc) {
  if(doc?.format!=='dsh-media-workflow'||doc.schemaVersion!==1||!doc.workflow)throw Error('不支持的便携工作流版本');
  safeData(doc.workflow);graphStructure(doc.workflow.graph);
  const {name,description,kind,graph,mappings,gui}=doc.workflow;
  return {name,description,kind,graph,mappings,gui,instanceId:null,modelBindings:{}};
}
