@echo off
echo =========================================
echo  Graphify: Knowledge Graph Generation
echo =========================================
echo Checking for Python...
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    pause
    exit /b
)

echo.
echo Running Graphify... 
echo (Make sure you have installed graphify via: pip install graphifyy)
echo.

:: Run graphify from the parent directory of 'scripts'
cd /d "%~dp0.."
python -m graphify update .

echo.
echo Graph generation completed. Check 'graph.html' and 'GRAPH_REPORT.md'.
pause
