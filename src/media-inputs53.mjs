// B03 unified input-port contract. Loader nodes are recognized only through an
// explicit adapter table; a loader-like node without an adapter is rejected
// instead of guessing its media kind or file field from its name. Adapters are
// declarations, not proof that a value exists in the remote ComfyUI input dir.
export const inputPorts53 = Object.freeze({
  LoadImage: Object.freeze({kind: 'image', input: 'image'}),
  LoadImageMask: Object.freeze({kind: 'image', input: 'image'}),
  LoadAudio: Object.freeze({kind: 'audio', input: 'audio'}),
  LoadVideo: Object.freeze({kind: 'video', input: 'file'}),
});
export const inputKinds53 = Object.freeze(['image', 'video', 'audio']);
const loaderLike = type => typeof type === 'string' && (/^(?:Load|Import|Read|Upload)/i.test(type) || /(?:^|_)Load(?:Image|Video|Audio|Media|File|Animation)/i.test(type) || /(?:Image|Video|Audio|Media|File)(?:Loader?|Import|Reader)$/i.test(type));

export function inputPort53(classType) {
  return inputPorts53[classType] || null;
}

// Declares every media input port of a workflow. `mappings` only make a port
// overridable; a literal value remains an explicit ComfyUI input-directory name.
export function inputContract53(t, {graph = t?.graph, mappings = t?.mappings || {}} = {}) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return {schemaVersion: 1, status: 'unavailable', inputs: [], inputTypes: [], mapped: [], issues: ['需要 API 图后才能声明媒体输入端口']};
  }
  const inputs = [], issues = [], maps = mappings && typeof mappings === 'object' && !Array.isArray(mappings) ? mappings : {};
  for (const [id, node] of Object.entries(graph)) {
    const type = node?.class_type;
    const port = inputPorts53[type];
    if (port) {
      const aliases = Object.entries(maps).filter(([, m]) => m && String(m.node) === id && m.input === port.input).map(([name]) => name);
      const value = node.inputs?.[port.input];
      const linked = Array.isArray(value);
      if (linked) issues.push('输入 ' + id + '.' + port.input + ' 被节点连线占用，不能声明为素材端口');
      else if (typeof value !== 'string' || !value.trim() || value.length > 300 || /(^[/\\]|\.\.|:|\x00-\x1f)/.test(value)) issues.push('输入 ' + id + '.' + port.input + ' 缺少可信文件值');
      if (aliases.length > 1) issues.push('输入 ' + id + '.' + port.input + ' 存在多个参数别名 ' + aliases.join('/') + '，不能确定绑定');
      for (const [alias, m] of Object.entries(maps)) {
        if (m && String(m.node) === id && m.input !== port.input) issues.push('参数映射 ' + alias + ' 指向 ' + type + '.' + m.input + '，不是已声明的 ' + port.kind + ' 输入端口 ' + port.input);
      }
      inputs.push({node: id, classType: type, kind: port.kind, input: port.input, alias: aliases[0] || null, mode: aliases.length ? 'mapped' : 'literal', value: linked ? null : String(value ?? '')});
    } else if (loaderLike(type)) {
      issues.push('输入节点 ' + id + '（' + type + '）未审查：拒绝按节点名猜测媒体类型或输入字段，需扩展输入端口契约');
    }
  }
  for (const [alias, m] of Object.entries(maps)) {
    if (m && !Object.hasOwn(graph, String(m.node))) issues.push('参数映射 ' + alias + ' 指向不存在的节点 ' + String(m.node));
  }
  return {schemaVersion: 1, status: issues.length ? 'pending' : 'declared', inputs, inputTypes: inputKinds53.filter(k => inputs.some(i => i.kind === k)), mapped: inputs.filter(i => i.mode === 'mapped'), issues};
}

// One explicit media slot is required for single-input routes. Ambiguity is an
// error: multi-input workflows must declare which port receives the artifact.
export function inputBinding53(template, kind = 'image', {alias, graph = template?.graph, mappings = template?.mappings || {}} = {}) {
  if (!inputKinds53.includes(kind)) throw Error('未知媒体输入类别 ' + kind);
  const contract = inputContract53(template, {graph, mappings});
  if (contract.issues.length) throw Error(contract.issues.join('；'));
  const rows = contract.inputs.filter(i => i.kind === kind);
  if (!rows.length) throw Error('工作流没有已声明的 ' + kind + ' 输入端口');
  if (rows.length !== 1) throw Error('本次单素材输入需要且仅支持一个 ' + kind + ' 加载节点；发现有 ' + rows.length + ' 个，请拆分工作流或显式选择');
  const row = rows[0];
  if (!row.alias) throw Error('参考素材必须有唯一的 ' + row.classType + '/' + row.input + ' 参数映射（' + kind + '）');
  if (alias !== undefined && alias !== row.alias) throw Error('素材别名与已声明输入端口不匹配：' + String(alias) + ' != ' + row.alias);
  return {node: row.node, alias: row.alias, kind: row.kind, input: row.input};
}

// Planning only: inspect may skip the remote-file existence/option check for
// mapped ports. Executing a workflow with deferred inputs is always rejected.
export function validateDeferredInputs53(template, nodes) {
  if (!Array.isArray(nodes) || new Set(nodes).size !== nodes.length || nodes.length > 8) throw Error('延期输入列表无效');
  const contract = inputContract53(template);
  if (contract.issues.length) throw Error(contract.issues.join('；'));
  return nodes.map(id => {
    const row = contract.inputs.find(i => i.node === String(id));
    if (!row) throw Error('延期输入 ' + id + ' 不是已声明的媒体加载节点');
    if (row.mode !== 'mapped') throw Error('延期输入 ' + id + ' 没有唯一的素材参数映射，不能跳过文件校验');
    return row;
  });
}
