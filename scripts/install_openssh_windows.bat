@echo off
REM =============================================================================
REM Wrapper script to auto-install OpenSSH Server on Windows
REM This .bat file automatically bypasses ExecutionPolicy and runs the .ps1 script
REM 
REM HOW TO USE:
REM 1. Copy both files (install_openssh_windows.bat and install_openssh_windows.ps1) 
REM    to the same folder on Windows
REM 2. Right-click this .bat file -> "Run as Administrator"
REM 3. Done! No need to manually set ExecutionPolicy
REM =============================================================================

echo ========================================
echo  OpenSSH Auto-Installer for Windows
echo ========================================
echo.
echo Checking Administrator privileges...
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
set "PS1_SCRIPT=%SCRIPT_DIR%install_openssh_windows.ps1"

REM Check if the .ps1 file exists
if not exist "%PS1_SCRIPT%" (
    echo [ERROR] Cannot find install_openssh_windows.ps1
    echo Please make sure both .bat and .ps1 files are in the same folder
    echo.
    pause
    exit /b 1
)

REM Run PowerShell with ExecutionPolicy Bypass
echo Running PowerShell script with ExecutionPolicy Bypass...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1_SCRIPT%"

REM Check if PowerShell script succeeded
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo  Script completed successfully
    echo ========================================
) else (
    echo.
    echo ========================================
    echo  Script failed with error code: %ERRORLEVEL%
    echo ========================================
)

echo.
pause
