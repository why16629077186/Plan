@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Build a properly encoded file:// URL (handles Chinese folder names and spaces)
for /f "delims=" %%u in ('powershell -NoProfile -Command "[uri]::new((Join-Path -LiteralPath '%~dp0' -ChildPath 'index.html')).AbsoluteUri"') do set "QUIZ_URL=%%u"

REM Prefer Microsoft Edge (preinstalled on Windows 10/11)
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE%" (
    start "" "%EDGE%" --app="%QUIZ_URL%"
    exit /b 0
)

REM Fallback: Google Chrome
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
    start "" "%CHROME%" --app="%QUIZ_URL%"
    exit /b 0
)

echo 未找到 Microsoft Edge 或 Google Chrome，请安装后重试。
pause
