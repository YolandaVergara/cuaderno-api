import Redis from 'ioredis';
import { cfg } from './config';
import { logger } from './logger';

export const redis = new Redis(cfg.REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});
