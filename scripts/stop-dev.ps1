$ErrorActionPreference = "SilentlyContinue"

Get-Process audio_visualizer_widget,cargo,rustc -ErrorAction SilentlyContinue | Stop-Process -Force

$portOwners = netstat -ano |
  Select-String ":1420" |
  ForEach-Object {
    ($_ -split "\s+")[-1]
  } |
  Where-Object {
    $_ -match "^\d+$" -and $_ -ne "0"
  } |
  Sort-Object -Unique

foreach ($processId in $portOwners) {
  Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
}
