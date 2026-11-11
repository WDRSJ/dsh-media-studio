// Only server-described primitives are converted. Frontend-only/custom widgets
// require their original editor document; they are never guessed from a model name.
import {expandEditor31} from './subgraphs31.mjs';
export const reviewedNodes = new Set(('EmptyImage SaveImage TextGenerate EmptyAudio PreviewAny ComfySwitchNode SkipLayerGuidanceDiTSimple EmptyFlux2LatentImage ResolutionSelector CheckpointLoaderSimple CLIPTextEncode EmptyLatentImage KSampler VAEDecode VAEEncode LoadImage ImageScale VAEEncodeForInpaint SetLatentNoiseMask ControlNetLoader ControlNetApplyAdvanced LoraLoader ImageBatch RepeatImageBatch SaveAnimatedWEBP SaveVideo SaveWEBM SaveAudioAdvanced CreateVideo CreateBoundingBoxes MOSSImageLayoutPrompt Wan22ImageToVideoLatent EmptyAceStep1.5LatentAudio TextEncodeAceStepAudio1.5 VAEDecodeAudio UNETLoader CLIPLoader DualCLIPLoader TripleCLIPLoader VAELoader LoraLoaderModelOnly UpscaleModelLoader ImageUpscaleWithModel ModelSamplingSD3 ModelSamplingFlux FluxGuidance EmptySD3LatentImage CLIPTextEncodeSDXL ConditioningZeroOut ModelSamplingAuraFlow').split(' '));
export const fieldsOf = d => ({...d?.input?.required,...d?.input?.optional});
const dynamicEntries = (spec,value) => { const option=(spec?.[1]?.options||[]).find(o=>o&&o.key===value); if(!option)return []; return [...Object.entries(option.inputs?.required||{}).map(([name,spec])=>({name,spec,required:true})),...Object.entries(option.inputs?.optional||{}).map(([name,spec])=>({name,spec,required:false}))]; };
const safeInput = x => typeof x==='string' && x.length<=160 && x.split('.').length<=8 && /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(x) && !['__proto__','prototype','constructor'].includes(x);
export const optionsOf = s => Array.isArray(s?.[0]) ? s[0] : s?.[0] === 'COMBO' ? s[1]?.options : s?.[0] === 'COMFY_DYNAMICCOMBO_V3' ? (s[1]?.options || []).map(o => typeof o === 'string' ? o : o?.key) : null;
const primitive = s => !!optionsOf(s) || ['STRING','INT','FLOAT','BOOLEAN'].includes(s?.[0]);
const ordered = d => [...(d.input_order?.required || Object.keys(d.input?.required || {})),...(d.input_order?.optional || Object.keys(d.input?.optional || {}))];
const safeId = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x) && !['__proto__','prototype','constructor'].includes(x);
export const isLinkPair = v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]) && v[1] >= 0;
const validLiteral = v => { const walk=(x,d=0)=>{if(d>20)throw Error('输入 JSON 嵌套过深');if(x===null||['string','boolean'].includes(typeof x))return;if(typeof x==='number'){if(!Number.isFinite(x))throw Error('无效数值');return;}if(Array.isArray(x)){if(x.length>5000)throw Error('输入数组过大');x.forEach(y=>walk(y,d+1));return;}if(typeof x==='object'){if(Object.keys(x).length>2000)throw Error('输入对象过大');for(const [k,y]of Object.entries(x)){if(['__proto__','prototype','constructor'].includes(k))throw Error('不允许的字段 '+k);walk(y,d+1);}return;}throw Error('不支持的输入值');};walk(v);if(Buffer.byteLength(JSON.stringify(v),'utf8')>100000)throw Error('输入值过大');return v;};

export function graphStructure(graph) {
  if (!graph || Array.isArray(graph) || typeof graph !== 'object' || !Object.keys(graph).length || Object.keys(graph).length > 300) throw Error('需要有效的 API 格式节点图');
  for (const [id,n] of Object.entries(graph)) {
    if (!safeId(id) || !n || typeof n.class_type !== 'string' || !n.inputs || Array.isArray(n.inputs) || typeof n.inputs !== 'object') throw Error('无效的 API 节点 '+id);
    for (const [key,value] of Object.entries(n.inputs)) {
      if (!safeInput(key)) throw Error('无效输入名 '+key);
      if (isLinkPair(value)) { if (!Object.hasOwn(graph,String(value[0])) || value[1] < 0) throw Error('无效连线 '+id+'.'+key); }
      else validLiteral(value);
    }
  }
  const visited=new Set(),active=new Set(),levels={};
  const visit=id=>{if(active.has(id))throw Error('工作流存在循环依赖 '+id);if(visited.has(id))return levels[id];active.add(id);let level=0;for(const v of Object.values(graph[id].inputs))if(isLinkPair(v))level=Math.max(level,visit(String(v[0]))+1);active.delete(id);visited.add(id);return levels[id]=level;};
  for(const id of Object.keys(graph))visit(id);
  return levels;
}

export function validateValue(value,spec,label,allowUnavailable=false) {
  if (!spec) throw Error('实例未声明参数 '+label);
  const [type,config={}]=spec,options=optionsOf(spec);
  if (options) {if(!options.includes(value)&&!allowUnavailable)throw Error('缺少或不支持 '+label+'='+value);if(!['string','number','boolean'].includes(typeof value))throw Error('无效选项类型 '+label);return;}
  if (type==='INT'&&!Number.isInteger(value) || type==='FLOAT'&&typeof value!=='number' || type==='STRING'&&typeof value!=='string' || type==='BOOLEAN'&&typeof value!=='boolean') throw Error('参数类型错误 '+label);
  if (!primitive(spec)) throw Error('参数必须通过节点连线提供 '+label);
  if (typeof value==='number' && (!Number.isFinite(value) || value<config.min || value>config.max)) throw Error('参数越界 '+label);
}

const isWildcardType=t=>t==='*'||String(t||'').startsWith('COMFY_');
export function graphIssues(graph,info) {
  graphStructure(graph);const issues=[];
  for(const [id,n] of Object.entries(graph)) {
    const d=info[n.class_type];if(!d) {issues.push(id+' 缺少节点 '+n.class_type);continue;}
    for(const [key,v] of Object.entries(n.inputs))if(isLinkPair(v)) {
      const out=info[graph[String(v[0])].class_type]?.output,expected=fieldsOf(d)[key]?.[0];
      if(!out || v[1]>=out.length)issues.push(id+' 输出插槽不存在 '+key);
      else if(typeof expected==='string'&&!isWildcardType(expected)&&!isWildcardType(out[v[1]])&&expected!==out[v[1]])issues.push(id+' 连线类型不兼容 '+key);
    }
  }
  return issues;
}

export function parameterFields(graph,info) {
  graphStructure(graph);const result=[];
  for(const [node,n] of Object.entries(graph))for(const [input,value] of Object.entries(n.inputs))if(!Array.isArray(value)) {
    const s=fieldsOf(info[n.class_type])[input];
      const row={node,input,nodeType:n.class_type,type:s?.[0],default:value,options:optionsOf(s),min:s?.[1]?.min,max:s?.[1]?.max,step:s?.[1]?.step,multiline:s?.[1]?.multiline===true,known:!!s,editable:!!s&&primitive(s),resource:/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name\d*$/.test(input)};for(const k of Object.keys(row))if(row[k]===undefined)delete row[k];result.push(row);
  }
  return result;
}

function editorToGraphFlat(gui,info) {
  if(!Array.isArray(gui?.nodes)||!Array.isArray(gui?.links)||!gui.nodes.length||gui.nodes.length>300)throw Error('需要标准编辑器节点及连线');
  const links=gui.links.map(l=>Array.isArray(l)?l:[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.type]);
  if(new Set(links.map(l=>l[0])).size!==links.length)throw Error('重复连线 ID');
  const graph={},ids=new Set(gui.nodes.map(n=>String(n.id)));if(ids.size!==gui.nodes.length)throw Error('重复节点 ID');
  for(const n of gui.nodes) {
    const d=info[n.type];if(!reviewedNodes.has(n.type)||!d||d.api_node||n.mode&&n.mode!==0)throw Error('不能可靠转换节点 '+n.type+'，请从 ComfyUI 导出 API 格式');
    if(!Array.isArray(n.widgets_values||[]))throw Error('不支持的编辑器控件格式 '+n.type);
    const inputs={},widgets=n.widgets_values||[];let p=0;
    for(const key of ordered(d)) {
      const s=fieldsOf(d)[key],socket=n.inputs?.find(i=>i.name===key),connected=socket?.link!=null;
      if(socket?.mediaStudioLiteral!==undefined){inputs[key]=socket.mediaStudioLiteral;continue;}
      // Converted primitive sockets retain a widget value in some frontends.
      if(connected) {
        const l=links.find(l=>l[0]===socket.link),slot=n.inputs.indexOf(socket);
        if(!l||String(l[3])!==String(n.id)||Number(l[4])!==slot||!ids.has(String(l[1])))throw Error('编辑器连线不完整 '+key);
        inputs[key]=[String(l[1]),Number(l[2])];
        if(primitive(s)&&socket.widget) {p++;if(s?.[1]?.control_after_generate||['seed','noise_seed'].includes(key))if(['fixed','increment','decrement','randomize'].includes(widgets[p]))p++;}
      } else if(primitive(s)&&!s?.[1]?.forceInput&&p<widgets.length) {
        const value=widgets[p++];validateValue(value,s,n.type+'.'+key,true);inputs[key]=value;
        if(s?.[0]==='COMFY_DYNAMICCOMBO_V3'){for(const dep of dynamicEntries(s,value)){const depKey=key+'.'+dep.name;if(p>=widgets.length){if(dep.required)throw Error('节点控件缺少 '+depKey);break;}const depValue=widgets[p++];validateValue(depValue,dep.spec,n.type+'.'+depKey,true);inputs[depKey]=depValue;}}
        if(s?.[1]?.control_after_generate||['seed','noise_seed'].includes(key))if(['fixed','increment','decrement','randomize'].includes(widgets[p]))p++;
      } else if(!primitive(s)&&!s?.[1]?.forceInput&&socket?.widget&&p<widgets.length){ const value=widgets[p++]; validLiteral(value); if(s?.[1]?.socketless)continue; inputs[key]=typeof value==='string'?value:JSON.stringify(value); } else if(!primitive(s)&&Object.hasOwn(d.input?.required||{},key)){ throw Error('无法确定输入 '+n.type+'.'+key+'，请导出 API 格式'); } else if(Object.hasOwn(d.input?.required||{},key))throw Error('无法确定输入 '+n.type+'.'+key+'，请导出 API 格式');
    }
    if(p!==widgets.length)throw Error('节点控件数量不匹配 '+n.type+'，拒绝猜测参数顺序');
    graph[String(n.id)]={class_type:n.type,inputs};
  }
  graphStructure(graph);
  for(const l of links)if(!Object.hasOwn(graph,String(l[3]))||!Object.hasOwn(graph,String(l[1])))throw Error('悬空编辑器连线');
  const issues=graphIssues(graph,info);if(issues.length){throw Error(issues.join('；'));}
  return graph;
}

export function compileEditor31(gui,info){
 const normalized=structuredClone(gui),definitions=new Set((normalized.definitions?.subgraphs||[]).map(d=>d.id));
 const normalize=doc=>{for(const node of doc.nodes||[]){
  if(!Object.hasOwn(node,'widgets_values_named')||definitions.has(node.type)||['Note','MarkdownNote','Reroute','PrimitiveNode'].includes(node.type))continue;
  const named=node.widgets_values_named;
  if(!named||Array.isArray(named)||typeof named!=='object')throw Error('命名控件格式无效');
  const d=info[node.type];if(!d)throw Error('缺少命名控件节点定义 '+node.type);
  const values=[],used=new Set();let filledDefault=false;
  for(const key of ordered(d)){
   const s=fieldsOf(d)[key],socket=node.inputs?.find(i=>i.name===key);
   if(!primitive(s)&&!s?.[1]?.forceInput&&socket?.link==null&&Object.hasOwn(named,key)){validLiteral(named[key]);values.push(named[key]);used.add(key);continue;}
   if(!primitive(s)||s?.[1]?.forceInput||socket?.link!=null&&!socket.widget)continue;
   if(!Object.hasOwn(named,key)){if(Object.hasOwn(d.input?.required||{},key))throw Error('命名控件缺少字段 '+key);if(primitive(s)&&s?.[1]?.default!==undefined){values.push(s[1].default);filledDefault=true;}continue;}
   validateValue(named[key],s,node.type+'.'+key,true);values.push(named[key]);used.add(key);
   if(s?.[0]==='COMFY_DYNAMICCOMBO_V3'){for(const dep of dynamicEntries(s,named[key])){const depKey=key+'.'+dep.name;if(!Object.hasOwn(named,depKey)){if(dep.required)throw Error('命名控件缺少字段 '+depKey);continue;}validateValue(named[depKey],dep.spec,node.type+'.'+depKey,true);values.push(named[depKey]);used.add(depKey);}}
   if(['seed','noise_seed'].includes(key)||s?.[1]?.control_after_generate){const control=named.control_after_generate??'fixed';if(!['fixed','increment','decrement','randomize'].includes(control))throw Error('种子控制模式不明确');values.push(control);if(Object.hasOwn(named,'control_after_generate'))used.add('control_after_generate');}
  }
  if(/^Load(?:Image|Video|Audio)$/.test(node.type)&&Object.hasOwn(named,'upload')&&!used.has('upload')){values.push(named.upload);used.add('upload');}
  if(Object.keys(named).some(k=>!used.has(k)))throw Error('存在未声明命名控件，拒绝猜测 '+node.type);
  if(!filledDefault&&Object.hasOwn(node,'widgets_values')&&(!Array.isArray(node.widgets_values)||JSON.stringify(node.widgets_values)!==JSON.stringify(values)))throw Error('命名控件与位置控件值冲突，请从 ComfyUI 导出 API 图');
  node.widgets_values=values;delete node.widgets_values_named;
 }};
 normalize(normalized);for(const d of normalized.definitions?.subgraphs||[])normalize(d);
 const expanded=expandEditor31(normalized,info,{fieldsOf,optionsOf,reviewedNodes});
 return {graph:editorToGraphFlat(expanded.document,info),sourceMap:expanded.sourceMap,notes:expanded.notes};
}
export function editorToGraph(gui,info){return compileEditor31(gui,info).graph;}

export function graphToEditor(graph,info) {
  const levels=graphStructure(graph),issues=graphIssues(graph,info);if(issues.length)throw Error(issues.join('；'));
  const gui={last_node_id:0,last_link_id:0,nodes:[],links:[],groups:[],config:{},extra:{ds:{scale:1,offset:[40,40]},mediaStudio:{schema:1,generated:true,limitations:['仅恢复已审查节点的服务端参数；插件专属控件和历史布局无法从 API 图推断。']}},version:0.4},byId=new Map(),rows={};
  const ids=Object.keys(graph),numeric=new Map(ids.map((id,i)=>[id,i+1]));
  for(const [order,id] of ids.entries()) {
    const n=graph[id],d=info[n.class_type];
    if(!reviewedNodes.has(n.class_type)||!d||d.api_node)throw Error('缺少可靠编辑器转换规则 '+n.class_type+'，请保留原始编辑器 JSON');
    const node={id:numeric.get(id),type:n.class_type,pos:[levels[id]*360,(rows[levels[id]]||0)*360],size:[300,Math.max(130,ordered(d).length*34+60)],flags:{},order,mode:0,inputs:[],outputs:(d.output||[]).map((type,i)=>({name:d.output_name?.[i]||type,type,links:[],slot_index:i})),properties:{'Node name for S&R':n.class_type},widgets_values:[]};rows[levels[id]]=(rows[levels[id]]||0)+1;
    for(const key of ordered(d)) {
      const s=fieldsOf(d)[key],v=n.inputs[key],linked=isLinkPair(v);
      if(!primitive(s)||s?.[1]?.forceInput||linked)node.inputs.push({name:key,type:optionsOf(s)?'COMBO':s[0],link:null,...primitive(s)&&linked?{widget:{name:key}}:{}});
      if(primitive(s)&&!s?.[1]?.forceInput) {
        if(v===undefined&&!Object.hasOwn(s[1]||{},'default'))throw Error('不能推断缺省控件 '+n.class_type+'.'+key);
        const value=linked?(s[1]?.default??optionsOf(s)?.[0]??({INT:0,FLOAT:0,BOOLEAN:false,STRING:''}[s[0]])):v??s[1]?.default;
        validateValue(value,s,n.class_type+'.'+key);node.widgets_values.push(value);
        if(s?.[1]?.control_after_generate||['seed','noise_seed'].includes(key))node.widgets_values.push('fixed');
      } else if(!primitive(s)&&!s?.[1]?.forceInput&&!linked&&v!==undefined) {
        let value=v;if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}
        const socketInput=node.inputs.find(i=>i.name===key);if(socketInput)socketInput.widget={name:key};else node.inputs.push({name:key,type:s[0],widget:{name:key},link:null});
        node.widgets_values.push(value);
      }
    }
    gui.nodes.push(node);byId.set(id,node);
  }
  for(const [id,n]of Object.entries(graph))for(const [key,v]of Object.entries(n.inputs))if(isLinkPair(v)) {
    const origin=byId.get(String(v[0])),target=byId.get(id),slot=target.inputs.findIndex(i=>i.name===key),link=++gui.last_link_id;
    target.inputs[slot].link=link;origin.outputs[v[1]].links.push(link);gui.links.push([link,origin.id,v[1],target.id,slot,origin.outputs[v[1]].type]);
  }
  gui.last_node_id=ids.length;
  // Renumbered API IDs are recorded so parameter mappings can be migrated explicitly.
  gui.extra.mediaStudio.nodeIds=Object.fromEntries(numeric);
  return gui;
}

export function modelCatalog(info,instanceId) {
  const rows=[];
  for(const [node,d]of Object.entries(info))for(const [input,s]of Object.entries(fieldsOf(d))) {
    if(!/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name(?:\d+)?$/.test(input))continue;
    const type=/ckpt/.test(input)?'checkpoint':/unet|diffusion/.test(input)?'diffusion':/clip/.test(input)?'text-encoder':/vae/.test(input)?'vae':/lora/.test(input)?'lora':/control_net/.test(input)?'controlnet':/Upscale/.test(node)?'upscaler':'other';
    for(const name of optionsOf(s)||[])if(typeof name==='string')rows.push({id:JSON.stringify([instanceId,node,input,name]),instanceId,name,type,loader:node,input,available:true,version:null,bytes:null,source:null,license:null,hardware:null,metadataStatus:'实例仅报告可选资源名，大小、许可证及硬件要求尚未核实'});
  }
  return rows;
}
