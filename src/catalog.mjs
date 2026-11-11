// Directory availability is independent of credentials and adapter readiness.
const entries = [
 ['ark','火山方舟','image video'],['doubao-voice','火山豆包语音','speech'],
 ['minimax','MiniMax','image video speech music'],['tencent','腾讯云','image video speech music'],
 ['bailian','阿里百炼','image video speech music'],['siliconflow','硅基流动','image video speech'],
 ['zhipu','智谱','image video speech'],['baidu','百度智能云','image video speech'],
 ['iflytek','讯飞','image speech'],['kling','可灵','image video'],['vidu','Vidu','image video'],
 ['mureka','Mureka','music speech'],['fish','Fish Audio','speech'],
 ['openai','OpenAI','image speech'],['google','Google Gemini / Cloud','image video speech music'],
 ['elevenlabs','ElevenLabs','speech music'],['azure-speech','Azure Speech','speech'],
 ['stability','Stability AI','image music'],['bfl','Black Forest Labs','image'],
 ['runway','Runway','image video'],['luma','Luma','image video'],['xai','xAI','image video'],
 ['adobe','Adobe Firefly','image video'],['fal','fal.ai','image video speech music'],
 ['replicate','Replicate','image video speech music'],
];
export const catalog = Object.freeze(entries.map(([id,label,kinds])=>Object.freeze({id,label,kinds:Object.freeze(kinds.split(' '))})));
export const kinds = Object.freeze(['image','video','music','speech']);
export function providersFor(kind, custom=[]){
 if(!kinds.includes(kind))throw Error('Unknown media category');
 return [...catalog,...custom].filter(p=>p.kinds.includes(kind));
}
