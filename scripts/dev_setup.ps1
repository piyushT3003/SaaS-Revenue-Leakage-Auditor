# Installs everything the VS Code tasks need: a Python 3.11+ virtual environment (venv\) with the backend
# dependencies, and the frontend's npm packages. Safe to run again after pulling changes.
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function PyOk($exe, $extra) { try { $v = & $exe @extra -c "import sys; print(sys.version_info >= (3, 11))" 2>$null; return ($v -eq 'True') } catch { return $false } }

$py = Join-Path $Root 'venv\Scripts\python.exe'
if (-not ((Test-Path $py) -and (PyOk $py @()))) {
  $base = $null; $extra = @()
  if ((Has 'py') -and (PyOk 'py' @('-3.12'))) { $base = 'py'; $extra = @('-3.12') }
  elseif ((Has 'py') -and (PyOk 'py' @('-3.11'))) { $base = 'py'; $extra = @('-3.11') }
  elseif ((Has 'python') -and (PyOk 'python' @())) { $base = 'python' }
  else { $ana = Join-Path $env:USERPROFILE 'anaconda3\python.exe'; if ((Test-Path $ana) -and (PyOk $ana @())) { $base = $ana } }
  if (-not $base) { Write-Error 'Python 3.11 or newer is required (https://www.python.org/downloads/).'; exit 1 }
  if (Test-Path (Join-Path $Root 'venv')) {
    $old = "venv_old_{0:yyyyMMddHHmmss}" -f (Get-Date)
    Write-Host "Existing venv is older than Python 3.11; keeping it as $old"
    Rename-Item (Join-Path $Root 'venv') $old
  }
  Write-Host "Creating venv with $base $extra ..."
  & $base @extra -m venv venv
  if ($LASTEXITCODE -ne 0) { Write-Error 'Could not create the virtual environment.'; exit 1 }
}
Write-Host 'Installing backend dependencies...'
& $py -m pip install --disable-pip-version-check -r backend\requirements-dev.txt
if ($LASTEXITCODE -ne 0) { Write-Error 'pip install failed.'; exit 1 }

if (-not (Has 'npm')) { Write-Error 'Node.js 20+ is required (https://nodejs.org/).'; exit 1 }
Write-Host 'Installing frontend dependencies...'
Push-Location (Join-Path $Root 'frontend')
cmd /c "npm install --no-audit --no-fund"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Write-Error 'npm install failed.'; exit 1 }
Write-Host 'Setup complete.'
exit 0
