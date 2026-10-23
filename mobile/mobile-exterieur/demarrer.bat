@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Gocelsys - mobile-exterieur
where npm >nul 2>nul || (echo  Node.js 20 ou plus recent est requis : https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo  Installation des dependances ^(premiere fois^)...
  call npm install
)
echo.
echo  Scannez le QR code avec Expo Go ^(Android^) ou l'appareil photo ^(iPhone^).
echo  Dans l'app, touchez "Serveur" sur l'ecran de connexion et saisissez http://IP-DU-PC:8000
echo.
call npx expo start
pause
