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
import { notificationsSse } from './sse/notifications.sse';

// Cargar variables de entorno
dotenv.config();


const app = express();

// Si usas proxy/CDN (Railway, Vercel, Cloudflare, etc.), activa trust proxy
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware de seguridad
app.use(helmet());

// CORS configuration: Allow specific origins in production
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

// Default allowed origins for production
const defaultAllowedOrigins = [
  'https://www.pasaporteando.net',
  'https://pasaporteando.net',
  'https://cuaderno-donde-pise-cmyzpffxx-yols-projects.vercel.app',
  'https://cuaderno-donde-pise-ohr8k4l9j-yols-projects.vercel.app',
  'https://cuaderno-donde-pise-om289gp5f-yols-projects.vercel.app',
  'https://cuaderno-donde-pise-o3iof00n2-yols-projects.vercel.app',
  'https://cuaderno-donde-pise.vercel.app'
];

const finalAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultAllowedOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // En desarrollo o si no hay origin (ej: Postman, server-to-server), permitir
    if (process.env.NODE_ENV === 'development' || !origin) {
      callback(null, true);
    } else if (finalAllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS origin not allowed:', { 
        origin, 
        allowedOrigins: finalAllowedOrigins,
        userAgent: origin ? 'browser' : 'server-to-server'
      });
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
  const health = {
    status: 'HEALTHY',
    db: 'DISCONNECTED',
    redis: 'DISCONNECTED',
    timestamp: new Date().toISOString(),
    version: '2.0.0-PRIVATE-DUAL-STACK',
    port: config.port,
    env: config.nodeEnv
  };

  let isHealthy = true;
  
  // Verificar DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.db = 'CONNECTED';
    logger.info('Health check: DB connection OK');
  } catch (dbError) {
    health.db = `ERROR: ${(dbError as Error).message}`;
    isHealthy = false;
    logger.error('Health check: DB connection failed', { error: (dbError as Error).message });
  }
  
  // Verificar Redis (opcional en Railway si no tienes Redis configurado)
  try {
    await connection.ping();
    health.redis = 'CONNECTED';
    logger.info('Health check: Redis connection OK');
  } catch (redisError) {
    health.redis = `ERROR: ${(redisError as Error).message}`;
    // Redis es opcional - no marcar como no saludable por Redis
    logger.warn('Health check: Redis connection failed', { error: (redisError as Error).message });
  }
  
  // Responder con el status apropiado
  if (isHealthy) {
    health.status = 'HEALTHY';
    res.status(200).json(health);
  } else {
    health.status = 'UNHEALTHY';
    res.status(503).json(health);
  }
});

// Healthcheck simple para Railway (solo verifica que el servidor responda)
app.get('/healthz', async (_req, res) => {
  try {
    // Solo verificar DB - Redis es opcional
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'cuaderno-api'
    });
  } catch (error) {
    logger.error('Simple health check failed', { error: (error as Error).message });
    res.status(503).json({ 
      status: 'ERROR',
      error: (error as Error).message,
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

// Test endpoint para crear un seguimiento de vuelo (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
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
}

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
      'GET /api/push/public-key',
      'POST /api/push/subscribe',
      'POST /api/push/test',
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

// Debug endpoint to test SSE route
app.get('/debug/sse-test', (_req, res) => {
  res.json({ message: 'SSE debug endpoint working', timestamp: new Date().toISOString() });
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
      isRailwayInternal: dbHost.includes('railway.internal'),
      port: config.port,
      nodeEnv: config.nodeEnv
    });

    // Test database connection before starting server
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection successful');
    } catch (dbError) {
      logger.error('Database connection failed', { error: (dbError as Error).message });
      // Don't exit - let Railway handle the retry
    }

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

    // Verificar Redis (opcional)
    try {
      await connection.ping();
      logger.info('Redis connection verified successfully');
      logger.info('Web service ready - worker runs separately');
    } catch (redisError) {
      logger.warn('Redis not available - polling disabled', { error: (redisError as Error).message });
    }
    
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info('🚀 Server started successfully', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        timezone: config.timezone,
        host: '0.0.0.0',
        healthcheck: '/healthz'
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
