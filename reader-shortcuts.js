'use strict';
const toolKeys={v:['paperboatSelect','鼠标选择'],h:[null,'手形拖动'],e:['paperboatEraser','橡皮擦'],c:['editorCommentButton','文字批注'],m:['editorHighlightButton','高亮'],t:['editorFreeTextButton','添加文字'],b:['editorInkButton','画笔'],i:['editorStampButton','插入图片']};
const defaults=Object.fromEntries([...Object.keys(toolKeys).map(k=>[k,k.toUpperCase()]),['open','Ctrl+O'],['save','Ctrl+S'],['find','Ctrl+F'],['print','Ctrl+P'],['undo','Ctrl+Z'],['redo','Ctrl+Shift+Z']]);
let bindings={...defaults};try{Object.assign(bindings,JSON.parse(localStorage.getItem('paperboat-keybindings')||'{}'));}catch{}
const keyName=e=>[e.ctrlKey||e.metaKey?'Ctrl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.key.length===1?e.key.toUpperCase():e.key].filter(Boolean).join('+');
let refreshTitles=()=>{};
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.id='shortcutsButton';button.textContent='快捷键';$('settingsButton').before(button);
 const dialog=document.createElement('dialog');dialog.id='shortcutsDialog';dialog.innerHTML='<form method="dialog"><div class="dialog-head"><h2>快捷键</h2><button aria-label="关闭">×</button></div><label>启用单键工具快捷键<input id="toolKeysEnabled" type="checkbox"></label><p class="muted">点击修改后按下新快捷键。Esc 取消录制。输入文字时不会切换工具。</p><div id="keyRows"></div><p id="keyStatus" role="status"></p><div style="display:flex;gap:12px;justify-content:flex-end"><button type="button" id="resetKeys">恢复默认</button><button type="button" id="saveKeys">保存</button></div></form>';document.body.append(dialog);
 const names={...Object.fromEntries(Object.entries(toolKeys).map(([k,v])=>[k,v[1]])),open:'打开 PDF',save:'导出 PDF',find:'文内搜索',print:'打印',undo:'撤销',redo:'重做'};let draft,recording;
 const draw=()=>{$('keyRows').replaceChildren();for(const [title,ids] of [['批注工具',Object.keys(toolKeys)],['阅读操作',['open','save','find','print']],['编辑操作',['undo','redo']]]){const h=document.createElement('h3');h.textContent=title;$('keyRows').append(h);for(const id of ids){const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:32px;margin:8px 0';const label=document.createElement('span');label.textContent=names[id];const b=document.createElement('button');b.type='button';b.textContent=draft[id]+' · 修改';b.onclick=()=>{recording=id;b.textContent='请按下快捷键…';};row.append(label,b);$('keyRows').append(row);}}};
 button.onclick=()=>{draft={...bindings};recording=null;$('keyStatus').textContent='';$('toolKeysEnabled').checked=localStorage.getItem('paperboat-tool-keys')!=='off';draw();dialog.showModal();};
 dialog.addEventListener('keydown',e=>{if(!recording)return;e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape'){recording=null;draw();return;}if(['Control','Alt','Shift','Meta'].includes(e.key))return;const value=keyName(e);if(!/^[A-Z0-9]$/.test(value)&&!value.includes('+')){$('keyStatus').textContent='请使用字母、数字或带修饰键的组合。';return;}if(['Alt+F4','Ctrl+Alt+Delete','Ctrl+W','Ctrl+R','Ctrl+L','Ctrl+Tab'].includes(value)||e.metaKey){$('keyStatus').textContent='该组合由系统或浏览器使用，请换一个。';return;}const conflict=Object.keys(draft).find(k=>k!==recording&&draft[k]===value);if(conflict){$('keyStatus').textContent='与“'+names[conflict]+'”冲突，请换一个。';return;}draft[recording]=value;recording=null;$('keyStatus').textContent='已修改，点击保存后生效。';draw();},true);
 $('resetKeys').onclick=()=>{draft={...defaults};recording=null;draw();$('keyStatus').textContent='已恢复默认，点击保存后生效。';};$('saveKeys').onclick=()=>{bindings={...draft};localStorage.setItem('paperboat-keybindings',JSON.stringify(bindings));localStorage.setItem('paperboat-tool-keys',$('toolKeysEnabled').checked?'on':'off');refreshTitles();dialog.close();};
 $('settingsDialog').querySelectorAll('p').forEach(p=>{if(p.textContent.startsWith('快捷键：'))p.remove();});
});
document.addEventListener('webviewerloaded',async event=>{
 const win=event.detail.source;if(win!==$('viewer').contentWindow)return;const app=win.PDFViewerApplication;await app.initializedPromise;const doc=win.document;
 refreshTitles=()=>{for(const [id,[target,name]] of Object.entries(toolKeys)){const b=doc.getElementById(target);if(b)b.title=name+' · '+bindings[id];}};setTimeout(refreshTitles,300);
 const handle=e=>{if(document.querySelector('dialog[open]')||doc.querySelector('dialog[open]')||e.isComposing||e.keyCode===229||e.repeat)return;if(e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
 
 const value=keyName(e),id=e.key==='Escape'?'v':Object.keys(bindings).find(k=>bindings[k]===value);if(!id||(state.workspace!=='reader'&&id!=='open'))return;if(toolKeys[id]&&value.length===1&&localStorage.getItem('paperboat-tool-keys')==='off')return;e.preventDefault();e.stopImmediatePropagation();
 if(e.key==='Escape')doc.dispatchEvent(new win.CustomEvent('paperboat-cancel-selection'));
 if(toolKeys[id]){if(id==='h'){doc.getElementById('paperboatSelect')?.click();app.eventBus.dispatch('switchcursortool',{source:win,tool:1});}else doc.getElementById(toolKeys[id][0])?.click();return;}
 if(id==='open')$('fileInput').click();if(id==='save')saveCurrent(true).catch(report);if(id==='find')app.findBar.open();if(id==='print')app.triggerPrinting();if(id==='undo'||id==='redo')app.eventBus.dispatch('editingaction',{source:win,name:id});};win.addEventListener('keydown',handle,true);window.addEventListener('keydown',handle,true);
});


