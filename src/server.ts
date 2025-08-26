import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { config } from './config/config';
import { logger } from './config/logger';
import { apiRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { JobManager } from './jobs/job-manager';

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

// Rutas de la API
app.use('/api', apiRoutes);

// Middleware de manejo de errores
app.use(notFoundHandler);
app.use(errorHandler);

// Inicializar job manager
let jobManager: JobManager;

async function startServer(): Promise<void> {
  try {
    // Inicializar job manager
    jobManager = new JobManager();
    
    // Programar jobs iniciales para vuelos existentes
    await jobManager.schedulePollingJobs();
    
    const server = app.listen(config.port, () => {
      logger.info('Server started', {
        port: config.port,
        nodeEnv: config.nodeEnv,
        timezone: config.timezone,
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(async () => {
        if (jobManager) {
          await jobManager.close();
        }
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      
      server.close(async () => {
        if (jobManager) {
          await jobManager.close();
        }
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
