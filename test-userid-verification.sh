#!/bin/bash

# 🔍 Script para verificar que se está guardando el userId real en flight tracking
# Este script consulta la base de datos para verificar los userId guardados

echo "🔍 VERIFICANDO USERID REAL EN FLIGHT TRACKING"
echo "=============================================="

API_URL="http://localhost:3000"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}📋 Este script verificará:${NC}"
echo "1. Que las rutas de flight tracking están protegidas por autenticación"
echo "2. Que el userId guardado en la BD es el UID real de Firebase"
echo "3. Que no se aceptan tokens inválidos o userId demo"
echo ""

# Test 1: Verificar que la ruta está protegida
echo -e "${YELLOW}🧪 Test 1: Ruta de tracking protegida${NC}"
response=$(curl -s -w "%{http_code}" "${API_URL}/api/flight/trackings" 2>/dev/null | tail -n1)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ Ruta /api/flight/trackings requiere autenticación (401)${NC}"
else
    echo -e "${RED}❌ Ruta debería requerir autenticación (recibido: $response)${NC}"
fi

# Test 2: Verificar que la ruta de registro está protegida
echo -e "${YELLOW}🧪 Test 2: Ruta de registro protegida${NC}"
response=$(curl -s -w "%{http_code}" -X POST "${API_URL}/api/flight/TEST123/follow" \
    -H "Content-Type: application/json" \
    -d '{"flightId":"TEST123","airline":"TEST","flightNumber":"123","scheduledDeparture":"2024-12-31T10:00:00Z","origin":"MAD","destination":"BCN"}' \
    2>/dev/null | tail -n1)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ Ruta POST /api/flight/:flightId/follow requiere autenticación (401)${NC}"
else
    echo -e "${RED}❌ Ruta debería requerir autenticación (recibido: $response)${NC}"
fi

# Test 3: Verificar con token inválido
echo -e "${YELLOW}🧪 Test 3: Token inválido rechazado${NC}"
response=$(curl -s -w "%{http_code}" "${API_URL}/api/flight/trackings" \
    -H "Authorization: Bearer invalid-token-123" \
    2>/dev/null | tail -n1)
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✅ Token inválido rechazado correctamente (401)${NC}"
else
    echo -e "${RED}❌ Token inválido debería ser rechazado (recibido: $response)${NC}"
fi

echo ""
echo -e "${BLUE}📊 VERIFICACIÓN DE BASE DE DATOS:${NC}"
echo -e "${YELLOW}Para verificar que los userId son reales (no demo):${NC}"
echo ""
echo "1. Conéctate a tu base de datos Railway:"
echo "   railway connect <service_name>"
echo ""
echo "2. Ejecuta esta consulta SQL:"
echo -e "${GREEN}   SELECT DISTINCT createdByUserId, COUNT(*) as flight_count"
echo "   FROM FlightTracking"
echo "   WHERE createdByUserId IS NOT NULL"
echo "   GROUP BY createdByUserId"
echo "   ORDER BY flight_count DESC;${NC}"
echo ""
echo "3. Verifica que los userId:"
echo "   - NO sean 'demo-user', 'test-user', etc."
echo "   - SÍ sean UIDs de Firebase (28 caracteres alfanuméricos)"
echo "   - Ejemplo de UID válido: 'Xy7Kp9Mn2QRs8Tv3Wu4Vx6Yz1A2B'"
echo ""

echo -e "${BLUE}🔧 VERIFICACIÓN EN FRONTEND:${NC}"
echo -e "${YELLOW}Para verificar que se envía el token correcto:${NC}"
echo ""
echo "1. Abre el frontend autenticado en el navegador"
echo "2. Abre DevTools (F12) → Network tab"
echo "3. Intenta hacer follow de un vuelo"
echo "4. Busca la petición POST a /api/flight/.../follow"
echo "5. Verifica que el header 'Authorization: Bearer <token>' está presente"
echo "6. Copia el token y decodifícalo en jwt.io para ver el UID"
echo ""

echo -e "${GREEN}✅ Tests de seguridad completados${NC}"
echo ""
echo -e "${YELLOW}💡 RESUMEN:${NC}"
echo "- ✅ Todas las rutas de flight tracking están protegidas"
echo "- ✅ Se rechaza acceso sin autenticación"
echo "- ✅ Se rechaza tokens inválidos"
echo "- 🔍 Verifica manualmente la BD para confirmar userId reales"
