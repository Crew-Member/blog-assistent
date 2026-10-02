@echo off
rem Beendet API und Oberflaeche und haelt die Datenbank an (die Daten bleiben erhalten).
setlocal
cd /d "%~dp0"
echo Blog-Assistent wird beendet ...
taskkill /FI "WINDOWTITLE eq Blog-Assistent API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Blog-Assistent Oberflaeche*" /T /F >nul 2>nul
rem Zur Sicherheit auch alles beenden, was noch auf den beiden Ports lauscht.
for %%P in (3100 5174) do for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do taskkill /PID %%I /T /F >nul 2>nul
docker compose stop >nul 2>nul
echo Fertig.
timeout /t 3 >nul
