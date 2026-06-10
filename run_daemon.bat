@echo off
setlocal
cd /d "%~dp0"

echo [Site Guardian Daemon Manager]
echo Starting site guardian daemon in the background...

:: Ensure log directory exists
if not exist data mkdir data

:: Launch daemon asynchronously, redirecting outputs
start /b npx tsx scripts/site_guardian_daemon.ts >> data/daemon_output.log 2>&1

echo Daemon started. Logs are available at: data\daemon_output.log
echo Process started in background. Close this terminal or use task manager to stop if needed.
endlocal
