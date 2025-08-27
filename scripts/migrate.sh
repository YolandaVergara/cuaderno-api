#!/bin/bash

# Script para ejecutar migraciones de Prisma en Railway
# Solo debe ejecutarse desde el servicio api-node

echo "🚀 Iniciando migración de Prisma en Railway..."
echo "📊 Servicio: api-node"
echo "🗄️ Base de datos: PostgreSQL (Railway privado)"

# Generar el cliente de Prisma
echo "🔧 Generando cliente de Prisma..."
npx prisma generate

# Ejecutar migraciones
echo "📈 Ejecutando migraciones..."
npx prisma migrate deploy

echo "✅ Migraciones completadas!"
