// Configuration readiness only. Never proves network access, credentials or a
// model's actual quality. Used before Auto chooses a chargeable executor.
export function protocolIssue31(c,kind,args={}){
 if(c.protocol==='legacy')return null;
 if(!['openai-image','openai-speech','sync-http','async-http'].includes(c.protocol))return '协议待适配';
 if(c.protocol==='openai-image'&&kind!=='image'||c.protocol==='openai-speech'&&kind!=='speech')return '协议与媒体类别不匹配';
 try{const u=new URL(c.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return '需要无凭证HTTPS接口地址';}catch{return '接口地址未配置';}
 if(['sync-http','async-http'].includes(c.protocol)){
  const m=c.mapping;if(!m||typeof m.submitPath!=='string'||!m.submitPath.startsWith('/')||!m.body||typeof m.body!=='object'||!m.outputPath&&m.outputEncoding!=='binary')return '自定义提交或输出映射不完整';
  if(c.protocol==='async-http'&&(!m.taskIdPath||!m.pollPath?.includes('${taskId}')||!m.statusPath||!Array.isArray(m.success)||!m.success.length||!Array.isArray(m.failure)||!m.failure.length))return '异步任务查询或终止状态映射不完整';
 }
 const mapped=JSON.stringify(c.mapping?.body||{}),fixed=c.mapping?.body||c.parameters||{};
 if((args.duration!==undefined&&kind==='video'||c.pricing?.unit==='second')&&!mapped.includes('${duration}')&&!mapped.includes('${duration_ms}')&&fixed.duration!==(args.duration??5)&&fixed.duration_ms!==(args.duration??5)*1000)return '协议未实际绑定请求时长，不能忽略输出要求或按未知时长计价';
 if(args.ratio!==undefined&&!mapped.includes('${ratio}')&&fixed.ratio!==args.ratio)return '协议未实际绑定请求画幅';
 if(args.resolution!==undefined&&!mapped.includes('${resolution}')&&![fixed.resolution,fixed.image_size,fixed.size].includes(args.resolution))return '协议未实际绑定请求分辨率';
 return null;
}
