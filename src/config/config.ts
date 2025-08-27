import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string(),
  redisUrl: z.string().optional(), // Hacer Redis opcional
  flightProvider: z.object({
    apiUrl: z.string(),
    apiKey: z.string(),
  }),
  timezone: z.string().default('Europe/Madrid'),
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutos
    max: z.number().default(100),
  }),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/cuaderno_api',
  redisUrl: process.env.REDIS_URL || '', // Vacío por defecto para evitar errores
  flightProvider: {
    apiUrl: process.env.FLIGHT_PROVIDER_API_URL || 'https://api.flightprovider.com/v1',
    apiKey: process.env.FLIGHT_PROVIDER_API_KEY || '',
  },
  timezone: process.env.TZ || 'Europe/Madrid',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
});
