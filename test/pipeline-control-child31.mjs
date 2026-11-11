import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import{pipeline3 as pipelineCore53}from'../src/pipeline3.mjs';
const root=process.argv[2],id=process.argv[3];process.send?.('ready');for(let i=0;i<60;i++){try{await pipeline3(root,{action:i%2?'continue':'pause',id},'owner',{authorize:()=>{throw Error('No generation in control concurrency test');}});}catch{}await new Promise(r=>setTimeout(r,1));}process.send?.('done');
