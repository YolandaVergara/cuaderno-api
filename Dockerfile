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

# (Opcional) Depuración: imprime info y comprueba tsconfig
# RUN node -v && npx tsc -v && echo "build:" && npm pkg get scripts.build && ls -la && \
#   [ -f tsconfig.json ] && echo "tsconfig OK" || (echo "Falta tsconfig.json" && exit 1)

# 3) Prisma + build
RUN npx prisma generate
RUN npm run build

# 4) Deja solo prod
RUN npm prune --omit=dev

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

ENV NODE_ENV=production
EXPOSE 3000

# Ajusta/borra si no tienes esta ruta
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]
