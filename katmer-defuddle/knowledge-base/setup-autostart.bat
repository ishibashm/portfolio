@echo off
echo Setting up Katmer Base Auto-Start...

set SCRIPT_DIR=%~dp0
set VBS_FILE=%SCRIPT_DIR%start-background.vbs
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_FILE=%STARTUP_FOLDER%\KatmerBase_AutoStart.vbs

echo Copying startup script to Windows Startup folder...
copy /Y "%VBS_FILE%" "%SHORTCUT_FILE%"

echo.
echo Auto-start setup complete! 
echo Katmer Base will now start automatically in the background when you log into Windows.
echo You can also double-click start-background.vbs to start it manually right now.
pause
