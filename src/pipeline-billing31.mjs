// Failed provider attempts may still be billed. Keep them in the estimate and
// deduct them from the stage ceiling; never present a retry as a free rewind.
export function previousCost31(stage){return(stage.attemptHistory||[]).reduce((n,a)=>{if(!Number.isFinite(a.estimateCNY)||a.estimateCNY<0)throw Error('原失败阶段费用未知，不能安全重试');return n+a.estimateCNY;},0);}
export function cloudParams31(stage){const previous=previousCost31(stage),params={...stage.params};if(params.budgetCNY!==undefined){params.budgetCNY=Math.round((params.budgetCNY-previous)*10000)/10000;if(params.budgetCNY<0)throw Error('原阶段预留可能已计费，剩余预算不足');}return params;}
export function pipelineEstimate31(stages){if(stages.some(s=>s.executor==='cloud-media'&&!Number.isFinite(s.costCNY)))return null;return stages.reduce((n,s)=>n+(s.costCNY||0)+previousCost31(s),0);}
