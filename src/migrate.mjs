import fs from 'node:fs';import path from 'node:path';import {DatabaseSync,backup}from'node:sqlite';
import {ConnectionStore}from'./connections.mjs';
export async function migrate(root,legacy){
 fs.mkdirSync(root,{recursive:true});const store=new ConnectionStore(root);if(fs.existsSync(path.join(root,'migration-complete.json'))||store.load().value.connections.length)return;
 if(!legacy||!fs.existsSync(path.join(legacy,'media-policy.json'))){fs.mkdirSync(path.join(root,'credentials'),{recursive:true});fs.mkdirSync(path.join(root,'legacy','outputs'),{recursive:true});if(!fs.existsSync(path.join(root,'media-policy.json')))fs.copyFileSync(new URL('../assets/default-policy.json',import.meta.url),path.join(root,'media-policy.json'));if(!fs.existsSync(path.join(root,'media-routing.json'))){const base=JSON.parse(fs.readFileSync(path.join(root,'media-policy.json')));fs.writeFileSync(path.join(root,'media-routing.json'),JSON.stringify({schemaVersion:1,defaults:{image:'ark',video:'ark',speech:'minimax',music:'minimax'},voices:{minimax:'male-qn-qingse',siliconflow:'alex'},models:base.presets}));}store.save(store.load().value,store.load().revision);fs.writeFileSync(path.join(root,'migration-complete.json'),JSON.stringify({at:new Date().toISOString(),fresh:true,version:2}));return;}
 const base=JSON.parse(fs.readFileSync(path.join(legacy,'media-policy.json'),'utf8').replace(/^\uFEFF/,''));
 const routes=JSON.parse(fs.readFileSync(path.join(legacy,'media-routing.json'),'utf8').replace(/^\uFEFF/,''));
 for(const f of ['media-policy.json','media-routing.json'])if(!fs.existsSync(path.join(root,f)))fs.copyFileSync(path.join(legacy,f),path.join(root,f));
 fs.mkdirSync(path.join(root,'credentials'),{recursive:true});
 const oldSecrets=path.join(legacy,'media/secrets');if(fs.existsSync(oldSecrets))for(const f of fs.readdirSync(oldSecrets).filter(f=>f.endsWith('.dpapi')))if(!fs.existsSync(path.join(root,'credentials',f)))fs.copyFileSync(path.join(oldSecrets,f),path.join(root,'credentials',f));
 const data=path.join(root,'legacy');fs.mkdirSync(data,{recursive:true});
 if(fs.existsSync(path.join(legacy,'media/data/media.sqlite'))&&!fs.existsSync(path.join(data,'media.sqlite'))){const db=new DatabaseSync(path.join(legacy,'media/data/media.sqlite'),{readOnly:true});try{await backup(db,path.join(data,'media.sqlite'));}finally{db.close();}}
 if(fs.existsSync(path.join(legacy,'media/data/outputs')))fs.cpSync(path.join(legacy,'media/data/outputs'),path.join(data,'outputs'),{recursive:true,force:false,errorOnExist:false});
 const config=store.load();for(const kind of ['image','video','music','speech']){
  const provider=routes.defaults[kind];const preset=provider==='tencent'?'tencentMusic':provider==='bailian'?'bailianMusic':kind==='video'&&provider==='minimax'?'minimaxVideo':provider==='siliconflow'?'siliconflow'+kind[0].toUpperCase()+kind.slice(1):kind;
  const model=(routes.models||{})[preset]||base.presets[preset];const name=({ark:'ARK_API_KEY',minimax:'MINIMAX_API_KEY',tencent:'TENCENTCLOUD_SECRET_KEY',bailian:'DASHSCOPE_API_KEY',siliconflow:'SILICONFLOW_API_KEY'})[provider];
  config.value.connections.push({id:'legacy-'+kind,providerId:provider,kind,label:'原有账户',enabled:true,endpoint:'',protocol:'legacy',modelPreview:model?.preview.model||'',modelQuality:model?.quality.model||'',voice:routes.voices?.[provider]||'',credentialRef:fs.existsSync(path.join(root,'credentials',name+'.dpapi'))?'stored:'+name:process.env[name]?'env:'+name:'',...(provider==='tencent'?{credentialRefs:{SecretId:'stored:TENCENTCLOUD_SECRET_ID'}}:{})});config.value.defaults[kind]='legacy-'+kind;
 }store.save(config.value,config.revision);fs.writeFileSync(path.join(root,'migration-complete.json'),JSON.stringify({at:new Date().toISOString(),source:legacy,version:2}));
}
