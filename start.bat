@echo off
title ZMAH Technologies - App Launcher
echo ====================================================
echo      Starting ZMAH Technologies E-Commerce Store
echo ====================================================
echo.

:: Navigate to the backend directory
cd /d "%~dp0backend"

:: Check if node_modules exists, if not, install dependencies
if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Wait 3 seconds, then launch the browser to localhost:5000
echo [INFO] Launching browser to http://localhost:5000 ...
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5000"

echo [INFO] Starting Express server...
npm start

pause
