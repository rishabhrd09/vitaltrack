@echo off
REM ============================================================================
REM VitalTrack/CareKosh — Local Development Setup (Windows)
REM ============================================================================
REM Run this script once after cloning the repository.
REM Usage: setup-local-dev.bat
REM ============================================================================

echo ╔══════════════════════════════════════════════════════╗
echo ║   VitalTrack — Local Development Setup (Windows)    ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ─── Check prerequisites ───
echo Checking prerequisites...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Download from https://nodejs.org
    exit /b 1
)
echo [OK] Node.js found

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed.
    exit /b 1
)
echo [OK] npm found

where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed. Download from https://git-scm.com
    exit /b 1
)
echo [OK] Git found

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Docker is not installed. Backend requires Docker.
    echo Download from https://docker.com/products/docker-desktop
) else (
    echo [OK] Docker found
)

echo.

REM ─── Get local IP ───
echo Detecting local IP address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
set LOCAL_IP=127.0.0.1
:found_ip
set LOCAL_IP=%LOCAL_IP: =%
echo Local IP: %LOCAL_IP%
echo.

REM ─── Backend .env ───
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Setting up Backend...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if not exist "vitaltrack-backend\.env" (
    echo Creating backend .env file...
    (
        echo DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
        echo SECRET_KEY=local-dev-secret-key-change-in-production
        echo ENVIRONMENT=development
        echo CORS_ORIGINS=["*"]
        echo REQUIRE_EMAIL_VERIFICATION=false
        echo MAIL_FROM=noreply@vitaltrack.app
        echo MAIL_PASSWORD=
        echo FRONTEND_URL=http://%LOCAL_IP%:8081
    ) > vitaltrack-backend\.env
    echo [OK] Backend .env created
) else (
    echo [SKIP] Backend .env already exists
)

echo.

REM ─── Mobile setup ───
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Setting up Mobile App...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cd vitaltrack-mobile

echo Installing npm dependencies (this may take 2-3 minutes)...
call npm install --legacy-peer-deps

echo.
echo Verifying critical dependencies...

findstr /C:"@tanstack/react-query" package.json >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALLING] @tanstack/react-query...
    call npm install @tanstack/react-query --legacy-peer-deps
) else (
    echo [OK] @tanstack/react-query installed
)

findstr /C:"@react-native-community/netinfo" package.json >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALLING] @react-native-community/netinfo...
    call npm install @react-native-community/netinfo --legacy-peer-deps
) else (
    echo [OK] @react-native-community/netinfo installed
)

REM ─── Mobile .env ───
if not exist ".env" (
    echo EXPO_PUBLIC_API_URL=http://%LOCAL_IP%:8000 > .env
    echo [OK] Mobile .env created (API URL: http://%LOCAL_IP%:8000)
) else (
    echo [SKIP] Mobile .env already exists
)

cd ..

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║   Setup Complete!                                    ║
echo ╠══════════════════════════════════════════════════════╣
echo ║                                                      ║
echo ║   Terminal 1 - Backend:                              ║
echo ║     cd vitaltrack-backend                            ║
echo ║     docker-compose up --build                        ║
echo ║                                                      ║
echo ║   Terminal 2 - Mobile:                               ║
echo ║     cd vitaltrack-mobile                             ║
echo ║     npx expo start --clear                           ║
echo ║                                                      ║
echo ╚══════════════════════════════════════════════════════╝
pause
