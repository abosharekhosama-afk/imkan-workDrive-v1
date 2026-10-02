import test from 'node:test';
import assert from 'node:assert/strict';
import { pageDimensionsMm, printPageCss, printBlockStyle, sectionHeaderFooter } from './print-layout.ts';

const base:any={size:'A4',orientation:'portrait',marginTopMm:20,marginRightMm:20,marginBottomMm:20,marginLeftMm:20,showPageNumbers:true,pageNumberStart:1};

test('page dimensions honor preset and orientation',()=>{
  assert.deepEqual(pageDimensionsMm(base),{widthMm:210,heightMm:297});
  assert.deepEqual(pageDimensionsMm({...base,orientation:'landscape'}),{widthMm:297,heightMm:210});
  assert.deepEqual(pageDimensionsMm({...base,size:'LETTER'}),{widthMm:216,heightMm:279});
  assert.deepEqual(pageDimensionsMm({...base,size:'CUSTOM',widthMm:100,heightMm:200,orientation:'landscape'}),{widthMm:200,heightMm:100});
});

test('print CSS emits zero-margin exact page box',()=>assert.equal(printPageCss(base),'@page{size:210mm 297mm;margin:0}'));

test('keep-with-next and explicit page breaks map to print-safe CSS',()=>{
  assert.deepEqual(printBlockStyle({pageBreakBefore:true,keepWithNext:true}),{breakBefore:'page',pageBreakBefore:'always',breakAfter:'avoid',pageBreakAfter:'avoid'});
  assert.equal(printBlockStyle({}).breakBefore,'auto');
});

test('section header/footer resolves first and odd/even pages',()=>{
  const doc:any={page:{...base,header:'H',footer:'F',differentFirstPage:false,differentOddEven:false}};
  const section:any={id:'s',header:'SH',footer:'SF',differentFirstPage:true,firstHeader:'FH',firstFooter:'FF',differentOddEven:true,oddHeader:'OH',evenHeader:'EH',oddFooter:'OF',evenFooter:'EF'};
  assert.deepEqual(sectionHeaderFooter(doc,section,1,1),{header:'FH',footer:'FF',showPageNumber:true});
  assert.deepEqual(sectionHeaderFooter(doc,section,2,2),{header:'EH',footer:'EF',showPageNumber:true});
  assert.deepEqual(sectionHeaderFooter(doc,section,3,3),{header:'OH',footer:'OF',showPageNumber:true});
});
