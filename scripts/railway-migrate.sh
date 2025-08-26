#!/bin/bash

# Railway migration script
echo "🚀 Running database migrations for Railway deployment..."

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️ Running database migrations..."
npx prisma db push --accept-data-loss

echo "✅ Migration completed successfully!"
