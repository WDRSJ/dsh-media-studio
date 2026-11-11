import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mediaRoot31, assertIsolatedRoot31} from '../src/root-policy31.mjs';

const home = 'C:/Users/example';

test('explicit dataRoot and backendRoot keep their documented priority', () => {
  assert.equal(mediaRoot31({dataRoot: 'C:/isolated/media'}, {}, home), path.resolve('C:/isolated/media'));
  assert.equal(mediaRoot31({dataRoot: 'C:/isolated/media', backendRoot: 'C:/legacy'}, {}, home), path.resolve('C:/isolated/media'));
  assert.equal(mediaRoot31({backendRoot: 'C:/legacy'}, {}, home), path.resolve('C:/legacy/media-studio-v2'));
  assert.equal(mediaRoot31({dataRoot: '   '}, {}, home), path.resolve(home, '.dsh/media-studio'));
});

test('an isolated DSH_HOME never falls back to the daily profile data root', () => {
  const isolated = 'C:/Users/example/Documents/AI/MediaStudio31-20261105/MediaStudioTest/home';
  assert.equal(mediaRoot31({}, {DSH_HOME: isolated}, home), path.resolve(isolated, 'media-studio'));
  // The desktop profile sets DSH_HOME to ~/.dsh, so its data root is unchanged.
  assert.equal(mediaRoot31({}, {DSH_HOME: path.join(home, '.dsh')}, home), path.resolve(home, '.dsh/media-studio'));
  // No DSH_HOME keeps the historical default for direct/legacy hosts.
  assert.equal(mediaRoot31({}, {}, home), path.resolve(home, '.dsh/media-studio'));
  // An empty DSH_HOME is ignored; a relative one fails closed instead of becoming cwd-relative.
  assert.equal(mediaRoot31({}, {DSH_HOME: '   '}, home), path.resolve(home, '.dsh/media-studio'));
  assert.throws(() => mediaRoot31({}, {DSH_HOME: 'MediaStudioTest/home'}, home), /绝对路径/);
});

test('an isolated host refuses a default root outside DSH_HOME and allows an explicit choice', () => {
  const isolated = 'C:/Users/example/iso-home';
  assert.doesNotThrow(() => assertIsolatedRoot31(path.join(isolated, 'media-studio'), {}, {DSH_HOME: isolated}));
  assert.throws(() => assertIsolatedRoot31(path.join(home, '.dsh/media-studio'), {}, {DSH_HOME: isolated}), /拒绝使用其外/);
  assert.doesNotThrow(() => assertIsolatedRoot31(path.join(home, '.dsh/media-studio'), {dataRoot: 'C:/explicit'}, {DSH_HOME: isolated}));
  assert.doesNotThrow(() => assertIsolatedRoot31('C:/legacy/media-studio-v2', {backendRoot: 'C:/legacy'}, {DSH_HOME: isolated}));
  assert.doesNotThrow(() => assertIsolatedRoot31(path.join(home, '.dsh/media-studio'), {}, {}));
});
