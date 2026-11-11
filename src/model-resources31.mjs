import fs from 'node:fs';import path from 'node:path';
import {atomicJSON} from './policy3.mjs';
import {modelCatalog,fieldsOf,optionsOf,reviewedNodes} from './workflow-format31.mjs';
const file=root=>path.join(root,'model-resource-metadata31.json');
export const metadata31=root=>fs.existsSync(file(root))?JSON.parse(fs.readFileSync(file(root),'utf8')):[];
const text=(v,n=500)=>String(v||'').slice(0,n);
export function saveModelMetadata31(root,input) {
  if(!input||!input.instanceId||!input.loader||!input.input||!input.name||[input.instanceId,input.loader,input.input,input.name].some(v=>typeof v!=='string'||v.length>300))throw Error('模型资源标识不完整');
  let source=null;if(input.source){const u=new URL(input.source);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('模型来源必须是无凭证、无查询参数的 HTTPS 链接');source=u.href;}
  if(input.bytes!=null&&(!Number.isSafeInteger(input.bytes)||input.bytes<0))throw Error('文件大小无效');
  if(input.minimumVRAMMB!=null&&(!Number.isSafeInteger(input.minimumVRAMMB)||input.minimumVRAMMB<0||input.minimumVRAMMB>1048576))throw Error('显存要求无效');
  const id=JSON.stringify([input.instanceId,input.loader,input.input,input.name]),record={id,instanceId:input.instanceId,loader:input.loader,input:input.input,name:input.name,version:text(input.version,100),description:text(input.description,2000),source,bytes:input.bytes??null,license:text(input.license,200),hardware:text(input.hardware,1000),architecture:text(input.architecture,200),evidence:'user-supplied; not benchmarked or vendor-verified by plugin',modified:new Date().toISOString()};
  record.minimumVRAMMB=input.minimumVRAMMB??null;
  const rows=metadata31(root);if(rows.length>=5000&&!rows.some(r=>r.id===id))throw Error('元数据条目过多');atomicJSON(file(root),[...rows.filter(r=>r.id!==id),record]);return record;
}
export function resources31(root,info,instanceId) {
  const metadata=metadata31(root),live=modelCatalog(info,instanceId);
  return live.map(m=>({...m,...metadata.find(r=>r.id===m.id),available:true}));
}
export function requirements31(root,graph,info,instanceId,accepted=reviewedNodes) {
  const nodes=[],models=[],metadata=metadata31(root);
  for(const [id,n]of Object.entries(graph)) {
    const d=info[n.class_type];
    nodes.push({id,type:n.class_type,available:!!d,reviewed:accepted.has(n.class_type),cloudApi:!!d?.api_node,reason:!d?'实例缺少该节点':d.api_node?'云端 API 节点不能作为隐式本地执行':!accepted.has(n.class_type)?'未审查节点：可保存原图，执行仍被阻止':null});
    for(const [input,name]of Object.entries(n.inputs)) {
      if(typeof name!=='string'||!/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name\d*$/.test(input))continue;
      const choices=optionsOf(fieldsOf(d)[input]),meta=metadata.find(r=>r.instanceId===instanceId&&r.loader===n.class_type&&r.input===input&&r.name===name);
      models.push({node:id,loader:n.class_type,input,name,instanceId,available:!!choices?.includes(name),reason:!d?'加载节点缺失':!choices?'实例未报告资源选项':!choices.includes(name)?'所绑定资源未在加载器列表中':null,source:meta?.source||null,bytes:meta?.bytes??null,license:meta?.license||null,hardware:meta?.hardware||null,architecture:meta?.architecture||null,metadataEvidence:meta?.evidence||'未知；不根据文件名猜测兼容架构',alternatives:choices||[],guide:['核对工作流发布者给出的模型架构、加载节点及许可证','仅从已核实来源手动安装到该实例的对应模型目录','大型模型和第三方 Python 节点必须先取得用户批准','安装后重新检测；其他同槽资源不等于架构兼容替代品']});
    }
  }
  return {instanceId,nodes,models,ready:nodes.every(n=>n.available&&n.reviewed&&!n.cloudApi)&&models.every(m=>m.available),downloadsPerformed:0};
}

// Dependency introspection is separate from compilation. In particular, current
// official templates can contain nested frontend subgraphs and proxy widgets.
// We can identify their declared resources without pretending to compile them.
export function editorRequirements31(root,gui,info,instanceId,accepted=reviewedNodes) {
 const definitions=new Map((gui.definitions?.subgraphs||[]).map(d=>[d.id,d])),nodes=[],models=[],limitations=[],metadata=metadata31(root);let count=0;
 const visit=(graph,scope,active=new Set())=>{
  for(const n of graph.nodes||[]) {
   if(++count>300)throw Error('编辑器依赖节点过多');
   if(['Note','MarkdownNote'].includes(n.type))continue;
   const sub=definitions.get(n.type);
   if(sub){if(active.has(n.type))throw Error('子图循环引用');limitations.push('子图 '+(sub.name||n.type)+' 仅分析依赖，代理控件需在 ComfyUI 导出 API 图');visit(sub,scope+'/'+n.id,new Set([...active,n.type]));continue;}
   const d=info[n.type];nodes.push({id:scope+'/'+n.id,type:n.type,available:!!d,reviewed:accepted.has(n.type),cloudApi:!!d?.api_node});
   for(const m of n.properties?.models||[]) {
    if(typeof m.name!=='string')continue;
    const fields=Object.keys(fieldsOf(d)).filter(k=>/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name\d*$/.test(k)),input=fields.length===1?fields[0]:null,options=input?optionsOf(fieldsOf(d)[input]):null;
    const meta=metadata.find(r=>r.instanceId===instanceId&&r.loader===n.type&&r.input===input&&r.name===m.name);
    let source=meta?.source||null;if(!source&&typeof m.url==='string'){try{const u=new URL(m.url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash)source=u.href;}catch{}}
    models.push({node:scope+'/'+n.id,loader:n.type,input,name:m.name,directory:m.directory||null,instanceId,available:!!options?.includes(m.name),source,sourceTrust:meta?'user-supplied':'workflow-declared; verify publisher before download',bytes:meta?.bytes??null,license:meta?.license||null,hardware:meta?.hardware||null,reason:!d?'加载节点缺失':!input?'模型字段不明确，需手动映射':!options?.includes(m.name)?'依赖模型未在实例选项中':null});
   }
  }
 };
 visit(gui,'editor');return{instanceId,nodes,models,ready:false,executionGraphAvailable:false,limitations:['仅原图依赖分析，尚无可执行 API 图',...limitations],downloadsPerformed:0};
}
