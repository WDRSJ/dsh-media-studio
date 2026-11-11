import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Recovery lists only already submitted work. It never creates a generation.
export function recoverableTasks(root) {
 const result=[], dir=path.join(root,'workflows3','jobs');
 if(fs.existsSync(dir))for(const name of fs.readdirSync(dir)) {
  if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))continue;
  try {const j=JSON.parse(fs.readFileSync(path.join(dir,name)));
   if(j.owner&&j.promptId&&['submitted','queued','running'].includes(j.status))result.push({type:'workflow',id:j.id,owner:j.owner});
  }catch{/* One damaged record must not prevent other tasks from recovery. */}
 }
 const file=path.join(root,'pipelines-v3','jobs.sqlite');
 if(fs.existsSync(file)) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {const controls=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='controls'").get();for(const row of db.prepare('SELECT id,owner,call_id,plan FROM jobs').all()) {
   try {const p=JSON.parse(row.plan);
    if(controls&&db.prepare('SELECT paused FROM controls WHERE id=? AND owner=?').get(row.id,row.owner)?.paused)continue;
    if(['running','waiting'].includes(p.state)&&!p.stages.some(s=>['preparing','submitting','uncertain'].includes(s.state)))result.push({type:'pipeline',id:row.id,owner:row.owner,call:row.call_id});
   }catch{}
  }}finally{db.close();}
 }
 return result;
}
