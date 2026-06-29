@echo off
setlocal

set SCRIPT_DIR=%~dp0
set SERVER=%SCRIPT_DIR%fabrika-server-win.exe
set PORT=3001

taskkill /f /im fabrika-server-win.exe 2>nul

start "" /b "%SERVER%"

timeout /t 3 /nobreak >nul

:wait_loop
curl -s http://localhost:%PORT%/api/health >nul 2>&1
if %errorlevel% neq 0 (
  timeout /t 1 /nobreak >nul
  goto wait_loop
)

start "" http://localhost:%PORT%

endlocal
