import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWriterSaveStatus } from './save-status.ts';

test('saved when clean and online', () => assert.equal(deriveWriterSaveStatus({saving:false,saved:true,queueCount:0,online:true,conflict:false}), 'saved'));
test('saving takes precedence while clean queue is being submitted', () => assert.equal(deriveWriterSaveStatus({saving:true,saved:false,queueCount:0,online:true,conflict:false}), 'saving'));
test('queued work is syncing online', () => assert.equal(deriveWriterSaveStatus({saving:true,saved:false,queueCount:2,online:true,conflict:false}), 'syncing'));
test('queued work is offline', () => assert.equal(deriveWriterSaveStatus({saving:false,saved:false,queueCount:2,online:false,conflict:false}), 'offline'));
test('conflict takes precedence over other states', () => assert.equal(deriveWriterSaveStatus({saving:true,saved:false,queueCount:2,online:true,conflict:true}), 'conflict'));
test('online error is explicit', () => assert.equal(deriveWriterSaveStatus({saving:false,saved:false,queueCount:0,online:true,conflict:false,error:'failed'}), 'error'));
test('dirty local document without queue is unsaved', () => assert.equal(deriveWriterSaveStatus({saving:false,saved:false,queueCount:0,online:true,conflict:false}), 'unsaved'));
