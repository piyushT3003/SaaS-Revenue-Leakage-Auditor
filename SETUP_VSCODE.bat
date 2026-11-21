@echo off
rem Copies the VS Code tasks, debug configurations and settings from tools\vscode into .vscode.
rem Existing files in .vscode with the same names are backed up as *.bak first.
cd /d "%~dp0"
if not exist .vscode mkdir .vscode
for %%F in (tasks.json launch.json settings.json extensions.json test.env) do (
  if exist ".vscode\%%F" copy /y ".vscode\%%F" ".vscode\%%F.bak" >nul
  copy /y "tools\vscode\%%F" ".vscode\%%F" >nul
  echo Installed .vscode\%%F
)
echo.
echo Done. In VS Code: Ctrl+Shift+P, "Tasks: Run Task", "Setup: install dependencies" (first time), then "Start app".
pause
