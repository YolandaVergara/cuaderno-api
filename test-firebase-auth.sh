#!/bin/bash

# 🧪 Script de prueba de autenticación Firebase
# Este script verifica que el backend acepta tokens reales de Firebase

echo "🔥 TESTING FIREBASE AUTHENTICATION"
echo "=================================="

API_URL="http://localhost:3000"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}📋 PASOS PARA PROBAR:${NC}"
echo "1. Abre el frontend en el navegador"
echo "2. Inicia sesión con tu cuenta de Firebase"
echo "3. Abre las herramientas de desarrollador (F12)"
echo "4. Ve a Console y ejecuta este comando:"
echo ""
echo -e "${GREEN}// Obtener token de Firebase${NC}"
echo "const user = firebase.auth().currentUser;"
echo "user.getIdToken().then(token => {"
echo "  console.log('Token:', token);"
echo "  // Copia este token y úsalo en las pruebas"
echo "});"
echo ""
echo -e "${YELLOW}📝 O usa este comando alternativo:${NC}"
echo "firebase.auth().currentUser?.getIdToken().then(token => console.log('🔑 TOKEN:', token))"
echo ""

# Test 1: Endpoint sin autenticación (debe funcionar)
echo -e "${YELLOW}🧪 Test 1: Endpoint público (debug)${NC}"
response=$(curl -s "${API_URL}/api/debug/jobs/stats" 2>/dev/null)
if [ $? -eq 0 ] && [[ $response == *"redis"* ]]; then
    echo -e "${GREEN}✅ Backend respondiendo correctamente${NC}"
else
    echo -e "${RED}❌ Backend no responde en ${API_URL}${NC}"
    exit 1
fi

# Test 2: Endpoint protegido sin token (debe fallar)
echo -e "${YELLOW}🧪 Test 2: Endpoint protegido sin token${NC}"
response=$(curl -s -w "%{http_code}" "${API_URL}/api/notifications" -o /dev/null)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ Endpoint protegido rechaza requests sin token${NC}"
else
    echo -e "${RED}❌ Endpoint protegido no rechaza requests sin token (código: $response)${NC}"
fi

echo ""
echo -e "${YELLOW}🔑 Para probar con token real:${NC}"
echo "curl -H \"Authorization: Bearer YOUR_FIREBASE_TOKEN\" \"${API_URL}/api/notifications\""
echo ""

# Test 3: Verificar que Firebase está configurado
echo -e "${YELLOW}🧪 Test 3: Verificando configuración Firebase${NC}"
if [ -n "$FIREBASE_PROJECT_ID" ] && [ -n "$FIREBASE_CLIENT_EMAIL" ]; then
    echo -e "${GREEN}✅ Variables de Firebase configuradas${NC}"
    echo "   Project ID: $FIREBASE_PROJECT_ID"
    echo "   Client Email: $FIREBASE_CLIENT_EMAIL"
else
    echo -e "${RED}❌ Variables de Firebase no configuradas${NC}"
fi

echo ""
echo -e "${YELLOW}🚀 NEXT STEPS:${NC}"
echo "1. Inicia el frontend: npm run dev"
echo "2. Ve a http://localhost:5174"
echo "3. Inicia sesión"
echo "4. Obtén el token y prueba los endpoints"
echo ""
echo -e "${GREEN}📚 Endpoints disponibles para probar:${NC}"
echo "GET  /api/notifications (requiere auth)"
echo "POST /api/notifications/:id/read (requiere auth)"
echo "GET  /api/flight/search (requiere auth)"
echo "GET  /api/debug/jobs/stats (público)"
echo ""
