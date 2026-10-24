#define AppVersion "0.5.0"
[Setup]
AppId={{A76D5640-4300-4517-A2D2-86C2A1872DA2}
AppName=纸舟
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Paperboat
DefaultGroupName=纸舟
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\releases
OutputBaseFilename=Paperboat-Setup-{#AppVersion}
SetupIconFile=..\paperboat.ico
UninstallDisplayIcon={app}\Paperboat.exe
Compression=lzma2
SolidCompression=yes
ChangesAssociations=yes
CloseApplications=yes
[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "installer\*,.github\*,.git\*,Paperboat.exe,*.cs,*.ps1,*.cmd,*.manifest,Paperboat-Motion.exe,README.md"
Source: "..\Start-Paperboat.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "stage\Paperboat.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy
[Tasks]
Name: desktopicon; Description: "创建桌面快捷方式"; Flags: unchecked
[Icons]
Name: "{group}\纸舟"; Filename: "{app}\Paperboat.exe"
Name: "{autodesktop}\纸舟"; Filename: "{app}\Paperboat.exe"; Tasks: desktopicon
[Registry]
Root: HKCU; Subkey: "Software\Classes\Paperboat.PDF"; ValueType: string; ValueData: "纸舟 PDF 文档"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Paperboat.PDF\DefaultIcon"; ValueType: string; ValueData: """{app}\pdf-document.ico"",0"
Root: HKCU; Subkey: "Software\Classes\Paperboat.PDF\shell\open\command"; ValueType: string; ValueData: """{app}\Paperboat.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.pdf\OpenWithProgids"; ValueName: "Paperboat.PDF"; ValueType: string; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Paperboat\Capabilities"; ValueName: "ApplicationName"; ValueType: string; ValueData: "纸舟"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Paperboat\Capabilities"; ValueName: "ApplicationDescription"; ValueType: string; ValueData: "纸舟 PDF 阅读与批注"
Root: HKCU; Subkey: "Software\Paperboat\Capabilities\FileAssociations"; ValueName: ".pdf"; ValueType: string; ValueData: "Paperboat.PDF"
Root: HKCU; Subkey: "Software\RegisteredApplications"; ValueName: "Paperboat"; ValueType: string; ValueData: "Software\Paperboat\Capabilities"; Flags: uninsdeletevalue
[Run]
Filename: "ms-settings:defaultapps?registeredAppUser=Paperboat"; Description: "设置默认 PDF 阅读器"; Flags: shellexec postinstall skipifsilent unchecked
Filename: "{app}\Paperboat.exe"; Description: "启动纸舟"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2: Boolean;
var V: String;
begin
 Result := (RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'));
 if not Result then Result := (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'));
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Code: Integer;
begin
 Result := '';
 if HasWebView2 then exit;
 ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
 if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Code) then begin Result := '无法启动 WebView2 安装程序。'; exit; end;
 if not HasWebView2 then Result := 'WebView2 安装未完成。请连接互联网后重试。';
end;


