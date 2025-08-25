# Cuaderno Donde Pise - API Server

API server para el proyecto Cuaderno Donde Pise, proporcionando servicios de proxy para FlightAware y otras funcionalidades.

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
