import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGUI, prepareAPI, WorkflowAutoError} from '../src/workflow-auto31.mjs';
import {listRemoteWorkflows, readRemoteWorkflow, saveRemoteWorkflow, remoteWorkflowName} from '../src/comfy-workflows31.mjs';

const info = {
  EmptyImage: {input: {required: {width: ['INT', {min: 16, max: 2048}], height: ['INT', {min: 16, max: 2048}], batch_size: ['INT', {min: 1, max: 8}], color: ['INT']}}, output: ['IMAGE']},
  SaveImage: {input: {required: {images: ['IMAGE'], filename_prefix: ['STRING']}}, output: [], output_node: true},
  CheckpointLoaderSimple: {input: {required: {ckpt_name: [['a.safetensors', 'b.safetensors']]}}, output: ['MODEL', 'CLIP', 'VAE']}
};
function editor(extra = []) {
  return {
    nodes: [
      {id: 1, type: 'EmptyImage', mode: 0, inputs: [], outputs: [{name: 'IMAGE', type: 'IMAGE', links: [1]}], widgets_values: [64, 48, 1, 0]},
      {id: 2, type: 'SaveImage', mode: 0, inputs: [{name: 'images', type: 'IMAGE', link: 1}], outputs: [], widgets_values: ['dsh_test']},
      ...extra
    ],
    links: [[1, 1, 0, 2, 0, 'IMAGE']]
  };
}
test('GUI auto preparation derives image output, editable aliases and ready status', () => {
  const r = prepareGUI(editor(), info, 'image');
  assert.equal(r.technicalType, 'image');
  assert.equal(r.kind, 'image');
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.outputSelection53, ['2']);
  assert.deepEqual(r.mappings.width, {node: '1', input: 'width', source: 'latent-width'});
  assert.deepEqual(r.mappings.height, {node: '1', input: 'height', source: 'latent-height'});
});
test('GUI auto preparation reports a missing model with node and candidates, never substitutes', () => {
  const checkpoint = {id: 3, type: 'CheckpointLoaderSimple', mode: 0, inputs: [], outputs: [{name: 'MODEL', type: 'MODEL', links: []}, {name: 'CLIP', type: 'CLIP', links: []}, {name: 'VAE', type: 'VAE', links: []}], widgets_values: ['missing.safetensors']};
  const r = prepareGUI(editor([checkpoint]), info, 'image');
  assert.equal(r.status, 'missing-model');
  assert.equal(r.missingModels.length, 1);
  assert.equal(r.missingModels[0].node, '3');
  assert.deepEqual(r.missingModels[0].candidates, ['a.safetensors', 'b.safetensors']);
  assert.match(r.diagnostics[0].message, /missing\.safetensors/);
});
test('media type mismatch is corrected to the detected output with an explicit warning', () => {
  const videoInfo = {...info, SaveVideo: {input: {required: {images: ['IMAGE'], filename_prefix: ['STRING']}}, output: [], output_node: true}};
  const gui = editor();
  gui.nodes[1] = {id: 2, type: 'SaveVideo', mode: 0, inputs: [{name: 'images', type: 'IMAGE', link: 1}], outputs: [], widgets_values: ['x']};
  const r = prepareGUI(gui, videoInfo, 'image');
  assert.equal(r.kind, 'video');
  assert.equal(r.adjustedKind.requested, 'image');
  assert.match(r.diagnostics[0].message, /实际输出/);
});
test('API graph preparation detects output and mappings without GUI', () => {
  const graph = {1: {class_type: 'EmptyImage', inputs: {width: 32, height: 32, batch_size: 1, color: 0}}, 2: {class_type: 'SaveImage', inputs: {images: ['1', 0], filename_prefix: 'x'}}};
  const r = prepareAPI(graph, info, 'image');
  assert.equal(r.source, 'comfy-api-auto');
  assert.equal(r.status, 'ready');
  assert.equal(r.mappings.width.node, '1');
});
test('ComfyUI userdata adapter lists, reads and saves with safe paths', async () => {
  const calls = [];
  const transport = {
    get: async route => {calls.push(route); if (route.startsWith('/userdata?dir=workflows')) return {data: [{path: 'A.json', size: 10}, {path: 'nested/B.json'}, {path: '../bad.json'}]}; if (route === '/userdata/workflows%2FA.json') return {data: {nodes: [], links: []}}; throw Object.assign(Error('not found'), {httpStatus: 404});},
    postRaw: async (route, body, contentType) => {calls.push(route); return {data: {path: 'MediaStudio/x.json'}, body, contentType};}
  };
  const list = await listRemoteWorkflows(transport);
  assert.deepEqual(list.files.map(x => x.file), ['workflows/A.json', 'workflows/nested/B.json']);
  const read = await readRemoteWorkflow(transport, 'workflows/A.json');
  assert.equal(read.format, 'comfy-editor');
  const saved = await saveRemoteWorkflow(transport, remoteWorkflowName('wf', 2), {nodes: [], links: []});
  assert.match(saved.route, /overwrite=false/);
  assert.match(calls.at(-1), /workflows%2FMediaStudio%2Fwf-v2\.json/);
  assert.throws(() => remoteWorkflowName('bad/../id', 1), /文件名/);
  await assert.rejects(readRemoteWorkflow(transport, '../secret.json'), /路径不安全/);
});
