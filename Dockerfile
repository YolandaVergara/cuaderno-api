# Base
FROM node:20-alpine

# Prisma en Alpine necesita openssl
RUN apk add --no-cache openssl

WORKDIR /app

# Paquetes primero
COPY package*.json ./

# Instala todas las deps (incluye TypeScript)
RUN npm ci

# Copia el resto del código
COPY . .

# Hace scripts ejecutables
RUN [ -d scripts ] && chmod +x scripts/*.sh || true

# Prisma
RUN npx prisma generate

# Build TypeScript usando ts-node directamente en runtime en lugar de compilar
# (esto evita problemas de compilación en Docker)

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

ENV NODE_ENV=production
EXPOSE 8080

# Usa npm start que ahora ejecuta ts-node
CMD ["npm", "start"]
