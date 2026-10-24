'use strict';
const $ = id => document.getElementById(id);
const state = { book: null, app: null, filter: 'all', workspace: 'library', opening: false, saving: null, theme: 'light', autoSave: true, organizer: null };
let db, toastTimer, progressTimer, textFilename = '纸舟.txt';
const themes = { light: '柔白', warm: '暖纸', sage: '浅绿', dark: '夜读' };
const bytesLabel = n => n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const baseName = name => name.replace(/\.pdf$/i, '');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const click = (id, action) => $(id).addEventListener('click', () => Promise.resolve().then(action).catch(report));
function report(error) { console.error(error); toast(error?.message || '操作失败，请重试。', 6500); }
function toast(message, ms = 3200) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), ms); }
async function busy(label, action) { if (!$('busy').hidden) return; $('busyLabel').textContent = label; $('busy').hidden = false; try { return await action(); } finally { $('busy').hidden = true; } }
function download(data, name, type = 'application/pdf') { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function openDatabase() { return new Promise((resolve, reject) => { const r = indexedDB.open('paperboat-v2', 1); r.onupgradeneeded = () => { r.result.createObjectStore('books', { keyPath: 'id' }); r.result.createObjectStore('files'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function read(store, key) { return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function allBooks() { return new Promise((resolve, reject) => { const r = db.transaction('books').objectStore('books').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function putBook(book, data) { return new Promise((resolve, reject) => { const tx = db.transaction(data ? ['books', 'files'] : ['books'], 'readwrite'); tx.objectStore('books').put(structuredClone(book)); if (data) tx.objectStore('files').put(data, book.id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('本机存储失败，请导出文件备份。')); }); }
function deleteBook(id) { return new Promise((resolve, reject) => { const tx = db.transaction(['books', 'files'], 'readwrite'); tx.objectStore('books').delete(id); tx.objectStore('files').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
function setTheme(theme) {
  state.theme = themes[theme] ? theme : 'light'; document.body.dataset.theme = state.theme; $('themeSelect').value = state.theme;
  $('themeButton').querySelector('span').textContent = themes[state.theme];
  if (state.app) $('viewer').contentDocument.documentElement.dataset.paperboatTheme = state.theme;
  localStorage.setItem('paperboat-theme', state.theme);
}
async function renderLibrary() {
  const books = (await allBooks()).sort((a, b) => b.lastOpened - a.lastOpened), term = $('librarySearch').value.toLowerCase().trim();
  $('fileCount').textContent = books.length;
  const filtered = books.filter(b => (state.filter !== 'favorites' || b.favorite) && b.name.toLowerCase().includes(term));
  $('documents').replaceChildren(); $('empty').hidden = filtered.length > 0;
  if (!filtered.length) { $('empty').querySelector('h3').textContent = books.length ? '没有找到符合条件的文档' : '书架从第一份文档开始'; }
  for (const book of filtered) {
    const card = el('article', undefined, 'document-card'), open = el('button', undefined, 'document-open'), preview = el('div', undefined, 'preview');
    open.title = `打开 ${book.name}`;
    if (book.thumb) { const image = el('img'); image.src = book.thumb; image.alt = ''; preview.append(image); } else preview.append(el('span', 'PDF', 'placeholder'));
    const info = el('div', undefined, 'document-info'); info.append(el('b', book.name), el('small', `${book.pages ? `${book.page || 1} / ${book.pages} 页 · ` : ''}${bytesLabel(book.size)}`));
    open.append(preview, info); open.onclick = () => openBook(book.id).catch(report);
    const actions = el('div', undefined, 'card-actions'), fav = el('button', book.favorite ? '★ 已收藏' : '☆ 收藏'), rename = el('button', '重命名'), remove = el('button', '移除');
    fav.onclick = async () => { try { book.favorite = !book.favorite; if (state.book?.id === book.id) state.book.favorite = book.favorite; await putBook(book); await renderLibrary(); } catch(e) { report(e); } };
    rename.onclick = async () => { const name = await askPaperboat('文件名称', book.name); if (!name?.trim()) return; book.name = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); if (!/\.pdf$/i.test(book.name)) book.name += '.pdf'; try { if (state.book?.id === book.id) { state.book.name = book.name; $('documentName').textContent = book.name; } await putBook(book); await renderLibrary(); } catch(e) { report(e); } };
    remove.onclick = async () => { if (!await askPaperboat(`从本机书架移除「${book.name}」？这会删除纸舟内的副本和页签，不删除已导出的文件。`)) return; try { if (state.book?.id === book.id) { await saveCurrent(false); await state.app.close(); state.book = null; state.organizer = null; document.querySelectorAll('[data-workspace]:not([data-workspace=library])').forEach(b => b.disabled = true); } await deleteBook(book.id); await renderLibrary(); } catch(e) { report(e); } };
    actions.append(fav, rename, remove); card.append(open, actions); $('documents').append(card);
  }
}
async function workspace(name) {
  if (name !== 'library' && !state.book) return;
  if (state.opening) return;
  if (name === 'organizer' && !state.organizer) await busy('正在准备页面…', initOrganizer);
  if (state.workspace === 'organizer' && name !== 'organizer' && state.organizer?.dirty) {
    if (!await askPaperboat('尚未应用页面整理。离开会放弃这些整理操作，原文档不会改变。')) return;
    state.organizer = null;
  }
  state.workspace = name; $('selectionTools').hidden = true;
  document.querySelectorAll('.workspace').forEach(e => e.hidden = e.id !== name);
  document.querySelectorAll('[data-workspace]').forEach(e => e.classList.toggle('selected', e.dataset.workspace === name));
  if (name === 'library') { await saveCurrent(false); await renderLibrary(); }
  if (name === 'reader') requestAnimationFrame(() => state.app?.pdfViewer.update());
}
let viewerReady;
function ensureViewer() {
  if (viewerReady) return viewerReady;
  viewerReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('阅读引擎未能启动。请通过“启动纸舟.cmd”运行，并使用最新版本 Edge 或 Chrome。')), 20000);
    document.addEventListener('webviewerloaded', async function loaded(event) {
      if (event.detail.source !== $('viewer').contentWindow) return;
      document.removeEventListener('webviewerloaded', loaded);
      try {
        const win = event.detail.source, options = win.PDFViewerApplicationOptions;
        options.setAll({ defaultUrl: '', disablePreferences: true, localeProperties: { lang: 'zh-CN' }, enableScripting: false, enablePermissions: true, enableSignatureEditor: true, enableComment: true, enableHighlightFloatingButton: true, enableAltText: false, enableAltTextModelDownload: false, enableGuessAltText: false, enableNewAltTextWhenAddingImage: false, enableSplitMerge: false, enableMerge: false, externalLinkTarget: 2 });
        const app = win.PDFViewerApplication; await app.initializedPromise; state.app = app; clearTimeout(timeout);
        app.downloadOrSave = () => saveCurrent(true).catch(report);
        app.save = () => saveCurrent(true).catch(report);
        app.download = () => saveCurrent(true).catch(report);
        app.eventBus.on('pagechanging', ({ pageNumber }) => {
          if (!state.book || state.opening) return;
          state.book.page = pageNumber; const id = state.book.id;
          clearTimeout(progressTimer); progressTimer = setTimeout(() => { if (state.book?.id === id) putBook(state.book).catch(report); }, 500);
        });
        app.eventBus.on('documenterror', ({ message }) => { $('readerLoading').hidden = true; toast(message || '文件无法打开。', 6000); });
        app.eventBus.on('scalechanging', ({ scale }) => updateZoomUI(scale));
        
        win.document.addEventListener('selectionchange', captureSelection);
        win.addEventListener('dragover', e => e.preventDefault());
        win.addEventListener('drop', e => { e.preventDefault(); e.stopImmediatePropagation(); importFiles(e.dataTransfer.files).catch(report); }, true);
        setTheme(state.theme); resolve(app);
      } catch(e) { clearTimeout(timeout); reject(e); }
    });
    $('viewer').src = 'engine/web/viewer.html?file=';
  });
  return viewerReady;
}
async function importFiles(files) {
  if (state.opening) return toast('请等待当前文件打开。');
  const list = [...files]; if (!list.length) return;
  if (state.organizer?.dirty && !await askPaperboat('导入文档会放弃尚未应用的页面整理，继续吗？')) return;
  await saveCurrent(false);
  let first;
  for (const file of list) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) { toast(`「${file.name}」不是可识别的 PDF 文件。`, 5000); continue; }
    const book = { id: crypto.randomUUID(), name: file.name, size: data.length, lastOpened: Date.now(), page: 1, bookmarks: [], favorite: false };
    await putBook(book, data); first ||= book.id;
  }
  state.organizer = null; await renderLibrary(); if (first) await openBook(first);
}
async function openBook(id) {
  if (state.opening) return;
  await saveCurrent(false); clearTimeout(progressTimer);
  const book = await read('books', id), data = await read('files', id);
  if (!book || !data) throw new Error('本机副本不存在，请重新导入原文件。');
  state.book = book; state.organizer = null;
  document.querySelectorAll('[data-workspace]').forEach(b => b.disabled = false);
  await workspace('reader'); state.opening = true; $('readerLoading').hidden = false;
  $('documentName').textContent = book.name; $('saveStatus').textContent = '正在打开…';
  try {
    const app = await ensureViewer(); $('readerLoading').hidden = true;
    const loaded = new Promise(resolve => app.eventBus.on('pagesinit', resolve, { once: true }));
    await app.open({ data: data.slice(), filename: book.name }); await loaded;
    app.pdfViewer.currentScaleValue = 'auto'; app.page = Math.min(book.page || 1, app.pagesCount);
    requestAnimationFrame(() => { if (state.app === app) updateZoomUI(app.pdfViewer.currentScale); });
    book.pages = app.pagesCount; book.lastOpened = Date.now(); book.page = app.page;
    app.setTitle(book.name); document.title = `${book.name} · 纸舟`;
    if (!book.thumb) { const page = await app.pdfDocument.getPage(1), vp = page.getViewport({ scale: 0.25 }), canvas = el('canvas'); canvas.width = vp.width; canvas.height = vp.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise; book.thumb = canvas.toDataURL('image/jpeg', .65); }
    await putBook(book); $('saveStatus').textContent = '本机副本已保存';
    $('undoMarkupButton').hidden = !state.markupActions?.some(a => a.bookId === book.id);
  } catch(e) { $('saveStatus').textContent = '打开失败，请检查文件或密码'; throw e; }
  finally { state.opening = false; $('readerLoading').hidden = true; if (state.app?.pdfDocument) updateZoomUI(state.app.pdfViewer.currentScale); }
}
async function saveCurrent(exportFile = false) {
  if (!state.book || !state.app?.pdfDocument || state.opening) return;
  if (state.saving) { await state.saving; if (exportFile) return saveCurrent(true); return; }
  const book = state.book, app = state.app;
  state.saving = (async () => {
    app.pdfViewer._layerProperties.annotationEditorUIManager?.endCurrentEditing();
    $('saveStatus').textContent = '正在保存…';
    try {
      const data = new Uint8Array(app.pdfDocument.annotationStorage.size ? await app.pdfDocument.saveDocument() : await app.pdfDocument.getData());
      book.size = data.length; book.page = app.page; await putBook(book, data);
      app.setTitle(book.name);
      $('saveStatus').textContent = '本机副本已保存';
      if (exportFile) { download(data, book.name); toast('已导出含批注和表单内容的 PDF。'); }
      return data;
    } catch(e) { $('saveStatus').textContent = '保存失败，请勿关闭窗口'; throw e; }
  })();
  try { return await state.saving; } finally { state.saving = null; }
}
function textDialog(title, text, name, description = '') { $('textTitle').textContent = title; $('textOutput').value = text; $('textDescription').textContent = description; textFilename = name; $('textDialog').showModal(); }
async function exportText() { if (!state.app?.pdfDocument) return; await busy('正在提取文档文字…', async () => { const chunks = []; for (let i = 1; i <= state.app.pagesCount; i++) { const content = await (await state.app.pdfDocument.getPage(i)).getTextContent(); chunks.push(`—— 第 ${i} 页 ——\n${content.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('')}`); } textDialog('文档文字', chunks.join('\n\n'), `${baseName(state.book.name)}.txt`, '文字按 PDF 内部顺序提取，双栏等复杂排版可能需要整理。扫描页没有文字层，无法提取文字。'); }); }
async function exportNotes() { await busy('正在整理批注…', async () => { const bytes = await saveCurrent(false), task = $('viewer').contentWindow.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }), doc = await task.promise; try { const lines = [`# ${state.book.name} · 批注`]; for (let n = 1; n <= doc.numPages; n++) { const annotations = await (await doc.getPage(n)).getAnnotations(); for (const a of annotations) { if (a.subtype === 'Link' || a.subtype === 'Widget' || a.subtype === 'Popup') continue; lines.push(`\n## 第 ${n} 页 · ${a.subtype || '批注'}\n${a.contentsObj?.str || a.contents || '（此批注为视觉标记，无文字内容；请查看 PDF 原页。）'}`); } } if (lines.length === 1) lines.push('\n暂无可导出的批注。'); textDialog('批注汇总', lines.join('\n'), `${baseName(state.book.name)}-批注.md`, '自由绘图、签名与高亮的视觉内容仍保存在 PDF 中。'); } finally { await task.destroy(); } }); }
async function exportImage() { await busy('正在生成当前页图片…', async () => { const bytes = await saveCurrent(false), task = $('viewer').contentWindow.pdfjsLib.getDocument({ data: bytes.slice(), cMapUrl: `${location.origin}/engine/web/cmaps/`, cMapPacked: true, standardFontDataUrl: `${location.origin}/engine/web/standard_fonts/`, wasmUrl: `${location.origin}/engine/web/wasm/` }); try { const doc = await task.promise, page = await doc.getPage(state.app.page), viewport = page.getViewport({ scale: 1.5, rotation: state.app.pdfViewer.pagesRotation + page.rotate }), canvas = el('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: 1 }).promise; const blob = await new Promise(resolve => canvas.toBlob(resolve)); download(blob, `${baseName(state.book.name)}-第${state.app.page}页.png`); toast('已导出包含已保存批注的页面图片。'); } finally { await task.destroy(); } }); }
async function addBookmark() { const page = state.app.page; if (state.book.bookmarks.some(b => b.page === page)) return toast('这一页已经在页签中。'); const title = await askPaperboat('页签名称', `第 ${page} 页`); if (title === null) return; state.book.bookmarks.push({ page, title: title.trim() || `第 ${page} 页` }); await putBook(state.book); toast('已添加页签。'); }
function showBookmarks() { $('bookmarkList').replaceChildren(); for (const b of [...state.book.bookmarks].sort((a,b) => a.page - b.page)) { const row = el('div', undefined, 'bookmark-row'), jump = el('button', `${b.title} · 第 ${b.page} 页`), remove = el('button', '移除'); jump.onclick = () => { state.app.page = b.page; $('bookmarksDialog').close(); }; remove.onclick = () => { state.book.bookmarks = state.book.bookmarks.filter(x => x.page !== b.page); putBook(state.book).then(() => { $('bookmarksDialog').close(); showBookmarks(); }).catch(report); }; row.append(jump, remove); $('bookmarkList').append(row); } if (!state.book.bookmarks.length) $('bookmarkList').append(el('p', '尚无页签。点击“＋ 页签”收藏当前页。', 'muted')); $('bookmarksDialog').showModal(); }
let pdfLibPromise;
function getPdfLib() { return pdfLibPromise ||= new Promise((resolve, reject) => { const s = el('script'); s.src = 'pdf-lib.min.js'; s.onload = () => resolve(window.PDFLib); s.onerror = () => reject(new Error('页面处理组件加载失败。')); document.head.append(s); }); }
function captureSelection() {
  const win = $('viewer').contentWindow, selection = win.getSelection();
  $('selectionTools').hidden = true;
  if (!selection?.rangeCount || !selection.toString().trim() || state.workspace !== 'reader') return;
  if (!selection.anchorNode?.parentElement?.closest('.textLayer')) return;
  const range = selection.getRangeAt(0), groups = [];
  for (const pageElement of win.document.querySelectorAll('.page')) {
    const pageNumber = Number(pageElement.dataset.pageNumber), box = pageElement.getBoundingClientRect(), view = state.app.pdfViewer.getPageView(pageNumber - 1), quads = [], seen = new Set();
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1 || r.height > 90 || r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right) continue;
      const left = Math.max(r.left,box.left)-box.left, top = Math.max(r.top,box.top)-box.top, right = Math.min(r.right,box.right)-box.left, bottom = Math.min(r.bottom,box.bottom)-box.top;
      const key = [left,top,right,bottom].map(n=>Math.round(n)).join(',');
      if (seen.has(key)) continue; seen.add(key);
      quads.push(...view.viewport.convertToPdfPoint(left,top), ...view.viewport.convertToPdfPoint(right,top), ...view.viewport.convertToPdfPoint(left,bottom), ...view.viewport.convertToPdfPoint(right,bottom));
    }
    if (quads.length) groups.push({ pageNumber, quads });
  }
  if (groups.length) { state.selection = { text: selection.toString(), groups, bookId: state.book.id }; $('selectionTools').hidden = false; }
}
async function addTextMarkup(subtype) {
  const selection = state.selection;
  if (!selection || selection.bookId !== state.book?.id) return toast('请先在 PDF 中选择文字。');
  await busy('正在保存文字标记…', async () => {
    const bytes = await saveCurrent(false), { PDFDocument, PDFName, PDFHexString } = await getPdfLib();
    let doc; try { doc = await PDFDocument.load(bytes); } catch { throw new Error('受保护的 PDF 当前不能添加这类标记。'); }
    const names = [];
    for (const group of selection.groups) {
      const xs = group.quads.filter((_,i)=>i%2===0), ys = group.quads.filter((_,i)=>i%2===1), page = doc.getPage(group.pageNumber - 1);
      const name = crypto.randomUUID(); names.push(name);
      const annotation = doc.context.obj({ Type:'Annot', Subtype:subtype, Rect:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)], QuadPoints:group.quads, C:[.28,.49,.39], F:4, T:PDFHexString.fromText('纸舟'), Contents:PDFHexString.fromText(selection.text), NM:PDFHexString.fromText(name) });
      let annots = page.node.Annots(); if (!annots) { annots = doc.context.obj([]); page.node.set(PDFName.of('Annots'), annots); } annots.push(doc.context.register(annotation));
    }
    const data = await doc.save(), book = state.book;
    clearTimeout(progressTimer); await state.app.close(); book.size = data.length; await putBook(book,data); (state.markupActions ||= []).push({ bookId: book.id, names }); $('selectionTools').hidden = true; state.selection = null; await openBook(book.id); toast('文字标记已保存到本机副本。');
  });
}
async function undoTextMarkup() {
  const index = state.markupActions?.findLastIndex(a => a.bookId === state.book.id);
  if (index === undefined || index < 0) return;
  await busy('正在撤销线标记…', async () => {
    const bytes = await saveCurrent(false), { PDFDocument, PDFName } = await getPdfLib(), doc = await PDFDocument.load(bytes), action = state.markupActions[index];
    for (const page of doc.getPages()) {
      const annots = page.node.Annots(); if (!annots) continue;
      for (let i = annots.size() - 1; i >= 0; i--) {
        const annotation = doc.context.lookup(annots.get(i)), name = annotation.get(PDFName.of('NM'));
        if (name?.decodeText && action.names.includes(name.decodeText())) annots.remove(i);
      }
    }
    const data = await doc.save(), book = state.book; clearTimeout(progressTimer); await state.app.close(); await putBook(book, data); state.markupActions.splice(index, 1); await openBook(book.id);
  });
}
async function initOrganizer() {
  const data = await saveCurrent(false), { PDFDocument } = await getPdfLib();
  let doc; try { doc = await PDFDocument.load(data); } catch { throw new Error('此文件可能有密码保护或结构不受支持，当前无法整理；仍可在阅读器中查看。'); }
  state.organizer = { sources: new Map([['main', doc]]), pages: doc.getPages().map((p, i) => ({ key: crypto.randomUUID(), source: 'main', index: i, rotation: p.getRotation().angle, selected: false })), history: [], dirty: false, renderToken: 0 };
  renderPages();
}
function rememberPages() { const org = state.organizer; org.history.push(structuredClone(org.pages)); if (org.history.length > 30) org.history.shift(); org.dirty = true; }
function selectedPages() { const pages = state.organizer.pages.filter(p => p.selected); if (!pages.length) { toast('请先勾选页面。'); return null; } return pages; }
function renderPages() {
  const org = state.organizer, token = ++org.renderToken;
  org.thumbCache ||= new Map();
  for(const tile of $('pageGrid').children){const canvas=tile.querySelector('canvas');if(canvas&&tile.dataset.thumbKey)org.thumbCache.set(tile.dataset.thumbKey,canvas);}
  $('pageGrid').replaceChildren();
  $('pageCount').textContent = `${org.pages.length} 页 · 已选 ${org.pages.filter(p => p.selected).length} 页`;
  $('undoPages').disabled = !org.history.length;
  const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) { observer.unobserve(entry.target); const p = org.pages.find(p => p.key === entry.target.dataset.key); if (p?.source === 'main') renderThumb(p, entry.target, token).catch(console.warn); } } });
  for (const [i,p] of org.pages.entries()) {
    const tile = el('label', undefined, `page-tile${p.selected ? ' checked' : ''}`); tile.dataset.key = p.key;
    const top = el('div', undefined, 'page-number'), check = el('input'); check.type = 'checkbox'; check.checked = p.selected; check.setAttribute('aria-label', `选择第 ${i + 1} 页`);
    top.append(el('span', `第 ${i + 1} 页`), check); const image = el('div', p.source === 'blank' ? '空白页' : p.source !== 'main' ? `合并页 ${p.index + 1}` : '', 'page-thumb');
    tile.append(top, image, el('small', `${p.rotation}°`, 'muted'));
    tile.dataset.thumbKey=`${p.source}:${p.index}:${p.rotation}`;
    const cached=org.thumbCache.get(tile.dataset.thumbKey);if(cached){const copy=el('canvas');copy.width=cached.width;copy.height=cached.height;copy.getContext('2d').drawImage(cached,0,0);image.replaceChildren(copy);}
    check.onchange = () => { p.selected = check.checked; tile.classList.toggle('checked', p.selected); $('pageCount').textContent = `${org.pages.length} 页 · 已选 ${org.pages.filter(p => p.selected).length} 页`; };
    $('pageGrid').append(tile); if(!cached)observer.observe(tile);
  }
  org.observer?.disconnect(); org.observer = observer;
}
async function renderThumb(p, tile, token) { const doc = state.app.pdfDocument, page = await doc.getPage(p.index + 1), vp = page.getViewport({ scale: .22, rotation: p.rotation }), canvas = el('canvas'); canvas.width = vp.width; canvas.height = vp.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise; if (state.organizer?.renderToken === token && tile.isConnected) tile.querySelector('.page-thumb').replaceChildren(canvas); }
async function buildPages(pages) { const { PDFDocument, degrees } = await getPdfLib(), output = await PDFDocument.create(); for (const p of pages) { if (p.source === 'blank') { output.addPage([595.28, 841.89]).setRotation(degrees(p.rotation)); continue; } const [copied] = await output.copyPages(state.organizer.sources.get(p.source), [p.index]); copied.setRotation(degrees(p.rotation)); output.addPage(copied); } output.setProducer('Paperboat / pdf-lib'); return output.save(); }
async function applyPages() { if (!state.organizer.pages.length) return toast('至少保留一页。'); await busy('正在生成整理后的 PDF…', async () => { const data = await buildPages(state.organizer.pages), name = `${baseName(state.book.name)}-整理.pdf`; state.organizer.dirty = false; await importFiles([new File([data], name, { type: 'application/pdf' })]); }); }
async function mergeFiles(files) { if (!files.length) return; await busy('正在导入合并文档…', async () => { const { PDFDocument } = await getPdfLib(), org = state.organizer, additions = [], sources = []; for (const file of files) { const key = crypto.randomUUID(); let doc; try { doc = await PDFDocument.load(await file.arrayBuffer()); } catch { throw new Error(`「${file.name}」受保护或无法解析，未应用此次合并。`); } sources.push([key, doc]); additions.push(...doc.getPages().map((p, i) => ({ key: crypto.randomUUID(), source: key, index: i, rotation: p.getRotation().angle, selected: false }))); } rememberPages(); for (const [key, doc] of sources) org.sources.set(key, doc); org.pages.push(...additions); renderPages(); }); }
async function imagesToPdf(files) { if (!files.length) return; await busy('正在把图片转换为 PDF…', async () => { const { PDFDocument } = await getPdfLib(), doc = await PDFDocument.create(); for (const file of files) { const bytes = await file.arrayBuffer(), image = file.type === 'image/png' || /\.png$/i.test(file.name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes), scale = Math.min(1, 1440 / Math.max(image.width, image.height)), page = doc.addPage([image.width * scale, image.height * scale]); page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); } const data = await doc.save(); await importFiles([new File([data], '图片文档.pdf', { type: 'application/pdf' })]); }); }
const ZOOM_MIN = 25, ZOOM_MAX = 400;
const currentZoom = () => Math.round((state.app?.pdfViewer?.currentScale || 1) * 100);
const clampZoom = value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)));
function updateZoomUI(scale) {
  if (!$('zoomDock') || state.opening) return;
  const percent = clampZoom((Number.isFinite(scale) ? scale : 1) * 100);
  $('zoomDock').hidden = false;
  if (document.activeElement !== $('zoomInput')) $('zoomInput').value = percent;
  $('zoomSlider').value = percent;
}
function applyZoom(percent) {
  if (!state.app?.pdfDocument) return;
  const value = clampZoom(percent);
  closeZoomMenu();
  state.app.pdfViewer.currentScale = value / 100;
  updateZoomUI(value / 100);
}
function applyZoomPreset(preset) {
  if (!state.app?.pdfDocument) return;
  closeZoomMenu();
  state.app.pdfViewer.currentScaleValue = preset;
  requestAnimationFrame(() => updateZoomUI(state.app?.pdfViewer?.currentScale));
}
function closeZoomMenu() { $('zoomMenu').hidden = true; $('zoomMore').setAttribute('aria-expanded', 'false'); }
async function boot() {
  if (location.protocol === 'file:') { $('empty').querySelector('h3').textContent = '请双击「启动纸舟.cmd」'; $('empty').querySelector('p').textContent = 'PDF 引擎需要本地应用服务。直接双击 HTML 不能启动完整阅读器。'; $('openButton').disabled = true; return; }
  db = await openDatabase(); setTheme(localStorage.getItem('paperboat-theme') || 'light'); state.autoSave = localStorage.getItem('paperboat-autosave') !== 'false'; $('autoSave').checked = state.autoSave;
  document.querySelectorAll('[data-workspace]').forEach(b => b.onclick = () => workspace(b.dataset.workspace).catch(report));
  document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { state.filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('selected', x === b)); $('libraryTitle').textContent = { all: '全部文档', recent: '最近阅读', favorites: '我的收藏' }[state.filter]; renderLibrary().catch(report); });
  click('home', () => workspace('library')); click('openButton', () => $('fileInput').click()); click('dropZone', () => $('fileInput').click());
  $('dropZone').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); } };
  $('fileInput').onchange = async e => { try { await importFiles(e.target.files); } catch(err) { report(err); } finally { e.target.value = ''; } };
  $('mergeInput').onchange = async e => { try { await mergeFiles(e.target.files); } catch(err) { report(err); } finally { e.target.value = ''; } };
  $('imageInput').onchange = async e => { try { await imagesToPdf(e.target.files); } catch(err) { report(err); } finally { e.target.value = ''; } };
  document.addEventListener('dragover', e => { e.preventDefault(); $('dropZone').classList.add('dragging'); });
  document.addEventListener('dragleave', () => $('dropZone').classList.remove('dragging'));
  document.addEventListener('drop', e => { e.preventDefault(); $('dropZone').classList.remove('dragging'); importFiles(e.dataTransfer.files).catch(report); });
  $('librarySearch').oninput = () => renderLibrary().catch(report);
  click('themeButton', () => { const keys = Object.keys(themes); setTheme(keys[(keys.indexOf(state.theme) + 1) % keys.length]); });
  $('themeSelect').onchange = e => setTheme(e.target.value);
  $('autoSave').onchange = e => { state.autoSave = e.target.checked; localStorage.setItem('paperboat-autosave', state.autoSave); };
  click('settingsButton', async () => { const estimate = await navigator.storage?.estimate?.(); $('storageInfo').textContent = estimate ? `本机存储占用约 ${bytesLabel(estimate.usage || 0)}` : ''; $('settingsDialog').showModal(); });
  click('saveButton', () => saveCurrent(true)); click('bookmarkButton', addBookmark); click('bookmarksButton', showBookmarks); click('notesButton', exportNotes); click('exportTextButton', exportText); click('exportImageButton', exportImage);
  click('underlineButton', () => addTextMarkup('Underline')); click('strikeButton', () => addTextMarkup('StrikeOut'));
  click('undoMarkupButton', undoTextMarkup);
  click('closeText', () => $('textDialog').close()); click('closeBookmarks', () => $('bookmarksDialog').close());
  click('downloadText', () => download('\ufeff' + $('textOutput').value, textFilename, 'text/plain;charset=utf-8'));
  click('copyText', async () => { await navigator.clipboard.writeText($('textOutput').value); toast('文字已复制。'); });
  click('helpButton', () => window.open('guide.html', '_blank', 'noopener'));
  click('sampleButton', async () => { const response = await fetch('sample.pdf'); if (!response.ok) throw new Error('示例文档加载失败。'); await importFiles([new File([await response.arrayBuffer()], '纸舟功能体验.pdf', { type: 'application/pdf' })]); });
  click('imagePdfButton', () => $('imageInput').click());
  click('applyPages', applyPages); click('mergeFiles', () => $('mergeInput').click());
  click('selectAll', () => { const all = state.organizer.pages.every(p => p.selected); state.organizer.pages.forEach(p => p.selected = !all); renderPages(); });
  click('rotatePages', () => { const selected = selectedPages(); if (!selected) return; rememberPages(); selected.forEach(p => p.rotation = (p.rotation + 90) % 360); renderPages(); });
  click('duplicatePages', () => { if (!selectedPages()) return; rememberPages(); state.organizer.pages = state.organizer.pages.flatMap(p => p.selected ? [p, { ...p, key: crypto.randomUUID(), selected: false }] : [p]); renderPages(); });
  click('deletePages', () => { const selected = selectedPages(); if (!selected) return; if (selected.length === state.organizer.pages.length) return toast('至少保留一页。'); rememberPages(); state.organizer.pages = state.organizer.pages.filter(p => !p.selected); renderPages(); });
  click('insertBlank', () => { rememberPages(); const org = state.organizer, last = org.pages.findLastIndex(p => p.selected); org.pages.splice(last < 0 ? org.pages.length : last + 1, 0, { key: crypto.randomUUID(), source: 'blank', rotation: 0, selected: false }); renderPages(); });
  click('undoPages', () => { const org = state.organizer; if (org.history.length) { org.pages = org.history.pop(); org.dirty = org.history.length > 0; renderPages(); } });
  for (const [id, direction] of [['moveEarlier', -1], ['moveLater', 1]]) click(id, () => { if (!selectedPages()) return; rememberPages(); const pages = state.organizer.pages; if (direction === -1) { for (let i = 1; i < pages.length; i++) if (pages[i].selected && !pages[i-1].selected) [pages[i-1],pages[i]] = [pages[i],pages[i-1]]; } else { for (let i = pages.length-2; i >= 0; i--) if (pages[i].selected && !pages[i+1].selected) [pages[i+1],pages[i]] = [pages[i],pages[i+1]]; } renderPages(); });
  click('extractPages', async () => { const selected = selectedPages(); if (!selected) return; await busy('正在提取页面…', async () => download(await buildPages(selected), `${baseName(state.book.name)}-提取.pdf`)); });
  $('zoomOut').onclick = () => applyZoom(currentZoom() - 10);
  $('zoomIn').onclick = () => applyZoom(currentZoom() + 10);
  $('zoomSlider').oninput = e => applyZoom(Number(e.target.value));
  $('zoomInput').onchange = e => { const value = Number(e.target.value); if (Number.isFinite(value) && value > 0) applyZoom(value); else e.target.value = currentZoom(); };
  $('zoomInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { e.target.value = currentZoom(); e.target.blur(); closeZoomMenu(); } };
  $('zoomMore').onclick = e => { e.stopPropagation(); const opening = $('zoomMenu').hidden; $('zoomMenu').hidden = !opening; $('zoomMore').setAttribute('aria-expanded', String(opening)); };
  $('zoomMenu').onclick = e => { e.stopPropagation(); const preset = e.target.dataset.zoom, fixed = e.target.dataset.zoomPreset; if (preset) applyZoomPreset(preset); else if (fixed) applyZoom(Number(fixed)); };
  document.addEventListener('click', closeZoomMenu);
  click('backupAll', async () => { await saveCurrent(false); const books = await allBooks(); if (!books.length) return toast('书架中暂无文档。'); for (const book of books) download(await read('files', book.id), book.name); toast('已请求下载全部副本；浏览器可能要求允许多文件下载。'); });
  
  window.addEventListener('beforeunload', e => { if (state.saving || state.app?._annotationStorageModified || state.organizer?.dirty) { e.preventDefault(); e.returnValue = ''; } });
  setInterval(() => { if (state.app?._annotationStorageModified) { $('saveStatus').textContent = '有未导出的修改'; const editing = $('viewer').contentDocument?.activeElement?.closest('input,textarea,[contenteditable=true]'); if (state.autoSave && !editing && !state.opening && !state.saving) saveCurrent(false).catch(report); } }, 2500);
  setInterval(() => fetch('/__paperboat_health').catch(() => {}), 60000);
  await renderLibrary();
  const launch = new URLSearchParams(location.search), token = launch.get('launch');
  if (token && /^[a-f0-9]{32}$/.test(token)) {
    try { const response=await fetch(`/__paperboat_launch/${token}`); if(!response.ok)throw new Error('启动文件已失效，请重新双击该 PDF。'); const name=launch.get('name')||'打开的文档.pdf'; await importFiles([new File([await response.arrayBuffer()],name,{type:'application/pdf'})]); history.replaceState(null,'',location.pathname); }
    catch(error){report(error);}
  }
}
boot().catch(report);

