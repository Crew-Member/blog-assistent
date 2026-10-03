@echo off
rem ============================================================================
rem Sicherung: Datenbank (Beitraege, Websites, Einstellungen) und Bilder/Uploads.
rem Aufruf per Doppelklick = sofort sichern. start.cmd ruft "backup.cmd auto" auf:
rem dann wird hoechstens einmal pro Tag gesichert. Es bleiben die letzten 14 Sicherungen.
rem Zielordner: .\backups oder BACKUP_DIR=... aus der .env (z. B. ein OneDrive-Ordner).
rem Nur ASCII-Zeichen, damit die Datei in jeder Windows-Codepage funktioniert.
rem ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "MODE=%~1"

set "BDIR=%~dp0backups"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"BACKUP_DIR=" ".env"`) do if not "%%B"=="" set "BDIR=%%B"

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "STAMP=%%T"
if "%STAMP%"=="" goto :failed
set "TODAY=%STAMP:~0,8%"

if /I not "%MODE%"=="auto" goto :do_backup
if not exist "%BDIR%\db-%TODAY%-*.dump" goto :do_backup
echo Sicherung von heute ist bereits vorhanden.
exit /b 0
:do_backup

echo Sichere nach: %BDIR%
if not exist "%BDIR%" mkdir "%BDIR%"
if not exist "%BDIR%" goto :failed

docker compose exec -T postgres pg_isready -U blog -d blog_assistent >nul 2>nul
if errorlevel 1 goto :no_db

docker compose exec -T postgres sh -c "pg_dump -U blog -d blog_assistent -Fc -f /tmp/backup.dump"
if errorlevel 1 goto :failed
docker compose cp postgres:/tmp/backup.dump "%BDIR%\db-%STAMP%.dump"
if errorlevel 1 goto :failed
docker compose exec -T postgres rm -f /tmp/backup.dump >nul 2>nul

if not exist "data\uploads" goto :after_uploads
robocopy "data\uploads" "%BDIR%\uploads" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :failed
:after_uploads

rem Nur die letzten 14 Datenbank-Sicherungen behalten (Bilder werden nur ergaenzt, nie geloescht).
for /f "skip=14 delims=" %%F in ('dir /b /o-n "%BDIR%\db-*.dump" 2^>nul') do del "%BDIR%\%%F" >nul 2>nul

echo Sicherung fertig: db-%STAMP%.dump
if /I not "%MODE%"=="auto" pause
exit /b 0

:no_db
echo HINWEIS: Die Datenbank laeuft nicht - es wurde nichts gesichert. Bitte zuerst start.cmd ausfuehren.
goto :end_fail
:failed
echo HINWEIS: Die Sicherung ist fehlgeschlagen. Bitte die Meldungen oben ansehen.
:end_fail
if /I "%MODE%"=="auto" exit /b 0
pause
exit /b 1
