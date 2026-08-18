param(
  [Parameter(Mandatory=$true)][string]$Server,
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$DeviceId = $env:COMPUTERNAME,
  [string]$Group = 'VN UTI',
  [int]$ThumbFrameIntervalMs = 1800,
  [int]$LiveFrameIntervalMs = 160,
  [int]$ThumbJpegQuality = 30,
  [int]$LiveJpegQuality = 45,
  [double]$ThumbScale = 0.35,
  [double]$LiveScale = 0.65
)

$ErrorActionPreference = 'Stop'
$installDir = "$env:ProgramData\CameraPC"
$startupDir = [Environment]::GetFolderPath('Startup')
$startupCmd = Join-Path $startupDir 'CameraPC-Agent.cmd'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$repoBase = 'https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent'
Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/pc-agent.ps1" -OutFile (Join-Path $installDir 'pc-agent.ps1')
Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/supervisor.ps1" -OutFile (Join-Path $installDir 'supervisor.ps1')

$config = [ordered]@{
  CONTROL_SERVER = $Server
  AGENT_TOKEN = $Token
  DEVICE_ID = $DeviceId
  DEVICE_GROUP = $Group
  THUMB_FRAME_INTERVAL_MS = $ThumbFrameIntervalMs
  LIVE_FRAME_INTERVAL_MS = $LiveFrameIntervalMs
  THUMB_JPEG_QUALITY = $ThumbJpegQuality
  LIVE_JPEG_QUALITY = $LiveJpegQuality
  THUMB_SCALE = $ThumbScale
  LIVE_SCALE = $LiveScale
  AGENT_PATH = (Join-Path $installDir 'pc-agent.ps1')
}
$config | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $installDir 'config.json') -Encoding UTF8

$cmdLines = @(
  '@echo off',
  'start "CameraPC Agent" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ProgramData%\CameraPC\supervisor.ps1"'
)
$cmdLines | Set-Content -Path $startupCmd -Encoding ASCII

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*CameraPC*' } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
  '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $installDir 'supervisor.ps1')
)

Write-Host ''
Write-Host 'CameraPC Agent installed successfully.' -ForegroundColor Green
Write-Host "Device: $DeviceId"
Write-Host "Server: $Server"
Write-Host "Group: $Group"
Write-Host "Live profile: ${LiveFrameIntervalMs}ms, JPEG ${LiveJpegQuality}, scale ${LiveScale}"
Write-Host "Startup: $startupCmd"
Write-Host 'The agent auto-starts after Windows sign-in, reconnects forever, and restarts automatically if it exits.'
Write-Host ''
