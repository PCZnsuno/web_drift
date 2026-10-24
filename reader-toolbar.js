'use strict';
document.addEventListener('webviewerloaded',async event=>{
 const win=event.detail.source;if(win!==document.getElementById('viewer').contentWindow)return;
 const app=win.PDFViewerApplication;await app.initializedPromise;
 const doc=win.document,comment=doc.getElementById('editorCommentButton');if(!comment)return;
 const select=doc.createElement('button');select.type='button';select.className='paperboatToolButton';select.id='paperboatSelect';select.title='选择 · 选择文字与批注';select.setAttribute('aria-label','选择模式');
 select.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3v17l5-5 4 7 3-2-4-7h7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
 comment.closest('.toolbarButtonWithContainer').before(select);
 const erase=select.cloneNode(false);erase.id='paperboatEraser';erase.title='橡皮擦 · 点击移除整条涂鸦或文字批注（Ctrl+Z 撤销）';erase.setAttribute('aria-label','橡皮擦');erase.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m3 14 9-10 9 8-8 9H9Zm5-5 9 8M13 21h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';select.after(erase);
 let erasing=false;erase.onclick=()=>{select.click();erasing=true;erase.classList.add('toggled');erase.setAttribute('aria-pressed','true');select.classList.remove('toggled');};
 doc.addEventListener('pointerdown',e=>{if(!erasing)return;if(e.target.closest('.toolbarButton,.paperboatToolButton,.toolbarButtonWithContainer')){if(!e.target.closest('#paperboatEraser')){erasing=false;erase.classList.remove('toggled');}return;}const node=e.target.closest('.annotationEditorLayer [data-editor-rotation]');if(!node)return;const manager=app.pdfViewer._layerProperties?.annotationEditorUIManager;const editor=manager?.getEditor(node.id);if(!editor)return;e.preventDefault();e.stopImmediatePropagation();manager.setSelected(editor);app.eventBus.dispatch('editingaction',{source:erase,name:'delete'});},true);
 // Keep the previous visible page surface while the engine rebuilds editing
 // layers. Copy once per switch, then release after the replacement is painted.
 const covers=new Map();let coverTimeout;
 const releaseCovers=()=>{for(const c of covers.values())c.remove();covers.clear();};
 doc.addEventListener('pointerdown',e=>{if(e.target.closest('#editorModeButtons button,#paperboatSelect,#paperboatEraser'))e.preventDefault();},true);
 doc.addEventListener('click',e=>{
  if(!e.target.closest('#editorModeButtons button,#paperboatSelect,#paperboatEraser'))return;
  releaseCovers();const scroller=doc.getElementById('viewerContainer'),bounds=scroller.getBoundingClientRect(),top=scroller.scrollTop,left=scroller.scrollLeft;
  for(const page of doc.querySelectorAll('.page')){const b=page.getBoundingClientRect();if(b.bottom<bounds.top||b.top>bounds.bottom)continue;const canvas=page.querySelector('.canvasWrapper canvas');if(!canvas?.width)continue;const copy=doc.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);Object.assign(copy.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'1'});copy.className='paperboat-render-cover';page.append(copy);covers.set(Number(page.dataset.pageNumber),copy);}
  win.requestAnimationFrame(()=>{scroller.scrollTop=top;scroller.scrollLeft=left;});clearTimeout(coverTimeout);coverTimeout=setTimeout(releaseCovers,1200);
 },true);
 app.eventBus.on('pagerendered',({pageNumber})=>{const cover=covers.get(pageNumber);if(cover)win.requestAnimationFrame(()=>{cover.remove();covers.delete(pageNumber);});});
 app.eventBus.on('annotationeditormodechanged',()=>win.requestAnimationFrame(()=>win.requestAnimationFrame(releaseCovers)));
 const panels=()=>[...doc.querySelectorAll('.editorParamsToolbar:not(.menu)')];
 const hide=()=>panels().forEach(p=>{p.classList.add('hidden');doc.querySelector('[aria-controls="'+p.id+'"]')?.setAttribute('aria-expanded','false');});
 select.onclick=()=>{erasing=false;erase.classList.remove('toggled');erase.setAttribute('aria-pressed','false');app.eventBus.dispatch('switchannotationeditormode',{source:select,mode:0});app.eventBus.dispatch('switchcursortool',{source:select,tool:0});hide();};
 const update=({mode})=>{if(mode!==0){erasing=false;erase.classList.remove('toggled');erase.setAttribute('aria-pressed','false');}select.classList.toggle('toggled',mode===0);select.setAttribute('aria-pressed',String(mode===0));};
 app.eventBus.on('annotationeditormodechanged',update);update({mode:app.pdfViewer.annotationEditorMode});
 doc.addEventListener('pointerdown',e=>{if(!e.target.closest('.toolbarButtonWithContainer,.editorParamsToolbar'))hide();},true);
 for(const panel of panels()){
  const button=doc.querySelector('[aria-controls="'+panel.id+'"]');
  button?.addEventListener('click',e=>{if(button.classList.contains('toggled')&&panel.classList.contains('hidden')){e.preventDefault();e.stopImmediatePropagation();hide();panel.classList.remove('hidden');button.setAttribute('aria-expanded','true');}},true);
 }
 let range=null;
 doc.addEventListener('selectionchange',()=>{const s=win.getSelection();if(s&&!s.isCollapsed&&s.anchorNode?.parentElement?.closest('.textLayer'))range=s.getRangeAt(0).cloneRange();else if(!doc.activeElement?.closest('#editorComment'))range=null;});
 comment.title='选中文字后添加批注';comment.setAttribute('aria-label','为选中文字添加批注');
 comment.addEventListener('pointerdown',e=>{e.preventDefault();},true);
 comment.addEventListener('click',e=>{
  e.preventDefault();e.stopImmediatePropagation();hide();
  const s=win.getSelection();if(range&&range.startContainer.isConnected){s.removeAllRanges();s.addRange(range);}
  if(!s||s.isCollapsed||!s.anchorNode?.parentElement?.closest('.textLayer')){select.click();toast('请先拖动选中相关文字，再点击批注。');return;}
  app.eventBus.dispatch('editingaction',{source:comment,name:'commentSelection'});range=null;
 },true);
 doc.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
});
