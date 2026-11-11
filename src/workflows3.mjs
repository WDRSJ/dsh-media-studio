import {verifyMedia53} from './media-verify53.mjs';
import {preparation52} from './import-authority52.mjs';
import {checkImport52,validateEditor52} from './import-validation52.mjs';
import {mediaContract51,contractHash53} from './media-contract51.mjs';
import {recoverResources49,withResourceLock49,assertNotArchived49,resourceTransaction49} from './resource-journal49.mjs';
import {instanceLabel31} from './instance-identity31.mjs';
import {loadSettings3,saveSettings3} from './policy3.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {workflow as legacy} from './comfy.mjs';
import {reviewedNodes,editorToGraph,compileEditor31,graphToEditor,graphStructure,graphIssues,parameterFields,validateValue,modelCatalog,isLinkPair} from './workflow-format31.mjs';
import {resources31,requirements31,editorRequirements31,saveModelMetadata31} from './model-resources31.mjs';
import {nodePolicy31,nodeReviewRequests31,reviewNode31} from './node-policy31.mjs';
import {exportPortable31,importPortable31} from './workflow-portable31.mjs';
import {Vault} from './vault.mjs';
import {workflowIdentity31} from './workflow-identity31.mjs';
import {inputPort53,validateDeferredInputs53} from './media-inputs53.mjs';
import {validateUploadMedia54,maxUploadBase64_54} from './media-transfer54.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {prepareGUI, prepareAPI, WorkflowAutoError, detectDocumentKind} from './workflow-auto31.mjs';
import {listRemoteWorkflows, readRemoteWorkflow, saveRemoteWorkflow, remoteWorkflowStatus, remoteWorkflowName, workflowDigest, comfyWorkflowUrl, safeRemoteFile} from './comfy-workflows31.mjs';

const approved=reviewedNodes;
const instanceRoots=new WeakMap();
const copy=structuredClone;
const safeName=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
function write(file,v){fs.mkdirSync(path.dirname(file),{recursive:true});for(let attempt=0;attempt<50;attempt++){const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(v,null,2));fs.renameSync(tmp,file);return;}catch(e){try{fs.rmSync(tmp,{force:true});}catch{}if(!['EPERM','EACCES','EBUSY'].includes(e.code))throw e;try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}catch{}}}throw Error('无法写入任务回执 '+path.basename(file)+'：文件被其他进程占用，原回执保留；请查询原任务，禁止盲目重提');}
function load(file,fallback){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):fallback;}
function rootDir(root){return path.join(root,'workflows3');}
function instance(record){const u=new URL(record.url||record.address);if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('实例地址需为独立服务根地址');const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);if(!['https:','http:'].includes(u.protocol)||!local&&u.protocol!=='https:')throw Error('远程实例需要 HTTPS 及显式信任');if(!safeName(record.id))throw Error('实例 ID 无效');return{id:record.id,label:String(record.label||'').slice(0,100),enabled:record.enabled!==false,url:u.origin,address:u.origin,local,trusted:local||record.trusted===true,credentialRef:record.credentialRef||''};}
function instances(root){return loadSettings3(root).instances.map(i=>{const out={...instance(i),credentialRef:i.credentialRef||''};instanceRoots.set(out,root);return out;});}
function authHeaders(inst){if(!inst.credentialRef)return{};if(!inst.trusted)throw Error('未信任的实例不会收到凭证');const root=instanceRoots.get(inst);if(!root)throw Error('凭证实例上下文缺失');return {authorization:'Bearer '+new Vault(root).get(inst.credentialRef)};}
async function call(inst,route,body,bytes=false){if(inst.enabled===false)throw Error('此实例配置已断开，不会联系服务');const response=await fetch(inst.address+route,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,headers:{...authHeaders(inst),...body?{'content-type':'application/json'}:{}},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok){let detail='';try{detail=(await response.text()).slice(0,300);}catch{}const error=Error('Comfy HTTP '+response.status+(detail?': '+detail:''));error.definitive=[400,401,403,404,409,413,422].includes(response.status);error.httpStatus=response.status;throw error;}let size=0,parts=[];for await(const b of response.body){size+=b.length;if(size>(bytes?128:32)*1024*1024)throw Error('实例响应超出限制');parts.push(b);}const data=Buffer.concat(parts);return bytes?data:JSON.parse(data);}
async function callRaw(inst,route,{method='GET',body,contentType='application/json'}={}){if(inst.enabled===false)throw Error('此实例配置已断开，不会联系服务');const response=await fetch(inst.address+route,{method,body,headers:{...authHeaders(inst),...body?{'content-type':contentType}:{}},redirect:'error',signal:AbortSignal.timeout(30000)});const status=response.status;let text='';if(method!=='HEAD'){let size=0,parts=[];for await(const b of response.body){size+=b.length;if(size>32*1024*1024)throw Error('实例响应超出限制');parts.push(b);}text=Buffer.concat(parts).toString('utf8');}if(!response.ok){const error=Error('Comfy HTTP '+status+(text?': '+text.slice(0,300):''));error.definitive=[400,401,403,404,409,413,422].includes(status);error.httpStatus=status;throw error;}let data=text;if(text&&/^[\[{]/.test(text.trim()))try{data=JSON.parse(text);}catch{}return {status,data,text,bytes:Buffer.byteLength(text),modified:response.headers.get('last-modified')||null};}
function transportFor(inst){return {get:route=>callRaw(inst,route,{method:'GET'}),postRaw:(route,body,contentType='application/json')=>callRaw(inst,route,{method:'POST',body,contentType})};}
async function autoSyncBeforeRun(root,t,inst,info,graph){
 if(!inst.local)return null;
 if(!(t.gui||t.autoPrepared===true||t.source==='comfy-userdata'))return null;
 const document=structuredClone(t.gui||graphToEditor(graph,info));
 if(document.extra&&typeof document.extra==='object')document.extra.mediaStudio={...document.extra.mediaStudio,title:t.name||humanWorkflowName(t),workflowId:t.id,version:t.version};
 const hash=workflowDigest(document);
 const file=remoteWorkflowName(t.id,t.version);
 const transport=transportFor(inst);
 let remote=null;try{remote=await readRemoteWorkflow(transport,file);}catch(e){if(e.httpStatus!==404)throw e;}
 if(remote&&remote.sha256===hash){const meta={...t.comfySync,instanceId:inst.id,file,localFile:file,sha256:hash,version:t.version,syncedAt:new Date().toISOString(),direction:'local-to-comfy'};updateWorkflowMeta(root,t.id,{comfySync:meta});return {file,sha256:hash,state:'already-synced',urls:comfyWorkflowUrl(inst.url,file)};}
 if(remote&&remote.sha256!==hash&&remote.sha256!==(t.comfySync?.sha256||null)){const e=Error('ComfyUI 中同名工作流已被用户修改；执行前未覆盖，请在高级区选择同步/拉取或另存版本');e.syncConflict=true;throw e;}
 await saveRemoteWorkflow(transport,file,document,{overwrite:!!remote});
 const meta={...t.comfySync,instanceId:inst.id,file,localFile:file,sha256:hash,version:t.version,syncedAt:new Date().toISOString(),direction:'local-to-comfy'};
 updateWorkflowMeta(root,t.id,{comfySync:meta});
 return {file,sha256:hash,state:remote?'updated':'created',urls:comfyWorkflowUrl(inst.url,file)};
}
function autoInstance(root,a){const rows=instances(root).filter(i=>i.enabled!==false);if(a.instanceId)return rows.find(i=>i.id===a.instanceId)||null;return rows.find(i=>i.local)||rows[0]||null;}
async function prepareAutoRecord(root,a,t,gui,graph){const inst=a.instanceId?checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true}):autoInstance(root,{instanceId:a.instanceId});if(!inst)return {...t,status:'needs-binding',diagnostics:[{code:'instance-required',node:'document',message:'尚未选择目标 ComfyUI 实例；选择实例后执行自动转换与绑定'}],availability:{status:'needs-binding',reason:'需要目标实例'}};const info=await call(inst,'/object_info');const prepared=gui?prepareGUI(gui,info,a.kind||t.kind||'image'):prepareAPI(graph,info,a.kind||t.kind||'image');const acceptance=analyze(prepared.graph,info,nodePolicy31(root,inst,info),[]);const contract=mediaContract51({...t,...prepared,instanceId:inst.id},{instanceId:inst.id,info,instance:inst});const diagnostics=[...(prepared.diagnostics||[]),...acceptance.issues.map(x=>({code:'graph-issue',node:'graph',message:x})),...(contract.compatible?[]:[{code:'media-contract',node:'output',message:(contract.issues||['媒体契约未通过']).join('；')}])];const blocking=diagnostics.filter(x=>x.code!=='media-type-adjusted');const status=blocking.length?(prepared.missingModels?.length?'missing-model':'needs-binding'):'ready';return {...t,instanceId:inst.id,gui:prepared.gui,graph:prepared.graph,mappings:prepared.mappings,modelBindings:prepared.modelBindings,modelFields:prepared.modelFields,dependencies:{...(t.dependencies||{}),nodes:[...new Set(Object.values(prepared.graph).map(n=>n.class_type))],modelFields:prepared.modelFields||[]},sourceMap:prepared.sourceMap||{},conversion:{sourceMap:prepared.sourceMap||{},notes:prepared.conversionNotes||[]},outputSelection53:prepared.outputSelection53,technicalType:prepared.technicalType,kind:prepared.kind,requestedKind:prepared.requestedKind,source:prepared.source,autoPrepared:true,status,availability:{status,reason:diagnostics.length?diagnostics[0].message:'自动转换、绑定与静态验收通过'},diagnostics,contractStatus:contract.compatible?'ready':'needs-review',enabled:contract.compatible&&!blocking.length&&['image','video'].includes(prepared.kind),autoInstanceId:inst.id};}
export function aceSignature31(t){
 if(!t?.graph||!Array.isArray(t.outputSelection53)||t.outputSelection53.length!==1)return null;
 const outId=String(t.outputSelection53[0]),out=t.graph[outId];
 if(!out||out.class_type!=='SaveAudioAdvanced')return null;
 const required=['TextEncodeAceStepAudio1.5','EmptyAceStep1.5LatentAudio','KSampler','VAEDecodeAudio','SaveAudioAdvanced'];
 const ancestors=new Set(),walk=id=>{if(ancestors.has(id))return;ancestors.add(id);for(const value of Object.values(t.graph[id]?.inputs||{}))if(isLinkPair(value)&&t.graph[value[0]])walk(String(value[0]));};walk(outId);
 const path=[...ancestors].map(id=>[id,t.graph[id]]);
 if(!required.every(type=>path.some(([,n])=>n.class_type===type)))return null;
 if(Object.entries(t.graph).some(([id,n])=>required.includes(n.class_type)&&!ancestors.has(id)))return null;
 const prod=path.find(([,n])=>n.class_type==='KSampler');if(!prod)return null;
 return {outId,out,producerId:prod[0],ancestors};
}
async function autoReviewKnownPurpose(root,t,a){
 const sig=aceSignature31(t);if(!sig)return null;
 const purpose=['music','speech'].includes(t.kind)?t.kind:'music';
 const inst=checkInstance(root,{instanceId:a.instanceId||t.instanceId,allowRemote:a.allowRemote===true});
 const info=await call(inst,'/object_info'),accepted=nodePolicy31(root,inst,info);
 if(!accepted.has(t.graph[sig.producerId]?.class_type))return null;
 const definitionHash=contractHash53(info[sig.out.class_type]);
 await workflowAdmin(root,{action:'reviewOutput',templateId:t.id,expectedVersion:t.version,instanceId:inst.id,node:sig.outId,technicalType:'audio',group:'audio',purpose,producerNode:sig.producerId,definitionHash,semanticEvidence:'自动签名：ACE-Step 1.5 音频图（EmptyAceStep1.5LatentAudio + TextEncodeAceStepAudio1.5 + KSampler + VAEDecodeAudio + SaveAudioAdvanced 连续祖先链）；本地版本绑定签名，仅声明音乐用途，未做主观质量评审',acknowledgeCodeReview:true,activate:true});
 const reviews=load(path.join(root,'media-reviews53.json'),[]),contract=mediaContract51(t,{reviews,instance:inst,info});return updateWorkflowMeta(root,t.id,{kind:'music',status:'ready',availability:{status:'ready',reason:'ACE-Step 签名自动审查通过；静态预检不代替真实推理'},contractStatus:'ready',purposeInferred:'ace-step-signature',enabled:true,output:'audio',mediaContract:contract});
}
function updateWorkflowMeta(root,id,patch){return withResourceLock49(root,()=>{const f=path.join(rootDir(root),'templates.json'),rows=load(f,[]),i=rows.findIndex(x=>x.id===id);if(i<0)throw Error('工作流不存在');const out={...rows[i],...patch};rows[i]=out;write(f,rows);return out;});}
function defs(info){return {...info?.input?.required,...info?.input?.optional};}
function dynamicRequiredIssues(def,nodeInputs){const issues=[];for(const [key,spec] of Object.entries(defs(def))){if(spec?.[0]!=='COMFY_DYNAMICCOMBO_V3')continue;const selected=nodeInputs?.[key];if(typeof selected!=='string')continue;const option=(spec?.[1]?.options||[]).find(o=>o&&o.key===selected);if(!option)continue;for(const dep of Object.keys(option.inputs?.required||{}))if(!Object.hasOwn(nodeInputs,key+'.'+dep))issues.push('缺少动态输入 '+key+'.'+dep);}return issues;}
function expandedDefs(info,nodeInputs){const fields=defs(info);for(const [key,spec] of Object.entries(fields)){if(spec?.[0]!=='COMFY_DYNAMICCOMBO_V3')continue;const selected=nodeInputs?.[key];if(typeof selected!=='string')continue;const option=(spec?.[1]?.options||[]).find(o=>o&&o.key===selected);if(!option)continue;for(const [dep,depSpec] of [...Object.entries(option.inputs?.required||{}),...Object.entries(option.inputs?.optional||{})])fields[key+'.'+dep]=depSpec;}return fields;}
function choices(def){return Array.isArray(def?.[0])?def[0]:def?.[0]==='COMBO'?def?.[1]?.options:null;}
export function candidates(graph){const result=[];for(const [id,n] of Object.entries(graph))for(const [input,value] of Object.entries(n.inputs||{}))if(['number','boolean','string'].includes(typeof value))result.push({node:id,input,type:typeof value,default:value,nodeType:n.class_type});return result;}
export function bind(graph,mappings={},values={}){const result=copy(graph);const conflict=!!(mappings.prompt&&mappings.negative&&mappings.prompt.node===mappings.negative.node&&mappings.prompt.input===mappings.negative.input);for(const [name,value]of Object.entries(values)){if(conflict&&name==='negative')continue;const m=Object.hasOwn(mappings,name)?mappings[name]:null;if(!m||!Object.hasOwn(result,m.node)||!Object.hasOwn(result[m.node].inputs,m.input))throw Error('参数没有有效映射 '+name);const prior=result[m.node].inputs[m.input];if(!['string','number','boolean'].includes(typeof value)||typeof value!==typeof prior||typeof value==='number'&&!Number.isFinite(value))throw Error('参数类型错误 '+name);result[m.node].inputs[m.input]=value;}return result;}
// Resolve only an explicitly saved graph/plan binding. Catalog order is never
// permission to substitute a different model or infer architecture compatibility.
export function checkpointBinding31(t,values,installed){
 const m=t.mappings?.model;if(!m||t.graph?.[m.node]?.class_type!=='CheckpointLoaderSimple')return values;
 const model=Object.hasOwn(values,'model')?values.model:t.graph[m.node].inputs[m.input];
 if(typeof model!=='string'||!model.trim()||!installed?.includes(model))throw Error('指定 checkpoint 缺失：'+String(model??'未绑定')+'；不会自动替换。请安装指定模型，或在方案中明确选择兼容模型并保存重新绑定。');
 return {...values,model};
}
export const convertGUI=editorToGraph;
function checkGraph(g){graphStructure(g);return g;}
const safeAsset=s=>typeof s==='string'&&s.length>0&&s.length<300&&!/(^[/\\]|\.\.|:|[\x00-\x1f])/.test(s);
export function analyze(g,info,accepted=approved,deferredInputs=[]){checkGraph(g);const issues=graphIssues(g,info),deferredSet=new Set(Array.isArray(deferredInputs)?deferredInputs.map(String):[]);if(!Array.isArray(deferredInputs))issues.push('延期输入列表无效');for(const id of deferredSet){const port=inputPort53(g[id]?.class_type);if(!port||typeof g[id]?.inputs?.[port.input]!=='string')issues.push('延期输入 '+id+' 不是已声明的媒体加载节点');}for(const [id,n] of Object.entries(g)){const def=info[n.class_type];if(!accepted.has(n.class_type)||def?.api_node)issues.push(id+' 未审查节点 '+n.class_type);if(!def){issues.push(id+' 缺少节点 '+n.class_type);continue;}const fields=expandedDefs(def,n.inputs);for(const k of Object.keys(def.input?.required||{}))if(!Object.hasOwn(n.inputs,k))issues.push(id+' 缺少输入 '+k);for(const issue of dynamicRequiredIssues(def,n.inputs))issues.push(id+' '+issue);
for(const [k,v]of Object.entries(n.inputs)){if(!Object.hasOwn(fields,k)){issues.push(id+' 未声明输入 '+k);continue;}if(isLinkPair(v)){if(!Object.hasOwn(g,String(v[0]))||v[1]<0)issues.push(id+' 无效连线 '+k);continue;}if(Array.isArray(v)||v&&typeof v==='object'){const spec=fields[k];const prim=Array.isArray(spec?.[0])||spec?.[0]==='COMBO'||['STRING','INT','FLOAT','BOOLEAN'].includes(spec?.[0]);if(prim)issues.push(id+' 类型错误 '+k);continue;}if(!['number','boolean','string'].includes(typeof v)){issues.push(id+' 类型错误 '+k);continue;}if(typeof v==='string'&&/(filename_prefix|ckpt_name|control_net_name|lora_name)$/.test(k)&&!safeAsset(v))issues.push(id+' 非安全资源名 '+k);const type=fields[k][0];if((type==='INT'&&(!Number.isInteger(v)))||(type==='FLOAT'&&typeof v!=='number')||(type==='STRING'&&typeof v!=='string')||(type==='BOOLEAN'&&typeof v!=='boolean'))issues.push(id+' 输入类型不符 '+k);const options=choices(fields[k]);if(options&&!options.includes(v)&&!(deferredSet.has(String(id))&&inputPort53(n.class_type)?.input===k))issues.push(id+' 缺少或不支持 '+k+'='+v);if(typeof v==='number'&&(v<fields[k][1]?.min||v>fields[k][1]?.max||!Number.isFinite(v)))issues.push(id+' 参数越界 '+k);}}
return{compatible:!issues.length,issues,nodes:[...new Set(Object.values(g).map(n=>n.class_type))],fields:candidates(g)};}
function template(id,name,graph,mappings={}){return{id,name,version:1,enabled:true,kind:'image',graph,mappings,dependencies:{nodes:[...new Set(Object.values(graph||{}).map(n=>n.class_type))],modelFields:candidates(graph||{}).filter(f=>/ckpt_name|lora_name|control_net_name|vae_name/.test(f.input)),minimumComfyVersion:'需以实例节点检查为准',resourceEstimate:'按模型与画幅变化，未承诺固定显存'},output:'image'};}
function library(){const graph=legacy({template:'txt2img',model:'请选择checkpoint',prompt:'prompt'}),edit=legacy({template:'img2img',model:'请选择checkpoint',prompt:'prompt',referenceName:'input.png'});let mask=copy(edit);mask['6']={class_type:'VAEEncodeForInpaint',inputs:{pixels:['9',0],mask:['8',1],vae:['3',2],grow_mask_by:6}};const ref=copy(graph);ref['8']={class_type:'LoadImage',inputs:{image:'control.png'}};ref['9']={class_type:'ControlNetLoader',inputs:{control_net_name:'请选择controlnet'}};ref['10']={class_type:'ControlNetApplyAdvanced',inputs:{positive:['4',0],negative:['5',0],control_net:['9',0],image:['8',0],strength:1,start_percent:0,end_percent:1}};ref['7'].inputs.positive=['10',0];ref['7'].inputs.negative=['10',1];const mapping={prompt:{node:'4',input:'text'},negative:{node:'5',input:'text'},model:{node:'3',input:'ckpt_name'},seed:{node:'7',input:'seed'},steps:{node:'7',input:'steps'},cfg:{node:'7',input:'cfg'},sampler:{node:'7',input:'sampler_name'},scheduler:{node:'7',input:'scheduler'},denoise:{node:'7',input:'denoise'}};const source={node:'8',input:'image'};
const boards=copy(graph);boards['11']={class_type:'CLIPTextEncode',inputs:{text:'second shot',clip:['3',1]}};boards['12']=copy(graph['7']);boards['12'].inputs.positive=['11',0];boards['13']={class_type:'VAEDecode',inputs:{samples:['12',0],vae:['3',2]}};boards['14']={class_type:'ImageBatch',inputs:{image1:['1',0],image2:['13',0]}};boards['2'].inputs.images=['14',0];
return [template('txt2img','文生图',graph,{...mapping,width:{node:'6',input:'width'},height:{node:'6',input:'height'}}),template('img2img','图生图',edit,{...mapping,image:source}),template('inpaint','透明通道蒙版重绘（输入与输出同尺寸）',mask,{...mapping,image:source}),template('upscale','插值放大',{'8':edit['8'],'9':edit['9'],'2':{class_type:'SaveImage',inputs:{images:['9',0],filename_prefix:'DSH_upscale'}}},{image:source,width:{node:'9',input:'width'},height:{node:'9',input:'height'}}),template('reference','ControlNet 条件图',ref,{...mapping,image:source,controlModel:{node:'9',input:'control_net_name'}}),template('storyboard','双镜头分镜图片批次',boards,{...mapping,secondPrompt:{node:'11',input:'text'}})];}
const kindLabel31={image:'图片',video:'视频',music:'音乐',speech:'语音',audio:'音频'};
function humanWorkflowName(t){
 const isHuman=v=>typeof v==='string'&&v.trim().length>1&&v.trim().length<=120&&!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(v)&&!/^workflows?[\\/]/i.test(v)&&!/\.json$/i.test(v)&&!/^[0-9a-f-]{20,}$/i.test(v);
 const candidates=[t.displayName,t.name,t.gui?.extra?.mediaStudio?.title,t.sourceFile?String(t.sourceFile).split('/').pop():null,t.gui?.extra?.name,t.gui?.name];
 const found=candidates.find(isHuman);
 return found?found.trim():((kindLabel31[t.kind]||'媒体')+'工作流 · '+(t.technicalType||t.kind||'未知')+' · 未命名');
}
function remoteDisplayName(document,file){
 const isHuman=v=>typeof v==='string'&&v.trim().length>1&&v.trim().length<=120&&!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(v)&&!/^workflows?[\\/]/i.test(v)&&!/\.json$/i.test(v);
 const values=[document?.extra?.mediaStudio?.title,document?.extra?.name,document?.name,file?String(file).split('/').pop().replace(/\.json$/i,''):null];
 return values.find(isHuman)?.trim()||'ComfyUI 工作流';
}

function all(root){recoverResources49(root);const custom=load(path.join(rootDir(root),'templates.json'),[]);return [...library().filter(t=>!custom.some(c=>c.id===t.id)),...custom];}
export function workflowDefinition31(root,id){const t=all(root).find(t=>t.id===id);if(!t)throw Error('工作流不存在 '+id);return {...copy(t),mediaContract:mediaContract51(t)};}
function list(root){const rows=instances(root);return{instances:rows,templates:all(root).map(({graph,mappings,...m})=>({...m,displayName:humanWorkflowName(m),needsMapping:!graph,mappings,identity:workflowIdentity31({...m,displayName:humanWorkflowName(m)},rows),mediaContract:m.mediaContract||mediaContract51({...m,graph})}))};}
function persist(root,t,expectedVersion){return withResourceLock49(root,()=>persistUnlocked49(root,t,expectedVersion));}
function persistUnlocked49(root,t,expectedVersion){assertNotArchived49(root,'workflow',t.id);if(!safeName(t.id))throw Error('模板 ID 无效');const f=path.join(rootDir(root),'templates.json'),rows=load(f,[]),old=rows.find(r=>r.id===t.id);const current=old||library().find(r=>r.id===t.id);if(expectedVersion!==undefined&&current?.version!==expectedVersion)throw Error('工作流版本冲突，请重新读取后保存');const stamp=new Date().toISOString();const out={...t,dependencies:{...t.dependencies,nodes:[...new Set(Object.values(t.graph||{}).map(n=>n.class_type))],modelFields:candidates(t.graph||{}).filter(f=>/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name\d*$/.test(f.input))},version:(current?.version||0)+1,created:current?.created||stamp,modified:stamp,source:t.source||current?.source||'user-import',availability:{status:t.graph?'unchecked':'needs-conversion',reason:'需要在执行实例重新检查节点与模型依赖'}};if(current)write(path.join(rootDir(root),'versions',current.id,current.version+'.json'),current);write(f,[...rows.filter(r=>r.id!==t.id),out]);return out;}
export async function workflowAdmin(root,a){if(['selectOutputs','describeOutputs','reviewOutput'].includes(a.action)){const t=all(root).find(t=>t.id===a.templateId);if(!t)throw Error('工作流不存在');const d=a.document||a;if(a.action==='selectOutputs'){if(!Number.isInteger(a.expectedVersion)||!Array.isArray(d.nodes)||!d.nodes.length||new Set(d.nodes).size!==d.nodes.length||d.nodes.some(id=>typeof id!=='string'||!t.graph?.[id]))throw Error('需要当前版本和有效目标节点ID');if(!['image','video','audio','music','speech'].includes(d.kind||t.kind))throw Error('输出用途无效');return persist(root,{...t,enabled:false,kind:d.kind||t.kind,outputSelection53:d.nodes},a.expectedVersion);}const inst=checkInstance(root,a),info=await call(inst,'/object_info');const contract=mediaContract51(t,{reviews:load(path.join(root,'media-reviews53.json'),[]),instance:inst,info});if(a.action==='describeOutputs')return{contract,candidates:Object.entries(t.graph||{}).filter(([,n])=>info[n.class_type]).map(([node,n])=>({node,nodeType:n.class_type,definitionHash:contractHash53(info[n.class_type]),outputNode:info[n.class_type].output_node===true})),warning:'自定义输出和用途必须审查本地代码/生成节点；定义哈希不是代码签名'};return withResourceLock49(root,()=>{const current53=all(root).find(x=>x.id===t.id);if(!current53||current53.version!==t.version||contractHash53(current53.graph)!==contractHash53(t.graph))throw Error('工作流版本已变化，请重新审查');if(!inst.local||d.acknowledgeCodeReview!==true||a.expectedVersion!==t.version||!['image','video','audio'].includes(d.technicalType)||!['image','video','audio','music','speech'].includes(d.purpose)||!/^\w{1,40}$/.test(d.group||''))throw Error('需要本地节点代码审查、当前版本及明确输出描述');const n=t.graph?.[d.node],def=info[n?.class_type],accepted=nodePolicy31(root,inst,info);if(!def||def.api_node||!def.output_node||!accepted.has(n.class_type)||contractHash53(def)!==d.definitionHash)throw Error('输出节点尚未审查或定义已变化');let producerDefinitionHash=null;if(['music','speech'].includes(d.purpose)){const producer=t.graph?.[d.producerNode];if(!producer||/^(Load|Save|Preview|Empty|AudioMerge|AudioConcat|AudioCrop)/.test(producer.class_type)||d.producerNode===d.node||!accepted.has(producer.class_type)||!info[producer.class_type]||info[producer.class_type].api_node||typeof d.semanticEvidence!=='string'||d.semanticEvidence.length<20)throw Error('语音/音乐需要已审查生成节点和明确用途证据，保存音频节点本身不足');producerDefinitionHash=contractHash53(info[producer.class_type]);}const r={workflowId:t.id,version:t.version,graphHash:contractHash53(t.graph),instanceId:inst.id,instanceUrl:inst.url,node:d.node,technicalType:d.technicalType,group:d.group,purpose:d.purpose,definitionHash:d.definitionHash,producerNode:d.producerNode||null,producerDefinitionHash,semanticEvidence:d.semanticEvidence||'',reviewedAt:new Date().toISOString()};const records=[...load(path.join(root,'media-reviews53.json'),[]).filter(x=>!(x.workflowId===t.id&&x.node===d.node)),r];const check=mediaContract51(t,{reviews:records,instance:inst,info});if(!check.compatible)throw Error(check.issues.join('；'));const changes={'media-reviews53.json':records};if(d.activate===true){const rows=load(path.join(rootDir(root),'templates.json'),[]),current=rows.find(x=>x.id===t.id);if(!current||current.version!==t.version)throw Error('工作流版本已变化');changes['workflows3/templates.json']=rows.map(x=>x.id===t.id?{...x,enabled:true}:x);}resourceTransaction49(root,changes);return r;});}if(['import','importPortable'].includes(a.action)&&a._preparation52!==preparation52){const{previewImport51}=await import('./import-session51.mjs');return previewImport51(root,a.document,a.kind);}if(a.action==='confirmImport'||a.action==='cancelImport'){const{finishImport51}=await import('./import-session51.mjs');return finishImport51(root,{previewId:a.previewId,cancel:a.action==='cancelImport'});}if(a.action==='list')return list(root);if(a.action==='saveInstance'){const i=instance(a.instance);const rows=instances(root);saveSettings3(root,{...loadSettings3(root),instances:[...rows.filter(x=>x.id!==i.id),i].map(({id,label,url,trusted,credentialRef,enabled})=>({id,label,url,trusted,credentialRef,enabled}))});return list(root);}if(a.action==='discover'){const configured=instances(root),probes=[...configured];for(const port of [8000,8189])if(!configured.some(i=>i.address==='http://127.0.0.1:'+port))probes.push(instance({id:'detected-'+port,address:'http://127.0.0.1:'+port}));return Promise.all(probes.map(async i=>{if(i.enabled===false||!i.local&&!i.trusted)return{...i,displayLabel:instanceLabel31(i),available:false,state:i.enabled===false?'disabled':'untrusted',message:i.enabled===false?'配置已断开；没有关闭ComfyUI服务':'远程实例未授权，本次没有联系服务'};try{const [stats,info]=await Promise.all([call(i,'/system_stats'),call(i,'/object_info')]);return{...i,displayLabel:instanceLabel31(i),checkedAt:new Date().toISOString(),available:true,state:'connected',version:stats.system?.comfyui_version,devices:stats.devices,nodeCount:Object.keys(info).length,models:modelCatalog(info,i.id),checkpoints:choices(defs(info.CheckpointLoaderSimple).ckpt_name)||[]};}catch(e){const denied=/HTTP (401|403)/.test(e.message),incompatible=e instanceof SyntaxError||/HTTP 404/.test(e.message);return{...i,available:false,state:denied?'permission-denied':incompatible?'incompatible-api':'unreachable',installationKnown:false,message:denied?'服务拒绝访问，请检查实例授权':incompatible?'地址未提供兼容的 ComfyUI API':'连接失败；可能未启动或地址错误，不能仅凭网络失败断言未安装'};}}));}
if(a.action==='upload'){
 const inst=checkInstance(root,{instanceId:a.instanceId,templateId:a.templateId,allowRemote:false});
 if(typeof a.dataBase64!=='string'||a.dataBase64.length>maxUploadBase64_54||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.dataBase64))throw Error('素材大小或编码无效');
 const bytes=Buffer.from(a.dataBase64,'base64'),uploaded=await validateUploadMedia54(root,bytes,a.kind||'image');
 const ext=uploaded.ext;
 const form=new FormData();form.append('image',new Blob([bytes]),'DSH_'+randomUUID()+'.'+ext);form.append('type','input');form.append('overwrite','false');
 const response=await fetch(inst.address+'/upload/image',{method:'POST',body:form,headers:authHeaders(inst),redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('素材上传失败 HTTP '+response.status);
 const result=await response.json();if(!safeAsset(result.name)||result.subfolder&&!safeAsset(result.subfolder))throw Error('服务返回不安全素材名');return {image:result.subfolder?result.subfolder+'/'+result.name:result.name,sha256:digest(bytes),bytes:bytes.length,kind:uploaded.kind};
 }
 if(a.action==='instanceCredential'){
  const settings=loadSettings3(root),i=settings.instances.find(i=>i.id===a.instanceId);if(!i)throw Error('实例未配置');let ref='';const vault=new Vault(root);
  if(a.operation==='set'){ref='stored:inst_'+i.id.slice(0,24)+'_'+randomUUID().replaceAll('-','');vault.set(ref,a.value);}
  else if(a.operation==='bind'){if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,99}$/.test(a.value||''))throw Error('环境变量名称无效');ref='env:'+a.value;}
  else if(a.operation!=='clear')throw Error('实例凭证操作无效');
  saveSettings3(root,{...settings,instances:settings.instances.map(x=>x.id===i.id?{...x,credentialRef:ref}:x)});
  return {instanceId:i.id,configured:!!ref&&vault.has(ref),message:a.operation==='clear'?'已取消实例凭证绑定；加密保留记录未删除':'实例凭证已安全绑定；没有发起网络请求'};
 }
 if(a.action==='importPortable'){
  const doc=importPortable31(a.document);return workflowAdmin(root,{_preparation52:preparation52,action:'import',id:a.id||randomUUID(),name:a.name||doc.name,document:doc});
 }
 if(a.action==='exportPortable'){
  const t=all(root).find(t=>t.id===a.templateId);if(!t)throw Error('模板不存在');return exportPortable31(t);
 }
 if(['import','save'].includes(a.action)){
  const doc=a.document;checkImport52(doc);if(!doc||JSON.stringify(doc).length>2000000)throw Error('工作流过大或为空');
  const id=a.id||randomUUID(),existing=all(root).find(t=>t.id===id);
  if(a.action==='import'&&existing)throw Error('工作流 ID 已存在；导入不会覆盖，请创建副本或明确保存新版本');
  if(a.action==='save'&&(!existing||!Number.isInteger(a.expectedVersion)))throw Error('保存需要已读取的工作流版本');
  const gui=Array.isArray(doc.nodes)?doc:doc.gui||null,graph=doc.graph||doc.prompt||(!gui?doc:null);
  if(gui)validateEditor52(gui);if(graph)checkGraph(graph);
  const mappings=a.mappings||doc.mappings||gui?.extra?.mediaStudio?.mappings||{};if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)||Object.keys(mappings).length>100)throw Error('参数映射必须是至多100项的对象');for(const[name,m]of Object.entries(mappings))if(!/^[\w.-]{1,100}$/.test(name)||!m||typeof m!=='object'||Array.isArray(m)||typeof m.node!=='string'||typeof m.input!=='string'||Object.keys(m).some(k=>!['node','input'].includes(k)))throw Error('无效参数映射 '+name);
  if(graph)for(const [name,m]of Object.entries(mappings)){if(!m||!Object.hasOwn(graph,m.node)||!Object.hasOwn(graph[m.node].inputs,m.input)||Array.isArray(graph[m.node].inputs[m.input]))throw Error('参数没有有效映射 '+name);}
  const t=template(id,String(a.name||doc.name||'自定义工作流').slice(0,100),graph||null,mappings);
  if(!['image','video','music','speech','audio'].includes(a.kind||doc.kind||existing?.kind||'image'))throw Error('工作流媒体类别无效');
  const staleEditor=existing?.graph&&graph&&digest(JSON.stringify(existing.graph))!==digest(JSON.stringify(graph));
  let out={...t,gui:staleEditor?null:gui,enabled:false,kind:a.kind||doc.kind||existing?.kind||'image',description:String(a.description??doc.description??existing?.description??'').slice(0,2000),source:gui?'comfy-editor':'api-import',instanceId:a.instanceId||doc.instanceId||existing?.instanceId||null,modelBindings:doc.modelBindings||existing?.modelBindings||{},...existing?.outputSelection53?{outputSelection53:copy(existing.outputSelection53)}:{}};
  const autoNow=a.auto===true||(a.auto!==false&&!!a.instanceId&&!!(gui||graph));if(autoNow){try{out=await prepareAutoRecord(root,a,out,out.gui,out.graph);}catch(e){out={...out,status:'conversion-failed',availability:{status:'conversion-failed',reason:e.message},diagnostics:Array.isArray(e.diagnostics)?e.diagnostics:[{code:e.code||'conversion-failed',node:'document',message:e.message}],enabled:false};}}else if(gui){out={...out,enabled:false,status:'needs-binding',availability:{status:'needs-binding',reason:'GUI 工作流需要目标实例自动转换；API 图可直接执行'},diagnostics:[{code:'instance-required',node:'document',message:'选择目标 ComfyUI 实例后自动转换与绑定'}]};}else{out={...out,enabled:!!out.graph,status:out.graph?'ready':'needs-binding',availability:{status:out.graph?'ready':'needs-binding',reason:out.graph?'API 图已导入；模型/实例检查按需执行':'没有可执行 API 图'}};}
  const saved=persist(root,out,a.action==='save'?a.expectedVersion:undefined);
  if(autoNow&&saved.graph)try{const reviewed=await autoReviewKnownPurpose(root,saved,a);return reviewed||saved;}catch{return saved;}
  return saved;
 }
 if(a.action==='reviewNode'){
  const inst=checkInstance(root,a),info=await call(inst,'/object_info');return reviewNode31(root,inst,info,a);
 }
 if(a.action==='saveModelMetadata'){
  const inst=checkInstance(root,a);return saveModelMetadata31(root,{...a.metadata,instanceId:inst.id});
 }
 if(a.action==='catalog'){
  const inst=checkInstance(root,a),info=await call(inst,'/object_info');
  return {instanceId:inst.id,models:resources31(root,info,inst.id),nodes:Object.keys(info),checkedAt:new Date().toISOString()};
 }
 if(a.action==='comfyList'){const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true}),result=await listRemoteWorkflows(transportFor(inst));return {...result,instanceId:inst.id,displayLabel:instanceLabel31(inst)};}
if(a.action==='comfyRead'){const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true});return {...await readRemoteWorkflow(transportFor(inst),a.file),instanceId:inst.id};}
if(a.action==='comfyImport'){const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true});const remote=await readRemoteWorkflow(transportFor(inst),a.file);const imported=await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:a.id||randomUUID(),name:a.name||remoteDisplayName(remote.document,remote.file),document:remote.document,kind:a.kind||'image',instanceId:inst.id,allowRemote:a.allowRemote===true,auto:true});const saved=updateWorkflowMeta(root,imported.id,{source:'comfy-userdata',sourceInstanceId:inst.id,sourceFile:remote.file,sourceSha256:remote.sha256,sourceModified:remote.modified||null,comfySync:{instanceId:inst.id,file:remote.file,localFile:remoteWorkflowName(imported.id,imported.version),sourceFile:remote.file,sha256:remote.sha256,version:imported.version,syncedAt:new Date().toISOString(),direction:'read-only'}});return {...saved,remote:{file:remote.file,sha256:remote.sha256,format:remote.format,modified:remote.modified}};}
if(['versions','restore','exportGUI','parameters','saveParameters','rename','requirements'].includes(a.action)){
  const t=all(root).find(t=>t.id===a.templateId);if(!t)throw Error('模板不存在');
  if(a.action==='versions'){
   const dir=path.join(rootDir(root),'versions',t.id),old=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^\d+\.json$/.test(f)).map(f=>load(path.join(dir,f),null)):[];
   return [...old,t].map(({version,name,modified,source})=>({version,name,modified,source})).sort((a,b)=>b.version-a.version);
  }
  if(a.action==='restore'){
   if(!Number.isInteger(a.version)||a.version<1)throw Error('无效版本');
   const old=load(path.join(rootDir(root),'versions',t.id,a.version+'.json'),null);if(!old)throw Error('历史版本不存在');
   if(!Number.isInteger(a.expectedVersion))throw Error('恢复需要当前版本');
   return persist(root,{...old,restoredFrom:a.version},a.expectedVersion);
  }
  if(a.action==='rename'){
   if(!String(a.name||'').trim()||!Number.isInteger(a.expectedVersion))throw Error('名称和当前版本必填');
   return persist(root,{...t,name:String(a.name).trim().slice(0,100)},a.expectedVersion);
  }
  if(a.action==='exportGUI'&&t.gui)return {document:copy(t.gui),source:'original-editor',limitations:[],version:t.version};
  if(!t.graph&&a.action==='requirements'&&t.gui){const inst=checkInstance(root,a),info=await call(inst,'/object_info');return editorRequirements31(root,t.gui,info,inst.id,nodePolicy31(root,inst,info));}
  if(!t.graph)throw Error('没有 API 执行图，请先转换编辑器工作流');
  const inst=checkInstance(root,a),info=await call(inst,'/object_info');
  const accepted=nodePolicy31(root,inst,info);
  if(a.action==='requirements')return {...requirements31(root,t.graph,info,inst.id,accepted),analysis:analyze(t.graph,info,accepted),nodeReviews:nodeReviewRequests31(root,inst,t.graph,info)};
  if(a.action==='parameters')return {fields:parameterFields(t.graph,info).map(f=>({...f,sourcePath:t.conversion?.sourceMap?.[f.node]||f.node})),mappings:t.mappings,version:t.version,analysis:analyze(t.graph,info,accepted)};
  if(a.action==='saveParameters'){
   if(!Number.isInteger(a.expectedVersion))throw Error('保存需要当前版本');
   const graph=bind(t.graph,a.mappings||t.mappings,a.values||{});
   for(const [name,v]of Object.entries(a.values||{})){const m=(a.mappings||t.mappings)[name];validateValue(v,defs(info[graph[m.node].class_type])[m.input],name);}
   const result=analyze(graph,info,accepted);if(!result.compatible)throw Error(result.issues.join('；'));
   // An edited API graph cannot silently export a stale original editor graph.
   return persist(root,{...t,graph,mappings:a.mappings||t.mappings,gui:null,previousEditorPreservedInVersion:t.version},a.expectedVersion);
  }
  const document=graphToEditor(t.graph,info),ids=document.extra.mediaStudio.nodeIds;
  document.extra.mediaStudio.mappings=Object.fromEntries(Object.entries(t.mappings).map(([name,m])=>[name,{node:String(ids[m.node]),input:m.input}]));
  return {document,source:'generated-api',limitations:['API 图不含原始布局或前端扩展控件；仅转换已审查节点。'],version:t.version};
 }
const t=all(root).find(t=>t.id===a.templateId);if(!t)throw Error('模板不存在');if(a.action==='bindInstance'){if(!Number.isInteger(a.expectedVersion)||!instances(root).some(i=>i.id===a.instanceId))throw Error('绑定需要当前工作流版本及已有实例ID');return persist(root,{...t,instanceId:a.instanceId},a.expectedVersion);}if(a.action==='convert'){if(!t.gui)throw Error('没有编辑器原图');const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:false}),info=await call(inst,'/object_info'),compiled=compileEditor31(t.gui,info),graph=compiled.graph;const inverse=new Map(Object.entries(compiled.sourceMap).map(([id,source])=>[source,id]));const mappings=Object.fromEntries(Object.entries(t.mappings||{}).map(([name,m])=>[name,{...m,node:inverse.get(m.node)||m.node}]));for(const [name,m]of Object.entries(mappings))if(!graph[m.node]||!Object.hasOwn(graph[m.node].inputs,m.input))throw Error('转换后参数映射失效 '+name);const result=persist(root,{...t,graph,mappings,conversion:{sourceMap:compiled.sourceMap,notes:compiled.notes},enabled:true},t.version);return {...result,analysis:analyze(graph,info)};}if(a.action==='autoPrepare'){
 if(!t.gui&&!t.graph)throw Error('工作流没有原始 GUI 或 API 图，无法自动准备');
 let prepared;
 try{prepared=await prepareAutoRecord(root,{...a,templateId:t.id,kind:a.kind||t.kind},t,t.gui,t.graph);}
 catch(e){prepared={...t,status:'conversion-failed',availability:{status:'conversion-failed',reason:e.message},diagnostics:Array.isArray(e.diagnostics)?e.diagnostics:[{code:e.code||'conversion-failed',node:'document',message:e.message}],enabled:false};}
 const saved=persist(root,prepared,a.expectedVersion??t.version);
 try{const reviewed=await autoReviewKnownPurpose(root,saved,a);return reviewed||saved;}catch{return saved;}
}
if(a.action==='comfyList'){
 const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true}),result=await listRemoteWorkflows(transportFor(inst));
 return {...result,instanceId:inst.id,displayLabel:instanceLabel31(inst)};
}
if(a.action==='comfyRead'){
 const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true});
 return {...await readRemoteWorkflow(transportFor(inst),a.file),instanceId:inst.id};
}
if(a.action==='comfyImport'){
 const inst=checkInstance(root,{instanceId:a.instanceId,allowRemote:a.allowRemote===true});
 const remote=await readRemoteWorkflow(transportFor(inst),a.file);
 const imported=await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:a.id||randomUUID(),name:a.name||remoteDisplayName(remote.document,remote.file),document:remote.document,kind:a.kind||'image',instanceId:inst.id,allowRemote:a.allowRemote===true,auto:true});
 const saved=updateWorkflowMeta(root,imported.id,{source:'comfy-userdata',sourceInstanceId:inst.id,sourceFile:remote.file,sourceSha256:remote.sha256,sourceModified:remote.modified||null,comfySync:{instanceId:inst.id,file:remote.file,localFile:remoteWorkflowName(imported.id,imported.version),sourceFile:remote.file,sha256:remote.sha256,version:imported.version,syncedAt:new Date().toISOString(),direction:'read-only'}});
 return {...saved,remote:{file:remote.file,sha256:remote.sha256,format:remote.format,modified:remote.modified}};
}
if(a.action==='comfyStatus'){
 const inst=checkInstance(root,{instanceId:a.instanceId||t.comfySync?.instanceId,allowRemote:a.allowRemote===true}),file=a.file||t.comfySync?.file;
 if(!file)return {synced:false,reason:'尚未同步到 ComfyUI',localHash:t.gui?digest(JSON.stringify(t.gui)):t.graph?digest(JSON.stringify(t.graph)):null};
 const remote=await remoteWorkflowStatus(transportFor(inst),file);
 const local= t.gui?digest(JSON.stringify(t.gui)):t.graph?digest(JSON.stringify(t.graph)):null;
 const last=t.comfySync?.sha256||null;
 const state=!remote.exists?'missing':remote.sha256===local&&remote.sha256===last?'unchanged':remote.sha256===last?'local-changed':local===last?'remote-changed':'conflict';
 return {synced:remote.exists,instanceId:inst.id,file,localHash:local,lastSyncedHash:last,remoteHash:remote.exists?remote.sha256:null,state,lastSync:t.comfySync||null,urls:comfyWorkflowUrl(inst.url,file)};
}
if(a.action==='comfySync'){
 const inst=checkInstance(root,{instanceId:a.instanceId||t.comfySync?.instanceId,allowRemote:a.allowRemote===true});
 const file=a.file||t.comfySync?.localFile||remoteWorkflowName(t.id,t.version);
 const info=await call(inst,'/object_info');
 const document=t.gui||graphToEditor(t.graph,info);
 const hash=workflowDigest(document);
 let remote=null;try{remote=await readRemoteWorkflow(transportFor(inst),file);}catch(e){if(e.httpStatus!==404)throw e;}
 const last=t.comfySync?.sha256||null;
 if(remote&&remote.sha256!==hash&&remote.sha256!==last&&a.overwrite!==true)return {conflict:true,file,localHash:hash,remoteHash:remote.sha256,state:'conflict',message:'ComfyUI 中同名工作流已被修改；未覆盖。请重新读取/选择覆盖或另存新版本',urls:comfyWorkflowUrl(inst.url,file)};
 if(!remote||a.overwrite===true){await saveRemoteWorkflow(transportFor(inst),file,document,{overwrite:true});}
 const saved=updateWorkflowMeta(root,t.id,{comfySync:{...t.comfySync,instanceId:inst.id,file,localFile:file,sha256:hash,version:t.version,syncedAt:new Date().toISOString(),direction:'local-to-comfy'},syncStatus:{state:'synced',at:new Date().toISOString()}});
 return {...saved,file,remoteHash:hash,changed:!remote||remote.sha256!==hash,urls:comfyWorkflowUrl(inst.url,file),graphSource:t.gui?'original-editor':'generated-api'};
}
if(a.action==='comfyPull'){
 const inst=checkInstance(root,{instanceId:a.instanceId||t.comfySync?.instanceId,allowRemote:a.allowRemote===true});
 const file=a.file||t.comfySync?.file;if(!file)throw Error('尚未指定 ComfyUI 工作流文件');
 const remote=await readRemoteWorkflow(transportFor(inst),file);
 const local=t.gui?workflowDigest(t.gui):t.graph?workflowDigest(t.graph):null,last=t.comfySync?.sha256||null;
 const state=remote.sha256===local?'unchanged':remote.sha256===last?'local-changed':local===last?'remote-changed':'conflict';
 if(a.apply!=='remote')return {state,remoteFile:file,remoteHash:remote.sha256,localHash:local,lastSyncedHash:last,message:state==='unchanged'?'无变化':state==='conflict'?'双方都有变化；需要明确选择':'检测到 ComfyUI 变化，未自动覆盖；传 apply=remote 明确应用'};
 const imported=await workflowAdmin(root,{_preparation52:preparation52,action:'save',id:t.id,expectedVersion:t.version,name:t.name,document:remote.document,kind:t.kind||a.kind||'image',instanceId:inst.id,allowRemote:a.allowRemote===true,auto:true,mappings:t.mappings});
 return {...imported,appliedRemote:true,state:'remote-applied'};
}
if(a.action==='comfyOpen'){
 const inst=checkInstance(root,{instanceId:a.instanceId||t.comfySync?.instanceId,allowRemote:a.allowRemote===true});
 const file=a.file||t.comfySync?.localFile||t.comfySync?.sourceFile;if(!file)throw Error('工作流尚未同步到 ComfyUI；请先同步或从 ComfyUI 导入');
 return {...comfyWorkflowUrl(inst.url,file),instanceId:inst.id,caveat:'不同 ComfyUI 前端版本对 workflow 深链支持不同；若未自动打开，请在 ComfyUI 的 Workflows 浏览器中打开该文件，不会修改当前画布'};
}
if(a.action==='export')return copy(t);if(a.action==='copy'){const id=a.id||randomUUID();if(all(root).some(t=>t.id===id))throw Error('副本 ID 已存在，禁止覆盖');return persist(root,{...t,id,name:a.name||t.name+' 副本',source:'dsh-copy'});}if(a.action==='enable'){if(a.enabled===true){let contract=mediaContract51(t);const reviews=load(path.join(root,'media-reviews53.json'),[]);if(!contract.compatible&&reviews.some(r=>r.workflowId===t.id)){const inst=checkInstance(root,a),info=await call(inst,'/object_info');contract=mediaContract51(t,{reviews,instance:inst,info});}if(!contract.compatible)throw Error('输出契约待验证，不能启用：'+contract.issues.join('；'));}return persist(root,{...t,enabled:a.enabled===true});}throw Error('未知工作流管理操作');}
function checkInstance(root,a){const bound=!a.instanceId&&a.templateId?all(root).find(t=>t.id===a.templateId)?.instanceId:null;const i=instances(root).find(i=>i.id===(a.instanceId||bound||'local'));if(!i)throw Error('实例未配置');if(i.enabled===false)throw Error('此实例配置已断开，不会联系服务');if(!i.local&&(!i.trusted||a.allowRemote!==true))throw Error('当前请求不允许发送到远程实例');return i;}
const polls53=new Map();
const definitive=e=>{if(e&&typeof e==='object')e.definitive=true;return e;};
// Cross-process poll claim: only one process audits/downloads a receipt at a
// time. Other processes wait and then re-read the completed record instead of
// downloading again or failing spuriously. A dead/expired owner is reclaimed.
const pollWait53=async(root,dir,id,owner,fn)=>{const lock=path.join(dir,id+'.polling53');for(let i=0;i<600;i++){let fd;try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code!=='EEXIST')throw e;let stale=false;try{const p=JSON.parse(fs.readFileSync(lock));if(!Number.isInteger(p.pid)||!p.at)stale=true;else{try{process.kill(p.pid,0);}catch(err){if(err.code==='ESRCH')stale=true;}if(Date.now()-Date.parse(p.at)>1800000)stale=true;}}catch{try{stale=Date.now()-fs.statSync(lock).mtimeMs>30000;}catch{stale=true;}}if(stale){try{fs.unlinkSync(lock);}catch{}continue;}const done=load(path.join(dir,id+'.json'),null);if(done?.owner===owner&&done.status==='completed'&&done.files?.length&&done.files.every(f=>f.verification?.verified))return await fn();await delay(100);continue;}try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return await fn();}finally{try{fs.closeSync(fd);}catch{}try{fs.unlinkSync(lock);}catch{}}}throw Error('原任务并发核对等待超时；保留原回执，请稍后重试');};
export async function workflowTool(root,a,owner){if(['poll','verifyLegacy'].includes(a.action)){if(!safeName(a.id))throw Error('任务 ID 无效');const key=path.resolve(root)+'|'+owner+'|'+a.id;if(polls53.has(key))return polls53.get(key);const dir=path.join(rootDir(root),'jobs');fs.mkdirSync(dir,{recursive:true});const promise=pollWait53(root,dir,a.id,owner,()=>workflowToolInner53(root,a,owner)).finally(()=>polls53.delete(key));polls53.set(key,promise);return promise;}return workflowToolInner53(root,a,owner);}
async function workflowToolInner53(root,a,owner){
 if(!owner)throw Error('需要会话身份');
 if(a.action==='list')return list(root);
 const dir=path.join(rootDir(root),'jobs');fs.mkdirSync(dir,{recursive:true});
 if(['inspect','submit'].includes(a.action)){
  let inst;try{inst=checkInstance(root,a);}catch(e){throw definitive(e);}
  const t=all(root).find(t=>t.id===a.templateId);
  if(!t||!t.enabled||!t.graph)throw Object.assign(Error('工作流不存在、已停用或需要补充 API 图和映射'),{definitive:true});
  if(a.action==='submit'&&a.expectedVersion!==undefined&&a.expectedVersion!==t.version)throw definitive(Error('工作流版本变化，未上传或提交；请重新检查方案'));
  let graph,deferredRows,info,analysis;try{graph=bind(t.graph,t.mappings,a.values||{});const deferred=a.deferredInputs??a.deferredImages??[];if(a.action==='submit'&&deferred.length)throw definitive(Error('执行前必须完成素材上传，不能以延期校验提交'));deferredRows=deferred.length?validateDeferredInputs53({...t,graph},deferred):[];info=await call(inst,'/object_info');analysis={...analyze(graph,info,nodePolicy31(root,inst,info),deferred),instanceId:inst.id,instanceUrl:inst.url,requiresInputUpload:deferred.length>0,deferredInputs:deferredRows,deferredImages:deferredRows.filter(r=>r.kind==='image').map(r=>r.node)};}catch(e){throw definitive(e);}
  let contract;try{contract=mediaContract51(t,{reviews:load(path.join(root,'media-reviews53.json'),[]),instance:inst,info});}catch(e){throw definitive(e);}contract.boundGraphHash=digest(JSON.stringify(graph));analysis.mediaContract=contract;if(!contract.compatible){analysis.compatible=false;analysis.issues.push(...contract.issues);}
  if(a.action==='inspect')return analysis;
  if(!analysis.compatible)throw Object.assign(Error(analysis.issues.join('；')),{definitive:true});
  const id=a.requestId?digest(owner+'\0'+a.requestId).slice(0,32):randomUUID(),f=path.join(dir,id+'.json'),fingerprint=digest(JSON.stringify({url:inst.url,graph,version:t.version,contract}));
  const job={id,owner,instance:inst,templateId:t.id,version:t.version,kind:t.kind||'image',contract53:contract,graph,fingerprint,status:'submitting',created:new Date().toISOString()};
  let prior;try{prior=withResourceLock49(root,()=>{assertNotArchived49(root,'workflow',t.id);if(all(root).find(x=>x.id===t.id)?.version!==t.version)throw Error('预检期间工作流版本已变化，未提交');try{fs.writeFileSync(f,JSON.stringify(job),{flag:'wx'});return null;}catch(e){if(e.code!=='EEXIST')throw e;const prev=load(f,null);if(prev?.owner!==owner||prev.fingerprint!==fingerprint)throw Error('重复请求标识对应不同任务');return{id,status:prev.status,promptId:prev.promptId};}});}catch(e){throw definitive(e);}
  if(prior){if(prior.status==='failed'){let previous=null;try{previous=load(f,null);}catch(e){throw definitive(e);}throw Object.assign(Error((previous?.error||'原提交已被服务拒绝')+'；请创建新任务重试'),{definitive:true,priorStatus:'failed'});}return prior;}
  if(a.action==='submit'&&!prior){try{const sync=await autoSyncBeforeRun(root,t,inst,info,graph);if(sync){job.sync=sync;write(f,job);}}catch(e){if(e.syncConflict){job.status='failed';job.error=e.message;write(f,job);throw Object.assign(Error('执行前同步 ComfyUI 图形冲突，未提交任务：'+e.message),{definitive:true});}job.sync={state:'sync-unavailable',error:e.message};write(f,job);}}
  try{const response=await call(inst,'/prompt',{prompt:graph,client_id:id});if(!response.prompt_id)throw Error('未返回服务任务号');job.promptId=response.prompt_id;job.status='submitted';write(f,job);}catch(e){if(e.definitive){job.status='failed';job.error=e.message;write(f,job);throw e;}job.status='uncertain';job.error=e.message;write(f,job);throw Error('提交结果不确定，禁止自动重提；任务 '+id);}
  return{id,status:job.status,promptId:job.promptId};
 }
 if(!safeName(a.id))throw Error('任务 ID 无效');const f=path.join(dir,a.id+'.json'),job=load(f,null);if(!job||job.owner!==owner)throw Error('任务不存在');if(job.status==='completed'&&job.files?.length&&job.files.every(x=>x.verification?.verified)){if(job.files.some(x=>!fs.existsSync(x.path)||digest(fs.readFileSync(x.path))!==x.sha256))throw Error('已变化的产物不能交付，保留原记录待审查');return{id:job.id,status:job.status,files:job.files};}const legacyAudit=job.status==='completed';
 const inst=instances(root).find(i=>i.id===job.instance.id&&i.url===job.instance.url);if(!inst||(!inst.local&&!inst.trusted))throw Error('原实例已停用或地址改变，未转发到新实例');if(!inst.local&&!a.allowRemote)throw Error('远程实例尚未授权');if(!job.promptId)return{id:job.id,status:job.status};
 const entry=(await call(inst,'/history/'+encodeURIComponent(job.promptId)))[job.promptId];if(!entry){const q=await call(inst,'/queue');const queued=q.queue_pending?.some(row=>row[1]===job.promptId),running=q.queue_running?.some(row=>row[1]===job.promptId);if(a.action==='cancel'&&queued){await call(inst,'/queue',{delete:[job.promptId]});job.status='cancel-requested';write(f,job);}return{id:job.id,status:running?'running':job.status==='cancel-requested'?'cancel-requested':queued?'queued':'unknown'};}
 if(entry.status?.status_str==='error'){job.status='failed';job.error='ComfyUI 返回执行失败，请检查原任务日志';write(f,job);return{id:job.id,status:'failed',error:job.error};}if(entry.status?.status_str!=='success')return{id:job.id,status:'pending'};
 const contract=job.contract53||mediaContract51({id:job.templateId,version:job.version,kind:job.kind||'image',graph:job.graph});if(!contract.compatible){job.contractAudit53={state:'pending',originalStatus:job.status,reason:contract.issues.join('；')};write(f,job);throw Error('原任务输出契约待验证：'+contract.issues.join('；'));}
 const files=[],staged=[];let n=0,total=0;try{for(const target of contract.selected){const output=entry.outputs?.[target.node];if(!output||!Array.isArray(output[target.group])||!output[target.group].length)throw Error('目标输出节点缺少契约产物 '+target.node);for(const item of output[target.group]){if(n>=64)throw Error('产物数量超过64项');if(!['output','temp'].includes(item.type)||!safeAsset(item.filename)||item.subfolder&&!safeAsset(item.subfolder))throw Error('目标产物路径或类型无效');const ext=path.extname(item.filename).toLowerCase();if(!/^\.[a-z0-9]{1,10}$/.test(ext))throw Error('目标产物文件名无效');const bytes=await call(inst,'/view?'+new URLSearchParams({filename:item.filename,subfolder:item.subfolder||'',type:item.type}),null,true);total+=bytes.length;if(total>256*1024*1024)throw Error('产物总量超过256MB');const dest=path.join(dir,job.id+'-'+n+++ext),temp=dest+'.unverified';fs.writeFileSync(temp,bytes);staged.push({temp,dest});const verification=await verifyMedia53(root,temp,contract.technicalType);files.push({path:dest,bytes:bytes.length,sha256:digest(bytes),kind:contract.purpose,outputNode:target.node,...['music','speech'].includes(contract.purpose)?{purposeEvidence:{purpose:contract.purpose,source:'version-bound locally reviewed generation workflow',workflowId:contract.workflowId,version:contract.version,graphHash:contract.graphHash}}:{},verification});}}
 for(const x of staged){if(fs.existsSync(x.dest)){if(digest(fs.readFileSync(x.dest))!==digest(fs.readFileSync(x.temp)))throw Error('归档路径已有不同内容，不覆盖原媒体');fs.rmSync(x.temp,{force:true});}else fs.renameSync(x.temp,x.dest);}
 }catch(e){for(const x of staged)fs.rmSync(x.temp,{force:true});job.status='validation-failed';job.validationError=e.message;write(f,job);throw Error('实际产物验证失败；未标记完成：'+e.message);}
 if(!files.length)throw Error('已完成但无支持的输出；原任务仍可查询');delete job.validationError;if(legacyAudit)job.contractAudit53={state:'passed',originalStatus:'completed',auditedAt:new Date().toISOString()};job.contract53={...contract,resultVerification:'passed',verifiedAt:new Date().toISOString()};job.status='completed';job.files=files;write(f,job);return{id:job.id,status:job.status,files};
}
