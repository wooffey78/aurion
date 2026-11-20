@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Setup.ps1"
echo.
echo Le fichier a distribuer : dist-setup\Aurion-Setup.bat
pause
