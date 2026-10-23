@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Gocelsys - Alertes automatiques
call .venv\Scripts\activate.bat
echo  Generation des alertes toutes les 15 minutes ^(Ctrl+C pour arreter^)
:loop
python manage.py run_alerts
timeout /t 900 /nobreak >nul
goto loop
