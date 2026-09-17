$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Browser {
  $paths = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
  )
  foreach ($p in $paths) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  foreach ($key in @(
      "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
      "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    )) {
    try {
      $def = (Get-ItemProperty -Path $key -ErrorAction Stop).'(default)'
      if ($def -and (Test-Path -LiteralPath $def)) { return $def }
    } catch {}
  }
  return $null
}

$browser = Find-Browser
$started = $false
$port = 18765
$listener = $null
while ($port -lt 18800) {
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
    $started = $true
    break
  } catch {
    $port++
    $listener = $null
  }
}

$appUrl = $null
if ($started) {
  $appUrl = "http://127.0.0.1:$port/"
} else {
  $html = Join-Path $root "index.html"
  $appUrl = ([Uri]$html).AbsoluteUri
}

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList @("--app=$appUrl")
} else {
  Start-Process $appUrl
}

if (-not $started) { exit 0 }

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
  $rel = $rel -replace "/", "\"
  $file = Join-Path $root $rel
  $fullRoot = [IO.Path]::GetFullPath($root)
  $fullFile = [IO.Path]::GetFullPath($file)
  $res = $ctx.Response
  try {
    if (-not $fullFile.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $fullFile -PathType Leaf)) {
      $res.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes("Not found")
      $res.OutputStream.Write($buf, 0, $buf.Length)
    } else {
      $ext = [IO.Path]::GetExtension($fullFile).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = "application/octet-stream" }
      $bytes = [IO.File]::ReadAllBytes($fullFile)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } finally {
    $res.OutputStream.Close()
  }
}
