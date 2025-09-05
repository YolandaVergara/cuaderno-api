#!/bin/bash

echo "🧪 Testing FlightAware Integration Endpoints"
echo "============================================="

BASE_URL="http://localhost:3000"

echo ""
echo "1. Health Check..."
curl -s "$BASE_URL/api/health" | jq . || echo "❌ Health check failed"

echo ""
echo "2. Testing /api/flight/by-date endpoint..."
curl -s "$BASE_URL/api/flight/by-date?ident=AA123&date=2025-01-30" | jq . || echo "❌ Flight by-date failed"

echo ""
echo "3. Testing FlightAware proxy endpoint..."
curl -s -X POST "$BASE_URL/api/flightaware-proxy" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "AA123", 
    "start": "2025-01-30", 
    "end": "2025-01-30", 
    "max_pages": "1"
  }' | jq . || echo "❌ FlightAware proxy failed"

echo ""
echo "✅ Test complete!"
