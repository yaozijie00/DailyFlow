@echo off
title DailyFlow - Dev

cd /d "%~dp0"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] First run - installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo Starting DailyFlow dev (first build may take a few minutes)...
echo Close the app window to exit.
echo.

call npm run tauri dev

echo.
echo DailyFlow exited with code %errorlevel%.
pause