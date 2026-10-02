import test from 'node:test';
import assert from 'node:assert/strict';
import { insertImage, updateImage } from './commands.ts';
import type { WriterDocument } from './model.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = join(here, '../../app/office/writer/[fileId]/page.tsx');
const page = readFileSync(pagePath, 'utf8');

function doc(): WriterDocument {
  return {
    id:'d', title:'Test', revision:1, page:{size:'A4',orientation:'portrait',marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20,header:'',footer:'',showPageNumbers:true,pageNumberFormat:'decimal',pageNumberStart:1},
    sections:[{id:'s',columns:1,columnGapMm:10}], blocks:[{id:'p',type:'paragraph',runs:[{text:'Hello'}]}],
    review:{comments:[],changes:[],snapshots:[],trackChanges:false}, bookmarks:[], footnotes:[], endnotes:[], citations:[], citationSources:[], citationStyle:'apa', captions:[], crossReferences:[], indexEntries:[]
  } as WriterDocument;
}

test('image insert stores source, alt text and dimensions', () => {
  const next = insertImage(doc(),'data:image/png;base64,AAA','Logo','p');
  const image = next.blocks.find(b=>b.type==='image')?.image;
  assert.equal(image?.src,'data:image/png;base64,AAA');
  assert.equal(image?.alt,'Logo');
  assert.equal(image?.width,560);
});

test('image update changes alt and dimensions without replacing block', () => {
  const base = insertImage(doc(),'https://example.com/a.png','A','p');
  const block = base.blocks.find(b=>b.type==='image')!;
  const next = updateImage(base,block.id,{...block.image!,alt:'Updated',width:800,height:450});
  const image = next.blocks.find(b=>b.id===block.id)?.image;
  assert.equal(image?.alt,'Updated');
  assert.equal(image?.width,800);
  assert.equal(image?.height,450);
});

test('image/link UI does not use prompt for the primary image or link flows', () => {
  assert.match(page,/const openLinkDialog=/);
  assert.match(page,/const openImageDialog=/);
  assert.match(page,/role="dialog"/);
  assert.doesNotMatch(page,/const insertLink=\(\)=>\{[^\n]*window\.prompt/);
  assert.doesNotMatch(page,/const addImage=\(\)=>\{[^\n]*window\.prompt/);
});

test('link dialog preserves selection bookmark and supports unlink', () => {
  assert.match(page,/setLinkSelection\(captureWriterSelection\(\)\)/);
  assert.match(page,/restoreWriterSelection\(linkSelection\)/);
  assert.match(page,/document\.execCommand\('unlink'\)/);
});
