@echo off
setlocal
cd /d "%~dp0"
rem ============================================================
rem  verificar.bat - roda as mesmas checagens que o Claude nao consegue rodar
rem  e grava tudo em verificacao.txt (envie esse arquivo para o Claude).
rem  Requer: npm install ja feito em backend e frontend, e backend\.env preenchido.
rem ============================================================
set "OUT=%~dp0verificacao.txt"
echo ===== Verificacao do projeto ===== > "%OUT%"
echo Data: %DATE% %TIME% >> "%OUT%"

echo.>> "%OUT%"
echo [1/3] Prisma: validar o schema >> "%OUT%"
pushd backend
call npx prisma validate >> "%OUT%" 2>&1
echo.>> "%OUT%"
echo [2/3] Backend: compilar o TypeScript >> "%OUT%"
call npm run build >> "%OUT%" 2>&1
popd

echo.>> "%OUT%"
echo [3/3] Frontend: compilar o TypeScript e o Vite >> "%OUT%"
pushd frontend
call npm run build >> "%OUT%" 2>&1
popd

echo.>> "%OUT%"
echo ===== fim ===== >> "%OUT%"
type "%OUT%"
echo.
echo Resultado salvo em: %OUT%
pause
