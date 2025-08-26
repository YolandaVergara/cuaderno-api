import { PrismaClient } from '@prisma/client';
import { config } from './config';

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (config.nodeEnv === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  prisma = global.__prisma;
}

export { prisma };
