param(
  [string]$Server = $env:CONTROL_SERVER,
  [string]$Token = $env:AGENT_TOKEN,
  [string]$DeviceId = $env:DEVICE_ID,
  [string]$Group = $env:DEVICE_GROUP
)

$ErrorActionPreference = 'Stop'

if (-not $Server) { $Server = 'ws://127.0.0.1:3000/ws' }
if (-not $Token) { $Token = 'change-agent-token' }
if (-not $DeviceId) { $DeviceId = $env:COMPUTERNAME }
if (-not $Group) { $Group = 'VN UTI' }

$ThumbIntervalMs = if ($env:THUMB_FRAME_INTERVAL_MS) { [int]$env:THUMB_FRAME_INTERVAL_MS } else { 1800 }
$LiveIntervalMs = if ($env:LIVE_FRAME_INTERVAL_MS) { [int]$env:LIVE_FRAME_INTERVAL_MS } else { 160 }
$ThumbQuality = if ($env:THUMB_JPEG_QUALITY) { [int]$env:THUMB_JPEG_QUALITY } else { 30 }
$LiveQuality = if ($env:LIVE_JPEG_QUALITY) { [int]$env:LIVE_JPEG_QUALITY } else { 45 }
$ThumbScale = if ($env:THUMB_SCALE) { [double]$env:THUMB_SCALE } else { 0.35 }
$LiveScale = if ($env:LIVE_SCALE) { [double]$env:LIVE_SCALE } else { 0.65 }
$script:StreamMode = 'thumbnail'

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
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [hashtable]$Payload)
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

function Get-ScreenFrame {
  param([int]$Quality, [double]$Scale)

  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $scaleSafe = [Math]::Max(0.25, [Math]::Min(1.0, $Scale))
  $targetWidth = [Math]::Max(320, [int][Math]::Round($bounds.Width * $scaleSafe))
  $targetHeight = [Math]::Max(180, [int][Math]::Round($bounds.Height * $scaleSafe))

  $source = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $gSource = [System.Drawing.Graphics]::FromImage($source)
  try {
    $gSource.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $target = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    $gTarget = [System.Drawing.Graphics]::FromImage($target)
    try {
      $gTarget.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $gTarget.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
      $gTarget.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Low
      $gTarget.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighSpeed
      $gTarget.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighSpeed
      $gTarget.DrawImage($source, 0, 0, $targetWidth, $targetHeight)

      $stream = New-Object System.IO.MemoryStream
      try {
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $encoder = [System.Drawing.Imaging.Encoder]::Quality
        $params = New-Object System.Drawing.Imaging.EncoderParameters 1
        try {
          $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long][Math]::Max(20, [Math]::Min(80, $Quality)))
          $target.Save($stream, $codec, $params)
          return @{
            data = [Convert]::ToBase64String($stream.ToArray())
            width = $targetWidth
            height = $targetHeight
          }
        } finally {
          $params.Dispose()
        }
      } finally {
        $stream.Dispose()
      }
    } finally {
      $gTarget.Dispose()
      $target.Dispose()
    }
  } finally {
    $gSource.Dispose()
    $source.Dispose()
  }
}

function Send-Frame {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [switch]$ForceLive)
  $isLive = $ForceLive -or $script:StreamMode -eq 'live'
  $quality = if ($isLive) { $LiveQuality } else { $ThumbQuality }
  $scale = if ($isLive) { $LiveScale } else { $ThumbScale }
  $frame = Get-ScreenFrame -Quality $quality -Scale $scale
  Send-Json $Socket @{
    type = 'agent:frame'
    width = $frame.width
    height = $frame.height
    mode = if ($isLive) { 'live' } else { 'thumbnail' }
    data = $frame.data
  }
}

function Escape-SendKeysText([string]$Text) {
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $Text.ToCharArray()) {
    $s = [string]$char
    if ('+^%~(){}[]'.Contains($s)) { [void]$builder.Append('{').Append($s).Append('}') }
    else { [void]$builder.Append($s) }
  }
  return $builder.ToString()
}

function Send-KeyCommand($Args) {
  $key = [string]$Args.key
  $map = @{
    'Enter'='{ENTER}'; 'Escape'='{ESC}'; 'Backspace'='{BACKSPACE}'; 'Tab'='{TAB}'; 'Delete'='{DELETE}';
    'ArrowUp'='{UP}'; 'ArrowDown'='{DOWN}'; 'ArrowLeft'='{LEFT}'; 'ArrowRight'='{RIGHT}';
    'Home'='{HOME}'; 'End'='{END}'; 'PageUp'='{PGUP}'; 'PageDown'='{PGDN}';
    'F1'='{F1}'; 'F2'='{F2}'; 'F3'='{F3}'; 'F4'='{F4}'; 'F5'='{F5}'; 'F6'='{F6}';
    'F7'='{F7}'; 'F8'='{F8}'; 'F9'='{F9}'; 'F10'='{F10}'; 'F11'='{F11}'; 'F12'='{F12}'
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
  for ($i=0; $i -lt $count; $i++) {
    [PcControlNative]::mouse_event($down,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 25
    [PcControlNative]::mouse_event($up,0,0,0,[UIntPtr]::Zero)
    if ($Double) { Start-Sleep -Milliseconds 60 }
  }
}

function Open-Url([string]$Url) {
  $uri = $null
  if (-not [Uri]::TryCreate($Url,[UriKind]::Absolute,[ref]$uri)) { throw 'Invalid URL' }
  if ($uri.Scheme -notin @('http','https')) { throw 'Only http/https URLs are allowed' }
  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  $chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) { Start-Process -FilePath $chrome -ArgumentList $Url; return }
  $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  if (Test-Path $edge) { Start-Process -FilePath $edge -ArgumentList $Url; return }
  Start-Process $Url
}

function Handle-Command {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, $Message)
  $cmd = [string]$Message.command
  $args = $Message.args
  try {
    switch ($cmd) {
      'mouseMove' { Move-Pointer $args }
      'mouseClick' { Click-Pointer $args $false }
      'mouseDoubleClick' { Click-Pointer $args $true }
      'key' { Send-KeyCommand $args }
      'text' { [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeysText ([string]$args.text))) }
      'openUrl' { Open-Url ([string]$args.url) }
      'screenshot' { Send-Frame $Socket -ForceLive }
      'ping' { }
      default { throw "Unsupported command: $cmd" }
    }
    Send-Json $Socket @{ type='agent:event'; event='command:done'; detail="Completed: $cmd"; ok=$true; commandId=$Message.commandId }
  } catch {
    Send-Json $Socket @{ type='agent:event'; event='command:error'; detail="Command failed $cmd`: $($_.Exception.Message)"; ok=$false; commandId=$Message.commandId }
  }
}

Write-AgentLog "CameraPC starting. Device ID: $DeviceId"

while ($true) {
  $socket = New-Object System.Net.WebSockets.ClientWebSocket
  try {
    Write-AgentLog "Connecting to $Server ..."
    $socket.ConnectAsync([Uri]$Server,[System.Threading.CancellationToken]::None).Wait()
    $screen = Get-ScreenInfo
    Send-Json $socket @{
      type='auth'; role='agent'; token=$Token; deviceId=$DeviceId; name=$env:COMPUTERNAME; group=$Group;
      platform="Windows $([Environment]::OSVersion.Version)"; username="$env:USERDOMAIN\$env:USERNAME";
      hostname=$env:COMPUTERNAME; screen=$screen
    }
    Write-AgentLog "Connected. Device ID: $DeviceId"

    $script:StreamMode = 'thumbnail'
    $buffer = New-Object byte[] 131072
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $receiveTask = $null
    $nextFrame = Get-Date
    $nextStatus = Get-Date

    while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
      $now = Get-Date
      if ($now -ge $nextFrame) {
        try { Send-Frame $socket } catch { Write-AgentLog "Frame send failed: $($_.Exception.Message)" }
        $interval = if ($script:StreamMode -eq 'live') { [Math]::Max(100,$LiveIntervalMs) } else { [Math]::Max(1000,$ThumbIntervalMs) }
        $nextFrame = (Get-Date).AddMilliseconds($interval)
      }

      if ($now -ge $nextStatus) {
        Send-Json $socket @{ type='agent:status'; cpu=0; ram=0; screen=Get-ScreenInfo }
        $nextStatus = $now.AddSeconds(10)
      }

      if (-not $receiveTask) {
        $receiveTask = $socket.ReceiveAsync($segment,[System.Threading.CancellationToken]::None)
      }

      if ($receiveTask.IsCompleted) {
        $result = $receiveTask.Result
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { break }
        if ($result.Count -gt 0) {
          $text = [System.Text.Encoding]::UTF8.GetString($buffer,0,$result.Count)
          try {
            $msg = $text | ConvertFrom-Json
            if ($msg.type -eq 'control:command') {
              Handle-Command $socket $msg
            } elseif ($msg.type -eq 'control:stream') {
              $newMode = if ([string]$msg.mode -eq 'live') { 'live' } else { 'thumbnail' }
              if ($newMode -ne $script:StreamMode) {
                $script:StreamMode = $newMode
                $nextFrame = Get-Date
                Write-AgentLog "Stream mode: $newMode"
              }
            }
          } catch {
            Write-AgentLog "Ignoring invalid message: $($_.Exception.Message)"
          }
        }
        $receiveTask = $null
      }
      Start-Sleep -Milliseconds 10
    }
  } catch {
    Write-AgentLog "Disconnected: $($_.Exception.Message)"
  } finally {
    try { $socket.Dispose() } catch { }
  }
  Write-AgentLog 'Reconnect in 3 seconds...'
  Start-Sleep -Seconds 3
}
