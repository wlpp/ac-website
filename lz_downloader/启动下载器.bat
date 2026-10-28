@echo off
title Litchi Downloader :8766

rem ---- Guard: exit if port 8766 is already listening ----
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo [i] Service already running: http://127.0.0.1:8766
    echo     To restart: close the old service window first, then run this again.
    echo.
    pause
    exit /b
)

echo Starting Litchi Downloader...
echo ==============================================
echo   Local:      http://127.0.0.1:8766
for /f "delims=" %%i in ('powershell -NoProfile -Command "$i = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex; (Get-NetIPAddress -InterfaceIndex $i -AddressFamily IPv4).IPAddress"') do echo   Phone(LAN): http://%%i:8766
echo   Close this window to stop the service.
echo ==============================================
echo.

cd /d "%~dp0"
"e:\myWork\project\ac-website\.venv\Scripts\python.exe" app.py

echo.
echo [i] Service exited. If there are errors above, take a screenshot for feedback.
pause
