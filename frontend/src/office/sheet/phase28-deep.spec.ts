import { evalFormula, defaultWorkbook, type Workbook } from './model';

describe('IMKAN Sheet Phase 28 deep formula contract', () => {
  function wb(): Workbook {
    const w = defaultWorkbook();
    const s = w.sheets[0];
    s.cells = {
      A1:{value:'A'}, B1:{value:10}, C1:{value:2},
      A2:{value:'B'}, B2:{value:20}, C2:{value:3},
      A3:{value:'A'}, B3:{value:30}, C3:{value:4},
      A4:{value:'C'}, B4:{value:40}, C4:{value:5},
    };
    return w;
  }
  it('supports criteria and aggregate functions used by modern spreadsheets', () => {
    const w=wb(), s=w.sheets[0];
    expect(evalFormula('=COUNTIFS(A1:A4,"A",B1:B4,">15")',s,new Set(),w)).toBe(1);
    expect(evalFormula('=SUMIFS(B1:B4,A1:A4,"A")',s,new Set(),w)).toBe(40);
    expect(evalFormula('=AVERAGEIF(A1:A4,"A",B1:B4)',s,new Set(),w)).toBe(20);
    expect(evalFormula('=MAXIFS(B1:B4,A1:A4,"A")',s,new Set(),w)).toBe(30);
    expect(evalFormula('=MINIFS(B1:B4,A1:A4,"A")',s,new Set(),w)).toBe(10);
  });
  it('supports error, ranking, selection and formatting helpers', () => {
    const w=wb(), s=w.sheets[0];
    expect(evalFormula('=IFNA(XLOOKUP("Z",A1:A4,B1:B4),99)',s,new Set(),w)).toBe(99);
    expect(evalFormula('=LARGE(B1:B4,2)',s,new Set(),w)).toBe(30);
    expect(evalFormula('=SMALL(B1:B4,2)',s,new Set(),w)).toBe(20);
    expect(evalFormula('=RANK.EQ(B2,B1:B4)',s,new Set(),w)).toBe(3);
    expect(evalFormula('=TEXT(0.25,"0.0%")',s,new Set(),w)).toBe('25.0%');
    expect(evalFormula('=VALUE("$1,250")',s,new Set(),w)).toBe(1250);
  });
  it('keeps dependency extraction and formula evaluation deterministic', () => {
    const w=wb(), s=w.sheets[0];
    expect(evalFormula('=SUM(B1:B4)',s,new Set(),w)).toBe(100);
    expect(evalFormula('=AVERAGE(C1:C4)',s,new Set(),w)).toBe(3.5);
  });
});
