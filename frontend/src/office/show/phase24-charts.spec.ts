import {defaultShow} from './model';
import {addChart,bindChartToSheet,setChartData,updateChart} from './commands';

describe('IMKAN Show Phase 7 - Charts & Data Visualization',()=>{
  it('creates a real chart object with editable data',()=>{
    const d=addChart(defaultShow(),'column');
    const e=d.slides[0].elements[d.slides[0].elements.length-1];
    expect(e.type).toBe('chart');
    expect(e.chart?.type).toBe('column');
    expect(e.chart?.categories).toHaveLength(4);
  });
  it('updates chart series and preserves document structure',()=>{
    let d=addChart(defaultShow(),'line');
    const id=d.slides[0].elements.at(-1)!.id;
    d=setChartData(d,id,['Jan','Feb'],[{name:'Revenue',values:[10,20]}]);
    d=updateChart(d,id,{title:'Revenue Trend',dataLabels:true});
    const c=d.slides[0].elements.find(e=>e.id===id)!.chart!;
    expect(c.title).toBe('Revenue Trend');
    expect(c.categories).toEqual(['Jan','Feb']);
    expect(c.series[0].values).toEqual([10,20]);
    expect(c.dataLabels).toBe(true);
  });
  it('stores Sheet binding metadata without converting the chart to an image',()=>{
    let d=addChart(defaultShow(),'bar');
    const id=d.slides[0].elements.at(-1)!.id;
    d=bindChartToSheet(d,id,{fileId:'sheet-file',sheet:'Sales',range:'A1:D5',firstRowHeaders:true});
    const e=d.slides[0].elements.find(x=>x.id===id)!;
    expect(e.type).toBe('chart');
    expect(e.chart?.source?.sheet).toBe('Sales');
    expect(e.chart?.source?.range).toBe('A1:D5');
  });
});
