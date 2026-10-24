using System;
using Microsoft.Win32;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
class DesktopHost : Form {
 readonly WebView2 web = new WebView2();
 readonly string root = AppDomain.CurrentDomain.BaseDirectory;
 string url="http://127.0.0.1:17936/";
 bool closing;
 bool dragging;
 void DragWindow(){
  if(dragging||IsDisposed||(Control.MouseButtons&MouseButtons.Left)==0)return;
  dragging=true;
  try {
   // Keep the maximized state until Windows enters its native caption move loop.
   // DefWindowProc preserves the pointer anchor and restores on drag itself.
   var mouse=Cursor.Position;
   ReleaseCapture();
   SendMessage(Handle,0xA1,(IntPtr)2,(IntPtr)((mouse.X&0xffff)|((mouse.Y&0xffff)<<16)));
  } finally {dragging=false;}
 }
 protected override CreateParams CreateParams {
  get {
   var p=base.CreateParams;
   // Native sizing/caption styles enable DWM transitions and drag-to-restore.
   p.Style|=0x00C00000|0x00040000|0x00080000|0x00020000|0x00010000;
   return p;
  }
 }
 readonly string windowSettings=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Paperboat","window.txt");
 [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int size);
 [StructLayout(LayoutKind.Sequential)] struct Margins { public int Left,Right,Top,Bottom; }
 [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr h,ref Margins m);
 protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);try{int corner=2;DwmSetWindowAttribute(Handle,33,ref corner,4);var margins=new Margins{Left=1,Right=1,Top=1,Bottom=1};DwmExtendFrameIntoClientArea(Handle,ref margins);}catch{}}
 protected override void OnFormClosed(FormClosedEventArgs e){try{var b=WindowState==FormWindowState.Normal?Bounds:RestoreBounds;Directory.CreateDirectory(Path.GetDirectoryName(windowSettings));File.WriteAllText(windowSettings,String.Join(",",WindowState==FormWindowState.Maximized?"max":"normal",b.X,b.Y,b.Width,b.Height));}catch{}base.OnFormClosed(e);}
 void RestoreWindow(){var area=Screen.FromControl(this).WorkingArea;MaximizedBounds=area;WindowState=FormWindowState.Maximized;try{if(!File.Exists(windowSettings))return;var v=File.ReadAllText(windowSettings).Split(',');if(v.Length!=5)return;int x=int.Parse(v[1]),y=int.Parse(v[2]),w=int.Parse(v[3]),h=int.Parse(v[4]);var saved=new Rectangle(x,y,Math.Max(960,w),Math.Max(640,h));var screen=Screen.FromRectangle(saved).WorkingArea;saved.Width=Math.Min(saved.Width,screen.Width);saved.Height=Math.Min(saved.Height,screen.Height);saved.X=Math.Max(screen.Left,Math.Min(saved.X,screen.Right-saved.Width));saved.Y=Math.Max(screen.Top,Math.Min(saved.Y,screen.Bottom-saved.Height));WindowState=FormWindowState.Normal;Bounds=saved;if(v[0]=="max")WindowState=FormWindowState.Maximized;}catch{WindowState=FormWindowState.Maximized;}}
 [DllImport("user32.dll")] static extern bool ReleaseCapture();
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 [STAThread] static void Main(string[] args) { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new DesktopHost(args)); }
 DesktopHost(string[] args) {
  AutoScaleMode=AutoScaleMode.Dpi; AutoScaleDimensions=new SizeF(96,96);
  Text="纸舟"; FormBorderStyle=FormBorderStyle.None; MinimumSize=new Size(960,640); Size=new Size(1360,920); StartPosition=FormStartPosition.CenterScreen; BackColor=Color.FromArgb(249,250,248);
  Icon=new Icon(Path.Combine(root,"paperboat.ico")); web.Dock=DockStyle.Fill; Controls.Add(web);
  Opacity=0;
  Shown+=async(s,e)=>{
   var area=Screen.FromPoint(Cursor.Position).WorkingArea;double splashScale=Math.Min(DeviceDpi/96.0,Math.Min(area.Width/720.0,area.Height/480.0));int w=(int)(640*splashScale),h=(int)(400*splashScale);
   using(var splash=new MotionSurface(null,new Rectangle(area.X+(area.Width-w)/2,area.Y+(area.Height-h)/2,w,h))){
    splash.Show();var elapsed=Stopwatch.StartNew();RestoreWindow();
    try{await Start(args);if(elapsed.ElapsedMilliseconds<500)await Task.Delay(500-(int)elapsed.ElapsedMilliseconds);Opacity=1;Activate();splash.BringToFront();await splash.FadeOut();}
    catch(Exception ex){splash.Hide();Opacity=1;MessageBox.Show(this,"纸舟启动失败："+ex.Message);closing=true;Close();}
   }
  };
  FormClosing+=async(s,e)=>{if(closing||web.CoreWebView2==null)return;e.Cancel=true;try{string result=await web.ExecuteScriptAsync("window.paperboatCanClose ? window.paperboatCanClose() : true");if(result!="true"&&MessageBox.Show(this,"仍有进行中的操作或未保存内容，是否关闭？","纸舟",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;}catch{}closing=true;Close();};
 }
 async Task Start(string[] args){
  bool ready=false;try{using(var c=new WebClient())ready=(await c.DownloadStringTaskAsync(url+"__paperboat_health")).Trim()==("paperboat-0.5|"+root.TrimEnd(Path.DirectorySeparatorChar).ToLowerInvariant());}catch{}
  if(!ready){var p=new ProcessStartInfo(Path.Combine(Environment.SystemDirectory,"WindowsPowerShell\\v1.0\\powershell.exe"),"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""+Path.Combine(root,"Start-Paperboat.ps1")+"\" -NoBrowser");p.UseShellExecute=false;p.CreateNoWindow=true;Process.Start(p);}
  for(int n=0;n<80&&!ready;n++){await Task.Delay(150);try{using(var c=new WebClient())ready=(await c.DownloadStringTaskAsync(url+"__paperboat_health")).Trim()==("paperboat-0.5|"+root.TrimEnd(Path.DirectorySeparatorChar).ToLowerInvariant());}catch{}}
  if(!ready)throw new Exception("本地服务不可用，请关闭旧版纸舟后重试。");
  if(args.Length>0){string source=Path.GetFullPath(args[0]);if(!File.Exists(source)||!source.EndsWith(".pdf",StringComparison.OrdinalIgnoreCase))throw new Exception("请选择有效的 PDF 文件。");string token=Guid.NewGuid().ToString("N");File.Copy(source,Path.Combine(Path.GetTempPath(),"paperboat-launch-"+token+".pdf"));url+="?launch="+token+"&name="+Uri.EscapeDataString(Path.GetFileName(source));}
  var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Paperboat","WebView2"));await web.EnsureCoreWebView2Async(env);
  web.ZoomFactor=1;
  web.CoreWebView2.Settings.IsStatusBarEnabled=false;
  bool nativeDrag=false;try{web.CoreWebView2.Settings.IsNonClientRegionSupportEnabled=true;nativeDrag=true;}catch(NotImplementedException){}
  await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.paperboatDesktop=true;window.paperboatNativeDrag="+(nativeDrag?"true":"false")+";");
  web.CoreWebView2.NavigationStarting+=(s,e)=>{Uri u;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out u)||u.Host!="127.0.0.1"||u.Port!=17936){e.Cancel=true;}};
  web.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;Uri u;if(Uri.TryCreate(e.Uri,UriKind.Absolute,out u)&&u.Host=="127.0.0.1"&&u.Port==17936)web.CoreWebView2.Navigate(e.Uri);};
  web.CoreWebView2.WebMessageReceived+=(s,e)=>{if(!e.Source.StartsWith("http://127.0.0.1:17936/"))return;string action=e.TryGetWebMessageAsString();if(action=="query-window-state")ReportWindowState();if(action=="query-default-pdf")ReportDefaultPdf();if(action=="default-pdf")Process.Start(new ProcessStartInfo("ms-settings:defaultapps?registeredAppUser=Paperboat"){UseShellExecute=true});if(action=="minimize")WindowState=FormWindowState.Minimized;if(action=="maximize")ToggleMax();if(action=="close")Close();if(action=="drag")DragWindow();};
  web.CoreWebView2.DownloadStarting+=(s,e)=>{using(var dialog=new SaveFileDialog()){dialog.FileName=Path.GetFileName(e.ResultFilePath);if(dialog.ShowDialog(this)==DialogResult.OK)e.ResultFilePath=dialog.FileName;else e.Cancel=true;}};
  var loaded=new TaskCompletionSource<bool>();
  EventHandler<CoreWebView2NavigationCompletedEventArgs> completed=(s,e)=>{if(e.IsSuccess)loaded.TrySetResult(true);else loaded.TrySetException(new Exception("页面加载失败："+e.WebErrorStatus));};
  web.CoreWebView2.NavigationCompleted+=completed;
  try{MaximizedBounds=Screen.FromControl(this).WorkingArea;web.CoreWebView2.Navigate(url);if(await Task.WhenAny(loaded.Task,Task.Delay(20000))!=loaded.Task)throw new Exception("页面加载超时。");await loaded.Task;}
  finally{web.CoreWebView2.NavigationCompleted-=completed;}
 }
 bool IsDefaultPdf(){using(var k=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice"))return k!=null&&String.Equals(k.GetValue("ProgId") as string,"Paperboat.PDF",StringComparison.OrdinalIgnoreCase);}
 async void ReportDefaultPdf(){await web.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('paperboat-default-pdf',{detail:"+(IsDefaultPdf()?"true":"false")+"}));");}
 async void ReportWindowState(){if(web.CoreWebView2==null)return;try{await web.ExecuteScriptAsync("window.paperboatWindowMaximized="+(WindowState==FormWindowState.Maximized?"true":"false")+";window.dispatchEvent(new Event('paperboat-window-state'));");}catch{}}
 protected override void OnResize(EventArgs e){base.OnResize(e);ReportWindowState();}
 void ToggleMax(){
  if(dragging||IsDisposed)return;
  MaximizedBounds=Screen.FromControl(this).WorkingArea;
  // One native command: no PNG capture, hidden WebView or layered overlay.
  SendMessage(Handle,0x112,(IntPtr)(WindowState==FormWindowState.Maximized?0xF120:0xF030),IntPtr.Zero);
 }
 protected override void WndProc(ref Message m){if(m.Msg==0xA3&&m.WParam==(IntPtr)2){ToggleMax();m.Result=IntPtr.Zero;return;}if(m.Msg==0x83&&m.WParam!=IntPtr.Zero){m.Result=IntPtr.Zero;return;}base.WndProc(ref m);if(m.Msg==0x84&&WindowState==FormWindowState.Normal){Point p=PointToClient(new Point((short)((long)m.LParam&65535),(short)(((long)m.LParam>>16)&65535)));int b=7;bool l=p.X<b,r=p.X>=ClientSize.Width-b,t=p.Y<b,d=p.Y>=ClientSize.Height-b;if(l&&t)m.Result=(IntPtr)13;else if(r&&t)m.Result=(IntPtr)14;else if(l&&d)m.Result=(IntPtr)16;else if(r&&d)m.Result=(IntPtr)17;else if(l)m.Result=(IntPtr)10;else if(r)m.Result=(IntPtr)11;else if(t)m.Result=(IntPtr)12;else if(d)m.Result=(IntPtr)15;}}
}



