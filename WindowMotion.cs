using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// Startup card only. Window transitions live in CompositorTransition.
sealed class MotionSurface : Form {
 readonly Image frame;
 readonly Stopwatch clock = Stopwatch.StartNew();
 readonly Timer pulse = new Timer { Interval=16 };
 public MotionSurface(Image image, Rectangle bounds) {
  frame=image; FormBorderStyle=FormBorderStyle.None; ShowInTaskbar=false;
  AutoScaleMode=AutoScaleMode.None; StartPosition=FormStartPosition.Manual; Bounds=bounds;
  BackColor=Color.FromArgb(247,250,248); DoubleBuffered=true;
  SetStyle(ControlStyles.AllPaintingInWmPaint|ControlStyles.UserPaint|ControlStyles.OptimizedDoubleBuffer,true);
  pulse.Tick+=(s,e)=>Invalidate(new Rectangle(0,(int)(220*ClientSize.Width/480f),ClientSize.Width,(int)(30*ClientSize.Width/480f))); if(frame==null)pulse.Start();
 }
 protected override bool ShowWithoutActivation { get { return true; } }
 protected override CreateParams CreateParams { get { var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p; } }
 [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int size);
 protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e);int corner=2,off=1;DwmSetWindowAttribute(Handle,33,ref corner,4);DwmSetWindowAttribute(Handle,3,ref off,4); }
 protected override void OnPaint(PaintEventArgs e) {
  var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
  if(frame!=null){g.SmoothingMode=SmoothingMode.None;g.CompositingMode=CompositingMode.SourceCopy;g.InterpolationMode=InterpolationMode.Bilinear;g.DrawImage(frame,ClientRectangle);return;}
  float k=ClientSize.Width/480f;g.ScaleTransform(k,k);
  using(var wash=new LinearGradientBrush(new Rectangle(0,0,480,300),Color.FromArgb(231,241,235),Color.FromArgb(252,253,251),45))g.FillRectangle(wash,0,0,480,300);
  using(var green=new SolidBrush(Color.FromArgb(72,125,104)))g.FillEllipse(green,208,42,64,64);
  using(var pen=new Pen(Color.White,2f)){g.DrawLines(pen,new[]{new PointF(220,80),new PointF(260,80),new PointF(250,91),new PointF(230,91),new PointF(220,80)});g.DrawLines(pen,new[]{new PointF(240,55),new PointF(240,78),new PointF(226,78),new PointF(240,55),new PointF(254,75)});}
  // Design-space pixel fonts avoid applying monitor DPI twice after ScaleTransform.
  using(var f=new Font("Microsoft YaHei UI",34,FontStyle.Bold,GraphicsUnit.Pixel))using(var b=new SolidBrush(Color.FromArgb(39,56,48)))using(var format=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center,FormatFlags=StringFormatFlags.NoWrap})g.DrawString("纸舟",f,b,new RectangleF(24,118,432,64),format);
  using(var f=new Font("Segoe UI",13,FontStyle.Regular,GraphicsUnit.Pixel))using(var b=new SolidBrush(Color.FromArgb(103,126,115)))using(var format=new StringFormat{Alignment=StringAlignment.Center,LineAlignment=StringAlignment.Center})g.DrawString("P A P E R B O A T",f,b,new RectangleF(24,182,432,30),format);
  using(var p=new Pen(Color.FromArgb(215,229,220),3)){p.StartCap=p.EndCap=LineCap.Round;g.DrawLine(p,180,232,300,232);}
  float x=180+(float)((Math.Sin(clock.Elapsed.TotalSeconds*2.5)+1)*40);
  using(var p=new Pen(Color.FromArgb(106,157,133),3)){p.StartCap=p.EndCap=LineCap.Round;g.DrawLine(p,x,232,x+40,232);}
 }
 public async Task FadeOut(){var w=Stopwatch.StartNew();while(!IsDisposed&&w.ElapsedMilliseconds<140){Opacity=Math.Max(0,1-w.Elapsed.TotalMilliseconds/140);await Task.Delay(15);} }
 protected override void Dispose(bool disposing){if(disposing)pulse.Dispose();base.Dispose(disposing);}
}
