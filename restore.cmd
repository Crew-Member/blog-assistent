@echo off
rem ============================================================================
rem Stellt eine Sicherung wieder her. ACHTUNG: Die aktuelle Datenbank wird ueberschrieben.
rem Aufruf:  restore.cmd backups\db-JJJJMMTT-HHMM.dump
rem Nur ASCII-Zeichen, damit die Datei in jeder Windows-Codepage funktioniert.
rem ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "FILE=%~1"
if "%FILE%"=="" goto :usage
if not exist "%FILE%" goto :notfound

echo.
echo ACHTUNG: Alle aktuellen Daten (Beitraege, Websites, Einstellungen) werden durch
echo den Stand aus "%FILE%" ersetzt.
set /p OK=Zum Fortfahren bitte JA eingeben: 
if /I not "%OK%"=="JA" goto :cancel

rem API und Oberflaeche beenden, damit keine Verbindung offen ist.
for %%P in (3100 5174) do for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do taskkill /PID %%I /T /F >nul 2>nul
docker compose up -d --wait
if errorlevel 1 goto :failed

docker compose cp "%FILE%" postgres:/tmp/restore.dump
if errorlevel 1 goto :failed
docker compose exec -T postgres sh -c "pg_restore -U blog -d blog_assistent --clean --if-exists --no-owner /tmp/restore.dump"
docker compose exec -T postgres rm -f /tmp/restore.dump >nul 2>nul

rem Bilder: liegen sie neben der Datenbank-Sicherung, werden fehlende Dateien zurueckkopiert.
if not exist "%~dp1uploads" goto :after_uploads
robocopy "%~dp1uploads" "data\uploads" /E /NFL /NDL /NJH /NJS /NP >nul
:after_uploads

echo.
echo Wiederherstellung abgeschlossen. Bitte jetzt start.cmd ausfuehren.
echo (Einzelne Warnungen von pg_restore ueber nicht vorhandene Objekte sind bei einer Wiederherstellung normal.)
pause
exit /b 0

:notfound
echo Die Datei "%FILE%" wurde nicht gefunden.
goto :usage
:cancel
echo Abgebrochen.
pause
exit /b 1
:usage
echo.
echo Aufruf: restore.cmd "backups\db-JJJJMMTT-HHMM.dump"
echo Vorhandene Sicherungen:
dir /b backups\db-*.dump 2>nul
pause
exit /b 1
:failed
echo FEHLER: Die Wiederherstellung ist fehlgeschlagen. Bitte die Meldungen oben ansehen.
pause
exit /b 1
