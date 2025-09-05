import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Force restart after DB recreation

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).optional(),
  FLIGHT_PROVIDER_API_URL: z.string().url().default('https://aeroapi.flightaware.com/aeroapi'),
  FLIGHT_PROVIDER_API_KEY: z.string().default(''),
  FLIGHTAWARE_API_KEY: z.string().default(''), // Legacy support for proxy
  TZ: z.string().default('Europe/Madrid'),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.string().transform(val => parseInt(val, 10)).default('900000'),
  RATE_LIMIT_MAX: z.string().transform(val => parseInt(val, 10)).default('100'),
});

export type Config = z.infer<typeof configSchema>;

let cfg: Config;

try {
  cfg = configSchema.parse(process.env);
} catch (error) {
  console.error('❌ Configuration validation failed:', error);
  if (process.env.NODE_ENV === 'production') {
    console.error('💥 Missing required environment variables in production');
    process.exitCode = 1;
    process.exit(1);
  }
  throw error;
}

export { cfg };

// Legacy export for compatibility
export const config = {
  port: cfg.PORT || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000),
  nodeEnv: cfg.NODE_ENV,
  databaseUrl: cfg.DATABASE_URL,
  redisUrl: cfg.REDIS_URL,
  flightProvider: {
    apiUrl: cfg.FLIGHT_PROVIDER_API_URL,
    apiKey: cfg.FLIGHT_PROVIDER_API_KEY,
  },
  flightAware: {
    apiKey: cfg.FLIGHTAWARE_API_KEY, // Legacy support for proxy
  },
  timezone: cfg.TZ,
  corsOrigins: cfg.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean),
  rateLimit: {
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    max: cfg.RATE_LIMIT_MAX,
  },
};
