import fs from 'node:fs';import path from 'node:path';

// DSH 0.2.2's public session event used by its official `present` tool.
// Keep ordinary playback URLs as a fallback; the chat renderer recognizes
// durable file references, not plugin HTTP paths as workspace images.
export function mediaDeliveries(ctx,root){
 const pending=new Set();
 return function deliver(value,owner,key){
  if(!['completed'].includes(value.status||value.state))return false;
  const agent=ctx.agents?.get(owner),session=agent?.session;
  if(!session?.append||!session.snapshotEvents||!ctx.agents.turnBoundaryOf)return false;
  const files=(value.files||[]).filter(f=>{
   if(!f.path)return false;const relative=path.relative(root,path.resolve(f.path));
   return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)&&fs.existsSync(f.path)&&fs.statSync(f.path).isFile();
  }).map(f=>({path:path.resolve(f.path),description:f.name||path.basename(f.path)}));
  if(!files.length)return false;
  const callId='media-delivery:'+key,already=()=>session.snapshotEvents().some(e=>e.type==='deliverables/presented'&&e.data.callId===callId);
  if(already()||pending.has(owner+'/'+callId))return true;
  const publish=turn=>{if(!already())session.append('deliverables/presented',{turn,callId,files});};
  const boundary=ctx.agents.turnBoundaryOf(session);
  if(boundary.lastTurn>0){publish(boundary.lastTurn);return true;}
  // An extension-created Agent may not have had its first turn yet. Publish
  // when the official jobs controller wakes that Agent, before its request.
  if(!agent.ctx?.on)return false;
  const slot=owner+'/'+callId;pending.add(slot);let off;
  off=agent.ctx.on('agent/pre-step',(event,next)=>{
   try{publish(event.turn);}finally{pending.delete(slot);off?.();}
   return next();
  });
  ctx.effect(()=>()=>{pending.delete(slot);off();});return true;
 };
}
