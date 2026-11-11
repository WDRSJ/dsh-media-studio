import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeSkill31} from '../src/skill31.mjs';

test('bundled media-studio-creative skill registers through the DSH skills registry with discovery instructions',()=>{
  let registered=null,disposed=false;
  const ctx={skills:{register:skill=>{registered=skill;return()=>{disposed=true;};}},effect:fn=>fn()};
  const info=creativeSkill31(ctx);
  assert.equal(info.registered,true);
  assert.equal(info.name,'media-studio-creative');
  assert.equal(registered.name,'media-studio-creative');
  assert.match(registered.description,/Media Studio/);
  assert.equal(registered.source,'bundled');
  assert.equal(registered.provider,'media-studio');
  assert.deepEqual(registered.invocation,{modelInvocable:true,userInvocable:true});
  assert.match(registered.content,/media_workflow_manage/);
  assert.match(registered.content,/inventory/);
  assert.match(registered.content,/checkpoints/);
  assert.ok(registered.content.length>500);
  assert.equal(creativeSkill31({}).registered,false);
});
