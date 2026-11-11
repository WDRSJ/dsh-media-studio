// Automatic ComfyUI workflow preparation: identify output media, compile GUI
// documents, derive editable aliases and report model/node diagnostics without
// silently substituting resources.
import {compileEditor31, graphStructure, graphToEditor} from './workflow-format31.mjs';

export class WorkflowAutoError extends Error {
  constructor(message, diagnostics = [], code = 'conversion-failed') {
    super(message);
    this.name = 'WorkflowAutoError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

const imageOutputs = new Set(['SaveImage', 'PreviewImage']);
const videoOutputs = new Set(['SaveVideo', 'SaveWEBM', 'SaveAnimatedWEBP', 'VHS_VideoCombine']);
const audioOutputs = new Set(['SaveAudioAdvanced', 'SaveAudio', 'SaveAudioMP3', 'PreviewAudio']);
const resourceInput = /(?:^|_)(?:ckpt|checkpoint|unet|diffusion|clip|vae|lora|control_net|model|upscale_model|gguf)_?name\d*$|^(?:unet_name|clip_name\d*|vae_name|lora_name|control_net_name|ckpt_name|model_name|upscale_model)$/i;
const loaderTypes = new Set(['CheckpointLoaderSimple', 'UNETLoader', 'CLIPLoader', 'DualCLIPLoader', 'TripleCLIPLoader', 'VAELoader', 'LoraLoader', 'LoraLoaderModelOnly', 'ControlNetLoader', 'UpscaleModelLoader', 'DiffControlNetLoader']);
const paramAliases = new Set(['prompt', 'negative', 'width', 'height', 'steps', 'seed', 'cfg', 'denoise', 'sampler', 'scheduler', 'duration', 'seconds', 'fps', 'frames', 'length', 'format', 'quality', 'image', 'tags', 'lyrics', 'temperature', 'top_k', 'top_p', 'min_p', 'repetition_penalty']);

function fields(info, type) {
  const d = info?.[type];
  return {...d?.input?.required, ...d?.input?.optional};
}
function choices(info, type, input) {
  const s = fields(info, type)[input];
  if (!s) return null;
  if (Array.isArray(s[0])) return s[0];
  if (s[0] === 'COMBO') return s[1]?.options || null;
  return null;
}
function isResourceInput(name) {
  return resourceInput.test(name);
}
function safeRemoteDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new WorkflowAutoError('工作流 JSON 必须是对象', [], 'invalid-document');
  if (Array.isArray(document.nodes) && Array.isArray(document.links)) return 'comfy-editor';
  graphStructure(document);
  return 'comfy-api';
}
function outputEntries(graph, info) {
  const out = [];
  for (const [id, node] of Object.entries(graph)) {
    const d = info?.[node.class_type];
    const isOutput = d?.output_node === true || imageOutputs.has(node.class_type) || videoOutputs.has(node.class_type) || audioOutputs.has(node.class_type);
    if (!isOutput) continue;
    let type = imageOutputs.has(node.class_type) || d?.output?.includes('IMAGE') ? 'image' : videoOutputs.has(node.class_type) ? 'video' : audioOutputs.has(node.class_type) || d?.output?.includes('AUDIO') ? 'audio' : '';
    // Prefer explicit media output class over generic IMAGE/AUDIO.
    if (videoOutputs.has(node.class_type)) type = 'video';
    else if (audioOutputs.has(node.class_type)) type = 'audio';
    else if (imageOutputs.has(node.class_type)) type = 'image';
    out.push({id, type, classType: node.class_type});
  }
  const savers = out.filter(o => /^Save/.test(o.classType));
  return savers.length ? savers : out;
}
function technicalType(outputs) {
  const types = [...new Set(outputs.map(o => o.type).filter(Boolean))];
  if (!types.length) throw new WorkflowAutoError('工作流没有可识别的输出节点（SaveImage/SaveVideo/SaveAudioAdvanced 等）', [], 'missing-output');
  if (types.length > 1) throw new WorkflowAutoError('工作流包含多种媒体输出，无法自动确定交付目标：' + types.join('、'), outputs.map(o => ({code: 'ambiguous-output', node: o.id, message: o.classType})), 'ambiguous-media');
  return types[0];
}
function requestedTechnical(kind) {
  if (['music', 'speech', 'audio'].includes(kind)) return 'audio';
  if (['image', 'video'].includes(kind)) return kind;
  return null;
}
function textNodeFrom(graph, id, wanted, seen = new Set()) {
  if (seen.has(id) || seen.size > 30) return null;
  seen.add(id);
  const n = graph?.[id];
  if (!n) return null;
  if (['CLIPTextEncode', 'TextEncodeAceStepAudio1.5', 'TextGenerate'].includes(n.class_type)) {
    const fields = Object.keys(n.inputs || {});
    const preferred = n.class_type === 'TextEncodeAceStepAudio1.5' ? ['tags'] : ['text', 'prompt'];
    const key = preferred.find(k => fields.includes(k) && !Array.isArray(n.inputs[k]));
    if (key) return {id, classType: n.class_type, input: key};
  }
  for (const value of Object.values(n.inputs || {})) {
    if (Array.isArray(value)) {
      const found = textNodeFrom(graph, String(value[0]), wanted, seen);
      if (found) return found;
    }
  }
  return null;
}
function addMapping(mappings, graph, alias, node, input, source = 'auto') {
  if (!alias || !paramAliases.has(alias) || Object.hasOwn(mappings, alias)) return false;
  if (typeof node !== 'string' || !graph[node] || !Object.hasOwn(graph[node].inputs, input) || Array.isArray(graph[node].inputs[input])) return false;
  mappings[alias] = {node, input, source};
  return true;
}
export function deriveMappings(graph, info) {
  const mappings = {}, notes = [];
  const nodes = Object.entries(graph);
  const byClass = type => nodes.filter(([, n]) => n.class_type === type);
  const ks = nodes.find(([, n]) => ['KSampler', 'KSamplerAdvanced'].includes(n.class_type));
  if (ks) {
    const [kid, node] = ks;
    for (const [input, alias] of [['seed', 'seed'], ['noise_seed', 'seed'], ['steps', 'steps'], ['cfg', 'cfg'], ['denoise', 'denoise'], ['sampler_name', 'sampler'], ['scheduler', 'scheduler']]) addMapping(mappings, graph, alias, kid, input, 'ksampler');
    if (Array.isArray(node.inputs.positive)) {
      const t = textNodeFrom(graph, String(node.inputs.positive[0]), 'positive');
      if (t) addMapping(mappings, graph, t.classType === 'TextEncodeAceStepAudio1.5' ? 'prompt' : 'prompt', t.id, t.input, 'positive');
    }
    if (Array.isArray(node.inputs.negative)) {
      const t = textNodeFrom(graph, String(node.inputs.negative[0]), 'negative');
      if (t) addMapping(mappings, graph, 'negative', t.id, t.input, 'negative');
    }
  }
  // Audio-specific controls.
  for (const [id, n] of byClass('TextEncodeAceStepAudio1.5')) {
    addMapping(mappings, graph, 'prompt', id, 'tags', 'ace-tags');
    addMapping(mappings, graph, 'lyrics', id, 'lyrics', 'ace-lyrics');
  }
  for (const [id, n] of byClass('EmptyAceStep1.5LatentAudio')) addMapping(mappings, graph, 'duration', id, 'seconds', 'ace-seconds');
  for (const [id, n] of byClass('SaveAudioAdvanced')) {
    addMapping(mappings, graph, 'format', id, 'format', 'audio-format');
    addMapping(mappings, graph, 'quality', id, 'format.quality', 'audio-quality');
  }
  for (const [id, n] of byClass('CreateVideo')) addMapping(mappings, graph, 'fps', id, 'fps', 'video-fps');
  for (const [id, n] of byClass('Wan22ImageToVideoLatent')) {
    addMapping(mappings, graph, 'width', id, 'width', 'wan-width');
    addMapping(mappings, graph, 'height', id, 'height', 'wan-height');
    addMapping(mappings, graph, 'length', id, 'length', 'wan-length');
  }
  for (const [id, n] of byClass('LoadImage')) addMapping(mappings, graph, 'image', id, 'image', 'image-input');
  // Spatial parameters from the most common latent constructors.
  for (const type of ['EmptyImage', 'EmptyLatentImage', 'EmptySD3LatentImage', 'EmptyFlux2LatentImage']) {
    const row = byClass(type)[0];
    if (!row) continue;
    addMapping(mappings, graph, 'width', row[0], 'width', 'latent-width');
    addMapping(mappings, graph, 'height', row[0], 'height', 'latent-height');
    if (Object.hasOwn(row[1].inputs, 'batch_size')) addMapping(mappings, graph, 'batch', row[0], 'batch_size', 'latent-batch');
  }
  // Models/resources are exposed as physical bindings, not as free-form params.
  for (const [id, n] of nodes) {
    if (!loaderTypes.has(n.class_type)) continue;
    for (const input of Object.keys(n.inputs || {})) {
      if (isResourceInput(input) && !Array.isArray(n.inputs[input])) {
        notes.push({node: id, classType: n.class_type, input, value: n.inputs[input]});
      }
    }
  }
  // Common generic scalar fields (only those with useful names) are optional aliases.
  for (const [id, n] of nodes) {
    for (const [input, value] of Object.entries(n.inputs || {})) {
      if (Array.isArray(value) || isResourceInput(input)) continue;
      if (!paramAliases.has(input)) continue;
      if (input === 'text' && Object.hasOwn(mappings, 'prompt')) continue;
      if (input === 'tags' && Object.hasOwn(mappings, 'prompt')) continue;
      addMapping(mappings, graph, input, id, input, 'generic');
    }
  }
  if (mappings.prompt && mappings.negative && mappings.prompt.node === mappings.negative.node && mappings.prompt.input === mappings.negative.input) {
    delete mappings.negative;
    notes.push({kind:'mapping-conflict',message:'positive/negative 指向同一文本节点，已忽略 negative 映射以保留 prompt'});
  }
  return {mappings, notes};
}
export function deriveModelBindings(graph, info) {
  const bindings = {}, missing = [], ambiguous = [], modelFields = [];
  for (const [id, node] of Object.entries(graph)) {
    if (!loaderTypes.has(node.class_type)) continue;
    const def = fields(info, node.class_type);
    for (const [input, value] of Object.entries(node.inputs || {})) {
      if (Array.isArray(value) || !isResourceInput(input)) continue;
      const options = choices(info, node.class_type, input);
      if (!options) continue;
      const row = {node: id, classType: node.class_type, input, value, candidates: options.slice(0, 80), configured: typeof value === 'string' && options.includes(value)};
      bindings[id + '/' + input] = row;
      modelFields.push(row);
      if (!row.configured) {
        const diag = {code: value ? 'missing-model' : 'unbound-model', node: id, classType: node.class_type, input, value, candidates: row.candidates, message: value ? '工作流第 ' + id + ' 个节点（' + node.class_type + '）缺少模型 ' + value + '；请安装或明确选择候选' : '工作流节点 ' + id + ' 尚未绑定 ' + input + '；请选择候选'};
        if (row.candidates.length === 1) diag.candidates = row.candidates;
        missing.push(diag);
        if (row.candidates.length > 0) ambiguous.push(diag);
      }
    }
  }
  return {bindings, missing, ambiguous, modelFields};
}
function prepareOutput(data, requestedKind) {
  const outputs = outputEntries(data.graph, data.info);
  const tech = technicalType(outputs);
  const req = requestedTechnical(requestedKind);
  const adjusted = req && req !== tech ? {code: 'media-type-adjusted', node: outputs[0].id, classType: outputs[0].classType, message: '实际输出为 ' + tech + '，已按实际类型自动调整（请求类别 ' + requestedKind + '）'} : null;
  const chosen = outputs.filter(o => o.type === tech).map(o => o.id);
  const kind = tech === 'audio' ? (['music', 'speech'].includes(requestedKind) ? requestedKind : 'audio') : tech;
  return {technicalType: tech, kind, outputNodes: chosen, outputs, adjusted};
}
function finish(data, requestedKind, source) {
  const output = prepareOutput(data, requestedKind);
  const mapped = deriveMappings(data.graph, data.info);
  const models = deriveModelBindings(data.graph, data.info);
  const diagnostics = [...(output.adjusted ? [output.adjusted] : []), ...models.missing];
  const blocking = diagnostics.filter(d => d.code !== 'media-type-adjusted');
  let status = blocking.length ? 'needs-binding' : 'ready';
  if (blocking.length && models.missing.some(m => m.code === 'missing-model')) status = 'missing-model';
  else if (blocking.length) status = 'needs-binding';
  return {
    source,
    status,
    diagnostics,
    mappings: mapped.mappings,
    resourceHints: mapped.notes,
    modelBindings: models.bindings,
    modelFields: models.modelFields,
    missingModels: models.missing,
    outputSelection53: output.outputNodes,
    adjustedKind: output.adjusted ? {requested: requestedKind, actual: output.kind} : null,
    technicalType: output.technicalType,
    kind: output.kind,
    requestedKind,
    outputs: output.outputs,
    graph: data.graph,
    gui: data.gui || null,
    auto: true
  };
}
export function prepareGUI(gui, info, requestedKind = 'image') {
  if (!info || typeof info !== 'object') throw new WorkflowAutoError('需要目标 ComfyUI 的 object_info 才能自动转换与绑定', [], 'instance-required');
  let compiled;
  try { compiled = compileEditor31(gui, info); }
  catch (e) { throw new WorkflowAutoError('自动转换失败：' + e.message, [{code: 'conversion-failed', node: 'document', message: e.message}], 'conversion-failed'); }
  const data = {graph: compiled.graph, gui: structuredClone(gui), info};
  return {...finish(data, requestedKind, 'comfy-editor-auto'), sourceMap: compiled.sourceMap, conversionNotes: compiled.notes || []};
}
export function prepareAPI(graph, info, requestedKind = 'image') {
  if (!info || typeof info !== 'object') throw new WorkflowAutoError('需要目标 ComfyUI 的 object_info 才能自动验收与绑定', [], 'instance-required');
  graphStructure(graph);
  const data = {graph: structuredClone(graph), gui: null, info};
  return {...finish(data, requestedKind, 'comfy-api-auto'), sourceMap: {}, conversionNotes: []};
}
export function rebuildEditor(graph, info) {
  return graphToEditor(graph, info);
}
export function detectDocumentKind(document) {
  return safeRemoteDocument(document);
}
