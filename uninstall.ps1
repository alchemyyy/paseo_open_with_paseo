# Removes the open-with-paseo plugin, its Explorer menu entry, and its launcher/request folder.
# Usage: powershell -ExecutionPolicy Bypass -File uninstall.ps1 [-PaseoCli <path to paseo.cmd>]
param(
  [string]$PaseoCli
)

$ErrorActionPreference = "Stop"
$PluginId = "open-with-paseo"

if (-not $PaseoCli) {
  $onPath = Get-Command paseo -ErrorAction SilentlyContinue
  $PaseoCli = if ($onPath) { $onPath.Source } else { Join-Path $env:ProgramFiles "Paseo\resources\bin\paseo.cmd" }
}

# Remove the plugin first: while loaded it re-registers the menu entry
$installed = (& $PaseoCli plugin ls --json | Out-String | ConvertFrom-Json) | Where-Object { $_.id -eq $PluginId }
if ($installed) {
  & $PaseoCli plugin remove $PluginId
  if ($LASTEXITCODE -ne 0) { throw "paseo plugin remove $PluginId failed with exit code $LASTEXITCODE" }
}

foreach ($key in @(
  "HKCU:\Software\Classes\Directory\shell\OpenWithPaseo",
  "HKCU:\Software\Classes\Directory\Background\shell\OpenWithPaseo"
)) {
  if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force }
}

$home_ = if ($env:PASEO_HOME) { $env:PASEO_HOME } else { Join-Path $HOME ".paseo" }
$dataDirectory = Join-Path $home_ "open-with-paseo"
if (Test-Path -LiteralPath $dataDirectory) { Remove-Item -LiteralPath $dataDirectory -Recurse -Force }

Write-Host "Removed $PluginId and its Explorer menu entry"
