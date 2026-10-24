'use strict';
document.addEventListener('webviewerloaded',event=>{
 const win=event.detail.source;if(win!==$('viewer').contentWindow)return;
 const doc=win.document;let pending=null,selection='',clickUntil=0;

 const clear=()=>{selection='';doc.querySelectorAll('.paperboat-region-selected').forEach(n=>n.classList.remove('paperboat-region-selected'));};
 const cancel=()=>{if(pending){pending.box?.remove();if(pending.page.hasPointerCapture(pending.id))pending.page.releasePointerCapture(pending.id);}pending=null;};
 const position=e=>{const r=pending.page.getBoundingClientRect();return {x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top)),r};};
 doc.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('input,textarea,[contenteditable=true],.annotationEditor,button,a'))return;
  const page=e.target.closest('.page'),mode=win.PDFViewerApplication?.pdfViewer.annotationEditorMode;
  if(!page||![0,3].includes(mode))return;
  // Let PDF.js retain real text ranges for highlighting and anchored comments.
  if(mode===0&&e.target.closest('.textLayer')){clear();return;}
  const r=page.getBoundingClientRect();pending={page,mode,id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,startX:e.clientX,startY:e.clientY,active:false};
 },true);
 doc.addEventListener('pointermove',e=>{
  if(!pending||pending.id!==e.pointerId)return;
  const d=pending;if(!d.active){if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6)return;d.active=true;clear();win.getSelection()?.removeAllRanges();d.box=doc.createElement('div');d.box.className='paperboat-marquee';d.page.append(d.box);d.page.setPointerCapture(d.id);}
  const p=position(e);d.end=p;d.box.style.left=Math.min(d.x,p.x)+'px';d.box.style.top=Math.min(d.y,p.y)+'px';d.box.style.width=Math.abs(d.x-p.x)+'px';d.box.style.height=Math.abs(d.y-p.y)+'px';e.preventDefault();e.stopImmediatePropagation();
  const scroller=doc.getElementById('viewerContainer'),v=scroller?.getBoundingClientRect();if(v){const dy=e.clientY<v.top+24?-8:e.clientY>v.bottom-24?8:0;if(dy)scroller.scrollTop+=dy;}
 },true);
 doc.addEventListener('pointerup',e=>{
  if(!pending||pending.id!==e.pointerId)return;const d=pending;if(!d.active){pending=null;return;}
  const p=position(e),left=Math.min(d.x,p.x),top=Math.min(d.y,p.y),width=Math.abs(d.x-p.x),height=Math.abs(d.y-p.y),rect=d.box.getBoundingClientRect();cancel();e.preventDefault();e.stopImmediatePropagation();clickUntil=performance.now()+150;
  if(width<4||height<4)return;
  if(d.mode===0){const text=[];for(const span of d.page.querySelectorAll('.textLayer span')){if(!span.firstChild||span.children.length)continue;const b=span.getBoundingClientRect();if(b.width&&b.height&&b.right>rect.left&&b.left<rect.right&&b.bottom>rect.top&&b.top<rect.bottom){span.classList.add('paperboat-region-selected');text.push(span.textContent);}}selection=text.join(' ');return;}
  const view=win.PDFViewerApplication.pdfViewer.getPageView(Number(d.page.dataset.pageNumber)-1),layer=view.annotationEditorLayer?.annotationEditorLayer;if(!layer){toast('请等待页面加载后再创建文本框。');return;}
  const bounds=layer.div.getBoundingClientRect(),pageBounds=d.page.getBoundingClientRect();const editor=layer.createAndAddNewEditor({offsetX:pageBounds.left+left-bounds.left,offsetY:pageBounds.top+top-bounds.top},false);
  if(!editor?.div)return;editor.div.style.width=width/bounds.width*100+'%';editor.div.style.minHeight=height/bounds.height*100+'%';const input=editor.div.querySelector('[contenteditable]');if(input){Object.assign(input.style,{width:'100%',minHeight:height+'px',whiteSpace:'pre-wrap',overflowWrap:'anywhere'});input.focus({preventScroll:true});}
 },true);
 doc.addEventListener('click',e=>{if(performance.now()<clickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 doc.addEventListener('paperboat-cancel-selection',()=>{cancel();clear();});
 doc.addEventListener('pointercancel',cancel);win.addEventListener('blur',cancel);
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'){cancel();clear();}});
 doc.addEventListener('copy',e=>{if(selection&&!doc.activeElement?.closest('input,textarea,[contenteditable=true]')){e.clipboardData.setData('text/plain',selection);e.preventDefault();}});
});


