@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Please use the complete Windows portable ZIP.
  pause
  exit /b 1
)
"runtime\node.exe" launcher.cjs
if errorlevel 1 pause
