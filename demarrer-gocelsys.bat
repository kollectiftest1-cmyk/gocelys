@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo  Demarrage de Gocelsys : API + administration web
start "Gocelsys API" cmd /k "cd /d backend && demarrer.bat"
timeout /t 8 /nobreak >nul
start "Gocelsys Web" cmd /k "cd /d web && demarrer.bat"
timeout /t 6 /nobreak >nul
start http://localhost:5173
