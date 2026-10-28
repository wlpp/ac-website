@echo off
title Huangguo Downloader :8765

rem ---- Guard: exit if port 8765 is already listening ----
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo [i] Service already running: http://127.0.0.1:8765
    echo     To restart: close the old service window first, then run this again.
    echo.
    pause
    exit /b
)

echo Starting Huangguo Downloader...
echo ==============================================
echo   Local:      http://127.0.0.1:8765
for /f "delims=" %%i in ('powershell -NoProfile -Command "$i = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex; (Get-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4).IPAddress"') do echo   Phone(LAN): http://%%i:8765
echo   Close this window to stop the service.
echo ==============================================
echo.

rem ---- Use the script's own folder if it contains app.py, otherwise fall back to the project path ----
set "APP_DIR=%~dp0"
if not exist "%APP_DIR%app.py" set "APP_DIR=e:\myWork\project\ac-website\hg_downloader"

cd /d "%APP_DIR%"
"e:\myWork\project\ac-website\.venv\Scripts\python.exe" app.py

echo.
echo [i] Service exited. If there are errors above, take a screenshot for feedback.
pause
