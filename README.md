# Cuaderno Donde Pise - Sistema de Seguimiento de Vuelos

API server para el proyecto Cuaderno Donde Pise, proporcionando servicios de proxy para FlightAware y otras funcionalidades.

## 🚀 Características

- **Seguimiento Dinámico**: Polling automático que se ajusta según proximidad de salida
- **Notificaciones Inteligentes**: Detecta cambios significativos (estado, puerta, terminal, retrasos ≥5min)
- **Escalable**: Arquitectura basada en jobs con Redis y BullMQ
- **Testeable**: Cobertura completa con Jest y mocks
- **Observabilidad**: Logging estructurado con Winston
- **Validación Robusta**: Schemas con Zod para todas las entradas

## 🏗️ Stack Tecnológico

- **Backend**: Express + TypeScript (Node 20+)
- **Base de Datos**: PostgreSQL con Prisma ORM
- **Cache & Jobs**: Redis + BullMQ
- **Validación**: Zod
- **Testing**: Jest + Supertest
- **Logging**: Winston
- **Seguridad**: Helmet + CORS + Rate Limiting
- **Desarrollo**: Docker Compose

## 📋 Reglas de Polling

El sistema ajusta automáticamente la frecuencia de polling según el tiempo restante:

- **≥7 días**: cada 6 horas
- **<7 días y ≥1 día**: cada 1 hora  
- **<24h y ≥6h**: cada 30 minutos
- **<6h**: cada 5 minutos

### Condiciones de Parada

- 2 horas después de la salida programada
- Estado `DEPARTED` o `CANCELLED`
- Cancelación manual del usuario

### Gestión de Errores

- Exponential backoff hasta 5 reintentos
- Jitter ±10% para evitar thundering herd
- Vuelta al intervalo normal tras max reintentos

## 🛠️ Instalación y Configuración

### 1. Clonar y configurar

```bash
git clone https://github.com/YolandaVergara/cuaderno-api.git
cd cuaderno-api
npm install
```

### 2. Variables de entorno

Copiar `.env.example` a `.env` y configurar:

```bash
cp .env.example .env
```

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cuaderno_api?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV=development

# Flight Provider API (mockeable)
FLIGHT_PROVIDER_API_URL="https://api.flightprovider.com/v1"
FLIGHT_PROVIDER_API_KEY="your_api_key_here"

# Timezone
TZ="Europe/Madrid"
```

### 3. Levantar servicios con Docker

```bash
# PostgreSQL + Redis
npm run docker:up

# Verificar que estén corriendo
docker ps
```

### 4. Configurar base de datos

```bash
# Aplicar migraciones
npm run db:push

# (Opcional) Abrir Prisma Studio
npm run db:studio
```

### 5. Iniciar desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev

# O construir y ejecutar
npm run build
npm start
```

## 📡 API Endpoints

### Autenticación

Todas las rutas requieren header `x-user-id` para identificar al usuario.

### Seguimiento de Vuelos

#### Registrar vuelo para seguimiento
```http
POST /api/flights/track
Content-Type: application/json
x-user-id: user-123

{
  "flightId": "AA123-2024-08-26",
  "airline": "American Airlines",
  "flightNumber": "AA123",
  "scheduledDeparture": "2024-08-26T10:30:00Z",
  "origin": "JFK",
  "destination": "LAX"
}
```

#### Obtener seguimientos activos
```http
GET /api/flights/trackings
x-user-id: user-123
```

#### Cancelar seguimiento
```http
DELETE /api/flights/trackings/{trackingId}
x-user-id: user-123
```

#### Estado actual de vuelo
```http
GET /api/flights/{flightId}/status
x-user-id: user-123
```

### Notificaciones

#### Obtener notificaciones
```http
GET /api/notifications?page=1&limit=20&unreadOnly=true
x-user-id: user-123
```

#### Marcar como leídas
```http
PUT /api/notifications/read
Content-Type: application/json
x-user-id: user-123

{
  "notificationIds": ["notif-1", "notif-2"]
}
```

#### Conteo no leídas
```http
GET /api/notifications/unread-count
x-user-id: user-123
```

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Cobertura
npm run test:coverage
```

## 🚀 **Despliegue en Railway**

### Opción 1: Railway CLI (Recomendado)

1. **Instalar Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Autenticarse**:
   ```bash
   railway login
   ```

3. **Crear proyecto**:
   ```bash
   railway new
   ```

4. **Añadir servicios necesarios**:
   ```bash
   # PostgreSQL
   railway add postgresql
   
   # Redis (plugin de la comunidad)
   railway add redis
   ```

5. **Configurar variables de entorno**:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set TZ="Europe/Madrid"
   railway variables set FLIGHT_PROVIDER_API_KEY="your_api_key"
   ```

6. **Desplegar**:
   ```bash
   railway up
   ```

### Opción 2: Conexión con GitHub

1. **Push tu código a GitHub**:
   ```bash
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

2. **Conectar en Railway Dashboard**:
   - Ve a [railway.app](https://railway.app)
   - Crea un nuevo proyecto
   - Conecta tu repositorio de GitHub
   - Añade PostgreSQL y Redis como servicios

3. **Configurar variables de entorno** en el dashboard:
   ```env
   NODE_ENV=production
   DATABASE_URL=${DATABASE_URL}  # Auto-generada por Railway
   REDIS_URL=${REDIS_URL}        # Auto-generada por Railway
   TZ=Europe/Madrid
   PORT=${PORT}                  # Auto-generada por Railway
   FLIGHT_PROVIDER_API_KEY=your_api_key_here
   ```

### Variables de Entorno para Railway

Railway auto-genera algunas variables. Las que necesitas configurar manualmente:

```env
# Configuración del proveedor de vuelos
FLIGHT_PROVIDER_API_KEY=your_api_key_here

# Configuración regional
TZ=Europe/Madrid

# CORS (opcional, para dominios específicos)
CORS_ORIGIN=https://yourdomain.com

# Rate limiting (opcional)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### Post-Despliegue

1. **Ejecutar migraciones**:
   ```bash
   railway run npm run railway:migrate
   ```

2. **Verificar salud del servicio**:
   ```bash
   curl https://your-app.railway.app/api/health
   ```

3. **Ver logs**:
   ```bash
   railway logs
   ```

## 🏭 Producción

### Variables de entorno adicionales

```env
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@prod-db:5432/cuaderno_api"
REDIS_URL="redis://prod-redis:6379"
CORS_ORIGIN="https://yourdomain.com"
```

### Deploy

```bash
# Construir
npm run build

# Ejecutar migraciones
npm run db:migrate

# Iniciar en producción
npm start
```

## 📊 Monitoreo

### Health Check
```http
GET /api/health
```

### Logs
Los logs se escriben en:
- `logs/error.log` - Solo errores
- `logs/combined.log` - Todos los logs
- `stdout` - En desarrollo

### Métricas de Colas
Las estadísticas de BullMQ están disponibles mediante el dashboard de la web UI o programáticamente.

## 🔧 Desarrollo

### Estructura del Proyecto

```
src/
├── config/          # Configuración (DB, Redis, Logger)
├── controllers/     # Controladores HTTP
├── jobs/           # Jobs de BullMQ
├── middleware/     # Middleware Express
├── routes/         # Definición de rutas
├── services/       # Lógica de negocio
├── types/          # Tipos TypeScript
├── utils/          # Utilidades
└── __tests__/      # Tests de integración
```

### Scripts Disponibles

```bash
npm run dev          # Desarrollo con hot reload
npm run build        # Compilar TypeScript
npm start            # Ejecutar versión compilada
npm test             # Ejecutar tests
npm run lint         # Ejecutar ESLint
npm run lint:fix     # Corregir problemas de ESLint automáticamente
npm run db:generate  # Generar cliente Prisma
npm run db:push      # Aplicar schema a DB
npm run db:migrate   # Crear y aplicar migración
npm run db:studio    # Abrir Prisma Studio
npm run docker:up    # Levantar servicios Docker
npm run docker:down  # Bajar servicios Docker
```

### Mockeable Flight Provider

El sistema incluye un proveedor de vuelos configurable:

- **Desarrollo/Test**: Usa `MockFlightProvider` con datos simulados
- **Producción**: Usa `FlightProvider` real con API externa

Para usar el mock, deja `FLIGHT_PROVIDER_API_KEY` vacío.

## 🤝 Contribución

1. Fork del repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Añadir nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## 📝 Licencia

MIT License - ver archivo [LICENSE](LICENSE) para detalles.

## 🐛 Troubleshooting

### PostgreSQL no conecta
```bash
# Verificar que Docker esté corriendo
docker ps

# Reiniciar servicios
npm run docker:down
npm run docker:up
```

### Redis no disponible
```bash
# Verificar conexión Redis
docker exec -it cuaderno-redis redis-cli ping
```

### Jobs no se procesan
```bash
# Verificar logs del servidor
npm run dev

# Verificar cola en Redis
docker exec -it cuaderno-redis redis-cli
> KEYS bull:*
```

---

**Desarrollado con ❤️ para seguimiento inteligente de vuelos**

## Características

- 🚀 Servidor Express con TypeScript
- ✈️ Proxy para FlightAware AeroAPI v4
- 🌍 CORS configurado para dominios autorizados
- 📊 Health checks y logging
- 🔐 Gestión segura de API keys

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus API keys

# Ejecutar en modo desarrollo
npm run dev

# Build para producción
npm run build
npm start
```

## Deploy en Railway

1. Conectar este repositorio a Railway
2. Configurar variables de entorno:
   - `FLIGHTAWARE_API_KEY`: Tu clave de FlightAware
   - `NODE_ENV`: production
3. Railway detectará automáticamente el proyecto Node.js

## Endpoints

- `GET /` - Información del servidor
- `GET /health` - Health check
- `POST /api/flightaware-proxy` - Proxy para FlightAware

## Variables de Entorno

- `FLIGHTAWARE_API_KEY` - Clave API de FlightAware (requerida)
- `NODE_ENV` - Entorno (development/production)
- `PORT` - Puerto del servidor (asignado automáticamente por Railway)

## Frontend Integration

En tu frontend, cambiar la URL base:

```typescript
const API_BASE = import.meta.env.PROD 
  ? 'https://tu-app.railway.app' 
  : 'http://localhost:3001';
```
