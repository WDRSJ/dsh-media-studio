import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEditor31, validateValue, optionsOf, reviewedNodes} from '../src/workflow-format31.mjs';
import {mediaContract51} from '../src/media-contract51.mjs';

const dynamicCombo = ['COMFY_DYNAMICCOMBO_V3', {options: [{key: 'flac', inputs: {required: {}}}, {key: 'mp3', inputs: {required: {quality: ['COMBO', {options: ['V0', '128k']}]}}}, {key: 'opus', inputs: {required: {quality: ['COMBO', {options: ['64k', '128k']}]}}}]}];
const info = {
  SaveAudioAdvanced: {input: {required: {filename_prefix: ['STRING', {default: 'audio/ComfyUI'}], format: dynamicCombo}, optional: {audio: ['AUDIO', {}]}}, output: ['AUDIO'], output_node: true},
};

test('official dynamic combo widget metadata is converted without guessing dependent fields', () => {
  assert.deepEqual(optionsOf(dynamicCombo), ['flac', 'mp3', 'opus']);
  validateValue('flac', dynamicCombo, 'format');
  assert.throws(() => validateValue('bad', dynamicCombo, 'format'), /缺少或不支持/);
  const gui = {
    nodes: [{
      id: 1, type: 'SaveAudioAdvanced', mode: 0, pos: [0, 0], size: [200, 100],
      inputs: [{name: 'audio', type: 'AUDIO', link: null}], outputs: [],
      widgets_values: ['audio/demo', 'flac'],
      widgets_values_named: {filename_prefix: 'audio/demo', format: 'flac'},
    }],
    links: [],
    extra: {mediaStudio: {schema: 1}},
    version: 0.4,
  };
  const {graph} = compileEditor31(gui, info);
  assert.equal(graph['1'].class_type, 'SaveAudioAdvanced');
  assert.equal(graph['1'].inputs.format, 'flac');
  assert.equal(graph['1'].inputs.filename_prefix, 'audio/demo');
});

test('official audio/video node adapters participate in the media output contract', () => {
  for (const node of ['SaveAudioAdvanced', 'SaveVideo', 'SaveWEBM', 'CreateVideo', 'Wan22ImageToVideoLatent', 'EmptyAceStep1.5LatentAudio', 'TextEncodeAceStepAudio1.5', 'VAEDecodeAudio']) assert.ok(reviewedNodes.has(node), 'missing reviewed node ' + node);
  assert.equal(mediaContract51({id: 'a', version: 1, kind: 'audio', graph: {s: {class_type: 'SaveAudioAdvanced', inputs: {}}}}).compatible, true);
  assert.equal(mediaContract51({id: 'a', version: 1, kind: 'music', graph: {s: {class_type: 'SaveAudioAdvanced', inputs: {}}}}).compatible, false, 'music still needs purpose review evidence');
  assert.equal(mediaContract51({id: 'v', version: 1, kind: 'video', graph: {s: {class_type: 'SaveVideo', inputs: {}}}}).compatible, true);
  assert.equal(mediaContract51({id: 'w', version: 1, kind: 'video', graph: {s: {class_type: 'SaveWEBM', inputs: {}}}}).outputs[0].group, 'images');
  assert.equal(mediaContract51({id: 'a', version: 1, kind: 'audio', graph: {s: {class_type: 'SaveAudioAdvanced', inputs: {}}}}).outputs[0].group, 'audio');
});
