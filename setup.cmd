@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" set "PATH=%CD%\runtime;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22+ first, or use the Windows portable ZIP.
 pause
 exit /b 1
)
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
 pause
 exit /b 1
)
cscript.exe //Nologo launch.vbs
