@echo off
title Paw ^& Glow - Local Server + Cloudflare Tunnel
cd /d "%~dp0"

echo ============================================================
echo  Paw and Glow - local server + public tunnel launcher
echo ============================================================
echo.

REM ---------- 1) Local server on port 8766 (runs the site + client CMS API) ----------
netstat -ano | findstr ":8766" | findstr "LISTENING" >nul
if %errorlevel%==0 goto server_ok
echo Starting local server...
start "Pet Server" /min python server.py 8766
timeout /t 2 /nobreak >nul
:server_ok
echo Local server is running on port 8766.
echo Client CMS: http://localhost:8766/admin  (default passcode: pawandglow)
echo.

REM ---------- 2) cloudflared (downloaded automatically if missing) ----------
if not exist "%TEMP%\opencode" mkdir "%TEMP%\opencode"
set "CF=%TEMP%\opencode\cloudflared.exe"
if exist "%CF%" goto cf_ok
echo Downloading cloudflared (first run only)...
curl -L -s -o "%CF%" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
if not exist "%CF%" goto cf_failed
goto cf_ok
:cf_failed
echo Download failed. Check your internet connection.
pause
exit /b 1
:cf_ok

echo Starting tunnel... your public link appears below.
echo Keep this window open - closing it stops the tunnel.
echo.
"%CF%" tunnel --url http://127.0.0.1:8766 --no-autoupdate
echo.
echo Tunnel closed.
pause
