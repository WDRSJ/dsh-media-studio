import test from 'node:test';
import assert from 'node:assert/strict';
import {aceSignature31} from '../src/workflows3.mjs';

const graph={
  save:{class_type:'SaveAudioAdvanced',inputs:{audio:['vae',0],filename_prefix:'x'}},
  vae:{class_type:'VAEDecodeAudio',inputs:{samples:['ks',0],vae:['vl',0]}},
  ks:{class_type:'KSampler',inputs:{model:['m',0],positive:['enc',0],negative:['enc',0],latent_image:['empty',0]}},
  enc:{class_type:'TextEncodeAceStepAudio1.5',inputs:{}},
  empty:{class_type:'EmptyAceStep1.5LatentAudio',inputs:{}},
  m:{class_type:'UNETLoader',inputs:{}},
  vl:{class_type:'VAELoader',inputs:{}}
};

test('ACE automatic purpose requires a connected fixed graph and exactly one SaveAudioAdvanced output', () => {
  const sig=aceSignature31({graph,outputSelection53:['save']});
  assert.equal(sig?.outId,'save');
  assert.equal(sig.producerId,'ks');
  assert.equal(graph[sig.producerId].class_type,'KSampler');
  assert.equal(sig.prod,undefined);
  assert.equal(aceSignature31({graph,outputSelection53:['save','vae']}),null);
  assert.equal(aceSignature31({graph,outputSelection53:[]}),null);
  assert.equal(aceSignature31({graph:{...graph,save:{class_type:'SaveImage',inputs:{}}},outputSelection53:['save']}),null);
  const unused={...graph,enc2:{class_type:'TextEncodeAceStepAudio1.5',inputs:{}},empty2:{class_type:'EmptyAceStep1.5LatentAudio',inputs:{}}};
  assert.equal(aceSignature31({graph:unused,outputSelection53:['save']}),null);
  const missing={...graph,enc:{class_type:'CLIPTextEncode',inputs:{}}};
  assert.equal(aceSignature31({graph:missing,outputSelection53:['save']}),null);
});
