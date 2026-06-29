@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo    🏭 Фабрика Контента — Запуск
echo ============================================
echo.

set SCRIPT_DIR=%~dp0
set SERVER=%SCRIPT_DIR%fabrika-server-win.exe
set PORT=3001

if not exist "%SERVER%" (
    echo [ОШИБКА] Не найден файл: fabrika-server-win.exe
    echo Убедитесь, что все файлы распакованы в одну папку.
    echo.
    pause
    exit /b 1
)

echo [1/4] Останавливаем предыдущий сервер...
taskkill /f /im fabrika-server-win.exe 2>nul

echo [2/4] Запускаем сервер...
start "" /b "%SERVER%"

echo [3/4] Ожидаем запуск сервера...
set RETRIES=0
:wait_loop
set /a RETRIES+=1
if !RETRIES! gtr 15 (
    echo [ОШИБКА] Сервер не запустился за 15 секунд.
    echo Возможно, порт %PORT% занят или файл повреждён.
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
curl -s http://localhost:%PORT%/api/health >nul 2>&1
if errorlevel 1 goto wait_loop

echo [4/4] Сервер запущен!
echo.
echo ============================================
echo    Открываю браузер...
echo    Если браузер не открылся, перейдите по адресу:
echo    http://localhost:%PORT%
echo ============================================
echo.
start "" http://localhost:%PORT%
echo Нажмите любую клавишу, чтобы остановить сервер.
pause >nul

echo Останавливаю сервер...
taskkill /f /im fabrika-server-win.exe 2>nul
echo Готово.

endlocal
