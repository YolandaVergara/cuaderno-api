import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

export const redis = new Redis(config.redisUrl, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 10000,
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error.message);
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis is ready to receive commands');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});
