export type ShowLayout='blank'|'title'|'title-content'|'two-column'|'image-text';
export type ShowElementType='text'|'shape'|'image'|'video'|'audio'|'line'|'table';
export type ShowAnimationEffect='fade'|'zoom'|'slide-in'|'float'|'pulse'|'spin';
export type ShowAnimationPhase='entrance'|'emphasis'|'exit';
export type ShowAnimationTrigger='with-previous'|'after-previous'|'on-click';
export type ShowAnimation={type:ShowAnimationEffect;duration:number;delay:number;direction?:'left'|'right'|'up'|'down';phase?:ShowAnimationPhase;order?:number;trigger?:ShowAnimationTrigger};
export type ShowElement={id:string;type:ShowElementType;x:number;y:number;width:number;height:number;rotation?:number;text?:string;src?:string;poster?:string;shape?:'rect'|'circle'|'roundRect';fill?:string;color?:string;fontSize?:number;fontFamily?:string;bold?:boolean;italic?:boolean;underline?:boolean;strike?:boolean;align?:'start'|'center'|'end';lineHeight?:number;bullet?:'none'|'bullet'|'number';border?:boolean;rows?:string[][];groupId?:string;animation?:ShowAnimation;animations?:ShowAnimation[];mediaAutoplay?:boolean;mediaLoop?:boolean;mediaMuted?:boolean;mediaVolume?:number;mediaTrimStart?:number;mediaTrimEnd?:number};
export type ShowTransition='none'|'fade'|'slide';
export type ShowSlide={id:string;layout:ShowLayout;background:string;elements:ShowElement[];notes?:string;master?:string;section?:string;transition?:ShowTransition;transitionDuration?:number;autoAdvanceMs?:number};
export type ShowMaster={id:string;name:string;background:string;elements:ShowElement[]};
export type ShowTheme={fontFamily:string;accent:string;secondary:string;background:string;headingFont:string};
export type ShowThemePreset='office'|'midnight'|'ocean'|'forest'|'sunset';
export type ShowSection={id:string;name:string;collapsed?:boolean};
export type ShowComment={id:string;slideId:string;elementId?:string;authorId?:string;text:string;createdAt:string;resolved?:boolean;replies?:Array<{id:string;authorId?:string;text:string;createdAt:string}>};
export type ShowDocument={schema:6;type:'SHOW';title:string;aspectRatio:'16:9'|'4:3';activeSlide:string;theme:ShowTheme;masters:ShowMaster[];slides:ShowSlide[];sections?:ShowSection[];comments?:ShowComment[]};
export const cloneShow=(d:ShowDocument):ShowDocument=>JSON.parse(JSON.stringify(d));
export const activeSlide=(d:ShowDocument)=>d.slides.find(s=>s.id===d.activeSlide)??d.slides[0];
export function defaultShow():ShowDocument {
  return { schema:6,type:'SHOW',title:'Untitled presentation',comments:[],aspectRatio:'16:9',activeSlide:'slide-1',theme:{fontFamily:'Arial',accent:'#2563eb',secondary:'#64748b',background:'#ffffff',headingFont:'Arial'},masters:[{id:'master-default',name:'Default',background:'#ffffff',elements:[]}],sections:[],slides:[{id:'slide-1',layout:'title-content',background:'#ffffff',master:'master-default',transition:'fade',transitionDuration:300,elements:[{id:'title',type:'text',x:8,y:12,width:84,height:18,text:'Presentation title',fontSize:32,bold:true,align:'center',color:'#111827',fontFamily:'Arial'},{id:'content',type:'text',x:12,y:40,width:76,height:28,text:'Add your content here',fontSize:20,align:'center',color:'#475569',fontFamily:'Arial'}]}]};
}
