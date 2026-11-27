@echo off
cd /d "%~dp0"
if not defined FIREBASE_PROJECT_ID set "FIREBASE_PROJECT_ID=climate-twin-549d3"
if not exist ".venv\Scripts\python.exe" (
  echo First follow the Python setup steps in PRESENTATION.txt.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" app.py
pause
