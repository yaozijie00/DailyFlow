@echo off
title DailyFlow Cross-PC Diagnostic
echo ============================================
echo  DailyFlow Cross-PC Diagnostic (read-only)
echo  Please screenshot this whole window and
echo  send it to the developer.
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cross-pc-diagnostic.ps1"
echo.
echo ============================================
echo  Done. Send this screenshot AND the file:
echo    %LOCALAPPDATA%\DailyFlow\startup.log
echo ============================================
pause
