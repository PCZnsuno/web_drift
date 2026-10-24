using System;
using System.IO;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using RectI=System.Drawing.Rectangle;

// One fixed HWND and one retained texture. Only render transforms are animated;
// no per-frame SetWindowPos, bitmap resampling, layout, or timer on the UI thread.
sealed class CompositorTransition : IDisposable {
 readonly Window window;
 readonly Image image;
 readonly ScaleTransform scale=new ScaleTransform();
 readonly TranslateTransform move=new TranslateTransform();
 readonly RectI from,to,union;
 double pixelScaleX=1,pixelScaleY=1;
 bool disposed;
 public static int RenderingTier { get { return RenderCapability.Tier>>16; } }
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int size);
 [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint period);
 [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint period);
 public CompositorTransition(Stream snapshot,RectI source,RectI target,IntPtr owner) {
  from=source;to=target;union=RectI.Union(from,to);
  var bitmap=BitmapFrame.Create(snapshot,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad);bitmap.Freeze();
  image=new Image{Source=bitmap,Stretch=Stretch.Fill,IsHitTestVisible=false};
  RenderOptions.SetBitmapScalingMode(image,BitmapScalingMode.LowQuality);
  var transforms=new TransformGroup();transforms.Children.Add(scale);transforms.Children.Add(move);image.RenderTransform=transforms;
  var canvas=new Canvas{Background=Brushes.Transparent,ClipToBounds=true};canvas.Children.Add(image);
  window=new Window{WindowStyle=WindowStyle.None,ResizeMode=ResizeMode.NoResize,AllowsTransparency=true,Background=Brushes.Transparent,ShowInTaskbar=false,ShowActivated=false,Focusable=false,Content=canvas,Left=union.Left,Top=union.Top,Width=union.Width,Height=union.Height};
  var helper=new WindowInteropHelper(window);helper.Owner=owner;IntPtr handle=helper.EnsureHandle();
  int off=1;DwmSetWindowAttribute(handle,3,ref off,4);
  // Position in physical screen pixels once; WPF transforms below use local DIPs.
  SetWindowPos(handle,IntPtr.Zero,union.X,union.Y,union.Width,union.Height,0x14);
  var device=HwndSource.FromHwnd(handle).CompositionTarget.TransformFromDevice;
  pixelScaleX=device.M11;pixelScaleY=device.M22;
  image.Width=from.Width*pixelScaleX;image.Height=from.Height*pixelScaleY;
  image.Clip=new RectangleGeometry(new Rect(0,0,image.Width,image.Height),8,8);
  move.X=(from.X-union.X)*pixelScaleX;move.Y=(from.Y-union.Y)*pixelScaleY;
 }
 public async Task ShowAsync(){
  var ready=new TaskCompletionSource<bool>();EventHandler rendered=null;
  rendered=(s,e)=>{window.ContentRendered-=rendered;ready.TrySetResult(true);};window.ContentRendered+=rendered;
  window.Show();
  if(await Task.WhenAny(ready.Task,Task.Delay(1500))!=ready.Task)throw new TimeoutException("Transition surface did not render.");
 }
 DoubleAnimation Tween(double fromValue,double toValue,int ms){return new DoubleAnimation(fromValue,toValue,TimeSpan.FromMilliseconds(ms)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseInOut},FillBehavior=FillBehavior.HoldEnd};}
 public async Task AnimateAsync(int milliseconds){
  bool raised=timeBeginPeriod(1)==0;
  try{
  var done=new TaskCompletionSource<bool>();
  var x=Tween(move.X,(to.X-union.X)*pixelScaleX,milliseconds);
  x.Completed+=(s,e)=>done.TrySetResult(true);
  scale.BeginAnimation(ScaleTransform.ScaleXProperty,Tween(1,to.Width/(double)from.Width,milliseconds));
  scale.BeginAnimation(ScaleTransform.ScaleYProperty,Tween(1,to.Height/(double)from.Height,milliseconds));
  move.BeginAnimation(TranslateTransform.YProperty,Tween(move.Y,(to.Y-union.Y)*pixelScaleY,milliseconds));
  move.BeginAnimation(TranslateTransform.XProperty,x);
  if(await Task.WhenAny(done.Task,Task.Delay(2000))!=done.Task)throw new TimeoutException("Transition animation did not complete.");
  }finally{if(raised)timeEndPeriod(1);}
 }
 public async Task FadeOutAsync(){
  var done=new TaskCompletionSource<bool>();var fade=new DoubleAnimation(1,0,TimeSpan.FromMilliseconds(65));fade.Completed+=(s,e)=>done.TrySetResult(true);
  image.BeginAnimation(UIElement.OpacityProperty,fade);await Task.WhenAny(done.Task,Task.Delay(500));
 }
 public void Dispose(){if(disposed)return;disposed=true;window.Close();image.Source=null;}
}
