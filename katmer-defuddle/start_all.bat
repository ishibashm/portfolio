@echo off
title Katmer-Defuddle Start Script
echo ===================================================
echo Starting Katmer-Defuddle Ecosystem
echo ===================================================

echo [0/3] Cleaning up previous sessions (closing occupied ports)...
FOR /F "tokens=5" %%T IN ('netstat -ano ^| findstr :8000') DO taskkill /F /PID %%T >nul 2>&1
FOR /F "tokens=5" %%T IN ('netstat -ano ^| findstr :3001') DO taskkill /F /PID %%T >nul 2>&1

echo [1/3] Checking Local LLM (Ollama)...
netstat -ano | findstr :11434 >nul
if %ERRORLEVEL% equ 0 (
    echo Ollama is already running. Skipping startup.
) else (
    echo Starting Ollama...
    start "Ollama Local LLM" cmd /k "ollama serve"
    timeout /t 3 /nobreak >nul
)

:: echo [1.5/2] Starting X API MCP Server (Background)...
:: start "X API MCP Server" cmd /c "cd /d "%~dp0x-tools\xmcp" && if exist venv\Scripts\activate (call venv\Scripts\activate) & python server.py"
:: timeout /t 3 /nobreak >nul

echo [1.75/2] Starting Brave MCP Server (Background)...
start "Brave Search MCP Server" cmd /c "cd /d "%~dp0x-tools\brave-mcp" && if exist .venv\Scripts\activate (call .venv\Scripts\activate) & python server.py"
timeout /t 3 /nobreak >nul

echo [1.8/2] Starting Katmer Base MCP Server (Background)...
start "Katmer Base MCP Server" cmd /c "cd /d "%~dp0knowledge-base" && set MCP_MODE=sse&& npm run mcp"
timeout /t 3 /nobreak >nul

echo [2/2] Starting Katmer Knowledge Base (Next.js)...
start "Katmer Knowledge Base" cmd /k "cd knowledge-base && set PORT=3001 && npm run dev"

echo.
echo ===============================================================================
echo 3. API Gateway          : http://localhost:8000
echo ===============================================================================
echo.
echo [TIP] To autonomously organize the LLM Wiki (Raw -> Wiki), open a new terminal and run:
echo       cd katmer-defuddle\knowledge-base && npx tsx scripts\auto_librarian.ts
echo.
echo All services started! Press any key to stop all services...
echo ===================================================
echo - Ollama Server is running on http://localhost:11434
echo - Katmer Base MCP Server is running on http://localhost:8002/sse
echo - The Knowledge Base dashboard is available at http://localhost:3001
echo.
echo Press any key to exit this launcher (the servers will keep running in their windows).
pause
