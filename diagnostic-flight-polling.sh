#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Flight Polling System Diagnostic${NC}"
echo "======================================="

# URL base del API (ajustar según configuración)
BASE_URL="http://localhost:3000/api"

# Función para hacer request y mostrar resultado
check_endpoint() {
    local endpoint=$1
    local description=$2
    local method=${3:-GET}
    
    echo -n "Checking $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ OK${NC}"
        if [ "$4" = "verbose" ]; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        fi
    else
        echo -e "${RED}✗ FAILED (HTTP $http_code)${NC}"
        echo "$body"
    fi
    echo ""
}

echo -e "${YELLOW}1. Backend Health Check${NC}"
check_endpoint "/debug/system-status" "Backend health"

echo -e "${YELLOW}2. Redis & Jobs Status${NC}"
check_endpoint "/debug/jobs/stats" "Redis and job queues" "GET" "verbose"

echo -e "${YELLOW}3. Active Flight Trackings${NC}"
check_endpoint "/debug/flight-trackings" "Active flight trackings" "GET" "verbose"

echo -e "${YELLOW}4. Flights Ready for Polling${NC}"
check_endpoint "/debug/polling-ready" "Flights ready for polling" "GET" "verbose"

echo -e "${YELLOW}5. System Status${NC}"
check_endpoint "/debug/system-status" "Overall system status" "GET" "verbose"

echo -e "${BLUE}6. Manual Tests${NC}"
echo "To manually test flight polling:"
echo "1. Add a flight through the UI (Modal > Transport > Flight)"
echo "2. Check that it appears in flight trackings above"
echo "3. Force polling: curl -X POST $BASE_URL/debug/force-poll/[TRACKING_ID]"
echo "4. Check flight search API: curl '$BASE_URL/flight/search?ident=IB6848&date=2024-12-01'"

echo ""
echo -e "${GREEN}Diagnostic completed!${NC}"
echo "Check the output above for any issues marked with ✗"
