import {metadata31} from './model-resources31.mjs';

// Memory reported by a CPU device is system RAM, never GPU VRAM. Unknown
// complex architectures require an explicit user estimate before Auto admits
// them; Local can still execute after its normal dependency checks.
export function resourcePolicy31(root,graph,instanceId,devices=[]){
 const metadata=metadata31(root),requirements=[];
 for(const n of Object.values(graph))for(const [input,name]of Object.entries(n.inputs)){
  if(typeof name!=='string'||!/(?:ckpt|unet|diffusion|clip|vae|lora|control_net|model)_name\d*$/.test(input))continue;
  const entry=metadata.find(m=>m.instanceId===instanceId&&m.loader===n.class_type&&m.input===input&&m.name===name);
  if(entry?.minimumVRAMMB!=null)requirements.push({mb:entry.minimumVRAMMB,evidence:'用户登记估算，非插件实测'});
  else if(n.class_type==='CheckpointLoaderSimple')requirements.push({mb:4096,evidence:'checkpoint 保守4096MB准入值，非模型峰值实测'});
  else return {available:false,reason:'复杂模型资源 '+n.class_type+'/'+name+' 尚未登记显存估算，不猜测架构要求'};
 }
 const modelFree=!requirements.length;
 if(modelFree&&Object.values(graph).some(n=>!['EmptyImage','SaveImage','LoadImage','ImageScale','ImageBatch','RepeatImageBatch','SaveAnimatedWEBP'].includes(n.class_type)))return{available:false,reason:'工作流资源需求未知，请使用本地显式执行并登记依赖'};
 const requiredVRAMMB=modelFree?0:requirements.reduce((total,r)=>total+r.mb,0);
 const gpu=devices.filter(d=>['cuda','hip','xpu','mps'].includes(String(d.type||'').toLowerCase()));
 const availableVRAMMB=Math.max(0,...gpu.map(d=>Math.max(0,Number(d.vram_free)||0)/1048576));
 return {available:modelFree||gpu.length>0,reason:modelFree?null:gpu.length?null:'仅检测到CPU或未知设备，系统内存不作为显存',requiredVRAMMB,availableVRAMMB,resourceEvidence:modelFree?'仅图像处理节点，无扩散模型；不代表生成质量':requirements.map(r=>r.evidence).join('；')};
}
