param(
  [string]$Server = $env:CONTROL_SERVER,
  [string]$Token = $env:AGENT_TOKEN,
  [string]$DeviceId = $env:DEVICE_ID,
  [string]$Group = $env:DEVICE_GROUP,
  [int]$FrameIntervalMs = $(if ($env:FRAME_INTERVAL_MS) { [int]$env:FRAME_INTERVAL_MS } else { 800 })
)

$ErrorActionPreference = 'Stop'

if (-not $Server) { $Server = 'ws://127.0.0.1:3000/ws' }
if (-not $Token) { $Token = 'change-agent-token' }
if (-not $DeviceId) { $DeviceId = $env:COMPUTERNAME }
if (-not $Group) { $Group = 'VanPhong' }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PcControlNative {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
}
"@

function Write-AgentLog([string]$Message) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host "[$ts] $Message"
}

function Send-Json {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [hashtable]$Payload
  )
  $json = $Payload | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
  $task = $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None)
  $task.Wait()
}

function Get-ScreenInfo {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  return @{ width = $bounds.Width; height = $bounds.Height }
}

function Get-ScreenJpegBase64 {
  param([int]$Quality = 55)

  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $stream = New-Object System.IO.MemoryStream
    try {
      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
      $encoder = [System.Drawing.Imaging.Encoder]::Quality
      $params = New-Object System.Drawing.Imaging.EncoderParameters 1
      $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]$Quality)
      $bitmap.Save($stream, $codec, $params)
      return [Convert]::ToBase64String($stream.ToArray())
    } finally {
      if ($params) { $params.Dispose() }
      $stream.Dispose()
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Send-Frame {
  param([System.Net.WebSockets.ClientWebSocket]$Socket)
  $screen = Get-ScreenInfo
  $data = Get-ScreenJpegBase64
  Send-Json $Socket @{
    type = 'agent:frame'
    width = $screen.width
    height = $screen.height
    data = $data
  }
}

function Escape-SendKeysText([string]$Text) {
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $Text.ToCharArray()) {
    $s = [string]$char
    if ('+^%~(){}[]'.Contains($s)) {
      [void]$builder.Append('{').Append($s).Append('}')
    } else {
      [void]$builder.Append($s)
    }
  }
  return $builder.ToString()
}

function Send-KeyCommand($Args) {
  $key = [string]$Args.key
  $map = @{
    'Enter' = '{ENTER}'
    'Escape' = '{ESC}'
    'Backspace' = '{BACKSPACE}'
    'Tab' = '{TAB}'
    'Delete' = '{DELETE}'
    'ArrowUp' = '{UP}'
    'ArrowDown' = '{DOWN}'
    'ArrowLeft' = '{LEFT}'
    'ArrowRight' = '{RIGHT}'
    'Home' = '{HOME}'
    'End' = '{END}'
    'PageUp' = '{PGUP}'
    'PageDown' = '{PGDN}'
    'F1' = '{F1}'
    'F2' = '{F2}'
    'F3' = '{F3}'
    'F4' = '{F4}'
    'F5' = '{F5}'
    'F6' = '{F6}'
    'F7' = '{F7}'
    'F8' = '{F8}'
    'F9' = '{F9}'
    'F10' = '{F10}'
    'F11' = '{F11}'
    'F12' = '{F12}'
  }

  if ($map.ContainsKey($key)) { $send = $map[$key] }
  elseif ($key.Length -eq 1) { $send = Escape-SendKeysText $key }
  else { return }

  $prefix = ''
  if ($Args.ctrl) { $prefix += '^' }
  if ($Args.alt) { $prefix += '%' }
  if ($Args.shift) { $prefix += '+' }
  [System.Windows.Forms.SendKeys]::SendWait($prefix + $send)
}

function Move-Pointer($Args) {
  $screen = Get-ScreenInfo
  $xNorm = [Math]::Max(0, [Math]::Min(1, [double]$Args.x))
  $yNorm = [Math]::Max(0, [Math]::Min(1, [double]$Args.y))
  $x = [int][Math]::Round(($screen.width - 1) * $xNorm)
  $y = [int][Math]::Round(($screen.height - 1) * $yNorm)
  [void][PcControlNative]::SetCursorPos($x, $y)
}

function Click-Pointer($Args, [bool]$Double = $false) {
  Move-Pointer $Args
  $right = ([string]$Args.button -eq 'right')
  $down = if ($right) { [PcControlNative]::MOUSEEVENTF_RIGHTDOWN } else { [PcControlNative]::MOUSEEVENTF_LEFTDOWN }
  $up = if ($right) { [PcControlNative]::MOUSEEVENTF_RIGHTUP } else { [PcControlNative]::MOUSEEVENTF_LEFTUP }
  $count = if ($Double) { 2 } else { 1 }
  for ($i = 0; $i -lt $count; $i++) {
    [PcControlNative]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 35
    [PcControlNative]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    if ($Double) { Start-Sleep -Milliseconds 70 }
  }
}

function Open-Url([string]$Url) {
  $uri = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { throw 'Invalid URL' }
  if ($uri.Scheme -notin @('http','https')) { throw 'Only http/https URLs are allowed' }

  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) {
    Start-Process -FilePath $chrome -ArgumentList $Url
    return
  }

  $edge = "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  if (Test-Path $edge) {
    Start-Process -FilePath $edge -ArgumentList $Url
    return
  }

  Start-Process $Url
}

function Handle-Command {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    $Message
  )

  $cmd = [string]$Message.command
  $args = $Message.args
  try {
    switch ($cmd) {
      'mouseMove' { Move-Pointer $args }
      'mouseClick' { Click-Pointer $args $false }
      'mouseDoubleClick' { Click-Pointer $args $true }
      'key' { Send-KeyCommand $args }
      'text' {
        $safe = Escape-SendKeysText ([string]$args.text)
        [System.Windows.Forms.SendKeys]::SendWait($safe)
      }
      'openUrl' { Open-Url ([string]$args.url) }
      'screenshot' { Send-Frame $Socket }
      'ping' { }
      default { throw "Unsupported command: $cmd" }
    }

    Send-Json $Socket @{
      type = 'agent:event'
      event = 'command:done'
      detail = "Completed: $cmd"
      ok = $true
      commandId = $Message.commandId
    }
  } catch {
    Send-Json $Socket @{
      type = 'agent:event'
      event = 'command:error'
      detail = "Command failed $cmd`: $($_.Exception.Message)"
      ok = $false
      commandId = $Message.commandId
    }
  }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' PC CONTROL CENTER AGENT' -ForegroundColor Cyan
Write-Host ' This agent allows viewing and controlling this PC from Control Center.'
Write-Host ' Run only on PCs you own or are authorized to manage. Press Ctrl+C to stop.'
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

while ($true) {
  $socket = New-Object System.Net.WebSockets.ClientWebSocket
  try {
    Write-AgentLog "Connecting to $Server ..."
    $socket.ConnectAsync([Uri]$Server, [System.Threading.CancellationToken]::None).Wait()

    $screen = Get-ScreenInfo
    Send-Json $socket @{
      type = 'auth'
      role = 'agent'
      token = $Token
      deviceId = $DeviceId
      name = $env:COMPUTERNAME
      group = $Group
      platform = "Windows $([Environment]::OSVersion.Version)"
      username = "$env:USERDOMAIN\$env:USERNAME"
      hostname = $env:COMPUTERNAME
      screen = $screen
    }
    Write-AgentLog "Connected. Device ID: $DeviceId"

    $buffer = New-Object byte[] 65536
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $receiveTask = $null
    $nextFrame = Get-Date
    $nextStatus = Get-Date

    while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
      $now = Get-Date

      if ($now -ge $nextFrame) {
        try { Send-Frame $socket } catch { Write-AgentLog "Frame send failed: $($_.Exception.Message)" }
        $nextFrame = $now.AddMilliseconds([Math]::Max(250, $FrameIntervalMs))
      }

      if ($now -ge $nextStatus) {
        Send-Json $socket @{
          type = 'agent:status'
          cpu = 0
          ram = 0
          screen = Get-ScreenInfo
        }
        $nextStatus = $now.AddSeconds(10)
      }

      if (-not $receiveTask) {
        $receiveTask = $socket.ReceiveAsync($segment, [System.Threading.CancellationToken]::None)
      }

      if ($receiveTask.IsCompleted) {
        $result = $receiveTask.Result
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
        if ($result.Count -gt 0) {
          $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
          try {
            $msg = $text | ConvertFrom-Json
            if ($msg.type -eq 'control:command') { Handle-Command $socket $msg }
          } catch {
            Write-AgentLog "Ignoring invalid message: $($_.Exception.Message)"
          }
        }
        $receiveTask = $null
      }

      Start-Sleep -Milliseconds 20
    }
  } catch {
    Write-AgentLog "Disconnected: $($_.Exception.Message)"
  } finally {
    try { $socket.Dispose() } catch { }
  }

  Write-AgentLog 'Reconnect in 3 seconds...'
  Start-Sleep -Seconds 3
}
