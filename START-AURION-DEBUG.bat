@echo off
setlocal
cd /d "%~dp0"
echo Demarrage d Aurion en mode diagnostic (fenetre visible)...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Aurion-Launcher.ps1" -Console
echo.
pause
