import { config } from './config/config';
import { logger } from './config/logger';
import { connection, pollWorker, pollEvents } from './infra/redis';
import { prisma } from './config/database';
import http from 'http';

// Mini servidor de vida para Railway healthcheck
const port = process.env.PORT;
if (port) {
  http.createServer((_, res) => res.end("OK")).listen(Number(port), "0.0.0.0");
  console.log(`Worker health server listening on port ${port}`);
}

async function startWorker() {
  try {
    logger.info('Starting dedicated worker service');
    
    // Verificar conexiones DB y Redis
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection verified');
    
    await connection.ping();
    logger.info('Redis connection verified');
    
    // Inicializar worker y eventos
    logger.info('Worker initialized - Redis connection verified');
    logger.info('Redis worker service started');
    
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down worker gracefully`);
      
      try {
        // Cerrar worker de forma limpia
        await pollWorker.close();
        logger.info('Worker closed successfully');
        
        // Cerrar eventos
        await pollEvents.close();
        logger.info('Events closed successfully');
        
        // Cerrar conexiones
        await connection.disconnect();
        logger.info('Redis disconnected');
        
        await prisma.$disconnect();
        logger.info('Database disconnected');
        
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    logger.info('Worker service ready - listening for jobs');
    
  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

// Iniciar worker solo si no estamos en modo test
if (process.env.NODE_ENV !== 'test') {
  startWorker();
}

export { startWorker };
