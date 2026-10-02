import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWriterDocument } from './model.ts';
import { insertSectionBreak, updatePageSettings, updateSection } from './commands.ts';

test('page setup persists page geometry, numbering and variants', () => {
  let doc=emptyWriterDocument('x');
  doc=updatePageSettings(doc,{size:'LEGAL',orientation:'landscape',marginTopMm:12,marginRightMm:14,marginBottomMm:16,marginLeftMm:18,showPageNumbers:true,pageNumberFormat:'roman-upper',pageNumberStart:7,differentFirstPage:true,differentOddEven:true});
  assert.equal(doc.page.size,'LEGAL'); assert.equal(doc.page.orientation,'landscape'); assert.equal(doc.page.marginLeftMm,18); assert.equal(doc.page.pageNumberFormat,'roman-upper'); assert.equal(doc.page.pageNumberStart,7); assert.equal(doc.page.differentFirstPage,true); assert.equal(doc.page.differentOddEven,true);
});

test('section setup persists columns, gap, headers and numbering', () => {
  let doc=emptyWriterDocument('x');
  doc=insertSectionBreak(doc,doc.blocks[0]?.id,2,'continuous');
  const sec=doc.sections[doc.sections.length-1];
  doc=updateSection(doc,sec.id,{columns:3,columnGapMm:14,header:'H',footer:'F',firstHeader:'FH',firstFooter:'FF',oddHeader:'OH',oddFooter:'OF',evenHeader:'EH',evenFooter:'EF',differentFirstPage:true,differentOddEven:true,pageNumberStart:9,pageNumberFormat:'letter-lower'});
  const out=doc.sections.find(s=>s.id===sec.id)!;
  assert.equal(out.columns,3); assert.equal(out.columnGapMm,14); assert.equal(out.header,'H'); assert.equal(out.firstHeader,'FH'); assert.equal(out.oddFooter,'OF'); assert.equal(out.evenHeader,'EH'); assert.equal(out.pageNumberStart,9); assert.equal(out.pageNumberFormat,'letter-lower'); assert.equal(out.differentOddEven,true);
});
