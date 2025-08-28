@echo off
echo Stopping NVR services...

REM Node.js 프로세스 종료
taskkill /f /im node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js processes stopped.
) else (
    echo No Node.js processes found.
)

REM npm 프로세스 종료
taskkill /f /im npm.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo npm processes stopped.
) else (
    echo No npm processes found.
)

REM 포트 사용 확인
netstat -ano | findstr :9091
netstat -ano | findstr :9092

echo NVR services stopped.
pause

