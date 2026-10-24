$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $wpf = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\WPF"
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:Microsoft.Web.WebView2.Core.dll /reference:Microsoft.Web.WebView2.WinForms.dll /win32manifest:Paperboat.manifest /win32icon:paperboat.ico /out:Paperboat-Motion.exe DesktopHost.cs WindowMotion.cs
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
    Write-Output 'Built Paperboat-Motion.exe. Close Paperboat before replacing Paperboat.exe.'
} finally { Pop-Location }
