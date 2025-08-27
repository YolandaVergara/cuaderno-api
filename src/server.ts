import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { config } from './config/config';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { connection } from './infra/redis';
import { apiRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// Cargar variables de entorno
dotenv.config();


const app = express();

// Si usas proxy/CDN (Railway, Vercel, Cloudflare, etc.), activa trust proxy
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware de seguridad
app.use(helmet());

// CORS seguro: permite solo orígenes definidos en producción
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // En desarrollo o si no hay origin (ej: Postman), permitir
    if (process.env.NODE_ENV === 'development' || !origin) {
      callback(null, true);
    } else if (allowedOrigins.length === 0) {
      // En prod sin CORS_ORIGIN configurado, rechazar
      callback(new Error('CORS_ORIGIN not configured in production'));
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});
app.use(limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


// Logging de requests
// Asegúrate de que el logger solo escriba a consola en producción (no a disco)
app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });
  next();
});

// Health check endpoint con verificación de DB y Redis
app.get('/health', async (_req, res) => {
  try {
    // Verificar DB (obligatorio)
    await prisma.$queryRaw`SELECT 1`;
    
    // Verificar Redis (obligatorio)
    await connection.ping();
    
    // Solo devolver 200 si AMBOS están OK
    res.status(200).json({ 
      status: "HEALTHY",
      redis: "CONNECTED", 
      db: "CONNECTED",
      timestamp: new Date().toISOString(),
      version: "2.0.0-PRIVATE-DUAL-STACK" 
    });
  } catch (e) {
    res.status(503).json({ 
      status: "UNHEALTHY",
      error: (e as Error).message,
      timestamp: new Date().toISOString() 
    });
  }
});

// Alternative health check endpoint for testing
app.get('/health-test', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await connection.ping();
    res.status(200).json({ 
      message: "TEST ENDPOINT WORKING", 
      redis: "ok", 
      db: "ok", 
      test: "working",
      timestamp: new Date().toISOString() 
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});

// Test endpoint para crear un seguimiento de vuelo
app.post('/test/flight-tracking', async (req, res) => {
  try {
    const { flightId, hours = 24 } = req.body;
    
    // Crear fecha de vuelo en el futuro
    const scheduledDeparture = new Date();
    scheduledDeparture.setHours(scheduledDeparture.getHours() + parseInt(hours));
    
    // Crear tracking mock
    const mockTracking = {
      id: `test-tracking-${Date.now()}`,
      userId: 'test-user',
      flightId: flightId || `TEST${Math.floor(Math.random() * 1000)}`,
      airline: 'TEST Airlines',
      flightNumber: 'TE123',
      scheduledDeparture,
      origin: 'MAD',
      destination: 'BCN'
    };
    
    // Programar job de polling
    const { scheduleNext } = await import('./infra/redis');
    await scheduleNext({
      userId: mockTracking.userId,
      flightId: mockTracking.flightId,
      trackingId: mockTracking.id,
      scheduledAt: scheduledDeparture.toISOString()
    });
    
    res.json({
      message: 'Test flight tracking created and job scheduled',
      tracking: mockTracking,
      scheduledDeparture: scheduledDeparture.toISOString(),
      hoursUntilFlight: hours
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Test endpoints para verificar rutas sin autenticación
app.get('/test/routes', (req, res) => {
  res.json({
    message: 'Routes test endpoint working',
    availableRoutes: [
      'GET /health',
      'GET /health-test', 
      'POST /test/flight-tracking',
      'GET /test/routes',
      'GET /test/redis',
      'GET /api/flight/:flightId (requires auth)',
      'POST /api/flight/:flightId/follow (requires auth)',
      'GET /api/notifications (requires auth)'
    ]
  });
});

// Test endpoint para verificar Redis
app.get('/test/redis', async (req, res) => {
  try {
    const startTime = Date.now();
    await connection.ping();
    const responseTime = Date.now() - startTime;
    
    res.json({ 
      message: 'Redis connection test successful',
      status: 'connected',
      responseTimeMs: responseTime,
      redisUrl: process.env.REDIS_URL ? 'configured' : 'missing',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ 
      message: 'Redis connection test failed',
      status: 'disconnected',
      error: (e as Error).message,
      redisUrl: process.env.REDIS_URL ? 'configured' : 'missing',
      errorDetails: {
        code: (e as any).code,
        errno: (e as any).errno,
        hostname: (e as any).hostname
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Rutas de la API
app.use('/api', apiRoutes);

// Middleware de manejo de errores
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    // Log DATABASE_URL host for debugging (masked for security)
    const dbUrl = process.env.DATABASE_URL || '';
    const dbHost = dbUrl.match(/@([^:\/]+)/)?.[1] || 'unknown';
    logger.info('Database connection info', { 
      host: dbHost.replace(/\./g, '***'), // Mask for security
      isRailwayInternal: dbHost.includes('railway.internal')
    });

    // Execute migrations in production (only on API service)
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Running database migrations...');
        const { execSync } = await import('child_process');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        logger.info('Database migrations completed successfully');
      } catch (migrationError) {
        logger.error('Migration failed', { error: (migrationError as Error).message });
        // Don't exit - let the app try to start anyway in case migrations were already applied
      }
    }

    // Solo verificar Redis, NO inicializar worker (servicio separado)
    try {
      await connection.ping();
      logger.info('Redis connection verified successfully');
      logger.info('Web service ready - worker runs separately');
    } catch (redisError) {
      logger.warn('Redis not available - polling disabled', { error: (redisError as Error).message });
    }
    
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info('Server started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        timezone: config.timezone,
        host: '0.0.0.0'
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down web service gracefully`);
      
      server.close(async () => {
        try {
          await connection.disconnect();
          logger.info('Redis disconnected');
          
          await prisma.$disconnect();
          logger.info('Database disconnected');
          
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Iniciar servidor solo si no estamos en modo test
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
