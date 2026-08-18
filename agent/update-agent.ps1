$ErrorActionPreference = 'Stop'
$installDir = "$env:ProgramData\CameraPC"
$configPath = Join-Path $installDir 'config.json'
$startupDir = [Environment]::GetFolderPath('Startup')
$startupCmd = Join-Path $startupDir 'CameraPC-Agent.cmd'

if (-not (Test-Path $configPath)) { throw "CameraPC is not installed on this PC: $configPath" }
$cfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json

$defaults = @{
  THUMB_FRAME_INTERVAL_MS = 1800
  LIVE_FRAME_INTERVAL_MS = 160
  THUMB_JPEG_QUALITY = 30
  LIVE_JPEG_QUALITY = 45
  THUMB_SCALE = 0.35
  LIVE_SCALE = 0.65
  DEVICE_GROUP = 'VN UTI'
  AUTO_UPDATE = $true
}
foreach ($key in $defaults.Keys) {
  if ($null -eq $cfg.$key) { $cfg | Add-Member -NotePropertyName $key -NotePropertyValue $defaults[$key] }
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8

$repoBase = 'https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent'
foreach ($file in @('pc-agent.ps1','supervisor.ps1','auto-updater.ps1','update-agent.ps1','version.txt')) {
  Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/$file?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -OutFile (Join-Path $installDir $file)
}

$cmdLines = @(
  '@echo off',
  'start "CameraPC Agent" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ProgramData%\CameraPC\supervisor.ps1"',
  'start "CameraPC Updater" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ProgramData%\CameraPC\auto-updater.ps1"'
)
$cmdLines | Set-Content -Path $startupCmd -Encoding ASCII

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*CameraPC*' -and $_.ProcessId -ne $PID } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $installDir 'supervisor.ps1'))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $installDir 'auto-updater.ps1'))

Write-Host 'CameraPC Agent updated and restarted.' -ForegroundColor Green
Write-Host "Device: $($cfg.DEVICE_ID)"
Write-Host "Version: $((Get-Content -Raw (Join-Path $installDir 'version.txt')).Trim())"
Write-Host 'Automatic updates: ON'
