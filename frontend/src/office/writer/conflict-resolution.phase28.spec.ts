import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWriterConflictEntries, resolveWriterConflict } from './conflict-resolution.ts';
import type { WriterDocument } from './model.ts';

const block = (id:string, text:string) => ({ id, type:'paragraph' as const, runs:[{ text }] });
const doc = (blocks:any[], title='Doc'): WriterDocument => ({ type:'WRITER', title, language:'en', page:{}, blocks, sections:[], citations:[], captions:[], crossReferences:[], indexEntries:[], bookmarks:[], footnotes:[] } as any);

test('builds block-level conflict entries', () => {
  const local=doc([block('a','local'),block('only-local','x')]);
  const remote=doc([block('a','remote'),block('only-remote','y')]);
  const entries=buildWriterConflictEntries(local,remote);
  assert.equal(entries.find(x=>x.id==='block:a')?.conflict,true);
  assert.equal(entries.find(x=>x.id==='block:only-local')?.defaultChoice,'local');
  assert.equal(entries.find(x=>x.id==='block:only-remote')?.defaultChoice,'remote');
});

test('merges per-block choices without overwriting unrelated remote work', () => {
  const local=doc([block('a','local'),block('local-only','mine')]);
  const remote=doc([block('a','remote'),block('remote-only','theirs')]);
  const merged=resolveWriterConflict(local,remote,{'block:a':'local','block:local-only':'local','block:remote-only':'remote'});
  assert.equal(merged.blocks.find(x=>x.id==='a')?.runs[0].text,'local');
  assert.equal(merged.blocks.find(x=>x.id==='local-only')?.runs[0].text,'mine');
  assert.equal(merged.blocks.find(x=>x.id==='remote-only')?.runs[0].text,'theirs');
});

test('remote choice can intentionally discard an overlapping local block', () => {
  const local=doc([block('a','local')]);
  const remote=doc([block('a','remote')]);
  const merged=resolveWriterConflict(local,remote,{'block:a':'remote'});
  assert.equal(merged.blocks[0].runs[0].text,'remote');
});

test('local metadata choice is preserved', () => {
  const local=doc([block('a','same')],'Local title');
  const remote=doc([block('a','same')],'Remote title');
  const merged=resolveWriterConflict(local,remote,{'document:title':'local'});
  assert.equal(merged.title,'Local title');
});
