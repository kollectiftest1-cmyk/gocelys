@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Gocelsys - API (backend)
echo.
echo  Gocelsys - demarrage du backend Django
echo  ====================================
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>nul
if errorlevel 1 (
  echo  Python 3.12 ou plus recent est requis : https://www.python.org/downloads/
  pause
  exit /b 1
)
if not exist .venv (
  echo  Creation de l'environnement Python...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
echo  Installation des dependances...
pip install -q -r requirements.txt
echo  Migrations de la base...
python manage.py migrate --noinput
if not exist .seeded (
  echo  Chargement des donnees de demonstration ^(1 a 2 minutes^)...
  python manage.py seed_demo
  echo ok> .seeded
)
echo.
echo  API disponible sur http://localhost:8000/api/  ^(et sur l'IP du PC pour les telephones^)
echo  Administration technique : http://localhost:8000/admin/  ^(admin / gocelsys2026^)
echo.
python manage.py runserver 0.0.0.0:8000
pause
