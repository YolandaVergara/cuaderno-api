#!/bin/bash

# 🧪 Script de prueba de autenticación SSE con Firebase
# Este script verifica que el endpoint SSE acepta tokens reales de Firebase

echo "🔥 TESTING SSE AUTHENTICATION"
echo "=================================="

API_URL="http://localhost:3000"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}📋 PASOS PARA PROBAR SSE:${NC}"
echo "1. Abre el frontend en el navegador"
echo "2. Inicia sesión con tu cuenta de Firebase"
echo "3. Abre las herramientas de desarrollador (F12)"
echo "4. Ve a Console y ejecuta este comando:"
echo ""
echo -e "${GREEN}// Obtener token de Firebase para SSE${NC}"
echo "const user = firebase.auth().currentUser;"
echo "user.getIdToken().then(token => {"
echo "  const userId = user.uid;"
echo "  console.log('Token:', token);"
echo "  console.log('UserId:', userId);"
echo "  console.log('SSE URL:', \`${API_URL}/api/notifications/stream?userId=\${userId}&token=\${token}\`);"
echo "});"
echo ""

# Test 1: Endpoint sin autenticación (debe funcionar)
echo -e "${YELLOW}🧪 Test 1: Endpoint público (debug)${NC}"
response=$(curl -s "${API_URL}/api/debug/jobs/stats" 2>/dev/null)
if [ $? -eq 0 ] && [[ $response == *"redis"* ]]; then
    echo -e "${GREEN}✅ Backend respondiendo correctamente${NC}"
else
    echo -e "${RED}❌ Backend no responde en ${API_URL}${NC}"
    echo "Asegúrate de que el backend esté ejecutándose en ${API_URL}"
    exit 1
fi

# Test 2: SSE sin token (debe fallar con 401)
echo -e "${YELLOW}🧪 Test 2: SSE sin token${NC}"
response=$(curl -s -w "%{http_code}" "${API_URL}/api/notifications/stream?userId=test-user" 2>/dev/null | tail -n1)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ SSE rechaza conexiones sin autenticación (401)${NC}"
else
    echo -e "${RED}❌ SSE debería rechazar sin token (recibido: $response)${NC}"
fi

# Test 3: SSE con token inválido (debe fallar con 401)
echo -e "${YELLOW}🧪 Test 3: SSE con token inválido${NC}"
response=$(curl -s -w "%{http_code}" "${API_URL}/api/notifications/stream?userId=test-user&token=invalid-token" 2>/dev/null | tail -n1)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ SSE rechaza tokens inválidos (401)${NC}"
else
    echo -e "${RED}❌ SSE debería rechazar token inválido (recibido: $response)${NC}"
fi

echo ""
echo -e "${YELLOW}📝 Para probar con token REAL:${NC}"
echo "1. Obtén un token real del frontend (pasos de arriba)"
echo "2. Ejecuta manualmente:"
echo "   curl -N \"${API_URL}/api/notifications/stream?userId=TU_USER_ID&token=TU_TOKEN_REAL\""
echo ""
echo -e "${YELLOW}🎯 También puedes probar en el frontend:${NC}"
echo "- Abre el frontend autenticado"
echo "- Verifica que las notificaciones SSE se conecten"
echo "- Revisa la consola del navegador para errores"
echo ""
echo -e "${GREEN}✅ Tests básicos completados${NC}"
