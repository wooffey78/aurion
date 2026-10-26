@echo off
setlocal
cd /d "%~dp0"
echo Installation de LibreOffice pour Aurion (facultatif, environ 350 Mo)...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-LibreOffice.ps1"
pause
