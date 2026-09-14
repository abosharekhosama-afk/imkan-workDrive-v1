(function(){
var out={};
function cs(el,props){try{var s=getComputedStyle(el);var o={};for(var i=0;i<props.length;i++){o[props[i]]=s.getPropertyValue(props[i]);}return o;}catch(e){return{};}}
function box(el){try{var r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}catch(e){return null;}}
function cls(el){try{return String(el.className||'').slice(0,160);}catch(e){return'';}}
function tx(el,n){try{return String(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,n||45);}catch(e){return'';}}
out.url=location.href;out.title=document.title;
var kids=[];for(var k=0;k<Math.min(document.body.children.length,8);k++){var c=document.body.children[k];kids.push({tag:c.tagName,cls:cls(c),id:c.id||'',n:c.children.length});}
out.topDivs=kids;
var ball=document.querySelectorAll('button');var barr=[];for(var b=0;b<Math.min(ball.length,90);b++){barr.push({text:tx(ball[b]),cls:cls(ball[b]),box:box(ball[b])});}
out.buttons=barr;
function findBtn(name){for(var i=0;i<ball.length;i++){if(tx(ball[i],60).indexOf(name)>=0)return ball[i];}return null;}
var BOXF=['background-color','color','border-radius','border-color','font-size','font-weight','padding','height','box-shadow','display','gap'];
var names=['New','Manage','Record'];
for(var ni=0;ni<names.length;ni++){var nm=names[ni];var el=findBtn(nm);out['btn_'+nm]=el?{text:tx(el,60),cls:cls(el),box:box(el),style:cs(el,BOXF)}:null;}
var si=document.querySelector('input[placeholder]');if(!si){si=document.querySelector('input[type=search]');}
out.search=si?{ph:si.placeholder||'',box:box(si),style:cs(si,['background-color','color','border-radius','border-color','font-size','height','padding','box-shadow']),parentBox:box(si.parentElement),parentCls:cls(si.parentElement)}:null;
var hdr=document.querySelector('header');
out.headerBox=hdr?{box:box(hdr),style:cs(hdr,['background-color','height','padding','border-bottom-color','display'])}:null;
var nav=document.querySelector('nav');
out.nav=nav?{box:box(nav),style:cs(nav,['background-color','color','width','padding','font-size'])}:null;
var navAs=document.querySelectorAll('nav a, nav button, aside a');var navArr=[];for(var q=0;q<Math.min(navAs.length,30);q++){navArr.push({text:tx(navAs[q]),box:box(navAs[q]),style:cs(navAs[q],['color','background-color','border-radius','font-size','font-weight','padding','height','display'])});}
out.navItems=navArr;
var ths=document.querySelectorAll('th');var chArr=[];for(var h=0;h<Math.min(ths.length,10);h++){chArr.push({text:tx(ths[h],30),box:box(ths[h]),style:cs(ths[h],['font-size','font-weight','color','background-color','padding','height'])});}
out.colHeaders=chArr;
var trs=document.querySelectorAll('tbody tr');var rowArr=[];for(var r=0;r<Math.min(trs.length,3);r++){var tr=trs[r];var tds=tr.querySelectorAll('td,th');var cellArr=[];for(var cc=0;cc<Math.min(tds.length,7);cc++){cellArr.push({text:tx(tds[cc]),box:box(tds[cc]),style:cs(tds[cc],['padding','font-size','color','font-weight'])});}rowArr.push({box:box(tr),style:cs(tr,['height','background-color','font-size','color']),cells:cellArr});}
out.rows=rowArr;
out.firstRowHtml=trs.length>0?trs[0].outerHTML.slice(0,3500):'NOROWS';
var ass=document.querySelectorAll('aside');var asArr=[];for(var a=0;a<Math.min(ass.length,6);a++){asArr.push({box:box(ass[a]),cls:cls(ass[a]),style:cs(ass[a],['background-color','width'])});}
out.asidePanels=asArr;
out.bodyStyle=cs(document.body,['font-family','font-size','color','background-color']);
return out;
})()
