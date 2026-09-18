@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" ("runtime\node.exe" cli.cjs doctor) else (node cli.cjs doctor)
pause
