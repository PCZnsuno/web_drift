'use strict';
const ocrJob={running:false,cancel:false,worker:null};
const loadOcrScript=src=>new Promise((resolve,reject)=>{const s=el('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('本地识别组件加载失败'));document.head.append(s);});
let ocrCache;
function openOcrCache(){return ocrCache ||= new Promise((resolve,reject)=>{const r=indexedDB.open('paperboat-ocr',1);r.onupgradeneeded=()=>r.result.createObjectStore('pages');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function cachedOcr(key,value){const d=await openOcrCache();return new Promise((resolve,reject)=>{const t=d.transaction('pages',value?'readwrite':'readonly'),s=t.objectStore('pages'),r=value?s.put(value,key):s.get(key);let result;r.onsuccess=()=>result=r.result;t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);});}
function ocrPages(value,total){const pages=new Set();for(const part of value.split(/[,，]/)){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw new Error('页码格式示例：1-3,5');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b>total||b<a)throw new Error('页码超出文档范围');for(let n=a;n<=b;n++)pages.add(n);}return [...pages].sort((a,b)=>a-b);}
document.addEventListener('DOMContentLoaded',()=>{
 const button=el('button','识别文字');button.id='ocrButton';$('exportTextButton').before(button);
 const dialog=el('dialog');dialog.id='ocrDialog';dialog.innerHTML='<div class="dialog-head"><h2>识别扫描件文字</h2><button id="ocrClose" aria-label="关闭">×</button></div><p>本地识别简体中文和英文，文档无需上传。完成后打开带文字层的新副本，原文保留。</p><label>识别范围<select id="ocrScope"><option value="current">当前页</option><option value="range">指定页码</option><option value="all">整份文档</option></select></label><label id="ocrRangeLabel" hidden>页码<input id="ocrRange" placeholder="例如 1-3,5"></label><p class="muted">已有文字层的页面自动跳过。模糊扫描、手写字和复杂排版可能识别不准；请核对结果。</p><p id="ocrProgress" role="status" aria-live="polite"></p><div class="dialog-actions"><button id="ocrStart" class="primary">开始识别</button><button id="ocrCancel" hidden>取消识别</button></div>';
 document.body.append(dialog);button.onclick=()=>{if(!state.book||state.opening)return;$('ocrProgress').textContent='';dialog.showModal();};$('ocrScope').onchange=()=>{$('ocrRangeLabel').hidden=$('ocrScope').value!=='range';};
 const cancel=()=>{ocrJob.cancel=true;ocrJob.abort?.(new Error('已取消'));$('ocrProgress').textContent='正在取消…';};$('ocrCancel').onclick=cancel;$('ocrClose').onclick=()=>ocrJob.running?cancel():dialog.close();dialog.addEventListener('cancel',e=>{if(ocrJob.running){e.preventDefault();cancel();}});
 $('ocrStart').onclick=async()=>{
  if(ocrJob.running)return;ocrJob.running=true;ocrJob.cancel=false;state.ocrRunning=true;$('ocrStart').disabled=true;$('ocrScope').disabled=true;$('ocrRange').disabled=true;$('ocrCancel').hidden=false;
  const status=text=>$('ocrProgress').textContent=text;
  const cancelled=new Promise((_,reject)=>ocrJob.abort=reject);cancelled.catch(()=>{});
  try{
   const app=state.app,book={...state.book},source=app.pdfDocument;
   const pages=$('ocrScope').value==='all'?Array.from({length:app.pagesCount},(_,i)=>i+1):$('ocrScope').value==='range'?ocrPages($('ocrRange').value,app.pagesCount):[app.page];
   const original=await saveCurrent(false);const results=[];let skipped=0;
   for(const n of pages){ocrJob.page=n;
    if(ocrJob.cancel)break;const page=await source.getPage(n),text=await page.getTextContent();
    if(text.items.some(i=>i.str?.trim())){skipped++;continue;}
    const key=source.fingerprints[0]+':'+n+':zh-en-v1';let result=await cachedOcr(key);
    if(!result){
     status(`正在加载本地识别组件 · 第 ${n} 页`);
     if(!window.Tesseract)await loadOcrScript('ocr/vendor/tesseract.min.js');
     if(!ocrJob.worker)ocrJob.worker=await Tesseract.createWorker(['chi_sim','eng'],1,{workerPath:new URL('ocr/vendor/worker.min.js',location.href).href,corePath:new URL('ocr/vendor/tesseract-core-lstm.wasm.js',location.href).href,langPath:new URL('ocr/lang',location.href).href,workerBlobURL:false,logger:m=>{if(m.progress!==undefined)status(`第 ${ocrJob.page} 页 · ${Math.round(m.progress*100)}%`);}});
     if(ocrJob.cancel)break;
     // Unrotated PDF coordinates keep the invisible text aligned on rotated pages.
     const viewport=page.getViewport({scale:Math.min(3,2200/Math.max(page.view[2]-page.view[0],page.view[3]-page.view[1])),rotation:0});
     const canvas=el('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:0}).promise;
     try{const recognized=await Promise.race([ocrJob.worker.recognize(canvas),cancelled]);result={width:canvas.width,height:canvas.height,lines:recognized.data.lines.map(l=>({text:l.text.trim(),bbox:l.bbox})).filter(l=>l.text)};}finally{canvas.width=canvas.height=0;}
     if(ocrJob.cancel)break;await cachedOcr(key,result);
    }
    if(result.lines.length)results.push({n,result,view:page.view});
   }
   if(ocrJob.cancel){status('已取消，未修改文档；已完成页面的识别结果已缓存。');return;}
   if(!results.length){status(skipped===pages.length?'所选页面已有文字层，无需识别。':'没有识别到文字，请检查扫描清晰度。');return;}
   status('正在生成可选择、可搜索的文字层…');
   if(!window.fontkit)await loadOcrScript('ocr/vendor/fontkit.min.js');
   const {PDFDocument}=await getPdfLib(),pdf=await PDFDocument.load(original);pdf.registerFontkit(window.fontkit);
   const font=await pdf.embedFont(await (await fetch('ocr/vendor/NotoSansSC.ttf')).arrayBuffer(),{subset:true});
   for(const {n,result,view} of results){const p=pdf.getPage(n-1),sx=(view[2]-view[0])/result.width,sy=(view[3]-view[1])/result.height;
    for(const line of result.lines){const b=line.bbox,size=Math.max(1,(b.y1-b.y0)*sy),width=font.widthOfTextAtSize(line.text,size),wanted=(b.x1-b.x0)*sx;
     // A text matrix fits each recognized line to its image bounding rectangle.
     const lib=await getPdfLib();p.pushOperators(lib.pushGraphicsState(),lib.concatTransformationMatrix(width?Math.max(.01,wanted/width):1,0,0,1,view[0]+b.x0*sx,view[3]-b.y1*sy+size*.12));
     p.drawText(line.text,{x:0,y:0,size,font,opacity:0});p.pushOperators(lib.popGraphicsState());
    }
   }
   if(ocrJob.cancel){status('已取消，未修改文档。');return;}
   const data=await pdf.save();if(ocrJob.cancel)return;
   const copy={...book,id:crypto.randomUUID(),name:baseName(book.name)+'-已识别.pdf',size:data.length,lastOpened:Date.now()};await putBook(copy,data);await renderLibrary();await openBook(copy.id);
   status(`已完成 ${results.length} 页，跳过 ${skipped} 页。副本已保存，可选字、搜索、批注；使用“导出 PDF”保存到文件。`);
  }catch(e){status(ocrJob.cancel?'已取消，未修改原文。':`识别失败：${e.message}`);console.error(e);}
  finally{if(ocrJob.worker){await ocrJob.worker.terminate().catch(()=>{});ocrJob.worker=null;}ocrJob.abort=null;ocrJob.running=false;state.ocrRunning=false;$('ocrStart').disabled=false;$('ocrScope').disabled=false;$('ocrRange').disabled=false;$('ocrCancel').hidden=true;}
 };
});
document.addEventListener('webviewerloaded',async event=>{
 const app=event.detail.source.PDFViewerApplication;await app.initializedPromise;
 const check=async()=>{if(!app.pdfDocument||state.ocrRunning)return;try{const source=app.pdfDocument,n=app.page,page=await source.getPage(n),text=await page.getTextContent();if(app.pdfDocument===source&&app.page===n){const empty=!text.items.some(i=>i.str?.trim());$('ocrHint').hidden=!empty;$('ocrButton').title=empty?'此页可能是扫描件，可点击识别文字':'识别扫描件文字';}}catch{}};
 app.eventBus.on('pagechanging',check);app.eventBus.on('pagesinit',check);
});
