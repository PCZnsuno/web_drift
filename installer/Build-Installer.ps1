$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
& "$root\Build-Desktop.ps1"
$stage=Join-Path $PSScriptRoot 'stage'
New-Item $stage -ItemType Directory -Force | Out-Null
Copy-Item "$root\Paperboat-Motion.exe" "$stage\Paperboat.exe" -Force
$compiler=Get-Command ISCC.exe -ErrorAction SilentlyContinue
if(!$compiler){$localCompiler=Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe';if(Test-Path $localCompiler){$compiler=Get-Command $localCompiler}} 
if(!$compiler){throw '请安装 Inno Setup 6 并把 ISCC.exe 加入 PATH，然后重新运行。'}
& $compiler.Source "$PSScriptRoot\Paperboat.iss"
if($LASTEXITCODE){throw '安装包编译失败'}

