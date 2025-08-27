import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

let redis: Redis | null = null;

// Solo usar Redis si está configurado y no estamos en producción (Railway issue)
if (config.redisUrl && config.nodeEnv !== 'production') {
  try {
    if (config.redisUrl.includes('localhost') || config.redisUrl.includes('127.0.0.1')) {
      redis = new Redis(config.redisUrl, {
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 5000,
      });

      redis.on('error', (error) => {
        logger.error('Redis connection error:', error);
      });

      redis.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      logger.info('Redis configured for development');
    } else {
      logger.info('Redis URL not configured for localhost - running without Redis');
    }
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    redis = null;
  }
} else {
  logger.info('Running without Redis (disabled for Railway deployment)');
}

export { redis };
