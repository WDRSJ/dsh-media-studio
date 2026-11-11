import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pipeline3} from '../src/pipeline3.mjs';
import {workflowAdmin, workflowTool} from '../src/workflows3.mjs';
import {saveSettings3, loadSettings3} from '../src/policy3.mjs';
import {preparation52} from '../src/import-authority52.mjs';

const info = {
  EmptyImage: {output: ['IMAGE'], input: {required: {width: ['INT', {min: 1, max: 4096}], height: ['INT', {min: 1, max: 4096}], batch_size: ['INT', {min: 1, max: 64}], color: ['INT', {min: 0}]}}},
  SaveImage: {output: [], output_node: true, input: {required: {images: ['IMAGE', {}], filename_prefix: ['STRING', {}]}}},
};
const graph = {a: {class_type: 'EmptyImage', inputs: {width: 64, height: 48, batch_size: 1, color: 0}}, s: {class_type: 'SaveImage', inputs: {images: ['a', 0], filename_prefix: 'definitive'}}};

test('a definitive ComfyUI 4xx submit rejection is failed, not an uncertain receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definitive63-')), prior = globalThis.fetch;
  try {
    saveSettings3(root, {...loadSettings3(root), instances: [{id: 'mock', url: 'http://127.0.0.1:65530', trusted: true, local: true}]});
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.endsWith('/object_info')) return new Response(JSON.stringify(info), {status: 200, headers: {'content-type': 'application/json'}});
      if (u.endsWith('/prompt')) return new Response(JSON.stringify({error: 'bad checkpoint'}), {status: 400, headers: {'content-type': 'application/json'}});
      return new Response('{}', {status: 200, headers: {'content-type': 'application/json'}});
    };
    const imported = await workflowAdmin(root, {_preparation52: preparation52, action: 'import', document: graph, name: 'definitive fixture'});
    await workflowAdmin(root, {action: 'enable', templateId: imported.id, enabled: true});
    let error = null;
    try { await workflowTool(root, {action: 'submit', templateId: imported.id, instanceId: 'mock', requestId: 'definitive-1'}, 'owner'); }
    catch (e) { error = e; }
    assert.ok(error);
    assert.equal(error.definitive, true);
    const jobFile = fs.readdirSync(path.join(root, 'workflows3/jobs')).find(n => n.endsWith('.json'));
    const job = JSON.parse(fs.readFileSync(path.join(root, 'workflows3/jobs', jobFile)));
    assert.equal(job.status, 'failed');
    assert.ok(!job.promptId);
    let retry = null;
    try { await workflowTool(root, {action: 'submit', templateId: imported.id, instanceId: 'mock', requestId: 'definitive-1'}, 'owner'); }
    catch (e) { retry = e; }
    assert.ok(retry);
    assert.equal(retry.definitive, true);
    assert.match(retry.message, /bad checkpoint/);
  } finally {
    globalThis.fetch = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('a local preflight failure blocks the pipeline instead of leaving it uncertain', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline63-'));
  try {
    const owner = 'owner';
    const created = await pipeline3(root, {action: 'create', spec: [{id: 'bad', executor: 'comfy-image', params: {template: 'txt2img', model: 'missing.safetensors', prompt: 'x', width: 256, height: 256, instanceId: 'mock'}}]}, owner);
    const comfyCall = async () => { throw Object.assign(Error('缺少或不支持 ckpt_name=missing.safetensors'), {definitive: true}); };
    await assert.rejects(pipeline3(root, {action: 'resume', id: created.id}, owner, {comfyCall, authorize: async () => ({})}), /缺少或不支持/);
    const view = await pipeline3(root, {action: 'get', id: created.id}, owner);
    assert.equal(view.state, 'blocked');
    assert.equal(view.stages[0].state, 'blocked');
    assert.ok(!view.stages[0].output);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
