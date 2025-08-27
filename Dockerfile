# Base
FROM node:20-alpine

# Prisma en Alpine necesita openssl
RUN apk add --no-cache openssl

WORKDIR /app

# Paquetes primero
COPY package*.json ./

# 1) Instala TODAS las deps para poder generar y construir
RUN npm ci

# 2) Copia el resto del código (incluye tsconfig*.json)
COPY . .

# 5) Hacer scripts ejecutables ANTES de cambiar usuario (a prueba de ausencia)
RUN [ -d scripts ] && chmod +x scripts/*.sh || true

# 3) Prisma + build
RUN npx prisma generate
RUN npm run build

# 4) Deja solo prod
RUN npm prune --omit=dev

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

ENV NODE_ENV=production
EXPOSE 8080
# (Sin HEALTHCHECK aquí; lo configuramos en Railway con Path: /health)

CMD ["npm", "start"]
