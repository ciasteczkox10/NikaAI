@echo off

start "Python" cmd /k ""%~dp0.venv\Scripts\python.exe" "%~dp0main.py""
start "Vite" cmd /k "cd /d ""%~dp0"" && npx vite"