param(
  [string]$ConfigPath = "$env:ProgramData\CameraPC\config.json"
)

$ErrorActionPreference = 'Stop'

function Write-SupervisorLog([string]$Message) {
  try {
    $dir = Split-Path -Parent $ConfigPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path (Join-Path $dir 'supervisor.log') -Value $line -Encoding UTF8
  } catch { }
}

while ($true) {
  try {
    if (-not (Test-Path $ConfigPath)) {
      Write-SupervisorLog "Config not found: $ConfigPath"
      Start-Sleep -Seconds 5
      continue
    }

    $cfg = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
    $agentPath = if ($cfg.AGENT_PATH) { [string]$cfg.AGENT_PATH } else { "$env:ProgramData\CameraPC\pc-agent.ps1" }

    if (-not (Test-Path $agentPath)) {
      Write-SupervisorLog "Agent not found: $agentPath"
      Start-Sleep -Seconds 5
      continue
    }

    $env:CONTROL_SERVER = [string]$cfg.CONTROL_SERVER
    $env:AGENT_TOKEN = [string]$cfg.AGENT_TOKEN
    $env:DEVICE_ID = [string]$cfg.DEVICE_ID
    $env:DEVICE_GROUP = [string]$cfg.DEVICE_GROUP
    if ($cfg.FRAME_INTERVAL_MS) { $env:FRAME_INTERVAL_MS = [string]$cfg.FRAME_INTERVAL_MS }

    Write-SupervisorLog "Starting desktop agent for $($env:DEVICE_ID)"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath
    $exitCode = $LASTEXITCODE
    Write-SupervisorLog "Desktop agent exited with code $exitCode; restarting in 3 seconds"
  } catch {
    Write-SupervisorLog "Supervisor error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 3
}
