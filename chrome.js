'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const paths={minimize:'M3 7h8',maximize:'M3 3h8v8H3Z',close:'m3 3 8 8M11 3l-8 8'};
 const max=document.querySelector('[data-window="maximize"]');
 for(const b of document.querySelectorAll('[data-window]')){b.innerHTML=`<svg viewBox="0 0 14 14" aria-hidden="true"><path d="${paths[b.dataset.window]}"/></svg>`;b.title=b.getAttribute('aria-label');}
 const sync=()=>{if(!max)return;const expanded=window.paperboatDesktop?window.paperboatWindowMaximized===true:innerWidth>=screen.availWidth-4&&innerHeight>=screen.availHeight-4;max.querySelector('path').setAttribute('d',expanded?'M5 3V1h8v8h-2M2 4h8v8H2Z':paths.maximize);max.title=expanded?'还原':'最大化';max.setAttribute('aria-label',max.title);};window.addEventListener('resize',sync);window.addEventListener('paperboat-window-state',sync);sync();if(window.paperboatDesktop)window.chrome.webview.postMessage('query-window-state');
 let saved=null;const active=()=>[...document.querySelectorAll('dialog[open]')].filter(d=>d.matches(':modal')).at(-1);
 const update=()=>{if(active()&&!saved){saved=[];document.documentElement.classList.add('paperboat-modal-lock');for(const d of [document,$('viewer')?.contentDocument].filter(Boolean)){for(const e of d.querySelectorAll('*')){if(!e.closest('dialog')&&(e.scrollHeight>e.clientHeight||e.scrollWidth>e.clientWidth)){saved.push([e,e.scrollTop,e.scrollLeft,e.style.overflow]);e.style.overflow='hidden';}}}}else if(!active()&&saved){for(const [e,y,x,overflow] of saved){e.style.overflow=overflow;e.scrollTop=y;e.scrollLeft=x;}saved=null;document.documentElement.classList.remove('paperboat-modal-lock');}};
 const show=HTMLDialogElement.prototype.showModal,close=HTMLDialogElement.prototype.close;
 HTMLDialogElement.prototype.showModal=function(){show.call(this);update();};HTMLDialogElement.prototype.close=function(...args){close.apply(this,args);update();};
 new MutationObserver(update).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 const protect=d=>{d.addEventListener('wheel',e=>{const top=active();if(top&&!top.contains(e.target))e.preventDefault();},{capture:true,passive:false});d.addEventListener('touchmove',e=>{const top=active();if(top&&!top.contains(e.target))e.preventDefault();},{capture:true,passive:false});d.addEventListener('keydown',e=>{const top=active();if(top&&!top.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();top.querySelector('button,input,select,textarea')?.focus();}},true);};protect(document);$('viewer').addEventListener('load',()=>{try{protect($('viewer').contentDocument);}catch{}});
});

