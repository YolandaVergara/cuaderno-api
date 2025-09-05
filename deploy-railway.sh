#!/bin/bash

# 🚀 Deploy script for Railway with Firebase Authentication
# Este script despliega el backend actualizado con autenticación Firebase

echo "🚀 RAILWAY DEPLOY - FIREBASE AUTH"
echo "================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}📋 PRE-DEPLOY CHECKLIST:${NC}"
echo "✅ Firebase Admin SDK instalado"
echo "✅ Middleware de autenticación actualizado"
echo "✅ Variables de entorno preparadas"
echo "✅ Código compilado sin errores"
echo ""

# Verificar Railway CLI
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not installed${NC}"
    echo "Install with: npm install -g @railway/cli"
    exit 1
fi

echo -e "${YELLOW}🔍 Verificando estado actual de Railway...${NC}"

# Login a Railway (si no está logueado)
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}🔐 Logging into Railway...${NC}"
    railway login
fi

echo -e "${GREEN}✅ Railway CLI ready${NC}"

# Mostrar proyectos
echo -e "${YELLOW}📂 Proyectos disponibles:${NC}"
railway projects

echo ""
echo -e "${BLUE}🔧 VARIABLES DE ENTORNO PARA RAILWAY:${NC}"
echo "Las siguientes variables deben estar configuradas en Railway:"
echo ""
echo "FIREBASE_PROJECT_ID=cuaderno-donde-pise"
echo "FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@cuaderno-donde-pise.iam.gserviceaccount.com"
echo "FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----..."
echo "DATABASE_URL=[Railway PostgreSQL URL]"
echo "REDIS_URL=[Railway Redis URL]"
echo "FLIGHT_PROVIDER_API_URL=https://aeroapi.flightaware.com/aeroapi"
echo "FLIGHT_PROVIDER_API_KEY=Bn1Ap6AQQ7gk5dcRb7xaSkakHL8ldB0q"
echo "FLIGHTAWARE_API_KEY=Bn1Ap6AQQ7gk5dcRb7xaSkakHL8ldB0q"
echo "NODE_ENV=production"
echo "PORT=3000"
echo "TZ=Europe/Madrid"
echo "RATE_LIMIT_WINDOW_MS=900000"
echo "RATE_LIMIT_MAX=100"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANTE: Configura las variables de Firebase en Railway antes de continuar${NC}"
echo ""
echo -e "${BLUE}🚀 COMANDOS DE DEPLOY:${NC}"
echo ""
echo "1. Conectar al proyecto:"
echo "   railway link"
echo ""
echo "2. Configurar variables de entorno:"
echo "   railway variables set FIREBASE_PROJECT_ID=cuaderno-donde-pise"
echo "   railway variables set FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@cuaderno-donde-pise.iam.gserviceaccount.com"
echo "   railway variables set FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----...\""
echo ""
echo "3. Deploy:"
echo "   railway up"
echo ""

read -p "¿Quieres continuar con el deploy automático? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 Iniciando deploy...${NC}"
    
    # Deploy a Railway
    railway up
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Deploy completado!${NC}"
        echo ""
        echo -e "${BLUE}🔗 Próximos pasos:${NC}"
        echo "1. Verifica que el backend responde en la URL de Railway"
        echo "2. Actualiza VITE_API_URL en el frontend"
        echo "3. Haz pruebas con usuarios reales"
        echo ""
    else
        echo -e "${RED}❌ Deploy falló${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}ℹ️  Deploy cancelado por el usuario${NC}"
    echo "Puedes ejecutar 'railway up' manualmente cuando estés listo"
fi
