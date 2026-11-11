import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Runtime} from '../src/runtime.mjs';
import {saveSettings3, loadSettings3, enforce, effectiveMode} from '../src/policy3.mjs';
import {checkpointBinding31} from '../src/workflows3.mjs';

const imageConnection = {id: 'image', providerId: 'openai', kind: 'image', label: '离线模拟', enabled: true, endpoint: 'https://api.example.test/v1', protocol: 'openai-image', modelPreview: 'image-model', modelQuality: 'image-model', voice: '', credentialRef: 'stored:key', pricing: {rate: 0.12, unit: 'request', currency: 'CNY', source: 'offline fixture'}};
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zerofee54-'));
  let calls = 0, requests = [];
  const runtime = new Runtime(root, {
    vault: {has: () => true, get: () => 'offline-fixture-key'},
    transport: async (url, options) => { calls++; requests.push({url, options}); return {bytes: Buffer.from(JSON.stringify({data: [{b64_json: Buffer.from('offline').toString('base64')}]}))};},
  });
  const state = runtime.config.load();
  state.value.connections.push(imageConnection);
  state.value.defaults.image = 'image';
  runtime.config.save(state.value, state.revision);
  return {root, runtime, stats: () => ({calls, requests}), cleanup() {runtime.close(); fs.rmSync(root, {recursive: true, force: true});}};
};
const plan = f => f.runtime.prepare({kind: 'image', prompt: 'offline zero-fee protocol test'}, 'owner');

test('unapproved or denied cloud tasks never send a charged request', async () => {
  const f = fixture();
  try {
    const p = await plan(f);
    assert.equal(p.status, 'awaiting-approval');
    await assert.rejects(f.runtime.submit(p.id, 'owner'), /确认/);
    assert.equal(f.stats().calls, 0);
    f.runtime.deny(p.id, 'owner');
    assert.equal(f.runtime.row(p.id, 'owner').status, 'cancelled');
    await assert.rejects(f.runtime.submit(p.id, 'owner'), /确认/);
    assert.equal(f.stats().calls, 0);
  } finally { f.cleanup(); }
});

test('an approved request is sent once; uncertain submission is never retried blindly', async () => {
  const f = fixture();
  try {
    const p = await plan(f);
    f.runtime.approve(p.id, 'owner');
    f.runtime.approve; // approval alone still does not spend
    assert.equal(f.stats().calls, 0);
    // Make the next transport throw after counting: submission becomes uncertain.
    let failed = 0;
    f.runtime.transport = async () => { failed++; throw Error('simulated transport loss after send'); };
    await assert.rejects(f.runtime.submit(p.id, 'owner'), /核对/);
    assert.equal(failed, 1);
    assert.equal(f.runtime.row(p.id, 'owner').status, 'uncertain');
    await assert.rejects(f.runtime.submit(p.id, 'owner'), /确认|提交/);
    assert.equal(failed, 1);
  } finally { f.cleanup(); }
});

test('Local mode refuses cloud dispatch without touching the provider transport', async () => {
  const f = fixture();
  try {
    saveSettings3(f.root, {...loadSettings3(f.root), mode: 'Local'});
    assert.equal(effectiveMode(f.root, 'image', 'owner'), 'Local');
    assert.throws(() => enforce(f.root, 'image', 'cloud', 'owner', 'call-local'), /Local|本地|禁止/);
    await assert.rejects(async () => { await plan(f); }, /Local|禁止/);
    assert.equal(f.stats().calls, 0);
  } finally { f.cleanup(); }
});

test('Auto/Hybrid never substitute a missing checkpoint or model with another installed one', () => {
  const workflow = {id: 'w', version: 1, kind: 'image', graph: {'1': {class_type: 'CheckpointLoaderSimple', inputs: {ckpt_name: 'requested.safetensors'}}, '2': {class_type: 'SaveImage', inputs: {}}}, mappings: {model: {node: '1', input: 'ckpt_name'}}};
  assert.throws(() => checkpointBinding31(workflow, {}, ['other-a.safetensors', 'other-b.safetensors']), /指定 checkpoint 缺失/);
  assert.throws(() => checkpointBinding31(workflow, {model: 'requested-missing.safetensors'}, ['other.safetensors']), /指定 checkpoint 缺失/);
  assert.deepEqual(checkpointBinding31(workflow, {model: 'requested.safetensors'}, ['requested.safetensors']), {model: 'requested.safetensors'});
});
