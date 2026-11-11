import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

function safeText(value) {
  return String(value ?? '').replace(/[\p{Cc}{}\\]/gu,' ').slice(0,100);
}
export async function renderMotion(root,args) {
  const duration=Number(args.duration??6), fps=Number(args.fps??24);
  const sizes={landscape:'1280x720',portrait:'720x1280',square:'720x720'};
  const scene=JSON.parse(args.scene||'{}');
  if(!scene||typeof scene!=='object'||Array.isArray(scene)||Object.keys(scene).some(k=>!['background','titleY','captionY'].includes(k)))throw Error('动画描述只接受 background、titleY、captionY');
  const background=scene.background??'142940',ty=scene.titleY??0.42,cy=scene.captionY??0.62;
  if(!/^[a-f0-9]{6}$/i.test(background)||![ty,cy].every(y=>Number.isFinite(y)&&y>=0.1&&y<=0.9))throw Error('动画颜色或位置越界');
  const size=sizes[args.format??'landscape'];
  if(!size||![24,30].includes(fps)||!Number.isInteger(duration)||duration<5||duration>10)throw Error('时长 5–10 秒，帧率 24/30，画幅 landscape/portrait/square');
  const dir=path.join(root,'motion',randomUUID());
  fs.mkdirSync(dir,{recursive:true});
  const title=safeText(args.title),caption=safeText(args.caption);
  const [w,h]=size.split('x').map(Number);
  const ass=['[Script Info]','ScriptType: v4.00+','PlayResX: '+w,'PlayResY: '+h,'[V4+ Styles]','Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding','Style: Default,Microsoft YaHei,52,&H00FFFFFF,&H00FFFFFF,&H00332211,&H00000000,0,0,0,0,100,100,0,0,1,1,0,5,20,20,20,1','[Events]','Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text'];
  const end='0:00:'+String(duration).padStart(2,'0')+'.00';
  ass.push('Dialogue: 0,0:00:00.00,'+end+',Default,,0,0,0,,{\\fad(500,500)\\move('+Math.round(w*.35)+','+Math.round(h*ty)+','+Math.round(w*.5)+','+Math.round(h*ty)+',0,1500)}'+title,'Dialogue: 0,0:00:01.00,'+end+',Default,,0,0,0,,{\\fs28\\fad(700,350)\\pos('+Math.round(w*.5)+','+Math.round(h*cy)+')}'+caption);
  fs.writeFileSync(path.join(dir,'scene.ass'),ass.join('\n'));
  fs.writeFileSync(path.join(dir,'parameters.json'),JSON.stringify({template:'motion-title-v1',title,caption,fps,duration,size,scene},null,2));
  const exe=path.join(root,'tools','ffmpeg.exe');
  const flags=['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x'+background+':s='+size+':r='+fps+':d='+duration,'-vf','ass=scene.ass,fade=t=in:d=0.3,fade=t=out:st='+(duration-.4)+':d=0.4','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','scene.mp4'];
  await new Promise((resolve,reject)=>{const child=spawn(exe,flags,{cwd:dir,windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:90000});let msg='';child.stderr.on('data',x=>msg=(msg+x).slice(-1200));child.on('error',reject);child.on('close',n=>n===0?resolve():reject(Error('渲染失败 '+msg)));});
  return {file:path.join(dir,'scene.mp4'),source:path.join(dir,'scene.ass'),duration,fps,size,providerCharge:0};
}
