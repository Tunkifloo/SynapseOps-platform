<#
.SYNOPSIS
  RN-001 · Muestrea el consumo de RAM/CPU del stack durante la prueba de carga.

.DESCRIPTION
  Toma muestras de `docker stats` cada IntervalSec durante DurationSec, suma el uso
  de TODOS los contenedores por muestra y registra el PICO total de RAM y CPU. Evalúa
  el criterio RN-001: RAM total <= 6 GB y CPU total <= 4 núcleos (400%) durante la ventana.

.EXAMPLE
  .\measure_resources.ps1 -DurationSec 180 -IntervalSec 3
#>
param(
  [int]$DurationSec = 180,
  [int]$IntervalSec = 3,
  [string]$OutFile = "infra/load-tests/resource-usage.csv"
)

$RAM_BUDGET_MB = 6144      # 6 GB
$CPU_BUDGET_PCT = 400      # 4 núcleos

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

"timestamp,total_ram_mb,total_cpu_pct,containers" | Out-File -FilePath $OutFile -Encoding utf8
$peakRam = 0.0; $peakCpu = 0.0; $samples = 0
$end = (Get-Date).AddSeconds($DurationSec)
Write-Host "Muestreando $DurationSec s cada $IntervalSec s (RN-001)..." -ForegroundColor Cyan

while ((Get-Date) -lt $end) {
  $raw = docker stats --no-stream --format "{{.MemUsage}};{{.CPUPerc}}" 2>$null
  $ram = 0.0; $cpu = 0.0; $n = 0
  foreach ($line in $raw) {
    if (-not $line) { continue }
    $parts = $line -split ';'
    $ram += ConvertTo-MB(($parts[0] -split '/')[0].Trim())
    $cpu += [double]($parts[1] -replace '[%\s]', '')
    $n++
  }
  $ram = [math]::Round($ram, 1); $cpu = [math]::Round($cpu, 1)
  if ($ram -gt $peakRam) { $peakRam = $ram }
  if ($cpu -gt $peakCpu) { $peakCpu = $cpu }
  $samples++
  "$(Get-Date -Format o),$ram,$cpu,$n" | Out-File -FilePath $OutFile -Append -Encoding utf8
  Start-Sleep -Seconds $IntervalSec
}

$ramOk = $peakRam -le $RAM_BUDGET_MB
$cpuOk = $peakCpu -le $CPU_BUDGET_PCT
Write-Host ""
Write-Host "── RN-001 · Consumo de hardware durante la carga ──" -ForegroundColor Cyan
Write-Host ("  Muestras           : {0}" -f $samples)
Write-Host ("  PICO RAM total     : {0:N0} MB ({1:N2} GB)   {2} (<= 6 GB)" -f $peakRam, ($peakRam/1024), $(if($ramOk){'OK'}else{'FALLA'}))
Write-Host ("  PICO CPU total     : {0:N0} %  ({1:N1} núcleos)  {2} (<= 4)" -f $peakCpu, ($peakCpu/100), $(if($cpuOk){'OK'}else{'FALLA'}))
Write-Host ("  RN-001: {0}" -f $(if($ramOk -and $cpuOk){'CUMPLE'}else{'NO CUMPLE'})) -ForegroundColor $(if($ramOk -and $cpuOk){'Green'}else{'Red'})
Write-Host ("  Detalle por muestra: {0}" -f $OutFile)
