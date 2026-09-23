@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
pushd "%~dp0"
py -3 -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>&1
if not errorlevel 1 goto use_py
python -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>&1
if not errorlevel 1 goto use_python
echo Python 3 is required. Install it from https://www.python.org/downloads/windows/
echo During setup, enable "Add Python to PATH", then open start_tv3.bat again.
pause
popd
exit /b 1

:use_py
py -3 "%~dp0start_tv3_windows.py"
goto finished

:use_python
python "%~dp0start_tv3_windows.py"

:finished
set GAME_EXIT=%errorlevel%
if not "%GAME_EXIT%"=="0" pause
popd
exit /b %GAME_EXIT%
