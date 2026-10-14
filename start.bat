@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要先安装 Node.js 18 或更高版本: https://nodejs.org/
  pause
  exit /b 1
)
start "" http://127.0.0.1:8090/
node server.cjs 8090
pause
