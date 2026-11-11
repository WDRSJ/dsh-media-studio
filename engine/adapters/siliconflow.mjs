const root='https://api.siliconflow.cn/v1';
const preset=(model,unit)=>({model,unit,unitPriceCNY:null,priceSource:null,priceCheckedAt:null});
export default {
 id:'siliconflow',version:2,label:'硅基流动',keyEnvironment:'SILICONFLOW_API_KEY',apiHosts:['api.siliconflow.cn'],downloadSuffixes:['siliconflow.cn'],
 kinds:{image:'siliconflowImage',video:'siliconflowVideo',speech:'siliconflowSpeech'},
 presets:{siliconflowImage:{preview:preset('Qwen/Qwen-Image','image'),quality:preset('Qwen/Qwen-Image','image')},siliconflowVideo:{preview:preset('Wan-AI/Wan2.2-T2V-A14B','video_request'),quality:preset('Wan-AI/Wan2.2-T2V-A14B','video_request')},siliconflowSpeech:{preview:preset('FunAudioLLM/CosyVoice2-0.5B','speech_kchar'),quality:preset('FunAudioLLM/CosyVoice2-0.5B','speech_kchar')}},
 unitForModel(kind,model){return kind==='video'&&model==='MiniMaxAI/MiniMax-H3'?'video_second':kind==='video'?'video_request':kind==='speech'?'speech_kchar':'image';},
 reviewedModels(kind){return kind==='video'?['Wan-AI/Wan2.2-T2V-A14B','Wan-AI/Wan2.2-I2V-A14B','MiniMaxAI/MiniMax-H3']:kind==='image'?['Qwen/Qwen-Image']:['FunAudioLLM/CosyVoice2-0.5B'];},
 build(input,preset){
  const model=preset.model;if(input.kind==='image'){if(!['Qwen/Qwen-Image','Kwai-Kolors/Kolors'].includes(model))throw Error('此图片模型的输入协议未审查，不套用其他模型参数');if(input.referenceImages.length)throw Error('硅基流动当前适配文生图；图像编辑需单独适配对应模型');const sizes=model.includes('Qwen-Image')?{'1:1':'1328x1328','16:9':'1664x928','9:16':'928x1664','4:3':'1472x1140','3:4':'1140x1472'}:{'1:1':'1024x1024','3:4':'960x1280','9:16':'720x1280'};if(!sizes[input.ratio])throw Error('该图像模型未适配此比例');return {endpoint:root+'/images/generations',body:{model,prompt:input.prompt,image_size:sizes[input.ratio]},units:1};}
  if(input.kind==='video'){
   if(input.generateAudio)throw Error('硅基流动此视频接口未提供音频开关');
   const transition=Date.parse('2026-11-10T00:00:00+08:00');
   if(model==='MiniMaxAI/MiniMax-H3'){
    if(Date.now()<transition)throw Error('官方公布MiniMax-H3自2026-11-10启用，当前日期尚未到达；未提交');
    if(preset.unit!=='video_second')throw Error('MiniMax-H3按秒计费，必须重新设置按秒单价，不能沿用Wan按次价格');
    if(input.duration<5||input.duration>15)throw Error('MiniMax-H3时长仅支持5至15秒');
    if(input.referenceImages.length>2)throw Error('仅支持首帧及尾帧两张参考图片');
    return{endpoint:root+'/video/submit',body:{model,prompt:input.prompt,duration:input.duration,resolution:input.tier==='preview'?'480p':'768p',ratio:input.ratio,...input.referenceImages.length?{images:input.referenceImages.map((url,i)=>({url,role:i===0?'first_frame':'last_frame'}))}:{}},units:input.duration,asyncTask:true};
   }
   if(!['Wan-AI/Wan2.2-T2V-A14B','Wan-AI/Wan2.2-I2V-A14B'].includes(model))throw Error('尚未审查此视频模型的协议，不沿用其他模型参数');
   if(Date.now()>=transition)throw Error('Wan2.2已于2026-11-10下线；请显式选择新模型并重新核定计价');
   if(preset.unit!=='video_request')throw Error('Wan2.2旧协议按次预留，计价单位不一致');
   if(input.duration!==5)throw Error('旧Wan协议仅接受默认5秒请求，不能伪造时长参数');
   const sizes={'16:9':'1280x720','9:16':'720x1280','1:1':'960x960'};if(!sizes[input.ratio])throw Error('硅基流动视频不支持此比例');if(input.referenceImages.length>1)throw Error('旧Wan协议只支持一个首帧');const i2v=/I2V/.test(model);if(i2v!==Boolean(input.referenceImages.length))throw Error('请使 I2V/T2V 模型与参考图输入匹配');
   return{endpoint:root+'/video/submit',body:{model,prompt:input.prompt,image_size:sizes[input.ratio],...(i2v?{image:input.referenceImages[0]}:{})},units:1,asyncTask:true,validUntil:new Date(transition).toISOString(),warnings:['Wan2.2将于2026-11-10下线；旧图像尺寸协议不适用于新H3，禁止直接沿用旧价格']};
  }
  if(input.kind==='speech'&&model!=='FunAudioLLM/CosyVoice2-0.5B')throw Error('此语音模型的协议未审查，不套用CosyVoice参数');
  if(input.kind==='speech')return {endpoint:root+'/audio/speech',body:{model,input:input.prompt,voice:input.voiceId,response_format:'mp3',stream:false},units:Array.from(input.prompt).length/1000,binary:true};
  throw Error('此供应商尚未适配该生成能力');
 },
 taskId(response){if(!response.requestId)throw Error('No SiliconFlow requestId');return response.requestId;},
 pollRequest(id){return {url:root+'/video/status',options:{method:'POST',body:{requestId:id}}};},
 pollStatus(response){const map={Succeed:'completed',Failed:'failed',InQueue:'submitted',InProgress:'submitted'};if(!map[response.status])throw Error('Unknown SiliconFlow task status');if(response.status==='Succeed'&&!response.results?.videos?.[0]?.url)throw Error('Missing SiliconFlow video URL');return map[response.status];},
 outputURL(plan,response){return plan.input.kind==='video'?response.results?.videos?.[0]?.url:response.images?.[0]?.url;}
};
