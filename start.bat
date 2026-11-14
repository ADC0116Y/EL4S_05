@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > /dev/null 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。https://nodejs.org/ja から LTS 版をインストールしてください。
  pause
  exit /b 1
)
node server.js
pause
