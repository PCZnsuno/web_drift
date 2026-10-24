$ErrorActionPreference='Stop'
$source=Split-Path $PSScriptRoot
$package=Join-Path (Split-Path $source) 'releases'
$escaped=[Security.SecurityElement]::Escape($package)
$testSource=[Security.SecurityElement]::Escape($PSScriptRoot)
@"
<Configuration><Networking>Enable</Networking><MappedFolders><MappedFolder><HostFolder>$escaped</HostFolder><SandboxFolder>C:\Packages</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder><MappedFolder><HostFolder>$testSource</HostFolder><SandboxFolder>C:\Tests</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>powershell.exe -NoExit -ExecutionPolicy Bypass -Command "Copy-Item C:\Tests C:\TestRun -Recurse; &amp; C:\TestRun\Test-Installer.ps1 -Installer (Get-ChildItem C:\Packages\Paperboat-Setup-*.exe | Select-Object -First 1).FullName"</Command></LogonCommand></Configuration>
"@ | Set-Content (Join-Path $package 'Test-Paperboat.wsb') -Encoding UTF8
