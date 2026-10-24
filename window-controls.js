'use strict';
document.addEventListener('DOMContentLoaded', () => {
  if (window.paperboatDesktop) return;
  // 只驱动 Edge --app 打开的无边框窗口。普通浏览器标签页有标签栏和地址栏，
  // outer/inner 差值很大，会直接返回；后台标签页的差值为 0，所以还要看可见性。
  // 去边框由服务端按 --app 端口定位窗口完成，只有成功后才显示自绘按钮，
  // 否则保留系统标题栏——避免出现「两套按钮」或「没有边框也点不动」。
  const controls = document.querySelector('.window-controls'), bar = document.querySelector('.titlebar');
  if (!controls || !bar) return;
  controls.hidden = true;
  const isAppWindow = () => document.visibilityState === 'visible'
    && (window.outerHeight - window.innerHeight) < 48
    && (window.outerWidth - window.innerWidth) < 48;
  const post = action => fetch(`/__paperboat_window/${action}`, { method: 'POST', headers: { 'X-Paperboat-Request': 'window-control' } });
  let bound = false, pending = false;
  const bind = () => {
    if (bound) return;
    bound = true;
    document.querySelectorAll('[data-window]').forEach(button => {
      button.onclick = () => post(button.dataset.window).catch(() => {});
    });
    bar.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.target === event.currentTarget) post('drag').catch(() => {});
    });
    bar.addEventListener('dblclick', event => {
      if (event.target === bar) post('maximize').catch(() => {});
    });
  };
  const sync = async () => {
    if (!isAppWindow()) { controls.hidden = true; return; }
    if (pending) return;
    pending = true;
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (!isAppWindow()) { controls.hidden = true; return; }
        try {
          const response = await post('frame');
          if (response.ok) { bind(); controls.hidden = false; return; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      controls.hidden = true;
    } finally { pending = false; }
  };
  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', sync);
});
