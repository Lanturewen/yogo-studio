@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\setup-hooks.cjs"
) else (
  node "scripts\setup-hooks.cjs"
)
pause
