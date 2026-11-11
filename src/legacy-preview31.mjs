import {adapterFor} from '../engine/adapters/index.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
import {buildMediaPlan,mediaPlanBlockers,policySchema} from '../engine/core.mjs';
import {readRouting,presetKey} from '../engine/routing.mjs';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const unit=u=>['image','music_request','video_request','request'].includes(u)?'request':['video_second','second'].includes(u)?'second':['speech_kchar','kchar'].includes(u)?'kchar':u;
// Same policy/routing snapshot and pure wire builder as the actual executor.
// Preview must not instantiate MediaStore (which creates a DB/draft receipt).
export function legacyPreview31(root,c,input,{reviewed=false,resolution,ratio,duration}={}){
 const base=JSON.parse(fs.readFileSync(path.join(root,'media-policy.json'),'utf8').replace(/^\uFEFF/,'')),route=readRouting(path.join(root,'media-routing.json'));
 const original=policySchema.parse({...base,presets:{...base.presets,...route.models}}),key=presetKey(input.kind,c.providerId),tier=input.tier==='quality'?'quality':'preview';
 const model=tier==='preview'?c.modelPreview:input.requestedTier==='standard'?(c.modelStandard||c.modelQuality):c.modelQuality;
 if(!model)throw Error('所选档位未配置模型');
 if(reviewed){const defaults=policySchema.parse(JSON.parse(fs.readFileSync(new URL('../assets/default-policy.json',import.meta.url))));if(defaults.presets[key]?.[tier]?.model!==model&&!adapterFor(c.providerId)?.reviewedModels?.(input.kind)?.includes(model))throw Error('Auto尚未审查此模型及档位的能力；请使用已审查模型或明确配置的协议');}
 route.defaults[input.kind]=c.providerId;route.models={...original.presets,...route.models};route.models[key]=structuredClone(route.models[key]);route.models[key][tier]={...route.models[key][tier],model};
 const expectedUnit=adapterFor(c.providerId)?.unitForModel?.(input.kind,model)||route.models[key][tier].unit;
 if(expectedUnit!==route.models[key][tier].unit){if(!c.pricing||c.pricing.rate==null)throw Error('模型计价单位已变化，请重新核定新单价');route.models[key][tier].unit=expectedUnit;}
 if(model!==original.presets[key][tier].model&&!c.pricing)throw Error('模型已变化，不能沿用原模型单价');
 if(c.pricing){const p=c.pricing;if(unit(p.unit)!==unit(route.models[key][tier].unit))throw Error('账号计价单位与官方适配器不一致');if(p.currency!=='CNY'&&!Number.isFinite(p.fxCNY))throw Error('费用换算汇率未知');Object.assign(route.models[key][tier],{unitPriceCNY:p.rate===null?null:p.rate*(p.currency==='CNY'?1:p.fxCNY),priceSource:p.source,priceCheckedAt:p.checkedAt||new Date().toISOString()});}
 if(c.voice)route.voices[c.providerId]=c.voice;
 const policy=policySchema.parse({...base,presets:{...base.presets,...route.models}}),{requestedTier,...raw}=input;
 const plan=buildMediaPlan({...raw,provider:c.providerId,...c.voice?{voiceId:c.voice}:{}},policy,route);
 if(c.endpoint&&!plan.endpoint?.startsWith(c.endpoint.replace(/\/$/,'')))throw Error('官方适配器不支持此区域地址覆盖；未更换区域端点');
 if(ratio!==undefined&&plan.input.kind==='image'&&c.providerId!=='siliconflow')throw Error('此图片适配器没有已审查的固定画幅参数，不忽略指定比例');
 if(ratio!==undefined&&plan.input.kind==='video'&&plan.body.ratio!==undefined&&plan.body.ratio!==ratio)throw Error('指定画幅与模型实际请求不一致；参考图自适应画幅不能保证固定比例');
 if(duration!==undefined&&plan.input.kind!=='video')throw Error('此官方适配器没有已审查的非视频时长参数，不忽略指定时长');
 if(resolution!==undefined&&String(resolution).toLowerCase()!==String(plan.body.resolution||plan.body.image_size||plan.body.size||'').toLowerCase())throw Error('指定分辨率不属于此模型/档位的已审查API参数');
 const blockers=mediaPlanBlockers(plan,policy).filter(b=>!['Paid generation locked','Budget is zero'].includes(b));if(blockers.length)throw Error(blockers.join('; '));
 return{policy,route,plan,contract:{provider:plan.provider,adapterVersion:plan.adapter?.version||1,model:plan.body.model||plan.body.ModelName,kind:plan.input.kind,inputMode:plan.input.referenceImages.length?(plan.input.kind==='video'?'image-to-video':'image-edit'):'text',endpoint:plan.endpoint,body:plan.body,estimateCNY:plan.estimateCNY,resolution:plan.body.resolution||plan.body.image_size||plan.body.size||null,validUntil:plan.validUntil||null,warnings:plan.warnings||[],async:!!plan.adapter?.asyncTask||plan.input.kind==='video'||plan.provider==='tencent',responseKind:plan.input.kind,wireHash:sha({endpoint:plan.endpoint,body:plan.body}),evidence:'现有受审查适配器请求构造；不证明账号权限、真实生成质量或供应商实际计费'}};
}
