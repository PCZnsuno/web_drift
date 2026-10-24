param([switch]$NoBrowser, [int]$Port = 17936, [string]$OpenPath)
$ErrorActionPreference = 'Stop'
$paperboatRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$serviceIdentity = 'paperboat-0.5|' + $paperboatRoot.TrimEnd('\').ToLowerInvariant()
$paperboatUrl = "http://127.0.0.1:$Port/"
$launchUrl = $paperboatUrl
if ($OpenPath) {
    $resolvedOpenPath = [IO.Path]::GetFullPath($OpenPath)
    if (!(Test-Path -LiteralPath $resolvedOpenPath -PathType Leaf) -or [IO.Path]::GetExtension($resolvedOpenPath) -ne '.pdf') { throw 'Only an existing PDF can be opened.' }
    $launchToken = [Guid]::NewGuid().ToString('N')
    $launchCopy = Join-Path ([IO.Path]::GetTempPath()) ("paperboat-launch-$launchToken.pdf")
    [IO.File]::Copy($resolvedOpenPath, $launchCopy, $false)
    $launchName = [Uri]::EscapeDataString([IO.Path]::GetFileName($resolvedOpenPath))
    $launchUrl = "${paperboatUrl}?launch=$launchToken&name=$launchName"
}
function Open-Paperboat {
    $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
    if (Test-Path -LiteralPath $edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList "--app=$launchUrl", '--window-size=1360,920'
    } else { Start-Process $launchUrl }
}
function Test-PaperboatService {
    try {
        $check = Invoke-WebRequest -Uri "${paperboatUrl}__paperboat_health" -UseBasicParsing -TimeoutSec 3
        $health = if ($check.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($check.Content) } else { [string]$check.Content }
        return ($check.StatusCode -eq 200 -and $health.Trim() -eq $serviceIdentity)
    } catch { return $false }
}
if (Test-PaperboatService) { if (!$NoBrowser) { Open-Paperboat }; exit }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() }
catch {
    # Another simultaneous launch may have finished binding after the first check.
    if (Test-PaperboatService) { if (!$NoBrowser) { Open-Paperboat }; exit }
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show("Port $Port is in use. If an older Paperboat is still running, close its window and wait for the service to exit (up to 20 minutes), then retry.", 'Paperboat')
    exit 1
}
if (!$NoBrowser) { Open-Paperboat }
$lastRequest = Get-Date
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PaperboatWindow {
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc f, IntPtr l);
 delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int n);
 [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int n, int v);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int z, uint f);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
 [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] static extern bool ReleaseCapture();
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);

 // Locate the window launched with --app: the msedge process carrying that flag owns it.
 // Fallback to the window title, because Edge may merge the window into a running instance
 // (the launcher process has already exited). Only the two app-window title shapes count:
 // "纸舟 · ..." before a document is open, "<file> · 纸舟" afterwards. This excludes the same
 // app opened in a normal browser tab ("... · 纸舟 - Google Chrome") and the Harness window.
 static bool LooksLikeApp(string t) {
   return t == "纸舟" || t.StartsWith("纸舟 ·", StringComparison.Ordinal) || t.EndsWith("· 纸舟", StringComparison.Ordinal);
 }
 static IntPtr Find(int[] pids) {
   // A click belongs to the active app window. Never pick an arbitrary matching window.
   var active = GetForegroundWindow();
   if (active == IntPtr.Zero) return IntPtr.Zero;
   uint activePid; GetWindowThreadProcessId(active, out activePid);
   try { if (!Process.GetProcessById((int)activePid).ProcessName.Equals("msedge", StringComparison.OrdinalIgnoreCase)) return IntPtr.Zero; }
   catch { return IntPtr.Zero; }
   var activeTitle = new StringBuilder(512); GetWindowText(active, activeTitle, 512);
   if (!LooksLikeApp(activeTitle.ToString())) return IntPtr.Zero;
   return active;
 }
 static IntPtr LegacyFind(int[] pids) {
   IntPtr byPid = IntPtr.Zero, byTitle = IntPtr.Zero;
   EnumWindows((h, l) => {
     if (!IsWindowVisible(h)) return true;
     var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
     string title = sb.ToString(); if (title.Length == 0) return true;
     uint pid; GetWindowThreadProcessId(h, out pid);
     if (byPid == IntPtr.Zero && pids != null) {
       foreach (int p in pids) if ((int)pid == p) { byPid = h; return true; }
     }
     if (byTitle == IntPtr.Zero && LooksLikeApp(title)) byTitle = h;
     return true;
   }, IntPtr.Zero);
   return byPid != IntPtr.Zero ? byPid : byTitle;
 }
 public static bool Act(string action, int[] pids) {
   IntPtr h = Find(pids);
   if (h == IntPtr.Zero) return false;
   switch (action) {
     case "frame":
       int style = GetWindowLong(h, -16);
       style &= ~0x00C00000;              // drop WS_CAPTION (WS_BORDER|WS_DLGFRAME)
       style |= 0x00040000;               // keep WS_THICKFRAME so edge resizing still works
       SetWindowLong(h, -16, style);
       SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 0x27); // NOSIZE|NOMOVE|NOZORDER|FRAMECHANGED
       return true;
     case "minimize": ShowWindow(h, 6); return true;
     case "maximize": ShowWindow(h, IsZoomed(h) ? 9 : 3); return true;
     case "close": return PostMessage(h, 0x10, IntPtr.Zero, IntPtr.Zero);
     case "drag": ReleaseCapture(); PostMessage(h, 0xA1, (IntPtr)2, IntPtr.Zero); return true;
     default: return false;
   }
 }
}
'@
# 找出本次 --app 打开的 msedge 进程（找不到时由 C# 的标题兜底接管）
function Get-AppWindowPids {
    try {
        return @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction Stop |
            Where-Object { $_.CommandLine -and $_.CommandLine.Contains("--app=http://127.0.0.1:$Port") } |
            ForEach-Object { [int]$_.ProcessId })
    } catch { return @() }
}
$mime = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.mjs'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.svg'='image/svg+xml';'.ico'='image/x-icon';'.png'='image/png';'.jpg'='image/jpeg';'.pdf'='application/pdf';'.json'='application/json';'.wasm'='application/wasm';'.ftl'='text/plain; charset=utf-8';'.ttf'='font/ttf';'.otf'='font/otf';'.woff2'='font/woff2'}
try {
    while (((Get-Date) - $lastRequest).TotalMinutes -lt 20) {
        if (!$listener.Pending()) { Start-Sleep -Milliseconds 60; continue }
        $client = $listener.AcceptTcpClient()
        $lastRequest = Get-Date
        $stream = $null
        try {
            $client.ReceiveTimeout = 3000
            $client.SendTimeout = 10000
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $request = $reader.ReadLine()
            $headers = @{}
            $readLength = 0
            while ($null -ne ($line = $reader.ReadLine()) -and $line -ne '') {
                $readLength += $line.Length
                if ($readLength -gt 32768) { throw 'Headers too large' }
                $parts = $line -split ':', 2
                if ($parts.Length -eq 2) { $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim() }
            }
            $parts = $request.Split(' ')
            $method = $parts[0]
            $path = [Uri]::UnescapeDataString($parts[1].Split('?')[0])
            $code = '200 OK'; $type = 'application/octet-stream'; $body = $null
            if ($headers['host'] -ne "127.0.0.1:$Port") {
                $code = '403 Forbidden'; $body = [Text.Encoding]::UTF8.GetBytes('Forbidden')
            } elseif ($path -match '^/__paperboat_launch/([a-f0-9]{32})$' -and $method -eq 'GET') {
                $launchFile = Join-Path ([IO.Path]::GetTempPath()) ("paperboat-launch-$($Matches[1]).pdf")
                if (Test-Path -LiteralPath $launchFile -PathType Leaf) { $type='application/pdf';$body=[IO.File]::ReadAllBytes($launchFile);Remove-Item -LiteralPath $launchFile -Force }
                else { $code='404 Not Found';$body=[Text.Encoding]::UTF8.GetBytes('Not found') }
            } elseif ($path -match '^/__paperboat_window/(frame|minimize|maximize|close|drag)$') {
                $sameOrigin = ($headers['origin'] -eq $paperboatUrl.TrimEnd('/') -and $headers['x-paperboat-request'] -eq 'window-control')
                if ($method -eq 'POST' -and $sameOrigin -and [PaperboatWindow]::Act($Matches[1], (Get-AppWindowPids))) { $type='application/json';$body=[Text.Encoding]::UTF8.GetBytes('{}') }
                else { $code='403 Forbidden';$body=[Text.Encoding]::UTF8.GetBytes('{}') }
            } elseif ($method -notin @('GET','HEAD')) {
                $code = '403 Forbidden'; $body = [Text.Encoding]::UTF8.GetBytes('Forbidden')
            } elseif ($path -eq '/__paperboat_health') {
                $type = 'text/plain'; $body = [Text.Encoding]::UTF8.GetBytes($serviceIdentity)
            } else {
                if ($path -eq '/') { $path = '/index.html' }
                $target = [IO.Path]::GetFullPath((Join-Path $paperboatRoot $path.TrimStart('/')))
                $extension = [IO.Path]::GetExtension($target).ToLowerInvariant()
                if (!$target.StartsWith($paperboatRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $path.Contains('\') -or $path.Contains(':') -or $extension -in @('.ps1','.cmd','.map') -or !(Test-Path -LiteralPath $target -PathType Leaf)) {
                    $code = '404 Not Found'; $body = [Text.Encoding]::UTF8.GetBytes('Not found')
                } else {
                    if ($mime.ContainsKey($extension)) { $type = $mime[$extension] }
                    $body = [IO.File]::ReadAllBytes($target)
                }
            }
            $header = "HTTP/1.1 $code`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: no-referrer`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne 'HEAD') { $stream.Write($body, 0, $body.Length) }
        } catch { [Console]::Error.WriteLine($_.Exception.Message) }
        finally { if ($stream) { $stream.Dispose() }; $client.Dispose() }
    }
} finally { $listener.Stop() }

