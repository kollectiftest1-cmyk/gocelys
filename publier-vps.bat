@echo off
REM ==========================================================================
REM  Gocelsys - publier une nouvelle version pour le VPS
REM  1. enregistre vos modifications sur la branche main (commit)
REM  2. reconstruit la branche deploy (backend + web, sans les apps mobiles)
REM  3. envoie main et deploy sur GitHub
REM  4. (option) lance la mise a jour sur le serveur
REM ==========================================================================
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
set "VPS=root@72.60.212.142"

where git >nul 2>&1 || (echo Git n'est pas installe : https://git-scm.com/download/win & pause & exit /b 1)
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%b"
if /i not "%BR%"=="main" (echo Placez-vous sur la branche main : git checkout main & pause & exit /b 1)
git remote get-url origin >nul 2>&1 || (
  echo Aucun depot distant. Creez un depot PRIVE sur GitHub puis :
  echo    git remote add origin git@github.com:VOTRE-COMPTE/gocelsys.git
  pause & exit /b 1
)

if exist "mobile\mobile-entreprise\.git" goto :nested
if exist "mobile\mobile-exterieur\.git" goto :nested

set "MSG="
set /p "MSG=Decrivez les changements (Entree = Mise a jour) : "
if "%MSG%"=="" set "MSG=Mise a jour"
git add -A
git diff --cached --quiet || git commit -q -m "%MSG%"
if errorlevel 1 (echo Le commit a echoue. & pause & exit /b 1)

echo Construction de la branche deploy...
for /f "delims=" %%g in ('git rev-parse --absolute-git-dir') do set "GIT_INDEX_FILE=%%g\deploy-index"
set "GIT_INDEX_FILE=%GIT_INDEX_FILE:/=\%"
if exist "%GIT_INDEX_FILE%" del /q "%GIT_INDEX_FILE%"
git read-tree --empty
git read-tree --prefix=backend/ main:backend || goto :fail
git read-tree --prefix=web/ main:web || goto :fail
git read-tree --prefix=deploy/ main:deploy || goto :fail
for /f %%h in ('git rev-parse main:.gitignore') do git update-index --add --cacheinfo 100644,%%h,.gitignore
for /f %%h in ('git rev-parse main:.gitattributes') do git update-index --add --cacheinfo 100644,%%h,.gitattributes
for /f %%h in ('git rev-parse main:deploy/README.md') do git update-index --add --cacheinfo 100644,%%h,README.md
for /f %%t in ('git write-tree') do set "TREE=%%t"
del /q "%GIT_INDEX_FILE%"
set "GIT_INDEX_FILE="

set "PARENT="
for /f %%p in ('git rev-parse -q --verify refs/heads/deploy 2^>nul') do set "PARENT=%%p"
set "PTREE="
if defined PARENT for /f %%t in ('git show -s --format^=%%T %PARENT%') do set "PTREE=%%t"
if "%PTREE%"=="%TREE%" (
  echo Branche deploy deja a jour.
) else (
  for /f %%s in ('git rev-parse --short main') do set "SHORT=%%s"
  call :commit_deploy
)

echo Envoi vers GitHub...
git push -q origin main deploy || goto :fail
echo.
echo Publie : main et deploy sont sur GitHub.
echo.
set "GO="
set /p "GO=Mettre a jour le serveur maintenant ? (o/N) : "
if /i "%GO%"=="o" ssh -t %VPS% "sudo gocelsys-deploy"
pause
exit /b 0

:commit_deploy
if defined PARENT (
  for /f %%c in ('git commit-tree %TREE% -p %PARENT% -m "Deploiement : main@%SHORT%" -m "%MSG%"') do set "NEW=%%c"
) else (
  for /f %%c in ('git commit-tree %TREE% -m "Deploiement : main@%SHORT%" -m "%MSG%"') do set "NEW=%%c"
)
git update-ref refs/heads/deploy %NEW%
echo Branche deploy mise a jour (%NEW:~0,7%).
exit /b 0

:nested
echo Les dossiers mobile\mobile-entreprise\.git et mobile\mobile-exterieur\.git (crees par Expo)
echo empechent d'enregistrer les apps mobiles dans main. Supprimez ces deux dossiers caches puis relancez.
pause
exit /b 1

:fail
echo Echec. Rien n'a ete envoye sur le serveur.
if defined GIT_INDEX_FILE if exist "%GIT_INDEX_FILE%" del /q "%GIT_INDEX_FILE%"
pause
exit /b 1
