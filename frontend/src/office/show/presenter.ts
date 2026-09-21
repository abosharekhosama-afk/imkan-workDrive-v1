import {ShowDocument, ShowSlide} from './model';

export type ShowPresenterMode='editor'|'audience'|'presenter';
export type ShowPresenterState={index:number;startedAt:number;elapsedSeconds:number;paused:boolean};

export const presenterMode=(value:string|null):ShowPresenterMode=>value==='audience'||value==='presenter'?value:'editor';
export const clampSlideIndex=(doc:ShowDocument,index:number)=>Math.max(0,Math.min(Math.max(0,doc.slides.length-1),index));
export const presenterCurrent=(doc:ShowDocument,index:number)=>doc.slides[clampSlideIndex(doc,index)];
export const presenterNext=(doc:ShowDocument,index:number):ShowSlide|undefined=>doc.slides[clampSlideIndex(doc,index)+1];
export const formatPresenterTime=(seconds:number)=>{const s=Math.max(0,Math.floor(seconds));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`};
export const presenterUrl=(fileId:string,mode:'audience'|'presenter',index:number)=>`/office/show/${encodeURIComponent(fileId)}?present=1&mode=${mode}&slide=${Math.max(0,index)}`;
