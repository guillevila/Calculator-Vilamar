@echo off
REM ===========================================================================
REM  Calculator Vilamar — arrancar con doble clic
REM
REM  Construye la aplicacion si hace falta y la abre. No necesita consola: se
REM  puede crear un acceso directo a este fichero en el escritorio.
REM
REM  El instalador .exe todavia no se genera: electron-builder necesita permiso
REM  para crear enlaces simbolicos en Windows (Modo de desarrollador activado, o
REM  ejecutar como administrador). Mientras tanto, esto hace el mismo trabajo.
REM ===========================================================================

cd /d "%~dp0"

REM Electron arranca como Node y NO abre ventana si esta variable esta puesta.
REM Es un fallo mudo: no da ningun error, simplemente no aparece nada.
set "ELECTRON_RUN_AS_NODE="

if not exist "apps\desktop\out\main\index.js" (
  echo Preparando la aplicacion por primera vez...
  call pnpm install || goto :error
  call pnpm build || goto :error
)

echo Abriendo Calculator Vilamar...
call pnpm start
goto :eof

:error
echo.
echo No se ha podido preparar la aplicacion. Copia lo de arriba y mandalo.
pause
