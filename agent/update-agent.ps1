$ErrorActionPreference = 'Stop'
$installDir = "$env:ProgramData\CameraPC"
$configPath = Join-Path $installDir 'config.json'

if (-not (Test-Path $configPath)) {
  throw "CameraPC is not installed on this PC: $configPath"
}

$cfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json
if (-not $cfg.THUMB_FRAME_INTERVAL_MS) { $cfg | Add-Member -NotePropertyName THUMB_FRAME_INTERVAL_MS -NotePropertyValue 1800 }
if (-not $cfg.LIVE_FRAME_INTERVAL_MS) { $cfg | Add-Member -NotePropertyName LIVE_FRAME_INTERVAL_MS -NotePropertyValue 160 }
if (-not $cfg.THUMB_JPEG_QUALITY) { $cfg | Add-Member -NotePropertyName THUMB_JPEG_QUALITY -NotePropertyValue 30 }
if (-not $cfg.LIVE_JPEG_QUALITY) { $cfg | Add-Member -NotePropertyName LIVE_JPEG_QUALITY -NotePropertyValue 45 }
if (-not $cfg.THUMB_SCALE) { $cfg | Add-Member -NotePropertyName THUMB_SCALE -NotePropertyValue 0.35 }
if (-not $cfg.LIVE_SCALE) { $cfg | Add-Member -NotePropertyName LIVE_SCALE -NotePropertyValue 0.65 }
if (-not $cfg.DEVICE_GROUP) { $cfg | Add-Member -NotePropertyName DEVICE_GROUP -NotePropertyValue 'VN UTI' }
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8

$repoBase = 'https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent'
Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/pc-agent.ps1" -OutFile (Join-Path $installDir 'pc-agent.ps1')
Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/supervisor.ps1" -OutFile (Join-Path $installDir 'supervisor.ps1')

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*CameraPC*' -and $_.ProcessId -ne $PID } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
  '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $installDir 'supervisor.ps1')
)

Write-Host 'CameraPC Agent updated and restarted.' -ForegroundColor Green
Write-Host "Device: $($cfg.DEVICE_ID)"
Write-Host 'Live mode will automatically activate when the dashboard opens this PC.'
