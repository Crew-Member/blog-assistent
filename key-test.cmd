@echo off
rem Prueft den Anthropic-Zugang (Key, Workspace, Modell) mit den Einstellungen aus der .env.
rem Verbraucht praktisch keine Token. Der Key wird nie angezeigt.
setlocal
cd /d "%~dp0"
echo Pruefe den Anthropic-Zugang ...
echo.
call npm run check:ai -w @blog/api --silent
echo.
pause
