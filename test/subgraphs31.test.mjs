import test from 'node:test';import assert from 'node:assert/strict';
import {compileEditor31,editorToGraph} from '../src/workflow-format31.mjs';
const info={EmptyImage:{input:{required:{width:['INT',{min:1,max:4096}],height:['INT',{min:1,max:4096}],batch_size:['INT',{}],color:['INT',{}]}},output:['IMAGE']},SaveImage:{input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}},output:[]}};
function fixture(){return{nodes:[{id:10,type:'sub',widgets_values:[96],inputs:[{name:'width',type:'INT',widget:{name:'width'},link:null}],outputs:[{type:'IMAGE',links:[1]}]},{id:11,type:'SaveImage',inputs:[{name:'images',link:1}],widgets_values:['out']}],links:[[1,10,0,11,0,'IMAGE']],definitions:{subgraphs:[{id:'sub',name:'image size',inputs:[{name:'width',type:'INT'}],inputNode:{id:-10},outputNode:{id:-20},nodes:[{id:1,type:'EmptyImage',inputs:[{name:'width',type:'INT',widget:{name:'width'},link:2}],outputs:[{type:'IMAGE',links:[3]}],widgets_values:[64,48,1,0]}],links:[{id:2,origin_id:-10,origin_slot:0,target_id:1,target_slot:0,type:'INT'},{id:3,origin_id:1,origin_slot:0,target_id:-20,target_slot:0,type:'IMAGE'}]}]}};}
test('subgraph promoted values, boundary outputs and repeated instance IDs expand independently',()=>{
 const doc=fixture(),original=structuredClone(doc);const r=compileEditor31(doc,info);assert.equal(r.graph.sg_1.inputs.width,96);assert.deepEqual(r.graph['11'].inputs.images,['sg_1',0]);assert.equal(r.sourceMap.sg_1,'10/1');assert.deepEqual(doc,original);
 doc.nodes.push({...structuredClone(doc.nodes[0]),id:20,widgets_values:[128],outputs:[{type:'IMAGE',links:[]}]});const two=editorToGraph(doc,info);assert.equal(two.sg_1.inputs.width,96);assert.equal(two.sg_2.inputs.width,128);
});
test('current frontend named widgets preserve semantics and contradictions never compile',()=>{
 const doc=fixture();doc.definitions.subgraphs[0].nodes[0].widgets_values_named={width:64,height:48,batch_size:1,color:0};doc.nodes[0].widgets_values_named={width:96};
 assert.equal(editorToGraph(doc,info).sg_1.inputs.width,96);
 doc.nodes[0].widgets_values_named.width=128;assert.throws(()=>editorToGraph(doc,info),/冲突/);
 const flat={nodes:[{id:1,type:'EmptyImage',widgets_values_named:{width:256,height:48,batch_size:1,color:0}}],links:[]};assert.equal(editorToGraph(flat,info)['1'].inputs.width,256);
 flat.nodes[0].widgets_values_named.unknown='x';assert.throws(()=>editorToGraph(flat,info),/未声明/);
});
test('unbound promoted inputs retain inner defaults; a primitive external input overrides the host widget',()=>{
 const doc=fixture();doc.nodes[0].widgets_values=[];assert.equal(editorToGraph(doc,info).sg_1.inputs.width,64);
 doc.nodes.push({id:30,type:'PrimitiveNode',widgets_values:[144]});doc.links.push([4,30,0,10,0,'INT']);doc.nodes[0].inputs[0].link=4;assert.equal(editorToGraph(doc,info).sg_1.inputs.width,144);
});
test('explicit empty or malformed positional copies never override named values silently',()=>{
 const flat={nodes:[{id:1,type:'EmptyImage',widgets_values_named:{width:256,height:48,batch_size:1,color:0}}],links:[]};
 for(const value of [[],{},null,[128,48,1,0]]){flat.nodes[0].widgets_values=value;assert.throws(()=>editorToGraph(flat,info),/冲突/);}
 delete flat.nodes[0].widgets_values;assert.equal(editorToGraph(flat,info)['1'].inputs.width,256);
 flat.nodes[0].widgets_values_named=null;assert.throws(()=>editorToGraph(flat,info),/命名控件格式/);
 const nested=fixture();nested.nodes[0].widgets_values=[];nested.nodes[0].widgets_values_named={width:96};assert.throws(()=>editorToGraph(nested,info),/冲突/);
 delete nested.nodes[0].widgets_values;assert.equal(editorToGraph(nested,info).sg_1.inputs.width,96);
});
test('nested subgraphs resolve outputs and refuse cyclic definitions or ambiguous promoted metadata',()=>{
 const doc=fixture(),inner=structuredClone(doc.definitions.subgraphs[0]);inner.id='nested';doc.definitions.subgraphs.push(inner);doc.definitions.subgraphs[0].nodes=[{id:1,type:'nested',widgets_values:[176],inputs:[],outputs:[{type:'IMAGE',links:[3]}]}];doc.definitions.subgraphs[0].links=doc.definitions.subgraphs[0].links.filter(l=>l.id===3);doc.nodes[0].widgets_values=[];
 assert.equal(editorToGraph(doc,info).sg_1.inputs.width,176);
 doc.definitions.subgraphs[1].nodes[0].type='sub';assert.throws(()=>editorToGraph(doc,info),/循环|控件/);
 const bad=fixture();bad.nodes[0].widgets_values=[96,128];assert.throws(()=>editorToGraph(bad,info),/提升控件数量/);
 bad.nodes[0].widgets_values=[96];bad.nodes[0].widgets_values_named={width:64};assert.throws(()=>editorToGraph(bad,info),/命名控件/);
});
