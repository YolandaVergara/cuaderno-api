#!/bin/sh

# Script de inicio para Railway
# Ejecuta migraciones solo en el servicio api-node

echo "🚀 Iniciando servicio: ${RAILWAY_SERVICE_NAME:-unknown}"

# Solo ejecutar migraciones en api-node
if [ "$RAILWAY_SERVICE_NAME" = "api-node" ]; then
  echo "📊 Ejecutando migraciones de Prisma..."
  npx prisma migrate deploy || {
    echo "❌ Error en migraciones, continuando con el servicio..."
  }
  echo "✅ Migraciones completadas"
  
  echo "🌐 Iniciando servidor web..."
  exec npm run start
  
elif [ "$RAILWAY_SERVICE_NAME" = "worker" ]; then
  echo "⚙️ Iniciando worker (sin migraciones)..."
  exec npm run start:worker
  
else
  echo "🔧 Servicio desconocido, iniciando servidor por defecto..."
  exec npm run start
fi
