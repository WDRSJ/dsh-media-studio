import fs from'node:fs';import path from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
const run=promisify(execFile);
// Reuse FFmpeg's demuxers/decoders. No MIME/extension is accepted as proof.
export async function verifyMedia53(root,file,expected,{binary=process.env.DSH_FFMPEG_PATH||path.join(root,'tools','ffmpeg.exe')}={}){
 const size=fs.statSync(file).size;if(!size||size>128*1024*1024)throw Error('产物为空或超过128MB');
 if(!fs.existsSync(binary))throw Error('未配置现有FFmpeg，不能验证产物；不会自动下载');
 const {stdout,stderr}=await run(binary,['-nostdin','-hide_banner','-i',file,'-map','0:v:0?','-map','0:a:0?','-progress','pipe:1','-nostats','-f','null','-'],{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
 const input=stderr.split('Stream mapping:')[0],video=input.match(/Stream #0:\d[^\n]*Video:[^\n]*/),audio=input.match(/Stream #0:\d[^\n]*Audio:[^\n]*/);
 const head=Buffer.alloc(12),fd=fs.openSync(file,'r');try{fs.readSync(fd,head,0,12,0);}finally{fs.closeSync(fd);}
 const image=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||head[0]===255&&head[1]===216&&head[2]===255||head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP';
 const frames=[...stdout.matchAll(/^frame=(\d+)/gm)].map(m=>Number(m[1])).at(-1)||0,seconds=Math.max(0,...[...stdout.matchAll(/^out_time_us=(\d+)/gm)].map(m=>Number(m[1])/1e6));
 const dimensions=video?[...video[0].matchAll(/\b(\d{1,6})x(\d{1,6})\b/g)].find(m=>Number(m[1])>0&&Number(m[2])>0):null,fps=video?.[0].match(/([\d.]+) fps/),sampleRate=audio?.[0].match(/(\d+) Hz/);
 const actual=video?(image&&frames===1?'image':'video'):audio?'audio':'unknown';
 if(!['image','video','audio'].includes(expected)||actual!==expected)throw Error('实际产物类型 '+actual+' 与契约 '+expected+' 不符');
 if(video&&(!dimensions||Number(dimensions[1])<1||Number(dimensions[2])<1||frames<1))throw Error('图片或视频无法读取有效尺寸/帧');
 if(expected==='video'&&(!fps||Number(fps[1])<=0||seconds<=0))throw Error('视频缺少有效帧率或时长');
 if(audio&&(!sampleRate||Number(sampleRate[1])<=0||seconds<=0))throw Error('音频缺少有效采样率或时长');
 if(/Error while decoding|corrupt|Invalid data found|Conversion failed/i.test(stderr))throw Error('产物解码损坏');
 return{verified:true,technicalType:actual,bytes:size,...dimensions?{width:Number(dimensions[1]),height:Number(dimensions[2])}:{},...fps?{fps:Number(fps[1])}:{},...sampleRate?{sampleRate:Number(sampleRate[1])}:{},frames,duration:seconds,verifier:'existing FFmpeg full decode; no semantic inference'};
}
