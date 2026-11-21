# One-click start for SaaS Revenue Assurance on Windows (PowerShell 5.1+).
#   Double-click START_APP.bat in the project folder, or run:  powershell -ExecutionPolicy Bypass -File scripts\start_app.ps1
#
# Path A (preferred): Docker Desktop is running  -> docker compose up (PostgreSQL + API + web).
# Path B (fallback):  PostgreSQL 16 binaries (system install, or installed by conda into .pgenv\) -> a private
#                     database in .localdb\ (port 5433, local-only,
#                     no password; not for production), the API from the venv and the Vite dev server.
# Either way, demo data and the six demo audits are loaded once, and the app is served on http://localhost:5185.
# Demo sign-in: piyush@demo.local / Demo-Pass-2026 (change it, or delete the demo users, before sharing the machine).
# Everything is logged to start_app.log in the project folder.

$ErrorActionPreference = 'Continue'  # native tools write progress to stderr; failures are checked via $LASTEXITCODE
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Log = Join-Path $Root 'start_app.log'
$DemoPassword = 'Demo-Pass-2026'
$Url = 'http://localhost:5185'

function Say($msg) { $line = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg; Write-Host $line; Add-Content -Path $Log -Value $line }
function Fail($msg) { Say "FAILED: $msg"; Say 'See start_app.log for details.'; Read-Host 'Press Enter to close'; exit 1 }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function NewSecret { $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_').TrimEnd('=') }
function WaitReady($seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-RestMethod -Uri 'http://localhost:8085/api/health/ready' -TimeoutSec 5; if ($r.status -eq 'ready') { return $true } } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}
function SetEnvLine($file, $key, $value) {
  $lines = Get-Content $file
  if ($lines -match "^$key=") { $lines = $lines -replace "^$key=.*", "$key=$value" } else { $lines += "$key=$value" }
  Set-Content -Path $file -Value $lines -Encoding ASCII
}

try { Set-Content -Path $Log -Value "SaaS Revenue Assurance start $(Get-Date -Format s)" -Encoding UTF8 -ErrorAction Stop }
catch { $Log = Join-Path $Root ("start_app_{0:HHmmss}.log" -f (Get-Date)); Set-Content -Path $Log -Value "SaaS Revenue Assurance start $(Get-Date -Format s) (start_app.log was locked by an earlier run)" -Encoding UTF8 }
Say "Project folder: $Root"

# ------------------------------------------------------------------ .env (secrets generated locally, never committed)
$EnvFile = Join-Path $Root '.env'
if (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $Root '.env.example') $EnvFile
  SetEnvLine $EnvFile 'JWT_SECRET' (NewSecret)
  SetEnvLine $EnvFile 'POSTGRES_PASSWORD' ((NewSecret).Substring(0, 24))
  SetEnvLine $EnvFile 'BOOTSTRAP_ADMIN_EMAIL' 'admin@demo.local'
  SetEnvLine $EnvFile 'DEMO_USER_PASSWORD' $DemoPassword
  SetEnvLine $EnvFile 'CORS_ORIGINS' 'http://localhost:5185,http://127.0.0.1:5185'
  Say 'Created .env with freshly generated secrets.'
} else { Say 'Using existing .env.' }
$cfg = @{}; Get-Content $EnvFile | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $cfg[$k] = $v }

# ------------------------------------------------------------------ Path A: Docker
$dockerOk = $false
if (Has 'docker') { docker info *> $null; $dockerOk = ($LASTEXITCODE -eq 0) }
Say ("Docker available and running: {0}" -f $dockerOk)

if ($dockerOk) {
  Say 'Building and starting containers (first run takes several minutes)...'
  docker compose up -d --build 2>&1 | Add-Content -Path $Log
  if ($LASTEXITCODE -ne 0) { Fail 'docker compose up failed.' }
  if (-not (WaitReady 600)) { docker compose logs backend --tail 80 2>&1 | Add-Content -Path $Log; Fail 'The API did not become ready within 10 minutes.' }
  Say 'API ready. Loading demo users and running the demo audits (once)...'
  docker compose exec -T backend python -m backend.app.seed.cli --demo-password $DemoPassword --run-audits 2>&1 | Add-Content -Path $Log
  Say "READY: $Url   (sign in as piyush@demo.local / $DemoPassword)"
  Say 'Stop later with:  docker compose down'
  exit 0
}

# ------------------------------------------------------------------ Path B: local PostgreSQL binaries + venv + Vite
$pgBin = $null
if (Has 'pg_ctl') { $pgBin = Split-Path (Get-Command pg_ctl).Source }
if (-not $pgBin) {
  $cand = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_ctl.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($cand) { $pgBin = $cand.DirectoryName }
}
if (-not $pgBin) {
  # No system PostgreSQL: use (or create) a private conda environment inside the project (.pgenv, ~150 MB, no admin rights).
  $pgEnv = Join-Path $Root '.pgenv'
  $local = Join-Path $pgEnv 'Library\bin\pg_ctl.exe'
  if (-not (Test-Path $local)) {
    $conda = $null
    foreach ($c in @("$env:USERPROFILE\anaconda3\Scripts\conda.exe", "$env:USERPROFILE\miniconda3\Scripts\conda.exe", "$env:ProgramData\anaconda3\Scripts\conda.exe", "$env:ProgramData\miniconda3\Scripts\conda.exe")) {
      if (Test-Path $c) { $conda = $c; break }
    }
    if (-not $conda -and (Has 'conda')) { $conda = (Get-Command conda).Source }
    if ($conda) {
      Say "Installing PostgreSQL 16 into .pgenv with conda ($conda); this downloads about 150 MB once..."
      & $conda create -y -p $pgEnv -c conda-forge --override-channels 'postgresql=16' 2>&1 | Add-Content -Path $Log
    }
  }
  if (Test-Path $local) { $pgBin = Split-Path $local }
}
Say ("PostgreSQL binaries: {0}" -f ($(if ($pgBin) { $pgBin } else { 'not found' })))
if (-not $pgBin) {
  Fail 'Neither a running Docker Desktop nor PostgreSQL was found. Install Docker Desktop (https://www.docker.com/products/docker-desktop) and start it, or install PostgreSQL 16 (https://www.postgresql.org/download/windows/), then run START_APP.bat again.'
}

# Python 3.11+
function PyVersionOk($exe) { try { $v = & $exe -c "import sys; print(sys.version_info >= (3, 11))" 2>$null; return ($v -eq 'True') } catch { return $false } }
$py = Join-Path $Root 'venv\Scripts\python.exe'
if (-not ((Test-Path $py) -and (PyVersionOk $py))) {
  $base = $null
  foreach ($c in @('py -3.12', 'py -3.11', 'python')) {
    $parts = $c -split ' '
    if (Has $parts[0]) { try { $ok = & $parts[0] @($parts[1..9] | Where-Object { $_ }) -c "import sys; print(sys.version_info >= (3, 11))" 2>$null; if ($ok -eq 'True') { $base = $parts; break } } catch { } }
  }
  if (-not $base) { $ana = Join-Path $env:USERPROFILE 'anaconda3\python.exe'; if ((Test-Path $ana) -and (PyVersionOk $ana)) { $base = @($ana) } }
  if (-not $base) { Fail 'Python 3.11 or newer is required (https://www.python.org/downloads/).' }
  Say "Creating a fresh virtual environment with: $($base -join ' ')"
  if (Test-Path (Join-Path $Root 'venv')) { Rename-Item (Join-Path $Root 'venv') ("venv_old_{0:yyyyMMddHHmmss}" -f (Get-Date)) }
  & $base[0] @($base[1..9] | Where-Object { $_ }) -m venv venv 2>&1 | Add-Content -Path $Log
}
Say 'Installing backend dependencies...'
& $py -m pip install --disable-pip-version-check -q -r backend\requirements.txt 2>&1 | Add-Content -Path $Log
if ($LASTEXITCODE -ne 0) { Fail 'pip install failed.' }

# Private database cluster (trust auth on 127.0.0.1 only, port 5433)
$data = Join-Path $Root '.localdb'
if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
  Say 'Initialising a private PostgreSQL data folder in .localdb ...'
  & (Join-Path $pgBin 'initdb.exe') -D $data -U postgres -A trust -E UTF8 --locale=C 2>&1 | Add-Content -Path $Log
  if ($LASTEXITCODE -ne 0) { Fail 'initdb failed.' }
  Add-Content (Join-Path $data 'postgresql.conf') "`nlisten_addresses = '127.0.0.1'`nport = 5433"
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
  # Not piped: the server process would inherit the pipe and the script would wait on it forever.
  $p = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList '-D', "`"$data`"", '-l', "`"$(Join-Path $Root 'localdb.log')`"", '-w', 'start' `
    -WindowStyle Hidden -PassThru
  $null = $p.Handle  # PS 5.1 only reports ExitCode if the handle was opened before exit
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { Fail 'Could not start the private PostgreSQL server (see localdb.log).' }
}
& (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 5433 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sra'" | Out-String | Set-Variable exists
if (-not $exists.Trim()) { & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 5433 -U postgres sra 2>&1 | Add-Content -Path $Log }
Say 'Database running on 127.0.0.1:5433.'

$env:DATABASE_URL = 'postgresql+psycopg://postgres@127.0.0.1:5433/sra'
$env:ENVIRONMENT = 'development'
$env:JWT_SECRET = $cfg['JWT_SECRET']
$env:BOOTSTRAP_ADMIN_EMAIL = $cfg['BOOTSTRAP_ADMIN_EMAIL']
$env:CORS_ORIGINS = 'http://localhost:5185,http://127.0.0.1:5185'
$env:SEED_DEMO_DATA_ON_START = 'true'
$env:AUTO_MIGRATE = 'true'
$env:DEMO_LOGIN_EMAIL = 'viewer@demo.local'   # demo mode: open the read-only demo without signing in
$env:DEMO_AUTO_LOGIN = 'true'
$env:PYTHONPATH = $Root

Say 'Starting the API on port 8085 ...'
Start-Process -FilePath $py -ArgumentList '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8085' `
  -WorkingDirectory $Root -WindowStyle Minimized -RedirectStandardOutput (Join-Path $Root 'api.log') -RedirectStandardError (Join-Path $Root 'api.err.log')
if (-not (WaitReady 300)) { Fail 'The API did not become ready (see api.err.log).' }
Say 'API ready. Loading demo users and running the demo audits (once)...'
& $py -m backend.app.seed.cli --demo-password $DemoPassword --run-audits 2>&1 | Add-Content -Path $Log

if (-not (Has 'npm')) { Fail 'Node.js 20+ is required for the web app (https://nodejs.org/).' }
Say 'Installing web dependencies (npm install)...'
Push-Location (Join-Path $Root 'frontend')
cmd /c "npm install --no-audit --no-fund" 2>&1 | Add-Content -Path $Log
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'npm install failed.' }
$env:VITE_API_PROXY = 'http://127.0.0.1:8085'  # avoid ::1 resolution of localhost on Windows
Say 'Starting the web app on port 5185 ...'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx vite --port 5185 --strictPort > ..\web.log 2>&1' -WorkingDirectory (Get-Location) -WindowStyle Minimized
Pop-Location
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) { try { Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null; break } catch { Start-Sleep -Seconds 2 } }
Say "READY: $Url   (sign in as piyush@demo.local / $DemoPassword)"
Say 'The API and web servers run in minimised windows; close them to stop the app.'
