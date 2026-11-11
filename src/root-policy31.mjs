import os from 'node:os';
import path from 'node:path';

// Resolve the media data root without ever falling back to the user's daily
// profile when the plugin runs under an isolated DSH_HOME. Explicit dataRoot
// always wins; backendRoot keeps the legacy migration path.
export function mediaRoot31(config = {}, env = process.env, home = os.homedir()) {
  const dataRoot = typeof config?.dataRoot === 'string' ? config.dataRoot.trim() : '';
  if (dataRoot) return path.resolve(dataRoot);
  const backendRoot = typeof config?.backendRoot === 'string' ? config.backendRoot.trim() : '';
  const legacy = path.resolve(backendRoot || path.join(home, 'Documents/AI/DSH-Reliable'));
  if (backendRoot) return path.resolve(legacy, 'media-studio-v2');
  const dshHomeRaw = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  if (dshHomeRaw) {
    if (!path.isAbsolute(dshHomeRaw)) throw Error('DSH_HOME 必须是绝对路径，拒绝按当前工作目录解析：' + dshHomeRaw);
    return path.resolve(dshHomeRaw, 'media-studio');
  }
  return path.resolve(home, '.dsh/media-studio');
}

// Fail closed if a future default change would make an isolated DSH_HOME use a
// root outside it. An explicit dataRoot remains the user's deliberate choice.
export function assertIsolatedRoot31(root, config = {}, env = process.env) {
  const dshHome = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : '';
  const dataRoot = typeof config?.dataRoot === 'string' && config.dataRoot.trim();
  const backendRoot = typeof config?.backendRoot === 'string' && config.backendRoot.trim();
  const explicit = dataRoot || backendRoot;
  if (!dshHome || explicit) return;
  const base = path.resolve(dshHome), target = path.resolve(root), relative = path.relative(base, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw Error('隔离 DSH_HOME 下拒绝使用其外的数据根 ' + target + '；请显式配置 dataRoot 或修正 DSH_HOME');
  }
}
