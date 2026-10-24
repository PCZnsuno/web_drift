'use strict';
// Native dialog supplies focus trapping, Escape semantics, and focus restoration.
function askPaperboat(message,value){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog'),form=document.createElement('form');form.method='dialog';
    const heading=el('h2',value===undefined?'请确认操作':'编辑名称');heading.id='paperboat-question-title';dialog.setAttribute('aria-labelledby',heading.id);
    const head=el('div',undefined,'dialog-head');head.append(heading);
    const description=el('p',message);description.id='paperboat-question-description';dialog.setAttribute('aria-describedby',description.id);
    const input=el('input');input.type='text';input.value=value||'';input.setAttribute('aria-label',message);input.maxLength=200;
    const actions=el('div',undefined,'dialog-actions'),cancel=el('button','取消'),ok=el('button','确认','primary');cancel.value='cancel';ok.value='ok';
    actions.append(cancel,ok);form.append(head,description);if(value!==undefined)form.append(input);form.append(actions);dialog.append(form);document.body.append(dialog);
    dialog.addEventListener('close',()=>{resolve(dialog.returnValue==='ok'?(value===undefined?true:input.value):(value===undefined?false:null));dialog.remove();},{once:true});
    dialog.showModal();if(value!==undefined){input.focus();input.select();}else cancel.focus();
  });
}
