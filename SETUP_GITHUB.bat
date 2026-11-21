@echo off
rem Copies the GitHub automation (CI, weekly encrypted backups, Dependabot) into .github\ .
rem Run once before your first push. Safe to run again: it only overwrites those three files.
cd /d "%~dp0"
if not exist ".github\workflows" mkdir ".github\workflows"
copy /Y "tools\github\dependabot.yml" ".github\dependabot.yml" >nul
copy /Y "tools\github\workflows\ci.yml" ".github\workflows\ci.yml" >nul
copy /Y "tools\github\workflows\backup.yml" ".github\workflows\backup.yml" >nul
echo GitHub automation installed in .github\
dir /b ".github" ".github\workflows"
pause
