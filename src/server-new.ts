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

// Middleware de seguridad
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
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
    // Verificar conexión a la base de datos
    await prisma.$queryRaw`SELECT 1`;
    
    // Verificar conexión a Redis
    await connection.ping();
    
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  } catch (e) {
    logger.error('Health check failed', { error: e });
    res.status(503).json({ 
      ok: false, 
      error: (e as Error).message,
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
    // Inicializar Redis worker (se hace automáticamente al importar)
    logger.info('Redis worker initialized');
    
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info('Server started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        timezone: config.timezone,
        host: '0.0.0.0'
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(async () => {
        await connection.disconnect();
        await prisma.$disconnect();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      
      server.close(async () => {
        await connection.disconnect();
        await prisma.$disconnect();
        process.exit(0);
      });
    });

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
