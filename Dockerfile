# 1) deps (incluye dev)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

# 2) builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# 3) runtime (solo prod)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./

# Trae node_modules del builder y elimina dev
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

# Trae el build y prisma (si lo necesitas en runtime)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Usuario no root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000
# Quita o ajusta si no tienes /api/health
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]
