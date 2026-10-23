@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Gocelsys - Administration web
where npm >nul 2>nul || (echo  Node.js 20 ou plus recent est requis : https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo  Installation des dependances ^(premiere fois^)...
  call npm install
)
echo.
echo  Interface web : http://localhost:5173  ^(le backend doit tourner sur le port 8000^)
echo.
call npm run dev
pause
