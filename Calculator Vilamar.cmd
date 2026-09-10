@echo off
REM ===========================================================================
REM  Calculator Vilamar — arrancar con doble clic
REM ===========================================================================

cd /d "%~dp0"

REM Electron arranca como Node y NO abre ventana si esta variable esta puesta.
set "ELECTRON_RUN_AS_NODE="

if not exist "apps\desktop\out\main\index.js" (
  echo Preparando la aplicacion por primera vez...
  call pnpm install
  call pnpm build
)

if exist "apps\desktop\node_modules\electron\dist\electron.exe" (
  echo Abriendo Calculator Vilamar...
  start "" "%~dp0apps\desktop\node_modules\electron\dist\electron.exe" "%~dp0apps\desktop\out\main\index.js"
  goto :eof
)

echo Abriendo con pnpm...
call pnpm start

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Ha ocurrido un error al iniciar la aplicacion.
  pause
)
goto :eof
