import test from 'node:test';
import assert from 'node:assert/strict';
import { setBlockSpacing, setListOrdered, toggleList, updateBlockLayout } from './commands.ts';
import type { WriterDocument } from './model.ts';

function doc(): WriterDocument {
  return { id:'d', title:'t', revision:1, page:{size:'A4',orientation:'portrait',marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20}, blocks:[{id:'p',type:'paragraph',align:'start',runs:[{text:'item'}],spaceAfter:8,lineSpacing:1.5}], sections:[], citations:[], citationSources:[], footnotes:[], endnotes:[], comments:[], bookmarks:[], review:{comments:[],changes:[],trackChanges:false,snapshots:[]} } as WriterDocument;
}

test('switches an active paragraph into an ordered list item', () => { const next=setListOrdered(doc(),'p',true); assert.equal(next.blocks[0].type,'list-item'); assert.equal(next.blocks[0].ordered,true); });
test('toggles the same list type back to paragraph', () => { const listed=toggleList(doc(),'p',false); const next=toggleList(listed,'p',false); assert.equal(next.blocks[0].type,'paragraph'); });
test('updates left indent without mutating the source document', () => { const source=doc(); const next=updateBlockLayout(source,'p',{indentLeftMm:20}); assert.equal(next.blocks[0].indentLeftMm,20); assert.equal(source.blocks[0].indentLeftMm,undefined); });
test('updates paragraph before/after spacing and line spacing together', () => { const next=setBlockSpacing(doc(),'p',{spaceBefore:12,spaceAfter:16,lineSpacing:2}); assert.equal(next.blocks[0].spaceBefore,12); assert.equal(next.blocks[0].spaceAfter,16); assert.equal(next.blocks[0].lineSpacing,2); });
