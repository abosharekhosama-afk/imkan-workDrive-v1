import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImageInspectorPatch, resetImageCrop, rotateImage, imageInspectorSummary } from './image-inspector.ts';

test('normalizes dimensions and rotation', () => {
  const out = normalizeImageInspectorPatch({src:'x',width:20,rotation:725}, {});
  assert.equal(out.width, 40); assert.equal(out.rotation, 5);
});
test('clamps crop values', () => {
  const out = normalizeImageInspectorPatch({src:'x',crop:{top:-2,right:120,bottom:30,left:5}}, {});
  assert.deepEqual(out.crop, {top:0,right:90,bottom:30,left:5});
});
test('rotates and resets crop', () => {
  const rotated = rotateImage({src:'x',rotation:350}, 20);
  assert.equal(rotated.rotation,10);
  assert.equal(resetImageCrop({...rotated,crop:{top:10,right:10,bottom:10,left:10}}).crop, undefined);
});
test('summarizes inspector state', () => {
  assert.equal(imageInspectorSummary({src:'x',width:500,height:300,rotation:90,wrap:'square',anchor:'page'}),'500×300 · 90° · square · page');
});
