@echo off
rem ============================================================================
rem Blog-Assistent: ein Doppelklick genuegt.
rem Holt Updates, installiert Abhaengigkeiten, startet die Datenbank, wendet
rem Datenbank-Aenderungen an und startet API und Oberflaeche. Zum Beenden: stop.cmd
rem Nur ASCII-Zeichen, damit die Datei in jeder Windows-Codepage funktioniert.
rem ============================================================================
setlocal
cd /d "%~dp0"
title Blog-Assistent Start

echo ==================================================
echo   Blog-Assistent wird gestartet
echo ==================================================
echo.

rem ---- Voraussetzungen ------------------------------------------------------
where node >nul 2>nul || goto :no_node
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
for /f "tokens=1 delims=." %%a in ("%NODEV:~1%") do set "NODEMAJOR=%%a"
if %NODEMAJOR% LSS 20 goto :old_node
where docker >nul 2>nul || goto :no_docker

rem ---- 1. Updates holen -----------------------------------------------------
if not exist ".git" goto :after_update
where git >nul 2>nul || goto :after_update
echo [1/6] Suche nach Updates ...
rem Die automatisch veraenderte Lock-Datei blockiert sonst das Update.
git checkout -- package-lock.json >nul 2>nul
git pull --ff-only
if errorlevel 1 echo HINWEIS: Das Update war nicht moeglich. Es wird mit dem vorhandenen Stand weitergearbeitet.
:after_update

rem ---- 2. Einstellungen (.env) ----------------------------------------------
echo [2/6] Pruefe Einstellungen ...
if exist ".env" goto :env_exists
copy ".env.example" ".env" >nul
echo.
echo Die Datei .env wurde neu angelegt. Bitte jetzt im Editor ausfuellen:
echo   ANTHROPIC_API_KEY, ADMIN_PASSWORD und SESSION_SECRET
echo Danach speichern und den Editor schliessen.
start /wait notepad ".env"
:env_exists
findstr /C:"ADMIN_PASSWORD=bitte-aendern" ".env" >nul && goto :env_bad
findstr /C:"SESSION_SECRET=bitte-durch" ".env" >nul && goto :env_bad
findstr /B /C:"AI_PROVIDER=fake" ".env" >nul && goto :env_ok
findstr /B /C:"ANTHROPIC_API_KEY=sk-" ".env" >nul || goto :env_bad
:env_ok

rem ---- 3. Docker / Datenbank ------------------------------------------------
echo [3/6] Starte die Datenbank ...
docker info >nul 2>nul && goto :docker_ready
echo Docker Desktop wird gestartet. Das kann ein bis zwei Minuten dauern ...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a TRIES=0
:docker_wait
docker info >nul 2>nul && goto :docker_ready
set /a TRIES+=1
if %TRIES% GEQ 48 goto :docker_timeout
timeout /t 5 /nobreak >nul
goto :docker_wait
:docker_ready
docker compose up -d --wait
if errorlevel 1 goto :db_failed

rem Tagliche Sicherung (vor Updates der Datenbank-Struktur). Ein Fehler hier stoppt den Start nicht.
call "%~dp0backup.cmd" auto

rem Noch laufende alte Server beenden: Unter Windows sperren sie sonst Dateien (z. B. die Prisma-Engine),
rem und npm install scheitert mit "EPERM operation not permitted".
for %%P in (3100 5174) do for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do taskkill /PID %%I /T /F >nul 2>nul
timeout /t 2 /nobreak >nul

rem ---- 4. Abhaengigkeiten ---------------------------------------------------
echo [4/6] Installiere Abhaengigkeiten ...
call npm install
if errorlevel 1 goto :npm_failed

rem ---- 5. Datenbank-Schema --------------------------------------------------
echo [5/6] Bereite die Datenbank-Anbindung vor ...
call npm run prisma:generate -w @blog/api
if errorlevel 1 goto :migrate_failed
call npm run prisma:deploy -w @blog/api
if errorlevel 1 goto :migrate_failed

rem ---- 6. Starten -----------------------------------------------------------
echo [6/6] Starte API und Oberflaeche ...
start "Blog-Assistent API" /D "%~dp0." cmd /k npm run dev:api
start "Blog-Assistent Oberflaeche" /D "%~dp0." cmd /k npm run dev:web

set /a TRIES=0
:api_wait
curl -s -f -o nul http://127.0.0.1:3100/api/health && goto :api_ready
set /a TRIES+=1
if %TRIES% GEQ 30 goto :api_timeout
timeout /t 2 /nobreak >nul
goto :api_wait
:api_ready

timeout /t 3 /nobreak >nul
start "" http://localhost:5174
echo.
echo ==================================================
echo   Fertig. Der Blog-Assistent laeuft im Browser:
echo   http://localhost:5174
echo.
echo   Zwei schwarze Fenster (API, Oberflaeche) muessen
echo   offen bleiben. Beenden: stop.cmd doppelklicken.
echo ==================================================
timeout /t 10 >nul
exit /b 0

rem ---- Fehlerfaelle ---------------------------------------------------------
:no_node
echo FEHLER: Node.js ist nicht installiert.
echo Bitte die LTS-Version von https://nodejs.org installieren und start.cmd erneut ausfuehren.
goto :fail
:old_node
echo FEHLER: Node.js %NODEV% ist zu alt. Benoetigt wird Version 20 oder neuer (https://nodejs.org).
goto :fail
:no_docker
echo FEHLER: Docker ist nicht installiert. Bitte Docker Desktop installieren (https://www.docker.com) und start.cmd erneut ausfuehren.
goto :fail
:env_bad
echo.
echo FEHLER: Die Datei .env ist noch nicht fertig ausgefuellt.
echo Noetig sind ein ANTHROPIC_API_KEY (beginnt mit sk-), ein eigenes ADMIN_PASSWORD
echo und ein eigenes SESSION_SECRET. Die Platzhalter "bitte-..." muessen ersetzt werden.
echo Die Datei wird jetzt geoeffnet. Danach speichern und start.cmd erneut ausfuehren.
start notepad ".env"
goto :fail
:docker_timeout
echo FEHLER: Docker Desktop ist nicht rechtzeitig gestartet. Bitte Docker Desktop selbst oeffnen,
echo warten bis "Engine running" angezeigt wird, und start.cmd erneut ausfuehren.
goto :fail
:db_failed
echo FEHLER: Die Datenbank konnte nicht gestartet werden. Bitte die Meldung oben ansehen.
goto :fail
:npm_failed
echo FEHLER: npm install ist fehlgeschlagen. Bitte die Meldung oben ansehen.
goto :fail
:migrate_failed
echo FEHLER: Die Datenbank-Aenderungen konnten nicht angewendet werden. Bitte die Meldung oben ansehen.
goto :fail
:api_timeout
echo FEHLER: Die API ist nicht angesprungen. Bitte im Fenster "Blog-Assistent API" nachsehen, was dort steht.
goto :fail
:fail
echo.
echo Das Fenster bleibt offen, damit Sie die Meldung lesen oder kopieren koennen.
pause
exit /b 1
