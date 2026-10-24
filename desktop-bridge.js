'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 if(!window.paperboatDesktop)return;
 document.body.classList.add('desktop-host');
 const controls=document.querySelector('.window-controls'),bar=document.querySelector('.titlebar');controls.hidden=false;
 const send=action=>window.chrome.webview.postMessage(action);
 document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>send(b.dataset.window));
 if(window.paperboatNativeDrag){
  const style=document.createElement('style');
  style.textContent='.desktop-host .titlebar .brand{justify-self:start;width:max-content;max-width:100%}.desktop-host .titlebar .window-controls:not([hidden]){display:inline-flex!important}.desktop-host .titlebar{app-region:drag;-webkit-app-region:drag;user-select:none}.desktop-host .titlebar button,.desktop-host .titlebar a,.desktop-host .titlebar input,.desktop-host .titlebar select{app-region:no-drag;-webkit-app-region:no-drag}';
  document.head.appendChild(style);
 } else {
 let press;
 bar.addEventListener('pointerdown',e=>{if(e.button===0&&!e.target.closest('button,a,input,select')){press={x:e.clientX,y:e.clientY,id:e.pointerId};bar.setPointerCapture(e.pointerId);e.preventDefault();}});
 bar.addEventListener('pointermove',e=>{if(!press||press.id!==e.pointerId)return;if(Math.hypot(e.clientX-press.x,e.clientY-press.y)<6)return;const id=press.id;press=null;if(bar.hasPointerCapture(id))bar.releasePointerCapture(id);send('drag');});
 const release=()=>{press=null;};bar.addEventListener('pointerup',release);bar.addEventListener('pointercancel',release);bar.addEventListener('lostpointercapture',release);
 bar.addEventListener('dblclick',e=>{if(!e.target.closest('button,a,input,select'))send('maximize');});
 }
 window.paperboatCanClose=()=>!state.ocrRunning&&!state.saving&&!state.opening&&!state.app?._annotationStorageModified&&!state.organizer?.dirty;
});
document.addEventListener('DOMContentLoaded',()=>{if(!window.paperboatDesktop)return;const section=document.createElement('section');section.innerHTML='<h3>默认 PDF 阅读器</h3><p>通过 Windows 设置选择纸舟，PDF 文件将使用纸舟文档图标。</p><button type="button">设置默认 PDF 阅读器</button>';section.querySelector('button').onclick=()=>window.chrome.webview.postMessage('default-pdf');document.getElementById('settingsDialog').querySelector('form').append(section);});
document.addEventListener('DOMContentLoaded',()=>{if(!window.paperboatDesktop)return;const status=document.createElement('p');status.className='muted';status.textContent='正在检查默认应用…';document.getElementById('settingsDialog').querySelector('form').append(status);window.addEventListener('paperboat-default-pdf',e=>status.textContent=e.detail?'纸舟已是默认 PDF 阅读器。':'纸舟尚未设为默认 PDF 阅读器。');const query=()=>window.chrome.webview.postMessage('query-default-pdf');window.addEventListener('focus',query);document.getElementById('settingsButton').addEventListener('click',query);query();});
