param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$Installer=(Resolve-Path -LiteralPath $Installer).Path
$results=Join-Path $PSScriptRoot 'test-results'
New-Item $results -ItemType Directory -Force | Out-Null
# This test is deliberately restricted to a disposable machine/account.
if(Test-Path 'HKCU:\Software\Classes\Paperboat.PDF'){throw '检测到已有纸舟注册，请在独立测试账户或虚拟机运行。'}
$target=Join-Path $env:LOCALAPPDATA 'Programs\Paperboat-InstallerTest'
if(Test-Path $target){throw '测试目录已存在，请换用干净测试环境。'}
$marker=Join-Path $env:LOCALAPPDATA ('Paperboat\installer-test-'+[guid]::NewGuid()+'.txt')
function Assert($condition,$message){if(!$condition){throw $message}}
function Run-Setup($phase){
 $log=Join-Path $results ($phase+'.log')
 $p=Start-Process -FilePath $Installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=desktopicon',('/DIR="'+$target+'"'),('/LOG="'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
 Assert ($p.ExitCode -eq 0) "$phase 安装失败：$($p.ExitCode)，查看 $log"
}
try{
 Run-Setup 'install'
 Assert (Test-Path "$target\Paperboat.exe") '缺少主程序'
 $icon=(Get-Item 'HKCU:\Software\Classes\Paperboat.PDF\DefaultIcon').GetValue('')
 Assert ($icon -eq ('"'+$target+'\pdf-document.ico",0')) '文档图标路径错误'
 $command=(Get-Item 'HKCU:\Software\Classes\Paperboat.PDF\shell\open\command').GetValue('')
 Assert ($command -eq ('"'+$target+'\Paperboat.exe" "%1"')) 'PDF 打开命令错误'
 Assert (Test-Path (Join-Path ([Environment]::GetFolderPath('Programs')) '纸舟\纸舟.lnk')) '缺少开始菜单快捷方式'
 Assert (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) '纸舟.lnk')) '缺少桌面快捷方式'
 New-Item (Split-Path $marker) -ItemType Directory -Force | Out-Null
 Set-Content -LiteralPath $marker -Value 'preserve-me'
 Run-Setup 'reinstall'
 Assert ((Get-Content $marker) -eq 'preserve-me') '覆盖安装损坏数据'
 $p=Start-Process "$target\unins000.exe" -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $results 'uninstall.log')+'"')) -WindowStyle Hidden -Wait -PassThru
 Assert ($p.ExitCode -eq 0) '卸载失败'
 Assert (!(Test-Path 'HKCU:\Software\Classes\Paperboat.PDF')) '残留 PDF 注册'
 Assert (!(Test-Path "$target\Paperboat.exe")) '主程序未删除'
 Assert ((Get-Content $marker) -eq 'preserve-me') '卸载删除了数据'
 'PASS: install, same-version reinstall, association paths, shortcuts, uninstall, data marker preservation. UI and cross-version migration not tested.' | Set-Content "$results\summary.txt"
} catch { $_ | Out-String | Set-Content "$results\failure.txt"; throw }
finally {if(Test-Path $marker){Remove-Item -LiteralPath $marker}}
