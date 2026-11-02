@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if exist "release\模板宝工作台-win32-x64\模板宝工作台.exe" (
  start "" "%~dp0release\模板宝工作台-win32-x64\模板宝工作台.exe"
  exit /b 0
)

if not exist node_modules\electron\dist\electron.exe (
  echo 首次运行：正在安装桌面工作台依赖，请稍候...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)

if not exist apps\desktop-cli\dist\index.js (
  echo 正在构建本地渲染引擎...
  call npm run build -w @templio/desktop-cli
  if errorlevel 1 goto fail
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0apps\desktop-studio"
exit /b 0

:fail
echo.
echo 启动失败，请查看上方错误信息。
pause
exit /b 1
