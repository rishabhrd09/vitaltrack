#!/usr/bin/env bash
# ============================================================================
# VitalTrack/CareKosh — Local Development Setup
# ============================================================================
# Run this script once after cloning the repository.
# It installs all dependencies for both backend and mobile.
#
# Usage:
#   chmod +x setup-local-dev.sh
#   ./setup-local-dev.sh
# ============================================================================

set -e  # Exit on any error

echo "╔══════════════════════════════════════════════════════╗"
echo "║   VitalTrack — Local Development Setup              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ─── Check prerequisites ───
echo "Checking prerequisites..."

check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed. Please install it first.${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ $1 found: $($1 --version 2>/dev/null | head -1)${NC}"
    fi
}

check_cmd "node"
check_cmd "npm"
check_cmd "git"
check_cmd "docker"

echo ""

# ─── Get local IP for Expo ───
echo "Detecting local IP address..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "127.0.0.1")
else
    LOCAL_IP="127.0.0.1"
fi
echo -e "${GREEN}Local IP: ${LOCAL_IP}${NC}"
echo ""

# ─── Backend setup ───
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setting up Backend (vitaltrack-backend)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "vitaltrack-backend/.env" ]; then
    echo "Creating backend .env file..."
    cat > vitaltrack-backend/.env << EOF
# Local development environment variables
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
SECRET_KEY=local-dev-secret-key-change-in-production
ENVIRONMENT=development
CORS_ORIGINS=["*"]
REQUIRE_EMAIL_VERIFICATION=false
MAIL_FROM=noreply@vitaltrack.app
MAIL_PASSWORD=
FRONTEND_URL=http://${LOCAL_IP}:8081
EOF
    echo -e "${GREEN}✓ Backend .env created${NC}"
else
    echo -e "${YELLOW}⊘ Backend .env already exists — skipping${NC}"
fi

echo ""

# ─── Mobile setup ───
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Setting up Mobile App (vitaltrack-mobile)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd vitaltrack-mobile

echo "Installing npm dependencies (this may take 2-3 minutes)..."
npm install --legacy-peer-deps

echo ""
echo "Verifying critical dependencies..."

# Check for required packages
check_dep() {
    if grep -q "\"$1\"" package.json; then
        echo -e "${GREEN}✓ $1 installed${NC}"
    else
        echo -e "${RED}✗ $1 MISSING — installing...${NC}"
        npm install "$1" --legacy-peer-deps
    fi
}

check_dep "@tanstack/react-query"
check_dep "@react-native-community/netinfo"
check_dep "zustand"
check_dep "expo-secure-store"

# Create mobile .env if needed
if [ ! -f ".env" ]; then
    cat > .env << EOF
EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:8000
EOF
    echo -e "${GREEN}✓ Mobile .env created (API URL: http://${LOCAL_IP}:8000)${NC}"
else
    echo -e "${YELLOW}⊘ Mobile .env already exists — skipping${NC}"
fi

cd ..

echo ""

# ─── Summary ───
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✅ Setup Complete!                                ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║   To start developing:                               ║"
echo "║                                                      ║"
echo "║   Terminal 1 — Backend:                              ║"
echo "║     cd vitaltrack-backend                            ║"
echo "║     docker-compose up --build                        ║"
echo "║                                                      ║"
echo "║   Terminal 2 — Mobile:                               ║"
echo "║     cd vitaltrack-mobile                             ║"
echo "║     npx expo start --clear                           ║"
echo "║                                                      ║"
echo "║   Then scan the QR code with Expo Go on your phone.  ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
