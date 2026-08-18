$ErrorActionPreference = 'SilentlyContinue'
$installDir = "$env:ProgramData\CameraPC"
$startupDir = [Environment]::GetFolderPath('Startup')
$startupCmd = Join-Path $startupDir 'CameraPC-Agent.cmd'

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*CameraPC*supervisor.ps1*' -or $_.CommandLine -like '*CameraPC*pc-agent.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Remove-Item -Force $startupCmd
Remove-Item -Recurse -Force $installDir

Write-Host 'CameraPC Agent removed.' -ForegroundColor Green
