import test from 'node:test';
import assert from 'node:assert/strict';
import {inputPorts53, inputPort53, inputContract53, inputBinding53, validateDeferredInputs53} from '../src/media-inputs53.mjs';
import {mediaContract51} from '../src/media-contract51.mjs';
import {analyze} from '../src/workflows3.mjs';
import {imageBinding31} from '../src/input31.mjs';

const info = {
  LoadImage: {input: {required: {image: [[]]}}, output: ['IMAGE', 'MASK']},
  LoadImageMask: {input: {required: {image: [[]], channel: [[]]}}, output: ['MASK']},
  LoadVideo: {input: {required: {file: [[]]}}, output: ['VIDEO']},
  LoadAudio: {input: {required: {audio: [[]]}}, output: ['AUDIO']},
  EmptyImage: {input: {required: {width: ['INT', {}]}}, output: ['IMAGE']},
  CheckpointLoaderSimple: {input: {required: {ckpt_name: [['installed']]}}, output: ['MODEL']},
  SaveImage: {input: {required: {images: ['IMAGE', {}]}}, output: []},
  SaveVideo: {input: {required: {video: ['VIDEO', {}]}}, output: ['VIDEO']},
  SaveAudio: {input: {required: {audio: ['AUDIO', {}]}}, output: ['AUDIO']},
};

test('declares exact built-in image/video/audio input ports and rejects loader-like unknown nodes', () => {
  assert.deepEqual({...inputPorts53.LoadImage}, {kind: 'image', input: 'image'});
  assert.deepEqual({...inputPorts53.LoadImageMask}, {kind: 'image', input: 'image'});
  assert.deepEqual({...inputPorts53.LoadVideo}, {kind: 'video', input: 'file'});
  assert.deepEqual({...inputPorts53.LoadAudio}, {kind: 'audio', input: 'audio'});
  assert.equal(inputPort53('CheckpointLoaderSimple'), null);
  assert.equal(inputPort53('UNETLoader'), null);

  const graph = {
    i: {class_type: 'LoadImage', inputs: {image: 'a.png'}},
    v: {class_type: 'LoadVideo', inputs: {file: 'b.mp4'}},
    a: {class_type: 'LoadAudio', inputs: {audio: 'c.wav'}},
    s: {class_type: 'SaveImage', inputs: {}},
  };
  const c = inputContract53({graph, mappings: {image: {node: 'i', input: 'image'}, video: {node: 'v', input: 'file'}, audio: {node: 'a', input: 'audio'}}});
  assert.equal(c.status, 'declared');
  assert.deepEqual(c.inputTypes, ['image', 'video', 'audio']);
  assert.deepEqual(c.issues, []);
  assert.equal(c.inputs.find(x => x.node === 'v').alias, 'video');
  assert.equal(c.inputs.find(x => x.node === 'v').mode, 'mapped');
  assert.equal(c.inputs.find(x => x.node === 'i').mode, 'mapped');

  const unknown = inputContract53({graph: {x: {class_type: 'VHS_LoadVideo', inputs: {video: 'x.mp4'}}, s: {class_type: 'SaveImage', inputs: {}}}, mappings: {}});
  assert.equal(unknown.status, 'pending');
  assert.match(unknown.issues.join('；'), /未审查/);

  const model = inputContract53({graph: {m: {class_type: 'UNETLoader', inputs: {unet_name: 'x.safetensors'}}, c: {class_type: 'CheckpointLoaderSimple', inputs: {ckpt_name: 'y'}}}, mappings: {}});
  assert.deepEqual(model.issues, []);
  assert.deepEqual(inputContract53({graph: null}).inputTypes, []);
  assert.match(inputContract53({graph: null}).issues.join('；'), /API 图/);
});

test('validates mapping targets, duplicate aliases, linked ports and missing nodes', () => {
  const graph = {v: {class_type: 'LoadVideo', inputs: {file: 'a.mp4'}}, s: {class_type: 'SaveVideo', inputs: {video: ['v', 0]}}};
  const wrong = inputContract53({graph, mappings: {clip: {node: 'v', input: 'video'}}});
  assert.match(wrong.issues.join('；'), /不是已声明的 video 输入端口 file/);
  const dup = inputContract53({graph, mappings: {a: {node: 'v', input: 'file'}, b: {node: 'v', input: 'file'}}});
  assert.match(dup.issues.join('；'), /多个参数别名/);
  const missing = inputContract53({graph, mappings: {x: {node: 'gone', input: 'file'}}});
  assert.match(missing.issues.join('；'), /不存在的节点/);
  const linked = inputContract53({graph: {src: {class_type: 'EmptyImage', inputs: {}}, i: {class_type: 'LoadImage', inputs: {image: ['src', 0]}}}, mappings: {}});
  assert.match(linked.issues.join('；'), /连线占用/);
  const unsafe = inputContract53({graph: {i: {class_type: 'LoadImage', inputs: {image: '../escape.png'}}}, mappings: {}});
  assert.match(unsafe.issues.join('；'), /缺少可信文件值/);
});

test('single-input binding is generic across image, video and audio but conservative on ambiguity', () => {
  const video = {graph: {v: {class_type: 'LoadVideo', inputs: {file: 'a.mp4'}}, s: {class_type: 'SaveVideo', inputs: {video: ['v', 0]}}}, mappings: {source: {node: 'v', input: 'file'}}};
  assert.deepEqual(inputBinding53(video, 'video'), {node: 'v', alias: 'source', kind: 'video', input: 'file'});
  const audio = {graph: {a: {class_type: 'LoadAudio', inputs: {audio: 'a.wav'}}, s: {class_type: 'SaveAudio', inputs: {audio: ['a', 0]}}}, mappings: {voice: {node: 'a', input: 'audio'}}};
  assert.equal(inputBinding53(audio, 'audio').alias, 'voice');
  const image = {graph: {i: {class_type: 'LoadImage', inputs: {image: 'a.png'}}, s: {class_type: 'SaveImage', inputs: {images: ['i', 0]}}}, mappings: {source: {node: 'i', input: 'image'}}};
  assert.equal(imageBinding31(image).alias, 'source');
  assert.throws(() => inputBinding53(image, 'image', {alias: 'other'}), /不匹配/);
  assert.throws(() => inputBinding53(video, 'image'), /没有已声明/);
  const two = {graph: {a: {class_type: 'LoadImage', inputs: {image: 'a.png'}}, b: {class_type: 'LoadImage', inputs: {image: 'b.png'}}}, mappings: {x: {node: 'a', input: 'image'}, y: {node: 'b', input: 'image'}}};
  assert.throws(() => inputBinding53(two, 'image'), /仅支持一个/);
  const unmapped = {graph: {a: {class_type: 'LoadImage', inputs: {image: 'a.png'}}}, mappings: {}};
  assert.throws(() => inputBinding53(unmapped, 'image'), /唯一/);
  assert.throws(() => inputBinding53(unmapped, 'sound'), /未知媒体输入类别/);
});

test('deferred planning covers mapped loaders of every media kind but never bypasses other constraints', () => {
  const graph = {
    img: {class_type: 'LoadImage', inputs: {image: 'pending.png'}},
    vid: {class_type: 'LoadVideo', inputs: {file: 'pending.mp4'}},
    aud: {class_type: 'LoadAudio', inputs: {audio: 'pending.wav'}},
    model: {class_type: 'CheckpointLoaderSimple', inputs: {ckpt_name: 'missing-model'}},
    save: {class_type: 'SaveImage', inputs: {images: ['img', 0]}},
  };
  const template = {graph, mappings: {image: {node: 'img', input: 'image'}, video: {node: 'vid', input: 'file'}, audio: {node: 'aud', input: 'audio'}}};
  const rows = validateDeferredInputs53(template, ['img', 'vid', 'aud']);
  assert.deepEqual(rows.map(r => r.kind), ['image', 'video', 'audio']);
  const accepted = new Set(['LoadImage', 'LoadVideo', 'LoadAudio', 'CheckpointLoaderSimple', 'SaveImage']);
  const planned = analyze(graph, info, accepted, ['img', 'vid', 'aud']);
  assert.ok(planned.issues.some(x => x.includes('missing-model')));
  assert.ok(!planned.issues.some(x => x.includes('pending.')));
  const strict = analyze(graph, info, accepted);
  assert.ok(strict.issues.some(x => x.includes('pending.')));
  assert.throws(() => validateDeferredInputs53(template, ['missing']), /不是已声明/);
  assert.throws(() => validateDeferredInputs53(template, ['img', 'img']), /列表无效/);
  assert.throws(() => validateDeferredInputs53({graph: {a: {class_type: 'LoadImage', inputs: {image: 'a.png'}}}, mappings: {}}, ['a']), /没有唯一/);
});

test('the media contract exposes declared inputs and blocks unknown loader sinks', () => {
  const graph = {v: {class_type: 'LoadVideo', inputs: {file: 'a.mp4'}}, s: {class_type: 'SaveVideo', inputs: {video: ['v', 0], filename_prefix: 'x'}}};
  const video = mediaContract51({id: 'w', version: 1, kind: 'video', graph});
  assert.equal(video.compatible, true);
  assert.deepEqual(video.inputTypes, ['video']);
  assert.equal(video.inputs[0].node, 'v');
  assert.equal(video.inputStatus, 'declared');
  assert.deepEqual(video.inputIssues, []);

  const image = mediaContract51({id: 'w', version: 1, kind: 'image', graph: {i: {class_type: 'LoadImage', inputs: {image: 'input.png'}}, s: {class_type: 'SaveImage', inputs: {images: ['i', 0]}}}, mappings: {source: {node: 'i', input: 'image'}}});
  assert.equal(image.compatible, true);
  assert.deepEqual(image.inputTypes, ['image']);

  const bad = mediaContract51({id: 'w', version: 1, kind: 'video', graph: {x: {class_type: 'VHS_LoadVideo', inputs: {video: 'a.mp4'}}, s: {class_type: 'SaveVideo', inputs: {video: ['x', 0]}}}});
  assert.equal(bad.compatible, false);
  assert.match(bad.issues.join('；'), /未审查/);
  assert.equal(bad.inputStatus, 'pending');
});
