@echo off
rem Double-click to install every doole-skills plugin into Claude Code.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
