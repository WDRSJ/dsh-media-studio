import fs from 'node:fs';import path from 'node:path';import {validatePipeline} from './pipeline3.mjs';import {effectiveMode} from './policy3.mjs';
// This route requires an explicit slideshow choice. It must never stand in for
// a requested diffusion/model video or claim a higher video quality tier.
export async function autoSlideshow31(runtime,args,owner,{tier,cap,maxSeconds,requireOnline,decideImage}){
 const reject=reason=>({selected:null,rejected:[{id:'local:slideshow',reason}],reason:'图片合成路线不满足约束',budgetCNY:cap,tier,predictionOnly:true});
 if(tier!=='preview')return reject('当前图片合成路线仅声明Preview，不替代更高档模型视频');
 if(args.connectionId||args.referenceImage)return reject('本路线仅支持本地提示词图片→视频；指定云端账号或参考图请使用明确联合阶段');
 if(!Number.isInteger(args.duration)||args.duration<3||args.duration>10)return reject('图片合成需明确3–10秒整数时长');
 if(maxSeconds!==undefined)return reject('多阶段总耗时尚未核定，不能满足严格耗时约束');
 if(effectiveMode(runtime.root,'image',owner)==='Cloud')return reject('图片执行策略禁止本地来源，不隐式覆盖');
 if(!fs.existsSync(process.env.DSH_FFMPEG_PATH||path.join(runtime.root,'tools/ffmpeg.exe')))return reject('未配置FFmpeg，本路线不会自动下载或先启动图片任务');
 const image=await decideImage();if(image.selected?.source!=='local')return reject('没有满足约束的本地图片工作流：'+image.rejected.map(r=>r.reason).join('；'));
 const s=image.selected,stages=validatePipeline([{id:'frame',name:'本地工作流图片',executor:'comfy-workflow',params:{kind:'image',templateId:s.workflowId,workflowVersion:s.workflowVersion,instanceId:s.instanceId,values:s.values}},{id:'slideshow',name:'普通图片合成视频（非模型视频）',executor:'ffmpeg-video',dependencies:['frame'],params:{seconds:args.duration}}]);
 return{selected:{id:'local:slideshow:'+s.id,source:'local',kind:'video',tier:'preview',executor:'pipeline',capabilities:['video','slideshow'],estimateCNY:0,networkStatus:s.networkStatus,stages,sourceDecision:s,qualityEvidence:'普通图片视频，仅Preview，不是模型动作生成；图片档位为用户声明'},rejected:[],budgetCNY:cap,tier,reason:'用户明确选择图片视频，绑定已检查本地工作流与FFmpeg两阶段',constraints:{requireOnline,maxSeconds},predictionOnly:true};
}
