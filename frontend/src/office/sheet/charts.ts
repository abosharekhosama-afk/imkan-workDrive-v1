import { Workbook, Sheet, SheetChart, cellKey, parseKey, formulaDisplay } from './model';

export type { SheetChart };
export type ChartType = SheetChart['type'];
export type ChartStackMode = NonNullable<SheetChart['stackMode']>;

const DEFAULT_COLORS = ['#2563eb','#16a34a','#f59e0b','#9333ea','#dc2626','#0891b2','#db2777','#65a30d'];
const THEMES: Record<string,string[]> = {
  office: DEFAULT_COLORS,
  mono: ['#111827','#374151','#6b7280','#9ca3af','#d1d5db','#4b5563','#1f2937','#6b7280'],
  ocean: ['#0369a1','#0284c7','#0891b2','#0e7490','#155e75','#2563eb','#1d4ed8','#1e40af'],
  nature: ['#166534','#15803d','#16a34a','#65a30d','#4d7c0f','#ca8a04','#a16207','#854d0e'],
  sunset: ['#be123c','#e11d48','#db2777','#c026d3','#9333ea','#7c3aed','#ea580c','#d97706'],
};

export function chartColors(chart: SheetChart) { return chart.colors?.length ? chart.colors : THEMES[chart.theme ?? 'office'] ?? DEFAULT_COLORS; }

export function rangeValues(sheet: Sheet, start: string, end: string, workbook: Workbook) {
  const a = parseKey(start), b = parseKey(end);
  if (!a || !b) return { labels: [] as string[], series: [] as number[][], seriesNames: [] as string[], xValues: [] as number[] };
  const minRow = Math.min(a.row,b.row), maxRow = Math.max(a.row,b.row);
  const minCol = Math.min(a.col,b.col), maxCol = Math.max(a.col,b.col);
  const rows: any[][] = [];
  for (let r=minRow;r<=maxRow;r++) {
    const row:any[]=[];
    for(let c=minCol;c<=maxCol;c++) row.push(sheet.cells[cellKey(r,c)] ? formulaDisplay(sheet.cells[cellKey(r,c)],sheet,workbook) : '');
    rows.push(row);
  }
  if (!rows.length) return {labels:[],series:[],seriesNames:[],xValues:[]};
  const hasHeader = rows.length > 1 && rows[0].length > 1 && rows[0].slice(1).some(v => String(v).trim() !== '');
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const seriesCount = Math.max(1, (rows[0]?.length ?? 1)-1);
  const seriesNames = hasHeader ? Array.from({length:seriesCount},(_,i)=>String(rows[0]?.[i+1] ?? `Series ${i+1}`)) : Array.from({length:seriesCount},(_,i)=>`Series ${i+1}`);
  const labels = dataRows.map(row=>String(row[0] ?? ''));
  const series = Array.from({length:seriesCount},(_,i)=>dataRows.map(row=>{const n=Number(row[i+1]);return Number.isFinite(n)?n:0;}));
  const xValues = dataRows.map(row=>Number(row[0])).map(v=>Number.isFinite(v)?v:0);
  return {labels,series,seriesNames,xValues};
}

export function addChart(workbook: Workbook, type: ChartType, start: string, end: string, title: string) {
  const next = JSON.parse(JSON.stringify(workbook)) as Workbook;
  const sheet = next.sheets.find(s => s.id === next.activeSheet);
  if (!sheet) return workbook;
  const id = `chart-${Date.now()}`;
  sheet.charts = [...(sheet.charts ?? []), {
    id, type, title: title || 'Chart', rangeStart:start, rangeEnd:end,
    position:{row:1,col:7}, width:560, height:330, legend:true,
    showLabels:false, showMarkers:true, showValues:false,
    stackMode: type==='column'||type==='bar' ? 'none' : undefined,
    theme:'office', colors:undefined,
    xAxis:{labels:true,grid:true,title:''}, yAxis:{labels:true,grid:true,title:''},
    trendline:{enabled:false,type:'linear',seriesIndex:0},
  }];
  return next;
}
export function updateChart(workbook: Workbook, id: string, patch: Partial<SheetChart>) {
  const next = JSON.parse(JSON.stringify(workbook)) as Workbook;
  const sheet = next.sheets.find(s => s.id === next.activeSheet); const chart = sheet?.charts?.find(c=>c.id===id);
  if(chart) Object.assign(chart,patch);
  return next;
}
export function deleteChart(workbook: Workbook, id: string) { const next=JSON.parse(JSON.stringify(workbook)) as Workbook; const sheet=next.sheets.find(s=>s.id===next.activeSheet); if(sheet) sheet.charts=(sheet.charts??[]).filter(c=>c.id!==id); return next; }

export function linearTrend(values:number[]) {
  const pts=values.map((y,x)=>[x,y] as const).filter(([,y])=>Number.isFinite(y)); if(pts.length<2)return null;
  const n=pts.length, sx=pts.reduce((a,[x])=>a+x,0), sy=pts.reduce((a,[,y])=>a+y,0), sxx=pts.reduce((a,[x])=>a+x*x,0), sxy=pts.reduce((a,[x,y])=>a+x*y,0); const d=n*sxx-sx*sx;
  if(!d)return {slope:0,intercept:sy/n}; return {slope:(n*sxy-sx*sy)/d,intercept:(sy-(n*((n*sxy-sx*sy)/d)*((n-1)/2)))/n};
}

export function chartSvgMarkup(chart:SheetChart, sheet:Sheet, workbook:Workbook) {
  const data=rangeValues(sheet,chart.rangeStart,chart.rangeEnd,workbook); const w=chart.width,h=chart.height,pad=52;
  const colors=chartColors(chart), labels=data.labels.slice(0,40), count=labels.length;
  const maxRaw=Math.max(1,...data.series.flat().map(v=>Math.abs(v)),0), minRaw=Math.min(0,...data.series.flat(),0);
  const ymin=chart.yAxis?.min ?? (chart.stackMode==='percent' ? 0 : minRaw), ymax=chart.yAxis?.max ?? (chart.stackMode==='percent' ? 100 : maxRaw);
  const range=Math.max(1,ymax-ymin), gw=Math.max(1,w-pad*2), gh=Math.max(1,h-92);
  const esc=(x:string)=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><text x="${w/2}" y="24" text-anchor="middle" font-size="16" font-family="Arial" font-weight="600">${esc(chart.title)}</text>`;
  if(chart.type==='pie'||chart.type==='doughnut'){
    const vals=(data.series[0]??[]).slice(0,count), total=Math.max(1,vals.reduce((a,b)=>a+Math.max(0,b),0)); let angle=-Math.PI/2; const cx=w/2,cy=h/2+10,r=Math.min(w,h)*.28;
    vals.forEach((v,i)=>{const end=angle+Math.max(0,v)/total*Math.PI*2,large=end-angle>Math.PI,x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end),inner=r*(chart.type==='doughnut'?.52:0); const d=inner?`M ${x1} ${y1} A ${r} ${r} 0 ${large?1:0} 1 ${x2} ${y2} L ${cx+inner*Math.cos(end)} ${cy+inner*Math.sin(end)} A ${inner} ${inner} 0 ${large?1:0} 0 ${cx+inner*Math.cos(angle)} ${cy+inner*Math.sin(angle)} Z`:`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large?1:0} 1 ${x2} ${y2} Z`; out+=`<path d="${d}" fill="${colors[i%colors.length]}" stroke="white"/>`; if(chart.showLabels)out+=`<text x="${cx+(r+.2*r)*Math.cos((angle+end)/2)}" y="${cy+(r+.2*r)*Math.sin((angle+end)/2)}" text-anchor="middle" font-size="9">${esc(labels[i]??'')}</text>`; angle=end;});
  } else {
    const xAt=(i:number)=>pad+(count>1?i*gw/(count-1):gw/2); const yAt=(v:number)=>pad+20+(ymax-v)/range*gh;
    if(chart.yAxis?.grid!==false){const ticks=chart.yAxis?.tick&&chart.yAxis.tick>0?Math.max(2,Math.ceil(range/chart.yAxis.tick)):5;for(let i=0;i<=ticks;i++){const v=ymin+range*i/ticks,y=yAt(v);out+=`<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#e5e7eb"/><text x="${pad-6}" y="${y+3}" text-anchor="end" font-size="9">${Number(v.toFixed(2))}</text>`;}}
    out+=`<line x1="${pad}" y1="${pad+20+gh}" x2="${w-pad}" y2="${pad+20+gh}" stroke="#94a3b8"/><line x1="${pad}" y1="${pad+20}" x2="${pad}" y2="${pad+20+gh}" stroke="#94a3b8"/>`;
    if(chart.xAxis?.title)out+=`<text x="${w/2}" y="${h-4}" text-anchor="middle" font-size="10">${esc(chart.xAxis.title)}</text>`; if(chart.yAxis?.title)out+=`<text transform="translate(12 ${h/2}) rotate(-90)" text-anchor="middle" font-size="10">${esc(chart.yAxis.title)}</text>`;
    const modes=chart.seriesTypes??[];
    data.series.forEach((series,si)=>{const mode=chart.type==='combo'?(modes[si]??(si===0?'column':'line')):chart.type; const vals=chart.stackMode==='percent'?series.map((v,i)=>{const total=data.series.reduce((a,s)=>a+Math.max(0,s[i]??0),0);return total?(Math.max(0,v)/total)*100:0;}):series;
      if(mode==='scatter'){vals.forEach((v,i)=>out+=`<circle cx="${xAt(i)}" cy="${yAt(v)}" r="4" fill="${colors[si%colors.length]}"/>`);}
      else if(mode==='line'||mode==='area'){const pts=vals.slice(0,count).map((v,i)=>[xAt(i),yAt(v)] as const);const path=pts.map((p,i)=>(i?'L':'M')+` ${p[0]} ${p[1]}`).join(' ');if(mode==='area')out+=`<path d="${path} L ${xAt(Math.max(0,count-1))} ${pad+20+gh} L ${xAt(0)} ${pad+20+gh} Z" fill="${colors[si%colors.length]}" opacity=".15"/>`;out+=`<path d="${path}" fill="none" stroke="${colors[si%colors.length]}" stroke-width="2"/>`;if(chart.showMarkers!==false)pts.forEach(([x,y],i)=>out+=`<circle cx="${x}" cy="${y}" r="3" fill="${colors[si%colors.length]}"/>`);if(chart.showValues)vals.forEach((v,i)=>out+=`<text x="${xAt(i)}" y="${yAt(v)-7}" text-anchor="middle" font-size="8">${Number(v.toFixed(2))}</text>`);}
      else {const groupW=gw/Math.max(1,count), barW=Math.max(4,groupW/(data.series.length+1)-3);vals.slice(0,count).forEach((v,i)=>{let base=ymin;if(chart.stackMode&&chart.stackMode!=='none'){base=data.series.slice(0,si).reduce((a,s)=>a+(chart.stackMode==='percent'?(data.series.reduce((z,q)=>z+Math.max(0,q[i]??0),0)?Math.max(0,s[i]??0)/data.series.reduce((z,q)=>z+Math.max(0,q[i]??0),0)*100:0):Math.max(0,s[i]??0)),0);}const x=pad+i*groupW+(si*barW), y=Math.min(yAt(base),yAt(base+v)), bh=Math.abs(yAt(base)-yAt(base+v));out+=`<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1,bh)}" fill="${colors[si%colors.length]}"/>`;if(chart.showValues)out+=`<text x="${x+barW/2}" y="${y-4}" text-anchor="middle" font-size="8">${Number(v.toFixed(2))}${chart.stackMode==='percent'?'%':''}</text>`;});}
      if(chart.trendline?.enabled && (chart.trendline.seriesIndex??0)===si && mode!=='pie'&&mode!=='doughnut'){const tr=linearTrend(vals);if(tr&&count>1)out+=`<path d="M ${xAt(0)} ${yAt(tr.intercept)} L ${xAt(count-1)} ${yAt(tr.intercept+tr.slope*(count-1))}" stroke="${colors[si%colors.length]}" stroke-width="2" stroke-dasharray="6 4" fill="none"/>`;}
    });
    if(chart.xAxis?.labels!==false) labels.forEach((l,i)=>out+=`<text x="${xAt(i)}" y="${pad+36+gh}" text-anchor="middle" font-size="8">${esc(String(l).slice(0,14))}</text>`);
    if(chart.legend) data.seriesNames.slice(0,8).forEach((name,i)=>{const x=pad+i*105;out+=`<rect x="${x}" y="${h-24}" width="10" height="10" fill="${colors[i%colors.length]}"/><text x="${x+14}" y="${h-15}" font-size="8">${esc(name.slice(0,15))}</text>`;});
  }
  return out+'</svg>';
}

export function exportChartSvg(chart:SheetChart,sheet:Sheet,workbook:Workbook){const blob=new Blob([chartSvgMarkup(chart,sheet,workbook)],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${chart.title||'chart'}.svg`;a.click();URL.revokeObjectURL(url);}
export async function exportChartPng(chart:SheetChart,sheet:Sheet,workbook:Workbook){const svg=chartSvgMarkup(chart,sheet,workbook),blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Chart export failed'));img.src=url;});const canvas=document.createElement('canvas');canvas.width=chart.width*2;canvas.height=chart.height*2;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');ctx.scale(2,2);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`${chart.title||'chart'}.png`;a.click();URL.revokeObjectURL(u);},'image/png');}
