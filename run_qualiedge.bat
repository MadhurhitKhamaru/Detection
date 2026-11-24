@echo off
REM ==============================================================================
REM QualiEdge Industrial Quality Control Platform - One-Click Launcher
REM ==============================================================================

setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Set Path for Python and Node.js
set "PYTHON_EXE=%APPDATA%\uv\python\cpython-3.11.17-windows-x86_64-none\python.exe"
if not exist "%PYTHON_EXE%" (
    set "PYTHON_EXE=python"
)

set "PATH=%USERPROFILE%\.local\node;%PATH%"

echo ==============================================================================
echo  Starting QualiEdge Industrial Inspection Platform
echo  - Edge REST API Server: http://127.0.0.1:8000
echo  - React HMI Dashboard:  http://localhost:3000
echo ==============================================================================

"%PYTHON_EXE%" scripts\run_edge.py

pause
