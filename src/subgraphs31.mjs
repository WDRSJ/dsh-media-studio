// Structural expansion only. No frontend plugins, dynamic scripts or model-name
// heuristics are executed. Unsupported widget migrations fail closed.
export function expandEditor31(document,info,{fieldsOf,optionsOf,reviewedNodes}) {
 const sourceMap={},notes=[],leaves=[],connections=[],definitions=new Map(),rootIds=new Set((document.nodes||[]).map(n=>String(n.id)));let serial=0,total=0,linkSerial=0;
 for(const d of document.definitions?.subgraphs||[]){if(!d.id||definitions.has(d.id))throw Error('子图定义 ID 重复或无效');definitions.set(d.id,d);}
 const primitive=s=>!!optionsOf(s)||['STRING','INT','FLOAT','BOOLEAN'].includes(s?.[0]);
 const specFor=(info,type,name)=>{const base=fieldsOf(info[type]);if(Object.hasOwn(base,name))return base[name];const dot=name.indexOf('.');if(dot<0)return undefined;const parent=base[name.slice(0,dot)];const sub=name.slice(dot+1);if(parent?.[0]!=='COMFY_DYNAMICCOMBO_V3'&&parent?.[0]!=='COMBO')return undefined;for(const option of parent?.[1]?.options||[]){const s=option?.inputs?.required?.[sub]||option?.inputs?.optional?.[sub];if(s)return s;}return undefined;};
 const primitiveNodeTypes=new Set(['PrimitiveNode','PrimitiveString','PrimitiveStringMultiline','PrimitiveInt','PrimitiveFloat','PrimitiveBoolean']);
 const order=d=>[...(d?.input_order?.required||Object.keys(d?.input?.required||{})),...(d?.input_order?.optional||Object.keys(d?.input?.optional||{}))];
 const allocate=()=>{let id;do{id='sg_'+(++serial);}while(rootIds.has(id));return id;};
 const literal=value=>({literal:true,value});
 const widgetIndex=(node,key)=>{
  const def=info[node.type];if(!def)throw Error('缺少节点定义 '+node.type);let p=0;
  const dynamicDeps=(s,value)=>{if(!s||!['COMFY_DYNAMICCOMBO_V3','COMBO'].includes(s[0]))return [];const opt=(s?.[1]?.options||[]).find(o=>o&&o.key===value);if(!opt)return [];return [...Object.entries(opt.inputs?.required||{}),...Object.entries(opt.inputs?.optional||{})];};
  for(const field of order(def)){
   const s=fieldsOf(def)[field],socket=node.inputs?.find(i=>i.name===field);
   if(!primitive(s)||s?.[1]?.forceInput||socket?.link!=null&&!socket.widget)continue;
   if(field===key)return p;
   const selected=node.widgets_values?.[p];p++;if((s?.[1]?.control_after_generate||['seed','noise_seed'].includes(field))&&['fixed','increment','decrement','randomize'].includes(node.widgets_values?.[p]))p++;
   for(const [dep,depSpec] of dynamicDeps(s,selected)){if(field+'.'+dep===key)return p;if(primitive(depSpec)){p++;if((depSpec?.[1]?.control_after_generate||['seed','noise_seed'].includes(dep))&&['fixed','increment','decrement','randomize'].includes(node.widgets_values?.[p]))p++;}}
  }
  throw Error('无法可靠定位提升参数 '+node.type+'.'+key);
 };
 function scope(doc,prefix,inputs=new Map(),ancestry=[]){
  if(ancestry.length>8||!Array.isArray(doc.nodes)||!Array.isArray(doc.links)||doc.links.length>3000)throw Error('子图结构或深度不受支持');
  const nodes=new Map(),links=new Map(),children=new Map(),flat=new Map(),resolving=new Set(),primitiveValues=new Map();
  for(const n of doc.nodes){if(++total>300)throw Error('展开节点超过300');const id=String(n.id);if(nodes.has(id))throw Error('重复节点 ID '+prefix+id);if(n.mode&&![0,2,4].includes(n.mode))throw Error('不支持静音或旁路节点 '+prefix+id);if(n.properties?.proxyWidgetErrorQuarantine?.length&&!n.properties.proxyWidgetErrorQuarantine.every(e=>e.reason==='missingSubgraphInput'&&e.originalEntry?.[1]==='control_after_generate'))throw Error('不支持隔离代理参数，请导出 API 格式');nodes.set(id,n);}
  for(const l of doc.links){const row=Array.isArray(l)?l:[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.type];if(row.length!==6||links.has(row[0]))throw Error('连线格式或 ID 无效');links.set(row[0],row);}
  const inputId=String(doc.inputNode?.id??-10),outputId=String(doc.outputNode?.id??-20);
  for(const l of links.values()){
   if(!nodes.has(String(l[1]))&&!(prefix&&String(l[1])===inputId))throw Error('悬空编辑器连线源');
   if(prefix&&String(l[3])===outputId)continue;
   const target=nodes.get(String(l[3]));if(!target||target.inputs?.[Number(l[4])]?.link!==l[0])throw Error('悬空或不一致的编辑器目标连线');
  }
  for(const [id,n]of nodes)if(!(n.mode===2||n.mode===4)&&!definitions.has(n.type)&&!['Note','MarkdownNote','Reroute','PrimitiveNode'].includes(n.type)){
   if(primitiveNodeTypes.has(n.type))continue;if(!info[n.type]||info[n.type].api_node||!reviewedNodes.has(n.type))throw Error('不能可靠转换节点 '+n.type+'，请提供 API 图及显式参数映射');
   const clone=structuredClone(n);clone.id=prefix?allocate():n.id;clone.inputs=(clone.inputs||[]).map(s=>({...s,link:null}));clone.outputs=(clone.outputs||info[n.type]?.output?.map(type=>({name:type,type}))||[]).map(s=>({...s,links:[]}));flat.set(id,clone);leaves.push(clone);sourceMap[String(clone.id)]=prefix+id;
  }
  const resolveLink=linkId=>{const l=links.get(linkId);if(!l)throw Error('连线不存在 '+prefix+linkId);return resolve(l[1],l[2]);};
 const primitiveValue=n=>primitiveValues.has(String(n.id))?primitiveValues.get(String(n.id)):(n.widgets_values||[])[0];
  const child=id=>{
   if(children.has(id))return children.get(id);const host=nodes.get(id),def=definitions.get(host?.type);if(!def)throw Error('子图定义不存在');if(ancestry.includes(def.id))throw Error('子图循环引用');
   const incoming=new Map(),widgetSlots=[];
   for(const [index,slot]of (def.inputs||[]).entries()){
    const socket=host.inputs?.find(s=>s.name===slot.name);
    if(socket?.link!=null)incoming.set(index,resolveLink(socket.link));
    const internal=(def.links||[]).map(l=>Array.isArray(l)?l:[l.id,l.origin_id,l.origin_slot,l.target_id,l.target_slot,l.type]).filter(l=>String(l[1])===String(def.inputNode?.id??-10)&&Number(l[2])===index);
    const hasWidget=internal.length&&internal.every(l=>{const target=def.nodes?.find(n=>String(n.id)===String(l[3])),input=target?.inputs?.[Number(l[4])];return input?.widget&&(primitiveNodeTypes.has(target.type)||primitive(specFor(info,target.type,input.name)));});
    if(hasWidget)widgetSlots.push(index);
   }
   const values=host.widgets_values||[];if(!Array.isArray(values)||values.length&&values.length!==widgetSlots.length)throw Error('子图提升控件数量不明确，拒绝猜测 '+def.name);
   const named=host.widgets_values_named;if(Object.hasOwn(host,'widgets_values_named')){if(!named||Array.isArray(named)||typeof named!=='object'||Object.keys(named).some(key=>!widgetSlots.some(index=>def.inputs[index].name===key)))throw Error('子图命名控件不明确');for(const [position,index]of widgetSlots.entries()){const key=def.inputs[index].name;if(!Object.hasOwn(named,key))continue;if(Object.hasOwn(host,'widgets_values')&&JSON.stringify(values[position])!==JSON.stringify(named[key]))throw Error('子图命名控件与位置控件值冲突');if(!incoming.has(index))incoming.set(index,literal(named[key]));}}
   for(let i=0;i<values.length;i++)if(!incoming.has(widgetSlots[i]))incoming.set(widgetSlots[i],literal(values[i]));
   const result=scope(def,prefix+id+'/',incoming,[...ancestry,def.id]);children.set(id,result);return result;
  };
  function resolve(id,slot){
   id=String(id);const key=id+':'+slot;if(resolving.has(key))throw Error('子图连线循环依赖');resolving.add(key);
   try{
    if(id===inputId&&prefix)return inputs.get(Number(slot))??{unbound:true};
    const n=nodes.get(id);if(!n)throw Error('连线源节点不存在 '+prefix+id);if(n.mode===2||n.mode===4)return{disabled:true};
    if(definitions.has(n.type))return child(id).output(Number(slot));
    if(n.type==='Reroute'){if(slot!==0||n.inputs?.length!==1||n.inputs[0].link==null)throw Error('不支持的 Reroute');return resolveLink(n.inputs[0].link);}
    if(primitiveNodeTypes.has(n.type)){if(slot!==0)throw Error('不支持的原始值控件插槽');if(n.inputs?.[0]?.link!=null)return resolveLink(n.inputs[0].link);const value=primitiveValue(n);if(!['string','number','boolean'].includes(typeof value))throw Error('不支持的原始值控件');return literal(value);}
    const leaf=flat.get(id);if(!leaf)throw Error('注释节点不能参与执行连线');return{node:leaf,slot:Number(slot)};
   }finally{resolving.delete(key);}
  }
  for(const [id,n]of nodes){
   if(definitions.has(n.type)){child(id);continue;}
   if(primitiveNodeTypes.has(n.type)){const link=n.inputs?.[0]?.link;if(link!=null){const origin=resolveLink(link);if(origin?.literal)primitiveValues.set(id,origin.value);}continue;}
  const target=flat.get(id);if(!target)continue;
   for(const [index,input]of (n.inputs||[]).entries())if(input.link!=null){
    const l=links.get(input.link);if(!l||String(l[3])!==id||Number(l[4])!==index)throw Error('子图目标插槽不匹配');
    const origin=resolveLink(input.link),socket=target.inputs[index];
    if(origin.disabled){const spec=fieldsOf(info[n.type])?.[input.name];const required=Object.prototype.hasOwnProperty.call(info[n.type]?.input?.required||{},input.name);if(required)throw Error('静音或旁路节点提供了必需输入 '+prefix+id+'.'+input.name);socket.link=null;if(socket.widget)delete socket.widget;continue;}
    if(origin.unbound){socket.link=null;if(input.widget&&primitive(specFor(info,n.type,input.name)))continue;const required=Object.prototype.hasOwnProperty.call(info[n.type]?.input?.required||{},input.name);if(required)throw Error('子图必需输入没有外部连接 '+prefix+id+'.'+input.name);if(socket.widget)delete socket.widget;continue;}
    if(origin.literal){if(input.widget&&primitive(specFor(info,n.type,input.name))){const position=widgetIndex(n,input.name);target.widgets_values[position]=origin.value;}else{socket.link=null;delete socket.widget;socket.mediaStudioLiteral=origin.value;}}else{const link=++linkSerial;socket.link=link;if(!origin.node.outputs?.[origin.slot])throw Error('子图输出插槽不存在');origin.node.outputs[origin.slot].links.push(link);connections.push([link,origin.node.id,origin.slot,target.id,index,l[5]]);}
   }
  }
  return{output(slot){const matches=[...links.values()].filter(l=>String(l[3])===outputId&&Number(l[4])===slot);if(matches.length!==1)throw Error('子图输出没有唯一来源');return resolveLink(matches[0][0]);}};
 }
 scope(document,'');
 if(definitions.size)notes.push('子图已按明确边界展开；原始编辑器图仍完整保留。未支持的代理控件迁移会拒绝转换。');
 return{document:{...document,nodes:leaves,links:connections,definitions:undefined},sourceMap,notes};
}
