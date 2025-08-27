import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config/config';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { connection } from './infra/redis';
import { apiRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app = express();

// Trust proxy para Railway
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = config.corsOrigins;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });
  next();
});

// Health check endpoint - API only checks DB and Redis
app.get('/health', async (_req, res) => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await connection.ping();
    
    // Only return 200 if BOTH are OK
    res.status(200).json({ 
      status: "HEALTHY",
      services: {
        database: "CONNECTED",
        redis: "CONNECTED"
      },
      timestamp: new Date().toISOString(),
      timezone: config.timezone
    });
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json({ 
      status: "UNHEALTHY",
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api', apiRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    // Verify connections (but don't fail if Redis is temporarily unavailable)
    try {
      await connection.ping();
      logger.info('Redis connection verified');
    } catch (redisError) {
      logger.warn('Redis temporarily unavailable', { error: (redisError as Error).message });
    }

    // Start server
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info('API server started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        timezone: config.timezone,
        host: '0.0.0.0'
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down API server gracefully`);
      
      server.close(async () => {
        try {
          await connection.disconnect();
          logger.info('Redis disconnected');
          
          await prisma.$disconnect();
          logger.info('Database disconnected');
          
          logger.info('API server shutdown complete');
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
    logger.error('Failed to start API server', { error });
    process.exit(1);
  }
}

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
