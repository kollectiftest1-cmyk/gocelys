@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Gocelsys - Reinitialiser la demo
call .venv\Scripts\activate.bat
python manage.py seed_demo --reset
pause
