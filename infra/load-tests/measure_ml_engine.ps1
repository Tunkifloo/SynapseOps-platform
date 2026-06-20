<#
.SYNOPSIS
  Fase 0 · Vigila la memoria/CPU del ml-engine durante un entrenamiento y detecta OOM.

.DESCRIPTION
  Muestrea `docker stats ml-engine` cada IntervalSec durante DurationSec y registra el
  PICO de RAM (MB/GB), el % sobre su mem_limit y el pico de CPU. Además detecta si el
  contenedor fue MATADO por OOM (State.OOMKilled) o REINICIADO (RestartCount sube),
  que es justo el síntoma del colapso con datasets grandes.

  Úsalo así: arranca este script y, en paralelo, lanza el entrenamiento del dataset
  de prueba (p. ej. 70k imágenes) desde el lienzo. Compara el "antes" (sin .wslconfig
  ni mem_limit) con el "después" (Fase 0 aplicada).

.EXAMPLE
  .\measure_ml_engine.ps1 -DurationSec 600 -IntervalSec 3
#>
param(
  [string]$Container  = "ml-engine",
  [int]$DurationSec   = 600,
  [int]$IntervalSec   = 3,
  [string]$OutFile    = ""
)

# Ruta de salida robusta: junto a este script, sin importar el CWD desde el que se lance.
if (-not $OutFile) { $OutFile = Join-Path $PSScriptRoot "ml-engine-memory.csv" }
$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

function ConvertTo-MB([string]$s) {
  if ($s -match '([\d.]+)\s*([KMGT]?i?B)') {
    $v = [double]$matches[1]; $u = $matches[2]
    switch ($u) {
      'B'   { return $v / 1MB }
      'KiB' { return $v / 1024 }; 'KB' { return $v / 1000 }
      'MiB' { return $v };        'MB' { return $v }
      'GiB' { return $v * 1024 }; 'GB' { return $v * 1000 }
      'TiB' { return $v * 1048576 }
    }
  }
  return 0
}

# RestartCount inicial: cualquier incremento durante la ventana = el contenedor se cayó.
$startRestarts = [int](docker inspect $Container --format '{{.RestartCount}}' 2>$null)
if ($null -eq $startRestarts) {
  Write-Host "No se encontró el contenedor '$Container'. ¿Está levantado el stack?" -ForegroundColor Red
  exit 1
}

"timestamp,mem_mb,mem_pct,cpu_pct,restart_count,oom_killed" | Out-File -FilePath $OutFile -Encoding utf8
$peakRamMb = 0.0; $peakMemPct = 0.0; $peakCpu = 0.0; $samples = 0
$oomSeen = $false; $restartSeen = $false
$end = (Get-Date).AddSeconds($DurationSec)
Write-Host "Vigilando '$Container' $DurationSec s cada $IntervalSec s (Ctrl+C para cortar antes)..." -ForegroundColor Cyan

while ((Get-Date) -lt $end) {
  $raw = docker stats $Container --no-stream --format "{{.MemUsage}};{{.MemPerc}};{{.CPUPerc}}" 2>$null
  $memMb = 0.0; $memPct = 0.0; $cpu = 0.0
  if ($raw) {
    $parts  = $raw -split ';'
    $memMb  = ConvertTo-MB(($parts[0] -split '/')[0].Trim())
    $memPct = [double]($parts[1] -replace '[%\s]', '')
    $cpu    = [double]($parts[2] -replace '[%\s]', '')
  }
  $insp     = docker inspect $Container --format '{{.RestartCount}};{{.State.OOMKilled}}' 2>$null
  $restarts = $startRestarts; $oom = $false
  if ($insp) {
    $ip = $insp -split ';'
    $restarts = [int]$ip[0]
    $oom = ($ip[1] -eq 'true')
  }
  if ($restarts -gt $startRestarts) { $restartSeen = $true }
  if ($oom) { $oomSeen = $true }

  $memMb = [math]::Round($memMb, 1); $memPct = [math]::Round($memPct, 1); $cpu = [math]::Round($cpu, 1)
  if ($memMb  -gt $peakRamMb)  { $peakRamMb  = $memMb }
  if ($memPct -gt $peakMemPct) { $peakMemPct = $memPct }
  if ($cpu    -gt $peakCpu)    { $peakCpu    = $cpu }
  $samples++
  "$(Get-Date -Format o),$memMb,$memPct,$cpu,$restarts,$oom" | Out-File -FilePath $OutFile -Append -Encoding utf8
  Start-Sleep -Seconds $IntervalSec
}

$verdict = if ($oomSeen -or $restartSeen) { 'COLAPSÓ (OOM/reinicio)' } else { 'SOBREVIVIÓ' }
$color   = if ($oomSeen -or $restartSeen) { 'Red' } else { 'Green' }
Write-Host ""
Write-Host "── Fase 0 · Memoria del '$Container' durante el entrenamiento ──" -ForegroundColor Cyan
Write-Host ("  Muestras            : {0}" -f $samples)
Write-Host ("  PICO RAM            : {0:N0} MB ({1:N2} GB)" -f $peakRamMb, ($peakRamMb/1024))
Write-Host ("  PICO % de mem_limit : {0:N1} %" -f $peakMemPct)
Write-Host ("  PICO CPU            : {0:N0} %  ({1:N1} núcleos)" -f $peakCpu, ($peakCpu/100))
Write-Host ("  OOM-killed          : {0}" -f $oomSeen)
Write-Host ("  Reinicios           : {0}" -f $(if($restartSeen){'SÍ'}else{'no'}))
Write-Host ("  Veredicto           : {0}" -f $verdict) -ForegroundColor $color
Write-Host ("  Detalle por muestra : {0}" -f $OutFile)
