import{createHash}from'node:crypto';import{inputContract53}from'./media-inputs53.mjs';
export const contractHash53=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const known={SaveImage:['image','images'],PreviewImage:['image','images'],SaveVideo:['video','images'],SaveWEBM:['video','images'],SaveAudio:['audio','audio'],SaveAudioMP3:['audio','audio'],SaveAudioOpus:['audio','audio'],SaveAudioAdvanced:['audio','audio'],PreviewAudio:['audio','audio']};
export function mediaContract51(t,{reviews=[],instance,info}={}){
 const graph=t.graph,outputs=[],issues=[];if(!graph)return{schemaVersion:2,status:'pending',compatible:false,issues:['需要API图后检查媒体输出'],outputs};
 const graphHash=contractHash53(graph),valid=reviews.filter(r=>r.workflowId===t.id&&r.version===t.version&&r.graphHash===graphHash&&instance?.id===r.instanceId&&instance?.url===r.instanceUrl&&info?.[graph[r.node]?.class_type]&&contractHash53(info[graph[r.node].class_type])===r.definitionHash);
 const inputContract=inputContract53(t);if(inputContract.issues.length)issues.push(...inputContract.issues);
 for(const[id,n]of Object.entries(graph)){const base=known[n.class_type],review=valid.find(r=>r.node===id);if(base||review)outputs.push({node:id,type:base?.[0]||review.technicalType,group:base?.[1]||review.group,source:base?'known adapter':'version/instance/definition reviewed adapter'});}
 const explicit=t.outputSelection53;if(explicit!==undefined&&(!Array.isArray(explicit)||!explicit.length||new Set(explicit).size!==explicit.length||explicit.some(id=>!outputs.some(o=>o.node===id))))issues.push('目标输出节点无效或尚未审查');
 if(!outputs.length)issues.push('没有可证明的媒体输出节点；未知节点需扩展契约审查');
 if(!explicit&&info&&Object.entries(graph).some(([id,n])=>info[n.class_type]?.output_node&&!outputs.some(o=>o.node===id)))issues.push('包含未知输出节点，必须明确选择已审查目标输出');
 if(!explicit&&outputs.length>1)issues.push('多输出工作流必须明确选择目标节点，不自动选第一项');
 const selected=explicit?outputs.filter(o=>explicit.includes(o.node)):outputs;
 const expected=['music','speech'].includes(t.kind)?'audio':t.kind;
 if(!['image','video','audio'].includes(expected)||selected.some(o=>o.type!==expected))issues.push('声明媒体 '+t.kind+' 与目标输出类型不符');
 const ancestors=id=>{const seen=new Set();const visit=n=>{for(const v of Object.values(graph[n]?.inputs||{}))if(Array.isArray(v)&&!seen.has(String(v[0]))){seen.add(String(v[0]));visit(String(v[0]));}};visit(id);return seen;};
 if(['music','speech'].includes(t.kind)&&selected.some(o=>!valid.some(r=>r.node===o.node&&r.purpose===t.kind&&r.producerNode&&!/^(Load|Save|Preview|Empty|AudioMerge|AudioConcat|AudioCrop)/.test(graph[r.producerNode]?.class_type||'')&&ancestors(o.node).has(r.producerNode)&&info?.[graph[r.producerNode]?.class_type]&&contractHash53(info[graph[r.producerNode].class_type])===r.producerDefinitionHash&&typeof r.semanticEvidence==='string'&&r.semanticEvidence.length>=20)))issues.push('通用audio不能证明music/speech；需要当前版本、实例和生成节点绑定的用途审查证据');
 return{schemaVersion:2,workflowId:t.id,version:t.version,graphHash,purpose:t.kind,technicalType:expected,status:issues.length?'pending':'preflight-only',compatible:!issues.length,outputs,selected,selection:explicit||selected.map(o=>o.node),issues,inputTypes:inputContract.inputTypes,inputs:inputContract.inputs,inputStatus:inputContract.status,inputIssues:inputContract.issues,cardinality:{minimumPerSelectedNode:1,maximumTotalFiles:64,selection:'all files of selected nodes; Hybrid requires one target artifact'},parameters:Object.entries(t.mappings||{}).map(([name,m])=>({name,node:m.node,input:m.input,type:typeof graph[m.node]?.inputs?.[m.input]})),dependencies:[...new Set(Object.values(graph).map(n=>n.class_type))],reviewBindings:valid,resultVerification:'required before completion; not yet executed'};
}
