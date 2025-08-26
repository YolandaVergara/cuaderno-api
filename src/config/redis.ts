import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
