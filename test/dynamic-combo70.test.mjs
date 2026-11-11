import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEditor31} from '../src/workflow-format31.mjs';
import {analyze} from '../src/workflows3.mjs';

const info = {
  EmptyAudio: {input: {required: {}}, output: ['AUDIO'], output_node: false},
  SaveAudioAdvanced: {
    input: {required: {
      audio: ['AUDIO', {}],
      filename_prefix: ['STRING', {}],
      format: ['COMFY_DYNAMICCOMBO_V3', {options: [
        {key: 'flac', inputs: {required: {}}},
        {key: 'mp3', inputs: {required: {quality: ['COMBO', {options: ['V0', '128k', '320k']}]}}}
      ]}]
    }},
    output: [], output_node: true
  }
};
const gui = {
  nodes: [
    {id: 1, type: 'EmptyAudio', mode: 0, inputs: [], outputs: [{name: 'AUDIO', type: 'AUDIO', links: [1]}], widgets_values: []},
    {id: 2, type: 'SaveAudioAdvanced', mode: 0, inputs: [{name: 'audio', type: 'AUDIO', link: 1}], outputs: [], widgets_values: ['test/audio', 'mp3', 'V0'], widgets_values_named: {filename_prefix: 'test/audio', format: 'mp3', 'format.quality': 'V0'}}
  ],
  links: [[1, 1, 0, 2, 0, 'AUDIO']]
};

test('dynamic combo dependent editor widgets become explicit dotted API inputs', () => {
  const {graph} = compileEditor31(gui, info);
  assert.deepEqual(graph['2'].inputs, {audio: ['1', 0], filename_prefix: 'test/audio', format: 'mp3', 'format.quality': 'V0'});
  assert.equal(graph['1'].class_type, 'EmptyAudio');
});

test('unknown dynamic dependent fields are rejected instead of silently dropped', () => {
  const bad = structuredClone(gui);
  bad.nodes[1].widgets_values_named['format.unknown'] = 'x';
  assert.throws(() => compileEditor31(bad, info), /未声明命名控件/);
});

test('analysis rejects a selected dynamic option missing its required dependent input', () => {
  const {graph} = compileEditor31(gui, info);
  const accepted = new Set(['EmptyAudio', 'SaveAudioAdvanced']);
  const good = analyze(graph, info, accepted);
  assert.ok(!good.issues.some(i => i.includes('缺少动态输入')), good.issues.join(';'));
  const missing = structuredClone(graph);
  delete missing['2'].inputs['format.quality'];
  const bad = analyze(missing, info, accepted);
  assert.ok(bad.issues.some(i => i.includes('缺少动态输入 format.quality')), bad.issues.join(';'));
});
