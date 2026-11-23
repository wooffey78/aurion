@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\Aurion-Launcher.ps1"
exit /b 0
