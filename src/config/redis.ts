import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

let redis: Redis | null = null;

// Solo intentar conectar a Redis si la URL no es la default de localhost
if (config.redisUrl && !config.redisUrl.includes('localhost') && config.nodeEnv === 'production') {
  try {
    redis = new Redis(config.redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
      // No hacer crash de la app por Redis
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    redis = null;
  }
} else {
  logger.info('Redis not configured or in development mode - running without Redis');
}

export { redis };
