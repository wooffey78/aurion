@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-Aurion.ps1"
if errorlevel 1 (
  echo.
  echo Installation Aurion echouee. Consultez le dossier logs\
  pause
  exit /b 1
)
exit /b 0
