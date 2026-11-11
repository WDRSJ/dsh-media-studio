// Selection operates on explicit capabilities; no model-name guesses or network calls.
export function selectBackend3(candidates,{kind,tier='standard',budgetCNY=0,required=[],availableVRAMMB=0,allowCloud=true,maxSeconds,requireOnline=false}={}){
 const rank={preview:1,standard:2,premium:3};
 const rejected=[],eligible=[];
 for(const c of candidates){let reason;
  if(!c.enabled||!c.available)reason=c.unavailableReason||'不可用';
  else if(c.kind!==kind||required.some(x=>!c.capabilities?.includes(x)))reason='能力不匹配';
  else if(!rank[c.tier]||rank[c.tier]<rank[tier])reason='质量档位不足';
  else if(c.source==='local'&&c.requiredVRAMMB>(c.availableVRAMMB??availableVRAMMB))reason='显存不足';
  else if(requireOnline&&c.networkStatus!=='reachable')reason='网络状态未验证';
  else if(maxSeconds!==undefined&&!Number.isFinite(c.expectedSeconds))reason='耗时未核定';
  else if(maxSeconds!==undefined&&c.expectedSeconds>maxSeconds)reason='超过预计耗时约束';
  else if(c.source==='cloud'&&!allowCloud)reason='云端未获授权';
  else if(!Number.isFinite(c.estimateCNY)||c.estimateCNY<0)reason='价格未核定';
  else if(c.estimateCNY>budgetCNY)reason='超过预算';
  if(reason)rejected.push({id:c.id,reason});else eligible.push(c);
 }
 eligible.sort((a,b)=>a.estimateCNY-b.estimateCNY||(a.source==='local'?-1:1)-(b.source==='local'?-1:1)||(b.verificationScore??0)-(a.verificationScore??0)||(b.qualityScore??0)-(a.qualityScore??0)||(a.expectedSeconds??Infinity)-(b.expectedSeconds??Infinity)||rank[a.tier]-rank[b.tier]||String(a.id).localeCompare(String(b.id)));
 return {selected:eligible[0]||null,rejected,reason:eligible.length?'满足已声明约束后选择最低估算费用；耗时为预测，不保证时限':'没有满足全部约束的方案'};
}
