# Starts the private development PostgreSQL used by the VS Code tasks (idempotent; safe to run repeatedly).
#   Data folder: .localdb\   Port: 127.0.0.1:5433   Auth: trust, local-only (development use only).
#   Databases:   sra (app)   sra_test (pytest; wiped on each test run)
# PostgreSQL binaries come from a system install or the project's conda environment (.pgenv, created on first use).
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

$pgBin = $null
$local = Join-Path $Root '.pgenv\Library\bin\pg_ctl.exe'
if (Test-Path $local) { $pgBin = Split-Path $local }
elseif (Has 'pg_ctl') { $pgBin = Split-Path (Get-Command pg_ctl).Source }
else {
  $cand = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_ctl.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($cand) { $pgBin = $cand.DirectoryName }
}
if (-not $pgBin) {
  $conda = $null
  foreach ($c in @("$env:USERPROFILE\anaconda3\Scripts\conda.exe", "$env:USERPROFILE\miniconda3\Scripts\conda.exe", "$env:ProgramData\anaconda3\Scripts\conda.exe")) { if (Test-Path $c) { $conda = $c; break } }
  if (-not $conda -and (Has 'conda')) { $conda = (Get-Command conda).Source }
  if (-not $conda) { Write-Error 'PostgreSQL not found. Install PostgreSQL 16 or Anaconda/Miniconda, or use Docker (docker compose up -d db).'; exit 1 }
  Write-Host 'Installing PostgreSQL 16 into .pgenv with conda (about 150 MB, once)...'
  & $conda create -y -p (Join-Path $Root '.pgenv') -c conda-forge --override-channels 'postgresql=16'
  if (-not (Test-Path $local)) { Write-Error 'conda could not install PostgreSQL.'; exit 1 }
  $pgBin = Split-Path $local
}

$data = Join-Path $Root '.localdb'
if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
  Write-Host 'Initialising .localdb ...'
  & (Join-Path $pgBin 'initdb.exe') -D $data -U postgres -A trust -E UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { Write-Error 'initdb failed.'; exit 1 }
  Add-Content (Join-Path $data 'postgresql.conf') "`nlisten_addresses = '127.0.0.1'`nport = 5433"
}

& (Join-Path $pgBin 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  # Started as a separate process and not piped: the server would otherwise inherit this script's output and keep it open.
  $p = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList '-D', "`"$data`"", '-l', "`"$(Join-Path $Root 'localdb.log')`"", '-w', 'start' -WindowStyle Hidden -PassThru
  $null = $p.Handle
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { Write-Error 'PostgreSQL did not start; see localdb.log.'; exit 1 }
}

$psql = Join-Path $pgBin 'psql.exe'
foreach ($db in @('sra', 'sra_test')) {
  $exists = (& $psql -h 127.0.0.1 -p 5433 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'") | Out-String
  if (-not $exists.Trim()) { & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 5433 -U postgres $db; Write-Host "Created database $db" }
}
Write-Host 'PostgreSQL ready on 127.0.0.1:5433 (databases: sra, sra_test).'
exit 0
