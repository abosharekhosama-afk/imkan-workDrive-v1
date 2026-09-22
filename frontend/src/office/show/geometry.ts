import {ShowElement} from './model';

export type ShowAlign='left'|'center'|'right'|'top'|'middle'|'bottom';
export type ShowDistribute='horizontal'|'vertical';
export type ShowGuide={axis:'x'|'y';position:number};

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));

export function alignElements(elements:ShowElement[],ids:string[],mode:ShowAlign):ShowElement[]{
  const picked=elements.filter(e=>ids.includes(e.id));
  if(picked.length<2)return elements;
  const next=elements.map(e=>({...e}));
  const target=mode==='left'?Math.min(...picked.map(e=>e.x)):
    mode==='right'?Math.max(...picked.map(e=>e.x+e.width)):
    mode==='top'?Math.min(...picked.map(e=>e.y)):
    mode==='bottom'?Math.max(...picked.map(e=>e.y+e.height)):
    mode==='center'?(Math.min(...picked.map(e=>e.x))+Math.max(...picked.map(e=>e.x+e.width)))/2:
    (Math.min(...picked.map(e=>e.y))+Math.max(...picked.map(e=>e.y+e.height)))/2;
  return next.map(e=>{
    if(!ids.includes(e.id))return e;
    if(mode==='left')e.x=target;
    else if(mode==='right')e.x=target-e.width;
    else if(mode==='top')e.y=target;
    else if(mode==='bottom')e.y=target-e.height;
    else if(mode==='center')e.x=target-e.width/2;
    else e.y=target-e.height/2;
    e.x=clamp(e.x);e.y=clamp(e.y);return e;
  });
}

export function distributeElements(elements:ShowElement[],ids:string[],axis:ShowDistribute):ShowElement[]{
  const picked=elements.filter(e=>ids.includes(e.id)).sort((a,b)=>axis==='horizontal'?a.x-b.x:a.y-b.y);
  if(picked.length<3)return elements;
  const first=picked[0],last=picked[picked.length-1];
  if(axis==='horizontal'){
    const span=(last.x)-(first.x+first.width); const gaps=span/(picked.length-1);
    let cursor=first.x+first.width;
    for(let i=1;i<picked.length-1;i++){const e=picked[i];e.x=clamp(cursor+gaps);cursor=e.x+e.width;}
  }else{
    const span=last.y-(first.y+first.height); const gaps=span/(picked.length-1);
    let cursor=first.y+first.height;
    for(let i=1;i<picked.length-1;i++){const e=picked[i];e.y=clamp(cursor+gaps);cursor=e.y+e.height;}
  }
  return elements;
}

export function snapValue(value:number,grid:number=1):number{return clamp(Math.round(value/grid)*grid);}
export function snapElement(element:ShowElement,grid:number=1):ShowElement{return {...element,x:snapValue(element.x,grid),y:snapValue(element.y,grid),width:Math.max(grid,snapValue(element.width,grid)),height:Math.max(grid,snapValue(element.height,grid))};}
export function centerGuide(elements:ShowElement[]):ShowGuide[]{return [{axis:'x',position:50},{axis:'y',position:50}];}


export type SmartGuide={axis:'x'|'y';position:number;kind:'center'|'edge'};
const near=(a:number,b:number,t:number)=>Math.abs(a-b)<=t;
export function smartSnapElement(element:ShowElement,others:ShowElement[],threshold=0.75):{element:ShowElement;guides:SmartGuide[]} {
  let e={...element}; const guides:SmartGuide[]=[];
  const candidatesX=[{v:50,k:'center' as const}]; const candidatesY=[{v:50,k:'center' as const}];
  for(const o of others.filter(x=>x.id!==element.id)){
    candidatesX.push({v:o.x,k:'edge'},{v:o.x+o.width,k:'edge'},{v:o.x+o.width/2,k:'center'});
    candidatesY.push({v:o.y,k:'edge'},{v:o.y+o.height,k:'edge'},{v:o.y+o.height/2,k:'center'});
  }
  const xPoints=[{v:e.x,k:'edge' as const},{v:e.x+e.width/2,k:'center' as const},{v:e.x+e.width,k:'edge' as const}];
  const yPoints=[{v:e.y,k:'edge' as const},{v:e.y+e.height/2,k:'center' as const},{v:e.y+e.height,k:'edge' as const}];
  let bestX:{delta:number;target:number;k:SmartGuide['kind']}|null=null;
  for(const p of xPoints) for(const c of candidatesX){const d=c.v-p.v;if(Math.abs(d)<=threshold && (!bestX||Math.abs(d)<Math.abs(bestX.delta)))bestX={delta:d,target:c.v-p.v,k:c.k};}
  let bestY:{delta:number;target:number;k:SmartGuide['kind']}|null=null;
  for(const p of yPoints) for(const c of candidatesY){const d=c.v-p.v;if(Math.abs(d)<=threshold && (!bestY||Math.abs(d)<Math.abs(bestY.delta)))bestY={delta:d,target:c.v-p.v,k:c.k};}
  if(bestX){e.x=clamp(e.x+bestX.delta,0,100-e.width);guides.push({axis:'x',position:Math.round((e.x+(bestX.k==='center'?e.width/2:bestX.delta===0?0:e.width))*100)/100,kind:bestX.k});}
  if(bestY){e.y=clamp(e.y+bestY.delta,0,100-e.height);guides.push({axis:'y',position:Math.round((e.y+(bestY.k==='center'?e.height/2:bestY.delta===0?0:e.height))*100)/100,kind:bestY.k});}
  return {element:e,guides};
}
