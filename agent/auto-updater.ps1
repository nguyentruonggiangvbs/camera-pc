param(
  [string]$ConfigPath = "$env:ProgramData\CameraPC\config.json"
)

$ErrorActionPreference = 'Continue'
$installDir = Split-Path -Parent $ConfigPath
$versionPath = Join-Path $installDir 'version.txt'
$logPath = Join-Path $installDir 'updater.log'
$repoBase = 'https://raw.githubusercontent.com/nguyentruonggiangvbs/camera-pc/main/agent'

function Write-UpdateLog([string]$Message) {
  try {
    Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
  } catch {}
}

function Get-LocalVersion {
  try {
    if (Test-Path $versionPath) { return (Get-Content -Raw $versionPath).Trim() }
  } catch {}
  return '0.0.0'
}

function Get-HttpBase([string]$WsUrl) {
  if ($WsUrl -match '^wss://') { return ($WsUrl -replace '^wss://','https://' -replace '/ws$','') }
  return ($WsUrl -replace '^ws://','http://' -replace '/ws$','')
}

function Restart-DesktopAgent {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*CameraPC*pc-agent.ps1*' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}

function Install-Latest([string]$TargetVersion) {
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $files = @('pc-agent.ps1','supervisor.ps1','auto-updater.ps1','update-agent.ps1')
  foreach ($file in $files) {
    $target = Join-Path $installDir $file
    $tmp = "$target.download"
    Invoke-WebRequest -UseBasicParsing -Uri "$repoBase/$file?t=$stamp" -OutFile $tmp -TimeoutSec 30
    Move-Item -Force $tmp $target
  }
  Set-Content -Path $versionPath -Value $TargetVersion -Encoding ASCII
  Write-UpdateLog "Updated files to version $TargetVersion; restarting desktop agent"
  Restart-DesktopAgent
}

Write-UpdateLog 'Auto updater started'

while ($true) {
  try {
    if (-not (Test-Path $ConfigPath)) {
      Write-UpdateLog "Config not found: $ConfigPath"
      Start-Sleep -Seconds 15
      continue
    }

    $cfg = Get-Content -Raw $ConfigPath | ConvertFrom-Json
    $autoUpdate = if ($null -ne $cfg.AUTO_UPDATE) { [bool]$cfg.AUTO_UPDATE } else { $true }
    $deviceId = [string]$cfg.DEVICE_ID
    $token = [string]$cfg.AGENT_TOKEN
    $server = [string]$cfg.CONTROL_SERVER
    $localVersion = Get-LocalVersion

    if ($autoUpdate -and $deviceId -and $token -and $server) {
      $base = Get-HttpBase $server
      $headers = @{ 'x-agent-token' = $token }
      $body = @{ deviceId = $deviceId; currentVersion = $localVersion } | ConvertTo-Json -Compress
      $status = Invoke-RestMethod -Method Post -Uri "$base/api/agent/update-check" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 15
      if ($status.latestVersion) {
        $remote = [string]$status.latestVersion
        if ([bool]$status.force -or [bool]$status.updateAvailable) {
          Write-UpdateLog "Update requested: local=$localVersion latest=$remote force=$($status.force)"
          Install-Latest $remote
          Start-Sleep -Seconds 10
        }
      }
    }
  } catch {
    Write-UpdateLog "Check failed: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 15
}
