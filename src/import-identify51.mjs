import {graphStructure} from './workflow-format31.mjs';
// Identification only: no IO, conversion, authority grant or activation.
export function identifyImport51(document){
 if(!document||typeof document!=='object'||Array.isArray(document))throw Error('导入内容必须是JSON对象');
 if(Buffer.byteLength(JSON.stringify(document),'utf8')>2000000)throw Error('导入文件超过2MB');
 if(Object.hasOwn(document,'format')){
  if(!['dsh-media-workflow','dsh-media-plan'].includes(document.format)||document.schemaVersion!==1)throw Error('未知导出包格式或版本');
  return {format:document.format,persisted:false,validated:false};
 }
 if(Array.isArray(document.nodes)&&Array.isArray(document.links))return {format:'comfy-editor',persisted:false,validated:false};
 graphStructure(document);
 return {format:'comfy-api',persisted:false,validated:true};
}
