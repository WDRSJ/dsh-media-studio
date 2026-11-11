// Full IDs are deliberate: prefixes/suffixes can collide for imported copies.
// A definition binding is distinct from the instance selected for this run.
export function workflowIdentity31(workflow,instances=[]){
 const id=String(workflow.id),version=workflow.version;
 const bound=typeof workflow.instanceId==='string'&&workflow.instanceId?workflow.instanceId:null;
 const instance=bound?instances.find(i=>i.id===bound):null;
 const binding=bound?{id:bound,label:instance?.label?.trim()||(instance?(()=>{try{return 'ComfyUI · '+new URL(instance.url).host;}catch{return 'ComfyUI · 地址待配置';}})():'未找到配置的实例'),url:instance?.url||null,configured:!!instance}:null;
 const instanceLabel=binding?binding.label+' ['+binding.id+']':'未绑定实例（执行时选择）';
 return {id,version,binding,label:(workflow.name||id)+' · v'+version+' · '+instanceLabel+' · ID '+id};
}
